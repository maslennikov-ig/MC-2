/**
 * NotebookLM Report Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-report-handler
 *
 * Single-stage flow with poll-mode support:
 * - Start mode: fetches lesson content → generates a report via the bridge
 * - Poll mode: checks bridge task status → fetches the result when ready
 * - Stores inline in the JSONB content column (no asset upload)
 *
 * mc2-6ye5z.5. The study guide's sibling, and the reason both carry their
 * format: in NotebookLM every report is the same artifact type and only the
 * format differs, so an `nlm_report` row holding a study guide would make the
 * two enrichment types indistinguishable afterwards. `study_guide` is refused
 * here and at the bridge.
 */

import { logger } from '@/shared/logger';
import type { ReportEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
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

type ReportFormat = ReportEnrichmentContent['report_format'];

const REPORT_FORMATS: readonly ReportFormat[] = ['briefing_doc', 'blog_post', 'custom'];

/**
 * Which report to ask for.
 *
 * `study_guide` is a valid NotebookLM format and is deliberately NOT one of
 * these: it belongs to `nlm_study_guide`, and silently accepting it here would
 * produce two enrichment types holding the same artifact.
 */
function resolveReportFormat(value: unknown): ReportFormat {
  if (value === 'study_guide') {
    throw new Error(
      "report_format 'study_guide' belongs to the nlm_study_guide enrichment; " +
        'use that type so the two stay distinguishable'
    );
  }
  return REPORT_FORMATS.find(format => format === value) ?? 'briefing_doc';
}

function buildDeferredResult(
  taskId: string,
  taskStatus: string,
  responseMetadata: Record<string, unknown> | undefined,
  durationMs: number,
  reportFormat: ReportFormat,
  extra: Record<string, unknown>
): GenerateResult {
  return {
    content: {
      type: 'nlm_report',
      markdown: '',
      report_format: reportFormat,
    } as ReportEnrichmentContent,
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
        report_format: reportFormat,
        ...extra,
      },
    },
    deferredTask: {
      provider: 'notebooklm-bridge',
      mediaType: 'report',
      taskId,
      status: taskStatus,
      responseMetadata,
    },
  };
}

function parseReportResult(
  rawMedia: { textContent?: string; buffer: Buffer },
  durationMs: number,
  reportFormat: ReportFormat,
  extra: Record<string, unknown>
): GenerateResult {
  const markdownContent = rawMedia.textContent ?? rawMedia.buffer.toString('utf-8');
  const wordCount = markdownContent.split(/\s+/).filter(Boolean).length;

  const content: ReportEnrichmentContent = {
    type: 'nlm_report',
    markdown: markdownContent,
    report_format: reportFormat,
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
      report_format: reportFormat,
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
    'NLM report handler: generating'
  );

  const reportFormat = resolveReportFormat(settings.reportFormat);

  // Poll mode: check an existing bridge task
  const asyncMode = resolveNlmAsyncMode(settings);
  const bridgeTaskId = resolveBridgeTaskId(settings);

  if (asyncMode === 'poll' && bridgeTaskId) {
    const poll = await checkBridgeTaskStatus(bridgeTaskId, 'report');
    const durationMs = Date.now() - startTime;

    if (!poll.completed) {
      return buildDeferredResult(
        bridgeTaskId,
        poll.status.status,
        poll.status.responseMetadata,
        durationMs,
        reportFormat,
        { poll_mode: true }
      );
    }

    const media = await fetchBridgeTaskMedia(bridgeTaskId, 'report');
    return parseReportResult(media, durationMs, reportFormat, {
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

  const instructions =
    typeof settings.instructions === 'string' ? settings.instructions : undefined;

  const start = await notebookLmBridgeClient.startReport({
    lessonTitle: enrichmentContext.lesson.title,
    script: lessonContent,
    language,
    courseId: enrichmentContext.course.id,
    lessonId: enrichmentContext.lesson.id,
    sources,
    reportFormat,
    artifactInstructions: instructions,
  });

  const extra = {
    source_strategy_used: sourceStrategy,
    source_count: sources.length,
  };

  if (!start.immediateMedia) {
    const durationMs = Date.now() - startTime;
    return buildDeferredResult(
      start.taskId,
      start.status,
      start.responseMetadata,
      durationMs,
      reportFormat,
      extra
    );
  }

  const durationMs = Date.now() - startTime;
  return parseReportResult(start.immediateMedia, durationMs, reportFormat, extra);
}

export const nlmReportHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};
