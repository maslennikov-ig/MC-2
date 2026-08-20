/**
 * Token Tracking Service
 *
 * Persists LLM token usage and costs to generation_trace table.
 * Non-blocking - failures should not break the pipeline.
 *
 * @module services/token-tracking-service
 */

import { getSupabaseAdmin } from '../shared/supabase/admin';
import { logger } from '../shared/logger';

/**
 * Trace entry data structure
 *
 * Maps to CostTracker's StageCost structure with required fields
 * for database persistence.
 */
export interface TraceEntry {
  courseId: string;
  stageNumber: number;
  phaseName: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

/** Rows per request when reading a course's traces. */
const TRACE_PAGE_SIZE = 1000;

/** One trace row, as much of it as a cost summary needs. */
interface TraceCostRow {
  id: string;
  stage: string;
  tokens_used: number | null;
  cost_usd: number | null;
}

/**
 * Course token summary aggregated from traces
 */
export interface CourseTokenSummary {
  totalTokens: number;
  totalCostUsd: number;
  byStage: Array<{ stage: number; tokens: number; cost: number }>;
  /**
   * What the user spent editing the course after it was generated: chat, inline
   * block edits, element CRUD.
   *
   * Reported apart from `byStage` because an edit is not a pipeline stage, and
   * counted in `totalCostUsd` because it is the same course's money. Lumping it
   * into a numbered stage would have made it stage 0 — indistinguishable from a
   * row whose stage could not be read (mc2-b7olk.5).
   */
  editing: { tokens: number; cost: number };
}

/**
 * Record a trace entry to the database
 *
 * Non-blocking operation - errors are logged but not thrown
 * to avoid breaking the generation pipeline.
 *
 * @param entry - Trace entry data
 *
 * @example
 * ```typescript
 * await recordTrace({
 *   courseId: 'uuid',
 *   stageNumber: 2,
 *   phaseName: 'classification',
 *   modelId: 'qwen/qwen3-235b-a22b-2507',
 *   inputTokens: 5000,
 *   outputTokens: 1000,
 *   costUsd: 0.0011,
 *   durationMs: 2500
 * });
 * ```
 */
export async function recordTrace(entry: TraceEntry): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from('generation_trace').insert({
      course_id: entry.courseId,
      stage: `stage_${entry.stageNumber}`,
      phase: entry.phaseName,
      step_name: 'llm_call',
      model_used: entry.modelId,
      tokens_used: entry.inputTokens + entry.outputTokens,
      cost_usd: entry.costUsd,
      duration_ms: entry.durationMs,
      input_data: {
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        ...(entry.metadata || {}),
      },
      created_at: new Date().toISOString(),
    });

    if (error) {
      logger.warn({ error, entry }, 'Failed to record trace to database');
      // Don't throw - tracing should not break the pipeline
    } else {
      logger.debug({ entry }, 'Trace recorded successfully');
    }
  } catch (error) {
    logger.warn({ error, entry }, 'Error recording trace to database');
    // Don't throw - tracing should not break the pipeline
  }
}

/**
 * Get total tokens and cost for a course
 *
 * Aggregates all traces for a given course, grouped by stage.
 *
 * @param courseId - Course UUID
 * @returns Course token summary with totals and per-stage breakdown
 *
 * @example
 * ```typescript
 * const summary = await getCourseTokenSummary('uuid');
 * // {
 * //   totalTokens: 125000,
 * //   totalCostUsd: 0.45,
 * //   byStage: [
 * //     { stage: 2, tokens: 50000, cost: 0.15 },
 * //     { stage: 3, tokens: 75000, cost: 0.30 }
 * //   ]
 * // }
 * ```
 */
export async function getCourseTokenSummary(courseId: string): Promise<CourseTokenSummary> {
  const rows = await readCourseTraceRows(courseId);
  // A caller that only reads gets the same zero-shape it always got.
  return rows === null ? emptySummary() : summarizeTraceRows(rows);
}

/** A course with nothing traced against it, and what a failed read looks like to a reader. */
function emptySummary(): CourseTokenSummary {
  return { totalTokens: 0, totalCostUsd: 0, byStage: [], editing: { tokens: 0, cost: 0 } };
}

/**
 * Every trace row for a course, or `null` when the read did not finish.
 *
 * `null` rather than an empty array on purpose: a caller that writes the result
 * somewhere cannot otherwise tell a failed read from a course that genuinely
 * cost nothing, and the two want opposite handling.
 */
async function readCourseTraceRows(courseId: string): Promise<TraceCostRow[] | null> {
  try {
    const supabase = getSupabaseAdmin();

    // Read the traces a page at a time. An unbounded select is capped by
    // PostgREST's `db-max-rows` if the project sets one, and a cap on a sum
    // does not fail — it under-reports, silently, and only for the courses with
    // the longest history. This is the writer of `courses.estimated_cost_usd`
    // on every edit, so it must not be able to truncate.
    //
    // Paged by cursor rather than by offset. `generation_trace.id` defaults to
    // `gen_random_uuid()`, so the sort order is stable but unrelated to
    // insertion order: a row inserted between two page requests lands anywhere
    // in it, and one that lands before the boundary shifts a boundary row down
    // into the next OFFSET, where it is read and counted twice. Stage 6
    // refreshes the course total as each lesson finishes while sibling jobs for
    // the same course are still inserting, so that is a live race, not a
    // theoretical one. With a cursor, a concurrent insert either sorts after it
    // and is counted once, or sorts before it and is missed — stale, never
    // double-counted, and the next refresh picks it up.
    const rows: TraceCostRow[] = [];
    let cursor: string | null = null;
    for (;;) {
      let query = supabase
        .from('generation_trace')
        .select('id, stage, tokens_used, cost_usd')
        .eq('course_id', courseId);
      if (cursor !== null) query = query.gt('id', cursor);

      const page = await query.order('id', { ascending: true }).limit(TRACE_PAGE_SIZE);

      if (page.error || !page.data) {
        logger.warn({ courseId, cursor, error: page.error }, 'Failed to read the course traces');
        return null;
      }

      if (page.data.length === 0) break;
      rows.push(...page.data);
      // Whatever the server returned, the next page starts after the last row
      // it gave us — so a `db-max-rows` cap below the page size costs a round
      // trip and nothing else.
      cursor = page.data[page.data.length - 1].id;
    }

    return rows;
  } catch (error) {
    logger.warn({ courseId, error }, 'Error reading the course traces');
    return null;
  }
}

/** Adds the rows up. Pure, so the read and the arithmetic fail separately or not at all. */
function summarizeTraceRows(rows: TraceCostRow[]): CourseTokenSummary {
  const byStage = new Map<number, { tokens: number; cost: number }>();
  const editing = { tokens: 0, cost: 0 };
  let totalTokens = 0;
  let totalCostUsd = 0;

  for (const row of rows) {
    totalTokens += row.tokens_used || 0;
    totalCostUsd += row.cost_usd || 0;

    // Editing has no stage number, and forcing one on it would file it under
    // stage 0 next to rows whose stage could not be read.
    if (row.stage === 'stage_edit') {
      editing.tokens += row.tokens_used || 0;
      editing.cost += row.cost_usd || 0;
      continue;
    }

    // Extract stage number from 'stage_N' format
    const stageMatch = row.stage.match(/stage_(\d+)/);
    const stageNumber = stageMatch ? parseInt(stageMatch[1], 10) : 0;

    const existing = byStage.get(stageNumber) || { tokens: 0, cost: 0 };
    byStage.set(stageNumber, {
      tokens: existing.tokens + (row.tokens_used || 0),
      cost: existing.cost + (row.cost_usd || 0),
    });
  }

  return {
    totalTokens,
    totalCostUsd: Number(totalCostUsd.toFixed(6)),
    byStage: Array.from(byStage.entries())
      .map(([stage, data]) => ({
        stage,
        tokens: data.tokens,
        cost: Number(data.cost.toFixed(6)),
      }))
      .sort((a, b) => a.stage - b.stage),
    editing: { tokens: editing.tokens, cost: Number(editing.cost.toFixed(6)) },
  };
}

/**
 * Writes the course's traced spend into `courses.estimated_cost_usd`.
 *
 * The column was null for every course, so the only way to answer "what did
 * this course cost" was the provider's key counter, which knows nothing about
 * courses (mc2-o7740). The traces are the source; this is their sum, refreshed
 * as the course progresses.
 *
 * A read that did not finish leaves the column alone. The summary's zero-shape
 * is indistinguishable from a course that genuinely cost nothing, so writing it
 * would replace a real recorded cost with 0 on any transient failure — and the
 * courses most exposed are the ones with the most rows to read, which is the
 * wrong way round. A stale number beats a wrong one; the next edit or stage
 * refreshes it.
 *
 * Two refreshes overlapping on one course — a stage refresh racing an edit
 * refresh, or a blue/green window — each read the whole table and each write the
 * whole figure, so the later write wins even when it carries the older sum. That
 * bound is accepted: the trace rows are never at risk, and the next refresh
 * reads the table again and puts the number right.
 *
 * Do not "fix" it by writing only when the new sum is larger. That guard would
 * permanently block the legitimate decrease `restart_from_stage` produces when
 * it deletes the traces of the stages being redone (mc2-fyn4f), and a course
 * would keep claiming the cost of a run that no longer exists (mc2-3vxbe).
 *
 * Never throws: accounting must not be able to fail a generation.
 */
export async function updateCourseEstimatedCost(courseId: string): Promise<number | undefined> {
  try {
    const rows = await readCourseTraceRows(courseId);
    if (rows === null) {
      logger.warn(
        { courseId },
        'Course traces could not be read; leaving the recorded estimated cost as it was'
      );
      return undefined;
    }

    const summary = summarizeTraceRows(rows);
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('courses')
      .update({ estimated_cost_usd: summary.totalCostUsd })
      .eq('id', courseId);

    if (error) {
      logger.warn({ courseId, error }, 'Failed to write the course estimated cost');
      return undefined;
    }
    logger.info(
      { courseId, estimatedCostUsd: summary.totalCostUsd, totalTokens: summary.totalTokens },
      'Course estimated cost updated'
    );
    return summary.totalCostUsd;
  } catch (error) {
    logger.warn({ courseId, error }, 'Error writing the course estimated cost');
    return undefined;
  }
}
