/**
 * NotebookLM Slide Deck Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-slide-deck-handler
 *
 * Single-stage flow with poll-mode support:
 * - Start mode: fetches lesson content → generates a slide deck via the bridge
 * - Poll mode: checks bridge task status → fetches the result when ready
 * - Returns a binary buffer for Supabase Storage upload (like the infographic)
 *
 * mc2-6ye5z.4. The `nlm_slide_deck` enum value has been in the database since
 * 2026-08-22 and nothing could produce a row: there was no bridge endpoint and
 * no handler. This is the other half.
 *
 * The deck is PDF or PPTX, and which one is a request option rather than a
 * constant — so the format travels with the content instead of being assumed
 * downstream.
 */

import { logger } from '@/shared/logger';
import type { SlideDeckEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import type { EnrichmentHandler } from '../services/enrichment-router';
import { getLessonContent } from '../services/database-service';
import { notebookLmBridgeClient } from '../services/notebooklm-bridge-client';
import type { EnrichmentHandlerInput, GenerateResult } from '../types';
import {
  buildStandardSources,
  resolveNlmAsyncMode,
  resolveBridgeTaskId,
  checkBridgeTaskStatus,
  fetchBridgeTaskMedia,
} from './nlm-shared';

type DeckFormat = SlideDeckEnrichmentContent['format'];

/** PDF unless the caller asked for PPTX; anything else is not a deck format. */
function resolveOutputFormat(value: unknown): DeckFormat {
  return value === 'pptx' ? 'pptx' : 'pdf';
}

function buildDeferredResult(
  taskId: string,
  taskStatus: string,
  responseMetadata: Record<string, unknown> | undefined,
  durationMs: number,
  format: DeckFormat,
  extra: Record<string, unknown>
): GenerateResult {
  return {
    content: {
      type: 'nlm_slide_deck',
      fileUrl: '',
      format,
    } as SlideDeckEnrichmentContent,
    metadata: {
      generated_at: new Date().toISOString(),
      generation_duration_ms: durationMs,
      estimated_cost_usd: 0,
      model_used: 'notebooklm-bridge',
      quality_score: 1.0,
      retry_attempts: 0,
      additional_info: {
        bridge: 'notebooklm',
        bridge_task_id: taskId,
        bridge_task_status: taskStatus,
        ...extra,
      },
    },
    deferredTask: {
      provider: 'notebooklm-bridge',
      mediaType: 'slide_deck',
      taskId,
      status: taskStatus,
      responseMetadata,
    },
  };
}

function buildSlideDeckResult(
  bridgeResult: { buffer: Buffer; mimeType: string; extension: string },
  durationMs: number,
  extra: Record<string, unknown>
): GenerateResult {
  // What arrived wins over what was asked for: the bridge reports the mime type
  // it actually downloaded, and labelling a PPTX as PDF would break whoever
  // opens it.
  const format: DeckFormat = bridgeResult.extension === 'pptx' ? 'pptx' : 'pdf';

  const content: SlideDeckEnrichmentContent = {
    type: 'nlm_slide_deck',
    fileUrl: '', // Set by the job processor after the Supabase Storage upload
    format,
    file_size_bytes: bridgeResult.buffer.length,
  };

  const metadata: EnrichmentMetadata = {
    generated_at: new Date().toISOString(),
    generation_duration_ms: durationMs,
    estimated_cost_usd: 0,
    model_used: 'notebooklm-bridge',
    quality_score: 1.0,
    retry_attempts: 0,
    additional_info: {
      bridge: 'notebooklm',
      mime_type: bridgeResult.mimeType,
      file_size_bytes: bridgeResult.buffer.length,
      slide_deck_output_format: format,
      ...extra,
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
  const { enrichmentContext, settings } = input;
  const startTime = Date.now();

  logger.info(
    {
      enrichmentId: enrichmentContext.enrichment.id,
      lessonId: enrichmentContext.lesson.id,
      lessonTitle: enrichmentContext.lesson.title,
    },
    'NLM slide deck handler: generating'
  );

  const outputFormat = resolveOutputFormat(settings.outputFormat);

  // Poll mode: check an existing bridge task
  const asyncMode = resolveNlmAsyncMode(settings);
  const bridgeTaskId = resolveBridgeTaskId(settings);

  if (asyncMode === 'poll' && bridgeTaskId) {
    const poll = await checkBridgeTaskStatus(bridgeTaskId, 'slide_deck');
    const durationMs = Date.now() - startTime;

    if (!poll.completed) {
      return buildDeferredResult(
        bridgeTaskId,
        poll.status.status,
        poll.status.responseMetadata,
        durationMs,
        outputFormat,
        { poll_mode: true }
      );
    }

    const media = await fetchBridgeTaskMedia(bridgeTaskId, 'slide_deck');
    return buildSlideDeckResult(media, durationMs, {
      poll_mode: true,
      bridge_task_id: bridgeTaskId,
    });
  }

  // Start mode: initiate a new generation
  const lessonContent = await getLessonContent(
    enrichmentContext.lesson.id,
    enrichmentContext.course.id
  );
  if (!lessonContent) {
    throw new Error(`No lesson content found for lesson ${enrichmentContext.lesson.id}`);
  }

  const { language, sources, sourceStrategy } = buildStandardSources(
    lessonContent,
    settings,
    input
  );

  // Read camelCase keys from the validated on-demand schema
  const deckFormat =
    typeof settings.deckFormat === 'string' ? settings.deckFormat : 'detailed_deck';
  const deckLength = typeof settings.deckLength === 'string' ? settings.deckLength : 'default';

  const start = await notebookLmBridgeClient.startSlideDeck({
    lessonTitle: enrichmentContext.lesson.title,
    script: lessonContent,
    language,
    courseId: enrichmentContext.course.id,
    lessonId: enrichmentContext.lesson.id,
    sources,
    slideDeckFormat: deckFormat,
    slideDeckLength: deckLength,
    slideDeckOutputFormat: outputFormat,
  });

  const extra = {
    source_strategy_used: sourceStrategy,
    source_count: sources.length,
    deck_format: deckFormat,
    deck_length: deckLength,
  };

  if (!start.immediateMedia) {
    const durationMs = Date.now() - startTime;
    return buildDeferredResult(
      start.taskId,
      start.status,
      start.responseMetadata,
      durationMs,
      outputFormat,
      extra
    );
  }

  const durationMs = Date.now() - startTime;
  return buildSlideDeckResult(start.immediateMedia, durationMs, extra);
}

export const nlmSlideDeckHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};
