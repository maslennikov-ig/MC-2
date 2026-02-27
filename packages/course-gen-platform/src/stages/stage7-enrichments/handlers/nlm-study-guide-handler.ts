/**
 * NotebookLM Study Guide Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-study-guide-handler
 *
 * Single-stage flow with poll-mode support:
 * - Start mode: fetches lesson content → generates study guide via bridge
 * - Poll mode: checks bridge task status → fetches result when ready
 * - Stores inline in JSONB content column (no asset upload)
 */

import { logger } from '@/shared/logger';
import type { StudyGuideEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import type { EnrichmentHandler } from '../services/enrichment-router';
import { getLessonContent } from '../services/database-service';
import { notebookLmBridgeClient } from '../services/notebooklm-bridge-client';
import type { EnrichmentHandlerInput, GenerateResult } from '../types';
import {
  buildNotebookLMSources,
  resolveSourceStrategy,
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
    content: { type: 'nlm_study_guide', markdown: '' } as StudyGuideEnrichmentContent,
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
      mediaType: 'study_guide',
      taskId,
      status: taskStatus,
      responseMetadata,
    },
  };
}

function parseMarkdownResult(
  rawMedia: { textContent?: string; buffer: Buffer },
  durationMs: number,
  extra: Record<string, unknown>
): GenerateResult {
  const markdownContent = rawMedia.textContent ?? rawMedia.buffer.toString('utf-8');
  const wordCount = markdownContent.split(/\s+/).filter(Boolean).length;

  const content: StudyGuideEnrichmentContent = {
    type: 'nlm_study_guide',
    markdown: markdownContent,
    word_count: wordCount,
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
      word_count: wordCount,
      ...extra,
    },
  };

  return { content, metadata };
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
    'NLM study guide handler: generating'
  );

  // Poll mode: check existing bridge task
  const asyncMode = resolveNlmAsyncMode(settings);
  const bridgeTaskId = resolveBridgeTaskId(settings);

  if (asyncMode === 'poll' && bridgeTaskId) {
    const poll = await checkBridgeTaskStatus(bridgeTaskId, 'study_guide');
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

    const media = await fetchBridgeTaskMedia(bridgeTaskId, 'study_guide');
    return parseMarkdownResult(media, durationMs, {
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

  const language = enrichmentContext.course.language || 'en';
  const sourceStrategy = resolveSourceStrategy(settings);
  const sources = buildNotebookLMSources({
    strategy: sourceStrategy,
    scriptContent: lessonContent,
    scriptTitle: enrichmentContext.lesson.title,
    rawLessonContent: lessonContent,
    input,
  });

  // Read camelCase key from validated on-demand schema
  const detailLevel = typeof settings.detailLevel === 'string' ? settings.detailLevel : 'standard';

  const start = await notebookLmBridgeClient.startStudyGuide({
    lessonTitle: enrichmentContext.lesson.title,
    script: lessonContent,
    language,
    courseId: enrichmentContext.course.id,
    sources,
    reportFormat: detailLevel,
  });

  if (!start.immediateMedia) {
    const durationMs = Date.now() - startTime;
    return buildDeferredResult(start.taskId, start.status, start.responseMetadata, durationMs, {
      source_strategy_used: sourceStrategy,
      source_count: sources.length,
      detail_level: detailLevel,
    });
  }

  const durationMs = Date.now() - startTime;
  return parseMarkdownResult(start.immediateMedia, durationMs, {
    source_strategy_used: sourceStrategy,
    source_count: sources.length,
    detail_level: detailLevel,
  });
}

export const nlmStudyGuideHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};
