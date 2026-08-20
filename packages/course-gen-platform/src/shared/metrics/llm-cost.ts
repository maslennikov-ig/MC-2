/**
 * What one LLM call cost, written where the money can be counted later.
 *
 * The tracking path existed and was dead: `costTracker.recordStageCost` had no
 * production caller, so `generation_trace.cost_usd` was empty in all but 162 of
 * 37107 rows and `courses.estimated_cost_usd` was null for every course. The
 * only way to answer "what did this course cost" was the provider's own key
 * counter, which knows nothing about courses, stages or models (mc2-o7740).
 *
 * Prices come from `MODEL_CATALOG` and nowhere else: a second price table in
 * this repository would drift from the routing configuration that picks the
 * models.
 */

import {
  getModelCapabilities,
  hasExactModelPricing,
  normalizeModelId,
} from '@megacampus/shared-types';

import logger from '../logger';
import { logTrace } from '../trace-logger';

/** Where a call belongs, so its cost lands on the right course and stage. */
export interface LlmCostContext {
  courseId: string;
  /**
   * Trace `stage` value, e.g. `stage_6`.
   *
   * `stage_edit` is the home for what a user spends after generation: chat,
   * inline block edits, element CRUD, regeneration of one block. Those calls
   * have no pipeline stage, which is why nothing recorded them — a user could
   * rewrite a course all day and the cost stayed at zero (mc2-b7olk.5). They are
   * real money against a real course, so they belong in the same table; the
   * per-stage breakdown reports them separately rather than as a stage.
   */
  stage:
    | 'stage_1'
    | 'stage_2'
    | 'stage_3'
    | 'stage_4'
    | 'stage_5'
    | 'stage_6'
    | 'stage_7'
    | 'stage_edit';
  /** Trace `phase` value, e.g. `stage_6_complex`. */
  phase: string;
  lessonId?: string;
  /** Trace `step_name`; defaults to `llm_call`. */
  stepName?: string;
  durationMs?: number;
  retryAttempt?: number;
}

export interface LlmCallUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Price of one call in USD, or `undefined` when the model is not catalogued.
 *
 * An uncatalogued model is a routing bug, not a rounding problem, so it is
 * reported rather than silently priced at zero.
 */
export function calculateLlmCostUsd(usage: LlmCallUsage): number | undefined {
  const capabilities = getModelCapabilities(usage.model);
  if (!capabilities) return undefined;
  return (
    (usage.inputTokens * capabilities.inputPricePerMillion) / 1_000_000 +
    (usage.outputTokens * capabilities.outputPricePerMillion) / 1_000_000
  );
}

/**
 * Records one image generation against a course.
 *
 * An image is billed per picture, not per token, so its price comes from the
 * provider's own figure rather than from `MODEL_CATALOG`. It still belongs in
 * the trace: the course total is a sum over that table, and a card image that
 * recorded its price only in `lesson_enrichments.metadata` was 18% of the
 * course it was billed to and invisible in the total (mc2-acjgd).
 */
export async function recordImageCallCost(
  usage: { model: string; costUsd: number },
  context?: LlmCostContext
): Promise<void> {
  if (!context) {
    logger.debug(
      { model: usage.model, costUsd: usage.costUsd },
      '[Cost] Image generated without a course context; its cost is not attributed'
    );
    return;
  }

  try {
    await logTrace({
      courseId: context.courseId,
      stage: context.stage,
      phase: context.phase,
      stepName: context.stepName ?? 'image_call',
      ...(context.lessonId ? { lessonId: context.lessonId } : {}),
      modelUsed: usage.model,
      costUsd: usage.costUsd,
      durationMs: context.durationMs ?? 0,
      inputData: { billedPerImage: true },
    });
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), model: usage.model },
      '[Cost] Could not record an image generation cost'
    );
  }
}

/**
 * Records one call's tokens, model and price against a course.
 *
 * Never throws and never blocks the caller: accounting must not be able to fail
 * a generation. A call made without a course context is logged at debug with
 * the model, so the remaining holes are visible instead of silent.
 */
export async function recordLlmCallCost(
  usage: LlmCallUsage,
  context?: LlmCostContext
): Promise<void> {
  if (!context) {
    logger.debug(
      { model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
      '[Cost] LLM call without a course context; its cost is not attributed'
    );
    return;
  }

  const costUsd = calculateLlmCostUsd(usage);
  if (costUsd === undefined) {
    logger.warn(
      { model: usage.model, courseId: context.courseId, stage: context.stage },
      '[Cost] Model is not in MODEL_CATALOG; the call is traced without a price'
    );
  } else if (!hasExactModelPricing(usage.model)) {
    // The provider served a variant of a catalogued model - a dated snapshot or
    // a router alias. Its own tariff can be higher, so this price is a floor and
    // the catalogue wants the entry (mc2-b7olk.6).
    logger.warn(
      {
        model: usage.model,
        pricedAs: normalizeModelId(usage.model),
        courseId: context.courseId,
      },
      '[Cost] Priced from the base model; add the served variant to MODEL_CATALOG'
    );
  }

  try {
    await logTrace({
      courseId: context.courseId,
      stage: context.stage,
      phase: context.phase,
      stepName: context.stepName ?? 'llm_call',
      ...(context.lessonId ? { lessonId: context.lessonId } : {}),
      modelUsed: usage.model,
      tokensUsed: usage.inputTokens + usage.outputTokens,
      ...(costUsd === undefined ? {} : { costUsd }),
      durationMs: context.durationMs ?? 0,
      ...(context.retryAttempt === undefined ? {} : { retryAttempt: context.retryAttempt }),
      inputData: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    });
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), model: usage.model },
      '[Cost] Could not record an LLM call cost'
    );
  }

  refreshCourseTotalAfterEdit(context);
}

/**
 * How long a course's edit refresh waits for the calls that follow it.
 *
 * One chat turn is at least two priced calls — the intent classification and
 * the answer — and the refresh is a SUM over every `generation_trace` row the
 * course has, so running it per call re-reads the whole history twice for one
 * turn and gets slower as the course grows. An inline edit that regenerates
 * several blocks is the same shape. Waiting first collapses a turn into a
 * single re-sum, and the run that does happen reads the table after all of its
 * rows are in it, which is what makes the total right.
 *
 * The classification counts here only because it was taught to record itself
 * (mc2-b5a2r); before that it called the provider on a raw client and left no
 * row at all.
 *
 * The bound this accepts: the timer is unreferenced and in-process, so a
 * container that stops inside the window loses that course's pending re-sum.
 * The trace rows are already written, so nothing is lost but the freshness of
 * `courses.estimated_cost_usd`, and the next edit or stage run for that course
 * puts it right. Deliberate — the alternative is holding a chat turn open, or
 * keeping a worker alive, for a number nobody is reading at that instant.
 */
export const EDIT_REFRESH_DEBOUNCE_MS = 1_500;

/** Courses with a re-sum already waiting, so a second call joins it rather than adding one. */
const pendingEditRefresh = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Re-sums the course total after an edit.
 *
 * Pipeline stages refresh it when their job finishes — once per job, not once
 * per call. An edit has no job, so a trace row written by chat or an inline edit
 * would sit in the table while `courses.estimated_cost_usd` stayed at whatever
 * generation left it. The row would exist and the number would still be wrong.
 *
 * Returns immediately: the re-sum is scheduled, never awaited, so accounting
 * cannot slow a chat turn down or fail one.
 */
function refreshCourseTotalAfterEdit(context: LlmCostContext): void {
  if (context.stage !== 'stage_edit') return;

  const { courseId } = context;
  const waiting = pendingEditRefresh.get(courseId);
  if (waiting) clearTimeout(waiting);

  const timer = setTimeout(() => {
    pendingEditRefresh.delete(courseId);
    void runCourseTotalRefresh(courseId);
  }, EDIT_REFRESH_DEBOUNCE_MS);
  // A total waiting to be re-summed is not a reason to keep a process alive.
  timer.unref?.();

  pendingEditRefresh.set(courseId, timer);
}

/**
 * How long to wait before the one retry a failed re-sum gets.
 *
 * `updateCourseEstimatedCost` leaves the column alone when it could not read
 * the traces, and the last edit of a session has no later stage run to put the
 * total right — so a single transient error would strand it until someone edits
 * that course again. One retry, not a loop: this is the freshness of a number
 * people read, not a durability guarantee, and the trace rows themselves are
 * already safe in the table.
 */
export const EDIT_REFRESH_RETRY_DELAY_MS = 5_000;

/** The re-sum itself. Never throws: accounting must not be able to fail a generation. */
async function runCourseTotalRefresh(courseId: string, isRetry = false): Promise<void> {
  try {
    const { updateCourseEstimatedCost } = await import('@/services/token-tracking-service');
    const written = await updateCourseEstimatedCost(courseId);

    // `undefined` means it did not write — a failed read or a failed update.
    if (written === undefined && !isRetry) {
      const timer = setTimeout(
        () => void runCourseTotalRefresh(courseId, true),
        EDIT_REFRESH_RETRY_DELAY_MS
      );
      timer.unref?.();
    }
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), courseId },
      '[Cost] Could not refresh the course total after an edit'
    );
  }
}
