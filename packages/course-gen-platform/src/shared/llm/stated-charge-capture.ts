/**
 * Carries the charge OpenRouter stated from the transport to the cost callback.
 *
 * Every completion body has `usage.cost` in it — the charge itself, not an
 * estimate of it. The direct SDK path reads it out of the body it parses
 * (`parseCompletionResponse`). The LangChain path cannot: `@langchain/openai`
 * builds `llmOutput` from three hand-picked fields and drops everything a
 * provider adds beyond the OpenAI specification. That is documented, deliberate
 * behaviour, and the cost is gone before any callback runs.
 *
 * So the body is read where it is already being read — the empty-completion
 * guard — and the number is left here, under the generation id the same body
 * carries. `costRecordingCallbacks` already pulls that id off the message, so it
 * has the key without being given one.
 *
 * Three alternatives were weighed and are recorded in
 * `docs/plans/langchain-cost-passthrough.md`: an `AsyncLocalStorage` slot (would
 * have to be opened at eleven call sites), instance state (`withConfig` rebuilds
 * the model from constructor fields and drops it — langchainjs#8586), and
 * `@langchain/openrouter` (passes the cost through, but calls the global `fetch`
 * directly, which would cost all four transport wrappers).
 *
 * @module shared/llm/stated-charge-capture
 */

/**
 * How many unread charges to hold before the oldest is dropped.
 *
 * There has to be a bound, because not every remembered charge is collected. A
 * model built without a course id has no cost callback at all, an aborted call
 * never reaches `handleLLMEnd`, and either way the entry stays. This runs inside
 * a BullMQ worker that lives for weeks, so an unbounded map is a leak with a
 * slow fuse rather than a cache.
 *
 * 256 against a worker concurrency of 30: large enough that a collected charge
 * is never evicted before its own callback runs, small enough to be nothing —
 * a number and a short string per entry.
 */
export const STATED_CHARGE_CAPACITY = 256;

/** Generation id to the charge its response body stated, awaiting collection. */
const statedCharges = new Map<string, number>();

/**
 * Remember what a completion body says this call cost.
 *
 * Overwrites rather than merges: a generation id names one call, and if the same
 * id ever arrives twice the later body is the later truth.
 *
 * Eviction is by insertion order — `Map` keeps it, and the oldest unread entry
 * is by definition the one whose collector is never coming.
 */
export function rememberStatedCharge(generationId: string, costUsd: number): void {
  if (!generationId) return;
  if (!Number.isFinite(costUsd)) return;

  // Delete first so a repeat key moves to the back of the queue instead of
  // keeping the position of the entry it replaces.
  statedCharges.delete(generationId);
  statedCharges.set(generationId, costUsd);

  while (statedCharges.size > STATED_CHARGE_CAPACITY) {
    const oldest = statedCharges.keys().next();
    if (oldest.done) break;
    statedCharges.delete(oldest.value);
  }
}

/**
 * Read a completion body and remember the charge it states, if it states one.
 *
 * Total by design: a body that is not a completion, or carries no usage, or
 * names no id, changes nothing at all. A missing charge is the case the
 * catalogue estimate and the deferred receipt already exist for, and turning it
 * into a throw would trade a priced row for a failed generation.
 */
export function rememberStatedChargeFromBody(body: unknown): void {
  if (typeof body !== 'object' || body === null) return;

  const { id, usage } = body as { id?: unknown; usage?: unknown };
  if (typeof id !== 'string' || id.length === 0) return;
  if (typeof usage !== 'object' || usage === null) return;

  const cost = (usage as { cost?: unknown }).cost;
  // `typeof number`, not truthiness: a call that genuinely cost $0 — a free
  // model, a cached prefix — is a measurement, and filing it as "not measured"
  // is the shape that once corrupted the very metric used to find unpriced calls
  // (mc2-y452l).
  if (typeof cost !== 'number') return;

  rememberStatedCharge(id, cost);
}

/**
 * Take the charge stated for this generation, and forget it.
 *
 * Reading removes: one call produces one charge and one ledger row, so a second
 * read of the same key would either be a bug or a double entry, and leaving the
 * entry behind is the leak this map is bounded against.
 *
 * `undefined` means no body stated a charge for this id — an aborted call, a
 * streamed one, a response the guard handed through without parsing. The caller
 * behaves exactly as it did before this module existed: catalogue estimate now,
 * provider receipt in about ten seconds.
 */
export function takeStatedCharge(generationId: string | undefined): number | undefined {
  if (!generationId) return undefined;

  const cost = statedCharges.get(generationId);
  if (cost === undefined) return undefined;

  statedCharges.delete(generationId);
  return cost;
}

/** How many charges are waiting to be collected. For tests and for a leak check. */
export function pendingStatedChargeCount(): number {
  return statedCharges.size;
}

/** Drop every pending charge. Test seam; nothing in production calls it. */
export function resetStatedCharges(): void {
  statedCharges.clear();
}
