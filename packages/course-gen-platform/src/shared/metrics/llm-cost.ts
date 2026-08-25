/**
 * What one LLM call cost, written where the money can be counted later.
 *
 * The tracking path existed and was dead: `costTracker.recordStageCost` had no
 * production caller, so `generation_trace.cost_usd` was empty in all but 162 of
 * 37107 rows and `courses.estimated_cost_usd` was null for every course. The
 * only way to answer "what did this course cost" was the provider's own key
 * counter, which knows nothing about courses, stages or models (mc2-o7740).
 *
 * A price is taken from the most specific source that knows it, in this order:
 *
 * 1. The provider's own receipt, `GET /api/v1/generation`, which arrives about
 *    ten seconds later and overwrites everything below.
 * 2. The endpoint this attempt was pinned to, whose live rate is exactly what
 *    this call will be billed.
 * 3. `MODEL_CATALOG`, the frozen mainstream rate, times the flex multiplier when
 *    the answer said flex.
 *
 * The third is a fallback and not a base: it holds the price the mainstream
 * providers charge, while the per-attempt pin routes to the cheapest, so it
 * overstates. Measured 2026-08-25 for `deepseek-v4-flash-0731`: catalogue $0.14
 * against a served $0.035, four times over. That correction used to arrive with
 * the receipt — but 92 of 509 rows over the previous fortnight never got one,
 * because an aborted or failed call has no receipt to collect, and those rows
 * carried 17% of the ledger on the overstated number.
 *
 * No second price table is introduced by any of this. Every figure above is
 * OpenRouter's own, read at a different moment.
 */

import {
  getModelCapabilities,
  hasExactModelPricing,
  normalizeModelId,
} from '@megacampus/shared-types';

import logger from '../logger';
import { logTrace } from '../trace-logger';
import { fetchGenerationFact } from '../llm/openrouter-generation';
import { getSupabaseAdmin } from '../supabase/admin';

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
  /**
   * OpenRouter's `x-generation-id` for this call, when the transport captured
   * one. Present even for calls that aborted — the header arrives before the
   * body does.
   */
  generationId?: string;
  /** Display name of the endpoint that served the call, when it is known. */
  providerName?: string;
  /**
   * The tariff the provider says it served this call at: `default`, `flex` or
   * `priority`. Read from the response body, not from what was requested.
   */
  serviceTier?: string;
  /**
   * What the endpoint this attempt was pinned to charges, in dollars per
   * million. Present only when the attempt named one endpoint with
   * `allow_fallbacks: false`, which is the only case where we know who served
   * it before the receipt arrives.
   */
  endpointRate?: { prompt: number; completion: number };
  /**
   * What OpenRouter says it charged, from `usage.cost` in the completion body.
   *
   * The charge itself, not an estimate of it, and it costs nothing to have:
   * measured 2026-08-25, it is on every completion with or without
   * `usage: {include: true}` and equals `GET /api/v1/generation` to the cent.
   * Absent only when no body arrived — an aborted or timed-out call — which is
   * exactly the case the deferred lookup and the estimates below exist for.
   */
  actualCostUsd?: number;
}

/**
 * What the flex tier charges, as a fraction of the catalogued rate.
 *
 * Half, on every model that offers it. Read from the live catalogue on
 * 2026-08-25: luna $0.10/$0.60 against $0.20/$1.20, gemini-3.7-flash
 * $0.1875/$0.9375 against $0.375/$1.875, gemini-2.5-flash-image $0.15/$1.25
 * against $0.30/$2.50. It is a published tier multiplier rather than a
 * per-model price, which is why one constant is honest here where a second
 * price table would not be.
 *
 * Applied only when the *answer* said flex. A request that asked for flex and
 * was served at the default rate — a model with no flex endpoint, or one that
 * refused for capacity — must not be estimated at half, because an
 * underestimate hides money where an overestimate merely reserves it.
 */
const FLEX_TARIFF_MULTIPLIER = 0.5;

/**
 * Replace an estimated price with what OpenRouter actually charged.
 *
 * `MODEL_CATALOG` is a plan, and on 2026-08-20 it was wrong in three places at
 * once — `openai/gpt-5.6-luna` at exactly half its tariff, `z-ai/glm-5.2` 1.23x
 * over, `~deepseek/...-latest` 1.45x over — so a ledger built on it could only
 * ever be argued with, never reconciled. `GET /api/v1/generation` answers with
 * the charge itself.
 *
 * Deferred, never awaited by a caller, one retry inside the lookup, and it
 * cannot fail a generation: the estimate is already in the row, so the worst
 * outcome here is that the row keeps it.
 */
export function settleTraceCostFromProvider(
  traceId: string | null,
  generationId: string | undefined,
  model: string
): void {
  if (!traceId || !generationId) return;

  const timer = setTimeout(() => {
    void (async () => {
      try {
        // Nobody awaits this one, so its waits stay unreferenced: the row keeps
        // its catalogue estimate if the process leaves first, which is the trade
        // the `unref` below already accepted. Every other caller does await, and
        // the default is to hold the loop (mc2-avjau).
        const fact = await fetchGenerationFact(generationId, { keepProcessAlive: false });
        // `=== null` and not falsy: a genuine $0 is a measurement, and filing it
        // as "not measured" is the bug that once corrupted the very metric used
        // to find unpriced calls (mc2-y452l).
        if (!fact || fact.usageUsd === null) return;

        const { error } = await getSupabaseAdmin()
          .from('generation_trace')
          .update({
            cost_usd: fact.usageUsd,
            output_data: {
              billedByProvider: true,
              generationId: fact.generationId,
              providerName: fact.providerName,
              servedModel: fact.model,
              router: fact.router,
              cancelled: fact.cancelled,
              finishReason: fact.finishReason,
              nativeTokensPrompt: fact.nativeTokensPrompt,
              nativeTokensCompletion: fact.nativeTokensCompletion,
              nativeTokensReasoning: fact.nativeTokensReasoning,
              // Which tariff this call was actually served at. The routing
              // decision is an intention; flex can refuse for capacity, and
              // this is the only record of which one happened (mc2-a9w19).
              serviceTier: fact.serviceTier,
            },
          })
          .eq('id', traceId);

        if (error) {
          logger.debug(
            { error: error.message, traceId, generationId },
            '[Cost] Could not write the provider figure onto the trace row'
          );
          return;
        }

        logger.info(
          {
            model,
            servedModel: fact.model,
            providerName: fact.providerName,
            billedUsd: fact.usageUsd,
            cancelled: fact.cancelled,
            generationId,
          },
          '[Cost] Priced from the provider instead of the catalogue'
        );
      } catch (error) {
        logger.debug(
          { error: error instanceof Error ? error.message : String(error), generationId },
          '[Cost] Provider price lookup failed; the row keeps its estimate'
        );
      }
    })();
  }, 0);

  // A receipt still to be collected is not a reason to keep a process alive.
  timer.unref?.();
}

/**
 * Price of one call in USD, or `undefined` when nothing prices the model.
 *
 * An uncatalogued model with no pinned endpoint is a routing bug, not a rounding
 * problem, so it is reported rather than silently priced at zero.
 *
 * `settleTraceCostFromProvider` replaces this figure with the real charge about
 * ten seconds later — but only for a call that produced a receipt. An aborted or
 * failed call never does, and for those this estimate is the only number the row
 * will ever carry, which is why it is worth taking from the pinned endpoint
 * rather than from the catalogue.
 */
export function calculateLlmCostUsd(usage: LlmCallUsage): number | undefined {
  // Nothing to estimate when the provider already stated the charge.
  if (usage.actualCostUsd !== undefined) return usage.actualCostUsd;

  // The price of the endpoint we pinned beats the catalogue on every count: it
  // is live, it is the endpoint that actually served the call, and it already
  // carries the tier, so no multiplier is guessed on top. The catalogue holds
  // the mainstream providers' rate and the pin routes to the cheapest — for
  // `deepseek-v4-flash-0731` on 2026-08-25 that was $0.035 against a published
  // $0.14, so the catalogue estimate overstated by four times. It also prices a
  // `~` alias, which the catalogue declines to price exactly at all.
  if (usage.endpointRate) {
    return (
      (usage.inputTokens * usage.endpointRate.prompt) / 1_000_000 +
      (usage.outputTokens * usage.endpointRate.completion) / 1_000_000
    );
  }

  const capabilities = getModelCapabilities(usage.model);
  if (!capabilities) return undefined;
  const tariff = usage.serviceTier === 'flex' ? FLEX_TARIFF_MULTIPLIER : 1;
  return (
    ((usage.inputTokens * capabilities.inputPricePerMillion) / 1_000_000 +
      (usage.outputTokens * capabilities.outputPricePerMillion) / 1_000_000) *
    tariff
  );
}

/** What an image call reports about itself. */
export interface ImageCallUsage {
  model: string;
  /**
   * Prompt tokens, priced at the ordinary input rate. Small next to the image
   * but not zero: a card prompt is several hundred tokens.
   */
  inputTokens?: number;
  /**
   * Output tokens. For an image call these are **image** tokens, so they price
   * at `imageOutputPricePerMillion` rather than at the text output rate.
   */
  outputTokens?: number;
  generationId?: string;
}

/**
 * Estimated price of one image call, or `undefined` when it cannot be estimated.
 *
 * `undefined` for a model the catalogue does not price *as an image model*, and
 * for a call whose response reported no token counts. Both are absences, not
 * zeroes, and the old code had no way to say so: it looked its model up in a
 * private `MODEL_COSTS` table inside the image service and fell back to a flat
 * `DEFAULT_COST_USD = 0.04` for anything unknown, so an unrecognised model
 * produced a confident wrong number instead of a visible hole (mc2-5mhlb).
 *
 * This is only ever a placeholder. `settleTraceCostFromProvider` replaces it
 * with OpenRouter's own charge about ten seconds later.
 */
export function calculateImageCostUsd(usage: ImageCallUsage): number | undefined {
  const capabilities = getModelCapabilities(usage.model);
  if (!capabilities?.imageOutputPricePerMillion) return undefined;
  // `== null`, not falsy: a call that genuinely reported zero output tokens is a
  // measurement, and pricing it as "unknown" is the shape that once corrupted
  // the unpriced-rows metric (mc2-y452l).
  if (usage.outputTokens == null) return undefined;

  return (
    ((usage.inputTokens ?? 0) * capabilities.inputPricePerMillion) / 1_000_000 +
    (usage.outputTokens * capabilities.imageOutputPricePerMillion) / 1_000_000
  );
}

/**
 * Records one image generation against a course.
 *
 * An image is billed per image token, not per text token, and the only figure
 * worth keeping is the provider's own — so this writes the estimate and then
 * settles it against `GET /api/v1/generation` exactly as a token call does. It
 * could not do that before: the image service built its own OpenAI client, the
 * transport was never wrapped, no `x-generation-id` ever reached us, and the
 * price stayed whatever the private table said (mc2-l17v5).
 *
 * It belongs in the trace regardless: the course total is a sum over that table,
 * and a card image that recorded its price only in `lesson_enrichments.metadata`
 * was 18% of the course it was billed to and invisible in the total (mc2-acjgd).
 */
export async function recordImageCallCost(
  usage: ImageCallUsage,
  context?: LlmCostContext
): Promise<void> {
  const costUsd = calculateImageCostUsd(usage);

  if (!context) {
    logger.debug(
      { model: usage.model, costUsd, generationId: usage.generationId },
      '[Cost] Image generated without a course context; its cost is not attributed'
    );
    return;
  }

  if (costUsd === undefined) {
    logger.warn(
      { model: usage.model, courseId: context.courseId, outputTokens: usage.outputTokens },
      '[Cost] Image model has no image rate in MODEL_CATALOG; the call is traced without an estimate'
    );
  }

  try {
    const traceId = await logTrace({
      courseId: context.courseId,
      stage: context.stage,
      phase: context.phase,
      stepName: context.stepName ?? 'image_call',
      ...(context.lessonId ? { lessonId: context.lessonId } : {}),
      modelUsed: usage.model,
      ...(costUsd === undefined ? {} : { costUsd }),
      durationMs: context.durationMs ?? 0,
      inputData: {
        billedCall: true,
        billedPerImage: true,
        ...(usage.inputTokens === undefined ? {} : { inputTokens: usage.inputTokens }),
        ...(usage.outputTokens === undefined ? {} : { outputTokens: usage.outputTokens }),
        ...(costUsd === undefined ? {} : { estimatedCostUsd: costUsd }),
        ...(usage.generationId ? { generationId: usage.generationId } : {}),
      },
    });

    settleTraceCostFromProvider(traceId, usage.generationId, usage.model);
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), model: usage.model },
      '[Cost] Could not record an image generation cost'
    );
  }

  // Same refresh as a token call. Today every image comes from stage 7, whose
  // job refreshes the total when it finishes, so this changes nothing — but the
  // asymmetry was a trap: the first edit path to generate an image would have
  // written its trace row and left `courses.estimated_cost_usd` untouched, which
  // is the silent-zero shape this whole feature exists to remove (mc2-6kmfx).
  refreshCourseTotalAfterEdit(context);
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
    const traceId = await logTrace({
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
      // A row whose price came from the response body is settled the moment it
      // is written. Saying so here rather than waiting for the deferred lookup
      // matters: 83 of 509 rows over the fortnight to 2026-08-25 never got an
      // `output_data` at all, so every reconciliation read them as unpriced
      // guesses when their number was already right.
      ...(usage.actualCostUsd === undefined
        ? {}
        : {
            outputData: {
              billedByProvider: true,
              ...(usage.generationId ? { generationId: usage.generationId } : {}),
              ...(usage.providerName ? { providerName: usage.providerName } : {}),
              ...(usage.serviceTier ? { serviceTier: usage.serviceTier } : {}),
            },
          }),
      inputData: {
        // Says "a provider charged for this", so a reconciliation can tell a
        // call from a stage progress marker. Token counts cannot: `judge_complete`
        // records the cascade's totals and is unpriced on purpose, because each
        // judge call prices itself where it is made. Counting those as holes is
        // what made "money the ledger missed" read 21 when the true answer was 0
        // (mc2-wjmrd).
        billedCall: true,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        ...(usage.actualCostUsd === undefined ? {} : { billedInResponse: true }),
        // The catalogue figure is kept alongside the provider's so a wrong
        // catalogue entry stays visible after the row is settled, instead of
        // being quietly overwritten by the truth it should have matched.
        ...(costUsd === undefined ? {} : { estimatedCostUsd: costUsd }),
        ...(usage.generationId ? { generationId: usage.generationId } : {}),
        ...(usage.providerName ? { providerName: usage.providerName } : {}),
        ...(usage.serviceTier ? { serviceTier: usage.serviceTier } : {}),
      },
    });

    settleTraceCostFromProvider(traceId, usage.generationId, usage.model);
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
