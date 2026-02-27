/**
 * NotebookLM Study Guide Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-study-guide-handler
 *
 * Single-stage flow:
 * - Fetches lesson content and builds source bundle
 * - Generates study guide (Markdown) via NotebookLM bridge
 * - Stores inline in JSONB content column (no asset upload)
 */

import { logger } from '@/shared/logger';
import type { StudyGuideEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
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
    'NLM study guide handler: generating'
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

  const detailLevel =
    typeof settings.detail_level === 'string' ? settings.detail_level : 'standard';

  const start = await notebookLmBridgeClient.startStudyGuide({
    lessonTitle: enrichmentContext.lesson.title,
    script: lessonContent,
    language,
    courseId: enrichmentContext.course.id,
    sources,
    reportFormat: detailLevel,
  });

  if (!start.immediateMedia) {
    // Deferred — return with task info for polling
    const durationMs = Date.now() - startTime;
    const deferredContent: StudyGuideEnrichmentContent = {
      type: 'nlm_study_guide',
      markdown: '',
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
          detail_level: detailLevel,
          bridge_task_id: start.taskId,
          bridge_task_status: start.status,
        },
      },
      deferredTask: {
        provider: 'notebooklm-bridge',
        mediaType: 'study_guide',
        taskId: start.taskId,
        status: start.status,
        responseMetadata: start.responseMetadata,
      },
    };
  }

  const bridgeResult = start.immediateMedia;
  const markdownContent = bridgeResult.textContent ?? bridgeResult.buffer.toString('utf-8');
  const wordCount = markdownContent.split(/\s+/).filter(Boolean).length;

  const content: StudyGuideEnrichmentContent = {
    type: 'nlm_study_guide',
    markdown: markdownContent,
    word_count: wordCount,
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
      detail_level: detailLevel,
      word_count: wordCount,
    },
  };

  return { content, metadata };
}

export const nlmStudyGuideHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};
