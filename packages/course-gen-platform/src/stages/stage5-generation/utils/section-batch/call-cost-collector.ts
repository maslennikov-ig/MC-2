/**
 * What a section batch's own LLM calls were recorded as costing.
 *
 * The price is made once, at the call, by `recordLlmCallCost` — this does not
 * make a second one. It collects the figure that recorder wrote to
 * `generation_trace` for each call, so a caller that has to report a cost
 * (the section regeneration history, which wrote a hardcoded `0` until
 * mc2-sdjy8.2) reports the recorded number rather than a placeholder or an
 * independently computed guess.
 *
 * The waiting is the whole reason this is a class and not a variable.
 * `@langchain/core` runs callback handlers on a background queue unless
 * `LANGCHAIN_CALLBACKS_BACKGROUND` is `"false"`, which this repository does not
 * set: `consumeCallback` queues the handler and returns, so `model.invoke()`
 * resolves before the cost callback has run at all. Reading the total straight
 * after an invoke would therefore read zero almost every time — a silent,
 * plausible, wrong number, which is the exact failure the placeholder was.
 * `awaitAllCallbacks` is LangChain's own way to drain that queue.
 *
 * @module stages/stage5-generation/utils/section-batch/call-cost-collector
 */

import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';
import logger from '@/shared/logger';

/**
 * How long the drain is allowed to take.
 *
 * Bounded because accounting must not be able to stall a generation, and the
 * queue being drained is process-wide: a busy worker can have other courses'
 * trace inserts ahead of ours. A drain that runs out of time reports what it
 * has, which under-reports; the `generation_trace` rows are unaffected either
 * way, since they are what is being waited for.
 */
export const COST_DRAIN_TIMEOUT_MS = 10_000;

/** Resolves true if `work` finished inside the budget, false if the budget ran out. */
async function withinBudget(work: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<boolean>(resolve => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });

  try {
    return await Promise.race([work.then(() => true), budget]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Accumulates the recorded cost of every LLM call made with one model instance.
 *
 * One collector spans a whole `generateWithRetry`, so a batch that escalated a
 * tier, retried, or went round the `UnifiedRegenerator` reports what the whole
 * attempt cost rather than what its last call cost.
 */
export class SectionCallCostCollector {
  private totalUsd = 0;
  private pricedCalls = 0;
  private unpricedCalls = 0;

  /**
   * Hand this to `createCostRecordingModelAsync` as its cost sink.
   *
   * Bound as a field rather than a method so it survives being passed as a
   * value.
   */
  readonly record = (costUsd: number | undefined): void => {
    // `undefined` is "no price was recorded" — an uncatalogued model, or a
    // trace write that failed. It is not a recorded zero, and adding it as one
    // would turn a missing measurement into a real-looking $0.00.
    if (costUsd === undefined) {
      this.unpricedCalls += 1;
      return;
    }
    this.pricedCalls += 1;
    this.totalUsd += costUsd;
  };

  /**
   * Waits for the queued cost callbacks, then reports the total.
   *
   * `undefined` when no call reported a price, so a caller can tell "this cost
   * nothing to run" from "nobody knows what this cost". Never throws.
   */
  async settle(
    drain: () => Promise<void> = awaitAllCallbacks,
    timeoutMs: number = COST_DRAIN_TIMEOUT_MS
  ): Promise<number | undefined> {
    try {
      const drained = await withinBudget(drain(), timeoutMs);
      if (!drained) {
        logger.warn(
          { timeoutMs, pricedCalls: this.pricedCalls, unpricedCalls: this.unpricedCalls },
          '[Cost] Cost callbacks did not drain in time; the reported section cost may be short'
        );
      }
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        '[Cost] Could not wait for the section cost callbacks'
      );
    }

    if (this.unpricedCalls > 0) {
      logger.warn(
        { pricedCalls: this.pricedCalls, unpricedCalls: this.unpricedCalls },
        '[Cost] Some section batch calls recorded no price; the reported cost is a floor'
      );
    }

    return this.pricedCalls === 0 ? undefined : this.totalUsd;
  }
}
