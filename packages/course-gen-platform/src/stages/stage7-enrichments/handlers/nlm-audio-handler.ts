/**
 * NotebookLM Audio Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-audio-handler
 *
 * Two-stage flow:
 * - Phase 1: Prepare editable narration draft from lesson content
 * - Phase 2: Generate final audio via NotebookLM bridge service
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
import { notebookLmBridgeClient } from '../services/notebooklm-bridge-client';
import type { DraftResult, EnrichmentHandlerInput, GenerateResult } from '../types';

interface NlmAudioDraft {
  type: 'nlm_audio_draft';
  script: string;
  voice_id: string;
  format: string;
  speed: number;
  duration_seconds: number;
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
  const { enrichmentContext } = input;
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

  const bridgeResult = await notebookLmBridgeClient.generateAudio({
    lessonTitle: enrichmentContext.lesson.title,
    script: normalizedDraft.script,
    language,
    voice: normalizedDraft.voice_id,
  });

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
      bridge_response: bridgeResult.responseMetadata,
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
  generationFlow: 'two-stage',
  generateDraft,
  generateFinal,
  generate,
};
