/**
 * NotebookLM Video Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-video-handler
 *
 * Single-stage flow:
 * - Internally generates script draft (reuses existing video draft generation)
 * - Immediately generates final video artifact through NotebookLM bridge
 */

import { logger } from '@/shared/logger';
import type { EnrichmentMetadata, VideoEnrichmentContent } from '@megacampus/shared-types';
import { videoScriptOutputSchema, type VideoScriptOutput } from '../prompts/video-prompt';
import { getLessonContent } from '../services/database-service';
import {
  isNotebookLMTaskFailedStatus,
  isNotebookLMTaskSuccessfulStatus,
  notebookLmBridgeClient,
  type NotebookLMVideoFormatPreset,
  type NotebookLMVideoStylePreset,
} from '../services/notebooklm-bridge-client';
import type { EnrichmentHandler } from '../services/enrichment-router';
import type { DraftResult, EnrichmentHandlerInput, GenerateResult } from '../types';
import {
  buildNotebookLMSources,
  isStringInSet,
  resolveNlmDurationGuidance,
  resolveSourceStrategy,
} from './nlm-shared';
import { videoHandler } from './video-handler';

interface ParsedVideoDraft {
  fullScript: string;
  estimatedDurationSeconds?: number;
  sectionCount?: number;
  tone?: string;
  pacing?: string;
}

const NLM_VIDEO_FORMAT_PRESETS: NotebookLMVideoFormatPreset[] = ['explainer', 'brief'];
const NLM_VIDEO_STYLE_PRESETS: NotebookLMVideoStylePreset[] = [
  'auto_select',
  'custom',
  'classic',
  'whiteboard',
  'kawaii',
  'anime',
  'watercolor',
  'retro_print',
  'heritage',
  'paper_craft',
];
const NLM_DEFAULT_VIDEO_FORMAT: NotebookLMVideoFormatPreset = 'explainer';
const NLM_DEFAULT_VIDEO_STYLE: NotebookLMVideoStylePreset = 'auto_select';
const NLM_ASYNC_MODE_POLL = 'poll';

function buildFullScript(scriptOutput: VideoScriptOutput): string {
  const scriptParts: string[] = [];

  scriptParts.push(scriptOutput.script.intro.text);
  scriptParts.push('');

  for (const section of scriptOutput.script.sections) {
    scriptParts.push(`[${section.title}]`);
    scriptParts.push(section.narration);
    scriptParts.push('');
  }

  scriptParts.push(scriptOutput.script.conclusion.text);

  return scriptParts.join('\n\n').trim();
}

function parseDraft(rawDraft: unknown): ParsedVideoDraft {
  if (!rawDraft || typeof rawDraft !== 'object') {
    throw new Error('Invalid draft content for NotebookLM video generation');
  }

  const value = rawDraft as Record<string, unknown>;
  const candidate =
    value.draft && typeof value.draft === 'object'
      ? (value.draft as Record<string, unknown>)
      : value;

  // Preferred: structured video script output
  const structured = videoScriptOutputSchema.safeParse(candidate);
  if (structured.success) {
    return {
      fullScript: buildFullScript(structured.data),
      estimatedDurationSeconds: structured.data.metadata.total_duration_seconds,
      sectionCount: structured.data.script.sections.length,
      tone: structured.data.metadata.tone,
      pacing: structured.data.metadata.pacing,
    };
  }

  // Fallback: plain script draft (for manual editing scenarios)
  const plainScript = candidate.script;
  if (typeof plainScript === 'string' && plainScript.trim()) {
    const durationValue = candidate.estimated_duration_seconds;
    const sectionCountValue = candidate.section_count;

    return {
      fullScript: plainScript.trim(),
      estimatedDurationSeconds:
        typeof durationValue === 'number' && Number.isFinite(durationValue) && durationValue > 0
          ? durationValue
          : undefined,
      sectionCount:
        typeof sectionCountValue === 'number' &&
        Number.isFinite(sectionCountValue) &&
        sectionCountValue > 0
          ? sectionCountValue
          : undefined,
      tone: typeof candidate.tone === 'string' ? candidate.tone : undefined,
      pacing: typeof candidate.pacing === 'string' ? candidate.pacing : undefined,
    };
  }

  throw new Error('Draft does not contain a valid video script');
}

function inferVideoFormatFromTarget(targetMinutes: number): NotebookLMVideoFormatPreset {
  if (targetMinutes <= 4) {
    return 'brief';
  }
  return NLM_DEFAULT_VIDEO_FORMAT;
}

function resolveVideoFormatPreset(
  settings: Record<string, unknown>,
  targetMinutes: number
): NotebookLMVideoFormatPreset {
  const preset = settings.nlm_video_format;
  if (isStringInSet(preset, NLM_VIDEO_FORMAT_PRESETS)) {
    return preset;
  }
  return inferVideoFormatFromTarget(targetMinutes);
}

function resolveVideoStylePreset(settings: Record<string, unknown>): NotebookLMVideoStylePreset {
  const preset = settings.nlm_video_style;
  if (isStringInSet(preset, NLM_VIDEO_STYLE_PRESETS)) {
    return preset;
  }
  return NLM_DEFAULT_VIDEO_STYLE;
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

function withNlmDurationSettings(input: EnrichmentHandlerInput): EnrichmentHandlerInput {
  const durationGuidance = resolveNlmDurationGuidance(
    input.enrichmentContext.lesson.duration_minutes
  );
  const mergedSettings: Record<string, unknown> = {
    ...(input.settings || {}),
    target_duration_minutes: durationGuidance.targetMinutes,
    duration_range_min_minutes: durationGuidance.minMinutes,
    duration_range_max_minutes: durationGuidance.maxMinutes,
  };

  return {
    ...input,
    settings: mergedSettings,
  };
}

async function generateDraft(input: EnrichmentHandlerInput): Promise<DraftResult> {
  if (!videoHandler.generateDraft) {
    throw new Error('Video draft generation is not configured');
  }

  const durationGuidance = resolveNlmDurationGuidance(
    input.enrichmentContext.lesson.duration_minutes
  );
  const inputWithDurationSettings = withNlmDurationSettings(input);

  logger.info(
    {
      enrichmentId: input.enrichmentContext.enrichment.id,
      lessonId: input.enrichmentContext.lesson.id,
      durationTargetMinutes: durationGuidance.targetMinutes,
      durationRangeMinMinutes: durationGuidance.minMinutes,
      durationRangeMaxMinutes: durationGuidance.maxMinutes,
    },
    'NLM video handler: generating draft (reusing video draft pipeline)'
  );

  return videoHandler.generateDraft(inputWithDurationSettings);
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
    'NLM video handler: generating final video via NotebookLM bridge'
  );

  const parsedDraft = parseDraft(draft.draftContent);
  let rawLessonContent: string | null = null;

  try {
    rawLessonContent = await getLessonContent(enrichmentContext.lesson.id);
  } catch (error) {
    logger.warn(
      {
        lessonId: enrichmentContext.lesson.id,
        error: error instanceof Error ? error.message : String(error),
      },
      'NLM video handler: failed to load raw lesson content for source bundle'
    );
  }

  const sourceStrategy = resolveSourceStrategy(settings);
  const durationGuidance = resolveNlmDurationGuidance(enrichmentContext.lesson.duration_minutes);
  const videoFormatPreset = resolveVideoFormatPreset(settings, durationGuidance.targetMinutes);
  const videoStylePreset = resolveVideoStylePreset(settings);
  const asyncMode = resolveNlmAsyncMode(settings);
  const bridgeTaskId = resolveBridgeTaskId(settings);
  const pollAttempt = resolvePollAttempt(settings);
  const sources = buildNotebookLMSources({
    strategy: sourceStrategy,
    scriptContent: parsedDraft.fullScript,
    scriptTitle: 'Video Draft Script',
    rawLessonContent,
    input,
  });
  let bridgeResult:
    | Awaited<ReturnType<typeof notebookLmBridgeClient.getTaskMedia>>
    | Awaited<ReturnType<typeof notebookLmBridgeClient.startVideo>>['immediateMedia'];
  let bridgeStartMetadata: Record<string, unknown> | undefined;

  if (asyncMode === NLM_ASYNC_MODE_POLL) {
    if (!bridgeTaskId) {
      throw new Error('NotebookLM video poll mode requires bridge task id');
    }

    const status = await notebookLmBridgeClient.getTaskStatus(bridgeTaskId, 'video');
    if (isNotebookLMTaskFailedStatus(status.status)) {
      throw new Error(
        `NotebookLM bridge task failed (taskId=${bridgeTaskId}, status=${status.status})`
      );
    }

    if (!isNotebookLMTaskSuccessfulStatus(status.status)) {
      const durationMs = Date.now() - startTime;
      const deferredContent: VideoEnrichmentContent = {
        type: 'video',
        script: parsedDraft.fullScript,
        avatar_id: (settings.avatar_id as string) || undefined,
        estimated_duration_seconds: parsedDraft.estimatedDurationSeconds ?? undefined,
        slides_sync_points: undefined,
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
            section_count: parsedDraft.sectionCount,
            tone: parsedDraft.tone,
            pacing: parsedDraft.pacing,
            source_strategy_used: sourceStrategy,
            source_count: sources.length,
            video_format_preset: videoFormatPreset,
            video_style_preset: videoStylePreset,
            duration_target_minutes: durationGuidance.targetMinutes,
            duration_range_min_minutes: durationGuidance.minMinutes,
            duration_range_max_minutes: durationGuidance.maxMinutes,
            bridge_task_id: bridgeTaskId,
            bridge_task_status: status.status,
            bridge_poll_attempt: pollAttempt,
            bridge_response: status.responseMetadata,
          },
        },
        deferredTask: {
          provider: 'notebooklm-bridge',
          mediaType: 'video',
          taskId: bridgeTaskId,
          status: status.status,
          responseMetadata: status.responseMetadata,
        },
      };
    }

    bridgeResult = await notebookLmBridgeClient.getTaskMedia(bridgeTaskId, 'video');
  } else {
    const start = await notebookLmBridgeClient.startVideo({
      lessonTitle: enrichmentContext.lesson.title,
      script: parsedDraft.fullScript,
      language: enrichmentContext.course.language || 'en',
      courseId: enrichmentContext.course.id,
      sources,
      videoFormat: videoFormatPreset,
      videoStyle: videoStylePreset,
      targetDurationMinutes: durationGuidance.targetMinutes,
      durationRangeMinMinutes: durationGuidance.minMinutes,
      durationRangeMaxMinutes: durationGuidance.maxMinutes,
    });

    bridgeStartMetadata = start.responseMetadata;

    if (!start.immediateMedia) {
      const durationMs = Date.now() - startTime;
      const deferredContent: VideoEnrichmentContent = {
        type: 'video',
        script: parsedDraft.fullScript,
        avatar_id: (settings.avatar_id as string) || undefined,
        estimated_duration_seconds: parsedDraft.estimatedDurationSeconds ?? undefined,
        slides_sync_points: undefined,
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
            section_count: parsedDraft.sectionCount,
            tone: parsedDraft.tone,
            pacing: parsedDraft.pacing,
            source_strategy_used: sourceStrategy,
            source_count: sources.length,
            video_format_preset: videoFormatPreset,
            video_style_preset: videoStylePreset,
            duration_target_minutes: durationGuidance.targetMinutes,
            duration_range_min_minutes: durationGuidance.minMinutes,
            duration_range_max_minutes: durationGuidance.maxMinutes,
            bridge_task_id: start.taskId,
            bridge_task_status: start.status,
            bridge_poll_attempt: pollAttempt,
            bridge_response: start.responseMetadata,
          },
        },
        deferredTask: {
          provider: 'notebooklm-bridge',
          mediaType: 'video',
          taskId: start.taskId,
          status: start.status,
          responseMetadata: start.responseMetadata,
        },
      };
    }

    bridgeResult = start.immediateMedia;
  }

  const content: VideoEnrichmentContent = {
    type: 'video',
    script: parsedDraft.fullScript,
    avatar_id: (settings.avatar_id as string) || undefined,
    estimated_duration_seconds:
      bridgeResult.durationSeconds ?? parsedDraft.estimatedDurationSeconds ?? undefined,
    slides_sync_points: undefined,
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
      section_count: parsedDraft.sectionCount,
      tone: parsedDraft.tone,
      pacing: parsedDraft.pacing,
      source_strategy_used: sourceStrategy,
      source_count: sources.length,
      video_format_preset: videoFormatPreset,
      video_style_preset: videoStylePreset,
      duration_target_minutes: durationGuidance.targetMinutes,
      duration_range_min_minutes: durationGuidance.minMinutes,
      duration_range_max_minutes: durationGuidance.maxMinutes,
      mime_type: bridgeResult.mimeType,
      format: bridgeResult.extension,
      bridge_response: bridgeResult.responseMetadata,
      bridge_start_response: bridgeStartMetadata,
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

export const nlmVideoHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generateDraft,
  generateFinal,
  generate,
};
