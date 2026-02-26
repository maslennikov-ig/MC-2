/**
 * NotebookLM Audio Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-audio-handler
 *
 * Single-stage flow:
 * - Internally prepares narration draft from lesson content
 * - Immediately generates final audio via NotebookLM bridge service
 */

import { logger } from '@/shared/logger';
import type { AudioEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import type { EnrichmentHandler } from '../services/enrichment-router';
import { AUDIO_CONFIG } from '../config';
import {
  getDefaultVoice,
  prepareAudioScript,
  validateTTSSettings,
  type TTSFormat,
  type TTSVoice,
} from '../prompts/audio-prompt';
import { getLessonContent } from '../services/database-service';
import {
  isNotebookLMTaskFailedStatus,
  isNotebookLMTaskSuccessfulStatus,
  notebookLmBridgeClient,
  type NotebookLMAudioFormatPreset,
  type NotebookLMAudioLengthPreset,
} from '../services/notebooklm-bridge-client';
import type { DraftResult, EnrichmentHandlerInput, GenerateResult } from '../types';
import {
  buildNotebookLMSources,
  isStringInSet,
  resolveNlmDurationGuidance,
  resolveSourceStrategy,
} from './nlm-shared';

interface NlmAudioDraft {
  type: 'nlm_audio_draft';
  script: string;
  voice_id: string;
  format: string;
  speed: number;
  duration_seconds: number;
}

const NLM_AUDIO_FORMAT_PRESETS: NotebookLMAudioFormatPreset[] = [
  'deep_dive',
  'brief',
  'critique',
  'debate',
];
const NLM_AUDIO_LENGTH_PRESETS: NotebookLMAudioLengthPreset[] = ['short', 'default', 'long'];
const NLM_DEFAULT_AUDIO_FORMAT: NotebookLMAudioFormatPreset = 'deep_dive';
const NLM_DEFAULT_AUDIO_LENGTH: NotebookLMAudioLengthPreset = 'default';
const NLM_ASYNC_MODE_POLL = 'poll';

function extractBridgeMetadataSummary(
  responseMetadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!responseMetadata) return undefined;
  const artifact = responseMetadata.artifact as Record<string, unknown> | undefined;
  const meta = artifact?.metadata as Record<string, unknown> | undefined;
  return {
    task_id: responseMetadata.task_id,
    status: responseMetadata.status,
    error: responseMetadata.error,
    artifact_duration_seconds: artifact?.duration_seconds,
    artifact_mime_type: artifact?.mime_type,
    artifact_extension: artifact?.extension,
    notebook_id: meta?.notebook_id,
    artifact_id: meta?.artifact_id,
    recovery_status: meta?.status,
    source_count: meta?.source_count,
  };
}

function normalizeDraft(input: unknown): NlmAudioDraft {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid draft content for NotebookLM audio generation');
  }

  const value = input as Record<string, unknown>;
  const candidate =
    value.draft && typeof value.draft === 'object'
      ? (value.draft as Record<string, unknown>)
      : value;

  const script = candidate.script;
  const voiceId = candidate.voice_id;
  const format = candidate.format;
  const speed = candidate.speed;
  const durationSeconds = candidate.duration_seconds;

  if (typeof script !== 'string' || !script.trim()) {
    throw new Error('Draft script is missing for NotebookLM audio generation');
  }

  if (typeof voiceId !== 'string' || !voiceId.trim()) {
    throw new Error('Draft voice_id is missing for NotebookLM audio generation');
  }

  return {
    type: 'nlm_audio_draft',
    script: script.trim(),
    voice_id: voiceId,
    format: typeof format === 'string' && format ? format : AUDIO_CONFIG.DEFAULT_FORMAT,
    speed: typeof speed === 'number' && Number.isFinite(speed) ? speed : 1.0,
    duration_seconds:
      typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : 0,
  };
}

function resolveSpeed(rawSpeed: unknown): number {
  if (typeof rawSpeed === 'number' && Number.isFinite(rawSpeed) && rawSpeed > 0) {
    return rawSpeed;
  }

  if (typeof rawSpeed === 'string') {
    if (rawSpeed === 'slow') return 0.9;
    if (rawSpeed === 'fast') return 1.1;
  }

  return 1.0;
}

function resolveAudioFormatPreset(settings: Record<string, unknown>): NotebookLMAudioFormatPreset {
  const preset = settings.nlm_audio_format;
  if (isStringInSet(preset, NLM_AUDIO_FORMAT_PRESETS)) {
    return preset;
  }
  return NLM_DEFAULT_AUDIO_FORMAT;
}

function inferAudioLengthFromTarget(targetMinutes: number): NotebookLMAudioLengthPreset {
  if (targetMinutes <= 4) {
    return 'short';
  }
  if (targetMinutes >= 7) {
    return 'long';
  }
  return NLM_DEFAULT_AUDIO_LENGTH;
}

function resolveAudioLengthPreset(
  settings: Record<string, unknown>,
  targetMinutes: number
): NotebookLMAudioLengthPreset {
  const preset = settings.nlm_audio_length;
  if (isStringInSet(preset, NLM_AUDIO_LENGTH_PRESETS)) {
    return preset;
  }
  return inferAudioLengthFromTarget(targetMinutes);
}

function resolveNlmAsyncMode(settings: Record<string, unknown>): string | null {
  const value = settings.__nlm_async_mode;
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function resolveBridgeTaskId(settings: Record<string, unknown>): string | null {
  const value = settings.__nlm_bridge_task_id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolvePollAttempt(settings: Record<string, unknown>): number {
  const value = settings.__nlm_poll_attempt;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

async function generateDraft(input: EnrichmentHandlerInput): Promise<DraftResult> {
  const { enrichmentContext, settings } = input;
  const startTime = Date.now();

  logger.info(
    {
      enrichmentId: enrichmentContext.enrichment.id,
      lessonId: enrichmentContext.lesson.id,
      lessonTitle: enrichmentContext.lesson.title,
    },
    'NLM audio handler: generating draft'
  );

  const lessonContent = await getLessonContent(enrichmentContext.lesson.id);
  if (!lessonContent) {
    throw new Error(`No lesson content found for lesson ${enrichmentContext.lesson.id}`);
  }

  const language = (enrichmentContext.course.language || 'en') as 'en' | 'ru';
  const validated = validateTTSSettings({
    voice: (settings.voice as TTSVoice | undefined) ?? getDefaultVoice(language),
    format: (settings.format as TTSFormat | undefined) ?? AUDIO_CONFIG.DEFAULT_FORMAT,
    speed: resolveSpeed(settings.speed),
  });

  const processedScript = prepareAudioScript({
    lessonTitle: enrichmentContext.lesson.title,
    lessonContent,
    language,
    settings: {
      voice: validated.voice,
      format: validated.format,
      speed: validated.speed,
    },
  });

  const draft: NlmAudioDraft = {
    type: 'nlm_audio_draft',
    script: processedScript.script,
    voice_id: validated.voice,
    format: validated.format,
    speed: validated.speed,
    duration_seconds: processedScript.estimatedDurationSeconds,
  };

  const durationMs = Date.now() - startTime;

  return {
    draftContent: draft,
    metadata: {
      durationMs,
      modelUsed: 'notebooklm-bridge',
    },
  };
}

async function generateFinal(
  input: EnrichmentHandlerInput,
  draft: DraftResult
): Promise<GenerateResult> {
  const { enrichmentContext, settings } = input;
  const startTime = Date.now();

  logger.info(
    {
      enrichmentId: enrichmentContext.enrichment.id,
      lessonId: enrichmentContext.lesson.id,
    },
    'NLM audio handler: generating final audio via NotebookLM bridge'
  );

  const normalizedDraft = normalizeDraft(draft.draftContent);
  const language = enrichmentContext.course.language || 'en';
  let rawLessonContent: string | null = null;

  try {
    rawLessonContent = await getLessonContent(enrichmentContext.lesson.id);
  } catch (error) {
    logger.warn(
      {
        lessonId: enrichmentContext.lesson.id,
        error: error instanceof Error ? error.message : String(error),
      },
      'NLM audio handler: failed to load raw lesson content for source bundle'
    );
  }

  const sourceStrategy = resolveSourceStrategy(settings);
  const durationGuidance = resolveNlmDurationGuidance(enrichmentContext.lesson.duration_minutes);
  const audioFormatPreset = resolveAudioFormatPreset(settings);
  const audioLengthPreset = resolveAudioLengthPreset(settings, durationGuidance.targetMinutes);
  const asyncMode = resolveNlmAsyncMode(settings);
  const bridgeTaskId = resolveBridgeTaskId(settings);
  const pollAttempt = resolvePollAttempt(settings);
  const sources = buildNotebookLMSources({
    strategy: sourceStrategy,
    scriptContent: normalizedDraft.script,
    scriptTitle: 'Narration Draft Script',
    rawLessonContent,
    input,
  });
  let bridgeResult:
    | Awaited<ReturnType<typeof notebookLmBridgeClient.getTaskMedia>>
    | Awaited<ReturnType<typeof notebookLmBridgeClient.startAudio>>['immediateMedia'];
  let bridgeStartMetadata: Record<string, unknown> | undefined;

  if (asyncMode === NLM_ASYNC_MODE_POLL) {
    if (!bridgeTaskId) {
      throw new Error('NotebookLM audio poll mode requires bridge task id');
    }

    const status = await notebookLmBridgeClient.getTaskStatus(bridgeTaskId, 'audio');

    if (isNotebookLMTaskFailedStatus(status.status)) {
      throw new Error(
        `NotebookLM bridge task failed (taskId=${bridgeTaskId}, status=${status.status})`
      );
    }

    if (!isNotebookLMTaskSuccessfulStatus(status.status)) {
      const durationMs = Date.now() - startTime;
      const deferredContent: AudioEnrichmentContent = {
        type: 'audio',
        voice_id: normalizedDraft.voice_id,
        script: normalizedDraft.script,
        duration_seconds:
          normalizedDraft.duration_seconds > 0 ? normalizedDraft.duration_seconds : 1,
        format: normalizedDraft.format as TTSFormat,
      };

      return {
        content: deferredContent,
        metadata: {
          generated_at: new Date().toISOString(),
          generation_duration_ms: (draft.metadata.durationMs || 0) + durationMs,
          total_tokens: draft.metadata.tokensUsed,
          estimated_cost_usd: 0,
          model_used: draft.metadata.modelUsed || 'notebooklm-bridge',
          quality_score: 1.0,
          retry_attempts: 0,
          additional_info: {
            bridge: 'notebooklm',
            source_strategy_used: sourceStrategy,
            source_count: sources.length,
            audio_format_preset: audioFormatPreset,
            audio_length_preset: audioLengthPreset,
            duration_target_minutes: durationGuidance.targetMinutes,
            duration_range_min_minutes: durationGuidance.minMinutes,
            duration_range_max_minutes: durationGuidance.maxMinutes,
            bridge_task_id: bridgeTaskId,
            bridge_task_status: status.status,
            bridge_poll_attempt: pollAttempt,
            bridge_response: extractBridgeMetadataSummary(status.responseMetadata),
          },
        },
        deferredTask: {
          provider: 'notebooklm-bridge',
          mediaType: 'audio',
          taskId: bridgeTaskId,
          status: status.status,
          responseMetadata: status.responseMetadata,
        },
      };
    }

    bridgeResult = await notebookLmBridgeClient.getTaskMedia(bridgeTaskId, 'audio');
  } else {
    const start = await notebookLmBridgeClient.startAudio({
      lessonTitle: enrichmentContext.lesson.title,
      script: normalizedDraft.script,
      language,
      courseId: enrichmentContext.course.id,
      voice: normalizedDraft.voice_id,
      sources,
      audioFormat: audioFormatPreset,
      audioLength: audioLengthPreset,
      targetDurationMinutes: durationGuidance.targetMinutes,
      durationRangeMinMinutes: durationGuidance.minMinutes,
      durationRangeMaxMinutes: durationGuidance.maxMinutes,
    });

    bridgeStartMetadata = start.responseMetadata;

    if (!start.immediateMedia) {
      const durationMs = Date.now() - startTime;
      const deferredContent: AudioEnrichmentContent = {
        type: 'audio',
        voice_id: normalizedDraft.voice_id,
        script: normalizedDraft.script,
        duration_seconds:
          normalizedDraft.duration_seconds > 0 ? normalizedDraft.duration_seconds : 1,
        format: normalizedDraft.format as TTSFormat,
      };

      return {
        content: deferredContent,
        metadata: {
          generated_at: new Date().toISOString(),
          generation_duration_ms: (draft.metadata.durationMs || 0) + durationMs,
          total_tokens: draft.metadata.tokensUsed,
          estimated_cost_usd: 0,
          model_used: draft.metadata.modelUsed || 'notebooklm-bridge',
          quality_score: 1.0,
          retry_attempts: 0,
          additional_info: {
            bridge: 'notebooklm',
            source_strategy_used: sourceStrategy,
            source_count: sources.length,
            audio_format_preset: audioFormatPreset,
            audio_length_preset: audioLengthPreset,
            duration_target_minutes: durationGuidance.targetMinutes,
            duration_range_min_minutes: durationGuidance.minMinutes,
            duration_range_max_minutes: durationGuidance.maxMinutes,
            bridge_task_id: start.taskId,
            bridge_task_status: start.status,
            bridge_poll_attempt: pollAttempt,
            bridge_response: extractBridgeMetadataSummary(start.responseMetadata),
          },
        },
        deferredTask: {
          provider: 'notebooklm-bridge',
          mediaType: 'audio',
          taskId: start.taskId,
          status: start.status,
          responseMetadata: start.responseMetadata,
        },
      };
    }

    bridgeResult = start.immediateMedia;
  }

  const durationSeconds =
    bridgeResult.durationSeconds && bridgeResult.durationSeconds > 0
      ? bridgeResult.durationSeconds
      : normalizedDraft.duration_seconds;

  const content: AudioEnrichmentContent = {
    type: 'audio',
    voice_id: normalizedDraft.voice_id,
    script: normalizedDraft.script,
    duration_seconds: durationSeconds > 0 ? durationSeconds : 1,
    format: normalizedDraft.format as TTSFormat,
  };

  const durationMs = Date.now() - startTime;

  const metadata: EnrichmentMetadata = {
    generated_at: new Date().toISOString(),
    generation_duration_ms: (draft.metadata.durationMs || 0) + durationMs,
    total_tokens: draft.metadata.tokensUsed,
    estimated_cost_usd: 0,
    model_used: draft.metadata.modelUsed || 'notebooklm-bridge',
    quality_score: 1.0,
    retry_attempts: 0,
    additional_info: {
      bridge: 'notebooklm',
      duration_seconds: durationSeconds,
      format: bridgeResult.extension,
      mime_type: bridgeResult.mimeType,
      source_strategy_used: sourceStrategy,
      source_count: sources.length,
      audio_format_preset: audioFormatPreset,
      audio_length_preset: audioLengthPreset,
      duration_target_minutes: durationGuidance.targetMinutes,
      duration_range_min_minutes: durationGuidance.minMinutes,
      duration_range_max_minutes: durationGuidance.maxMinutes,
      bridge_response: extractBridgeMetadataSummary(bridgeResult.responseMetadata),
      bridge_start_response: extractBridgeMetadataSummary(bridgeStartMetadata),
    },
  };

  return {
    content,
    metadata,
    assetBuffer: bridgeResult.buffer,
    assetMimeType: bridgeResult.mimeType,
    assetExtension: bridgeResult.extension,
  };
}

async function generate(input: EnrichmentHandlerInput): Promise<GenerateResult> {
  const draft = await generateDraft(input);
  return generateFinal(input, draft);
}

export const nlmAudioHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generateDraft,
  generateFinal,
  generate,
};
