/**
 * NotebookLM Infographic Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-infographic-handler
 *
 * Single-stage flow:
 * - Fetches lesson content and builds source bundle
 * - Generates infographic (PNG) via NotebookLM bridge
 * - Returns binary buffer for Supabase Storage upload (like audio/video)
 */

import { logger } from '@/shared/logger';
import type { InfographicEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import type { EnrichmentHandler } from '../services/enrichment-router';
import { getLessonContent } from '../services/database-service';
import { notebookLmBridgeClient } from '../services/notebooklm-bridge-client';
import type { EnrichmentHandlerInput, GenerateResult } from '../types';
import { buildNotebookLMSources, resolveSourceStrategy } from './nlm-shared';

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

  const lessonContent = await getLessonContent(
    enrichmentContext.lesson.id,
    enrichmentContext.course.id
  );
  if (!lessonContent) {
    throw new Error(`No lesson content found for lesson ${enrichmentContext.lesson.id}`);
  }

  const language = enrichmentContext.course.language || 'en';
  const sourceStrategy = resolveSourceStrategy(settings);
  const sources = buildNotebookLMSources({
    strategy: sourceStrategy,
    scriptContent: lessonContent,
    scriptTitle: 'Lesson Content',
    rawLessonContent: lessonContent,
    input,
  });

  const orientation = typeof settings.orientation === 'string' ? settings.orientation : 'portrait';
  const detailLevel =
    typeof settings.detail_level === 'string' ? settings.detail_level : 'detailed';

  const start = await notebookLmBridgeClient.startInfographic({
    lessonTitle: enrichmentContext.lesson.title,
    script: lessonContent,
    language,
    courseId: enrichmentContext.course.id,
    sources,
    infographicOrientation: orientation,
    infographicDetail: detailLevel,
  });

  if (!start.immediateMedia) {
    const durationMs = Date.now() - startTime;
    const deferredContent: InfographicEnrichmentContent = {
      type: 'nlm_infographic',
      imageUrl: '',
      format: 'png',
    };

    return {
      content: deferredContent,
      metadata: {
        generated_at: new Date().toISOString(),
        generation_duration_ms: durationMs,
        estimated_cost_usd: 0,
        model_used: 'notebooklm-bridge',
        quality_score: 1.0,
        retry_attempts: 0,
        additional_info: {
          bridge: 'notebooklm',
          source_strategy_used: sourceStrategy,
          source_count: sources.length,
          orientation,
          detail_level: detailLevel,
          bridge_task_id: start.taskId,
          bridge_task_status: start.status,
        },
      },
      deferredTask: {
        provider: 'notebooklm-bridge',
        mediaType: 'infographic',
        taskId: start.taskId,
        status: start.status,
        responseMetadata: start.responseMetadata,
      },
    };
  }

  const bridgeResult = start.immediateMedia;

  const content: InfographicEnrichmentContent = {
    type: 'nlm_infographic',
    imageUrl: '', // Will be set by job-processor after Supabase Storage upload
    format: 'png',
    file_size_bytes: bridgeResult.buffer.length,
  };

  const durationMs = Date.now() - startTime;

  const metadata: EnrichmentMetadata = {
    generated_at: new Date().toISOString(),
    generation_duration_ms: durationMs,
    estimated_cost_usd: 0,
    model_used: 'notebooklm-bridge',
    quality_score: 1.0,
    retry_attempts: 0,
    additional_info: {
      bridge: 'notebooklm',
      source_strategy_used: sourceStrategy,
      source_count: sources.length,
      orientation,
      detail_level: detailLevel,
      mime_type: bridgeResult.mimeType,
      file_size_bytes: bridgeResult.buffer.length,
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

export const nlmInfographicHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};
