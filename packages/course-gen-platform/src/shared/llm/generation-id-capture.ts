/**
 * Keeps the `x-generation-id` of the call that is running right now.
 *
 * The header arrives with the response headers — before the body, and therefore
 * before any abort of ours. `fetch` resolves as soon as headers are in, so a
 * wrapper around `fetch` sees the id even for the calls that go on to time out.
 * Those are exactly the calls that used to leave nothing behind: on 2026-08-20
 * two Stage 4 aborts and four Career Playbook timeouts were 46% of an invoice
 * and had no row anywhere (mc2-64n8i).
 *
 * `AsyncLocalStorage` rather than a return value because the id has to survive a
 * throw. The slot is created by the caller, filled by the transport, and read
 * from the `catch` — which is the whole point.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** Filled in by the transport as soon as OpenRouter's headers arrive. */
export interface GenerationIdSlot {
  generationId?: string;
}

const generationIdStore = new AsyncLocalStorage<GenerationIdSlot>();

/**
 * Run one logical attempt with a fresh slot.
 *
 * One slot per attempt, never per call: a retry that reaches a different
 * provider gets a different generation, and reusing the slot would attribute the
 * second attempt's cost to the first one's id.
 */
export function withGenerationIdCapture<T>(fn: (slot: GenerationIdSlot) => Promise<T>): Promise<T> {
  const slot: GenerationIdSlot = {};
  return generationIdStore.run(slot, () => fn(slot));
}

/** Where a failed attempt's generation id rides out of the `throw`. */
const GENERATION_ID_ON_ERROR = Symbol.for('megacampus.generationId');

/**
 * Pin the generation id onto the error an attempt is about to throw.
 *
 * The id is the only thing an aborted attempt leaves behind, and the retry that
 * follows needs it to learn which provider to route around. A symbol rather than
 * a plain field so nothing that serialises or compares errors starts seeing it.
 */
export function annotateErrorWithGenerationId(error: unknown, generationId?: string): void {
  if (!generationId || typeof error !== 'object' || error === null) return;
  try {
    Object.defineProperty(error, GENERATION_ID_ON_ERROR, {
      value: generationId,
      enumerable: false,
      configurable: true,
    });
  } catch {
    // A frozen error is not a reason to lose the attempt.
  }
}

/** The generation id of the attempt that threw this error, if it carried one. */
export function readGenerationIdFromError(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const value = (error as Record<symbol, unknown>)[GENERATION_ID_ON_ERROR];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Wrap a `fetch` so every OpenRouter response deposits its generation id.
 *
 * Deliberately total: a transport that throws on a missing header would turn an
 * accounting nicety into a failed generation. Anything unexpected here is simply
 * not recorded.
 */
export function instrumentFetchWithGenerationId(
  baseFetch: typeof globalThis.fetch = globalThis.fetch
): typeof globalThis.fetch {
  return async function instrumentedFetch(input, init) {
    const response = await baseFetch(input, init);
    try {
      const slot = generationIdStore.getStore();
      if (slot) {
        const id = response.headers.get('x-generation-id');
        if (id) slot.generationId = id;
      }
    } catch {
      // An id we failed to read is a gap in the ledger, never a failed call.
    }
    return response;
  };
}
