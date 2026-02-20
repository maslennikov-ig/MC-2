/**
 * NotebookLM Video Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-video-handler
 *
 * Two-stage flow:
 * - Phase 1: Generate/edit script draft (reuses existing video draft generation)
 * - Phase 2: Generate final video artifact through NotebookLM bridge
 */

import { logger } from '@/shared/logger';
import type { EnrichmentMetadata, VideoEnrichmentContent } from '@megacampus/shared-types';
import { videoScriptOutputSchema, type VideoScriptOutput } from '../prompts/video-prompt';
import { notebookLmBridgeClient } from '../services/notebooklm-bridge-client';
import type { EnrichmentHandler } from '../services/enrichment-router';
import type { DraftResult, EnrichmentHandlerInput, GenerateResult } from '../types';
import { videoHandler } from './video-handler';

interface ParsedVideoDraft {
  fullScript: string;
  estimatedDurationSeconds?: number;
  sectionCount?: number;
  tone?: string;
  pacing?: string;
}

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

async function generateDraft(input: EnrichmentHandlerInput): Promise<DraftResult> {
  if (!videoHandler.generateDraft) {
    throw new Error('Video draft generation is not configured');
  }

  logger.info(
    {
      enrichmentId: input.enrichmentContext.enrichment.id,
      lessonId: input.enrichmentContext.lesson.id,
    },
    'NLM video handler: generating draft (reusing video draft pipeline)'
  );

  return videoHandler.generateDraft(input);
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

  const bridgeResult = await notebookLmBridgeClient.generateVideoOverview({
    lessonTitle: enrichmentContext.lesson.title,
    script: parsedDraft.fullScript,
    language: enrichmentContext.course.language || 'en',
  });

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
      mime_type: bridgeResult.mimeType,
      format: bridgeResult.extension,
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

export const nlmVideoHandler: EnrichmentHandler = {
  generationFlow: 'two-stage',
  generateDraft,
  generateFinal,
  generate,
};
