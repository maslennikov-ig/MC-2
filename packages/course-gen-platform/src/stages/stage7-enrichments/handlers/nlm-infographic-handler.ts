/**
 * NotebookLM Infographic Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-infographic-handler
 *
 * Single-stage flow with poll-mode support:
 * - Start mode: fetches lesson content → generates infographic via bridge
 * - Poll mode: checks bridge task status → fetches result when ready
 * - Returns binary buffer for Supabase Storage upload (like audio/video)
 */

import { logger } from '@/shared/logger';
import type { InfographicEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
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

function buildDeferredResult(
  taskId: string,
  taskStatus: string,
  responseMetadata: Record<string, unknown> | undefined,
  durationMs: number,
  extra: Record<string, unknown>
): GenerateResult {
  return {
    content: {
      type: 'nlm_infographic',
      imageUrl: '',
      format: 'png',
    } as InfographicEnrichmentContent,
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
      mediaType: 'infographic',
      taskId,
      status: taskStatus,
      responseMetadata,
    },
  };
}

function buildInfographicResult(
  bridgeResult: { buffer: Buffer; mimeType: string; extension: string },
  durationMs: number,
  extra: Record<string, unknown>
): GenerateResult {
  const content: InfographicEnrichmentContent = {
    type: 'nlm_infographic',
    imageUrl: '', // Will be set by job-processor after Supabase Storage upload
    format: 'png',
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
    'NLM infographic handler: generating'
  );

  // Poll mode: check existing bridge task
  const asyncMode = resolveNlmAsyncMode(settings);
  const bridgeTaskId = resolveBridgeTaskId(settings);

  if (asyncMode === 'poll' && bridgeTaskId) {
    const poll = await checkBridgeTaskStatus(bridgeTaskId, 'infographic');
    const durationMs = Date.now() - startTime;

    if (!poll.completed) {
      return buildDeferredResult(
        bridgeTaskId,
        poll.status.status,
        poll.status.responseMetadata,
        durationMs,
        { poll_mode: true }
      );
    }

    const media = await fetchBridgeTaskMedia(bridgeTaskId, 'infographic');
    return buildInfographicResult(media, durationMs, {
      poll_mode: true,
      bridge_task_id: bridgeTaskId,
    });
  }

  // Start mode: initiate new generation
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

  // Read camelCase keys from validated on-demand schema
  const orientation = typeof settings.orientation === 'string' ? settings.orientation : 'portrait';
  const detailLevel = typeof settings.detailLevel === 'string' ? settings.detailLevel : 'detailed';

  const start = await notebookLmBridgeClient.startInfographic({
    lessonTitle: enrichmentContext.lesson.title,
    script: lessonContent,
    language,
    courseId: enrichmentContext.course.id,
    lessonId: enrichmentContext.lesson.id,
    sources,
    infographicOrientation: orientation,
    infographicDetail: detailLevel,
  });

  if (!start.immediateMedia) {
    const durationMs = Date.now() - startTime;
    return buildDeferredResult(start.taskId, start.status, start.responseMetadata, durationMs, {
      source_strategy_used: sourceStrategy,
      source_count: sources.length,
      orientation,
      detail_level: detailLevel,
    });
  }

  const durationMs = Date.now() - startTime;
  return buildInfographicResult(start.immediateMedia, durationMs, {
    source_strategy_used: sourceStrategy,
    source_count: sources.length,
    orientation,
    detail_level: detailLevel,
  });
}

export const nlmInfographicHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};
