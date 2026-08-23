/**
 * NotebookLM Data Table Enrichment Handler
 * @module stages/stage7-enrichments/handlers/nlm-data-table-handler
 *
 * Single-stage flow with poll-mode support:
 * - Start mode: fetches lesson content → generates a data table via the bridge
 * - Poll mode: checks bridge task status → fetches the result when ready
 * - Stores inline in the JSONB content column (no asset upload)
 *
 * mc2-6ye5z.8. The CSV is kept as CSV. Re-encoding it into rows here would make
 * this the second place that decides what a cell is, and the first — whatever
 * renders it — would then disagree with the artifact. `headers` and `row_count`
 * are read off the top of the file as a convenience and are advisory.
 */

import { logger } from '@/shared/logger';
import type { DataTableEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
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

/**
 * Read the header row and count the data rows.
 *
 * A deliberately shallow read: it splits on newlines and commas and does not
 * understand quoted fields containing either. That is why the result is
 * optional metadata beside the CSV rather than a replacement for it — a wrong
 * header list is a cosmetic flaw, a wrongly-parsed artifact is data loss.
 */
function summariseCsv(csv: string): { headers?: string[]; rowCount?: number } {
  const lines = csv.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return {};

  const headers = lines[0].split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
  return {
    headers: headers.some(header => header.length > 0) ? headers : undefined,
    rowCount: Math.max(0, lines.length - 1),
  };
}

function buildDeferredResult(
  taskId: string,
  taskStatus: string,
  responseMetadata: Record<string, unknown> | undefined,
  durationMs: number,
  extra: Record<string, unknown>
): GenerateResult {
  return {
    content: { type: 'nlm_data_table', csv: '' } as DataTableEnrichmentContent,
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
      mediaType: 'data_table',
      taskId,
      status: taskStatus,
      responseMetadata,
    },
  };
}

function parseDataTableResult(
  rawMedia: { textContent?: string; buffer: Buffer },
  durationMs: number,
  extra: Record<string, unknown>
): GenerateResult {
  const csv = rawMedia.textContent ?? rawMedia.buffer.toString('utf-8');
  const { headers, rowCount } = summariseCsv(csv);

  const content: DataTableEnrichmentContent = {
    type: 'nlm_data_table',
    csv,
    headers,
    row_count: rowCount,
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
      row_count: rowCount,
      column_count: headers?.length,
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
    'NLM data table handler: generating'
  );

  // Poll mode: check an existing bridge task
  const asyncMode = resolveNlmAsyncMode(settings);
  const bridgeTaskId = resolveBridgeTaskId(settings);

  if (asyncMode === 'poll' && bridgeTaskId) {
    const poll = await checkBridgeTaskStatus(bridgeTaskId, 'data_table');
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

    const media = await fetchBridgeTaskMedia(bridgeTaskId, 'data_table');
    return parseDataTableResult(media, durationMs, {
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

  const start = await notebookLmBridgeClient.startDataTable({
    lessonTitle: enrichmentContext.lesson.title,
    script: lessonContent,
    language,
    courseId: enrichmentContext.course.id,
    lessonId: enrichmentContext.lesson.id,
    sources,
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
      extra
    );
  }

  const durationMs = Date.now() - startTime;
  return parseDataTableResult(start.immediateMedia, durationMs, extra);
}

export const nlmDataTableHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
};
