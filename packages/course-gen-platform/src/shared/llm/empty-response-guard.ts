/**
 * Names the 200 that carries nothing, instead of letting the parser trip over it.
 *
 * On 2026-08-22 five Career Playbook attempts on one endpoint of
 * `deepseek/deepseek-v4-flash-0731` died as `Cannot read properties of undefined
 * (reading 'map')` and `(reading 'message')` (mc2-f1tqd). The stack pointed at
 * `crossBlockJudge` and `group2Generator`, which is where the failure surfaced
 * and not where it happened: the provider had answered without a usable
 * `choices`, no generation record was ever created for any of the five, and the
 * first thing to touch the absent array was LangChain's own response parsing —
 * code we do not own and cannot instrument. What the log then reported was the
 * shape of our reader, not the shape of what arrived.
 *
 * So the check sits on the transport, next to the two wrappers already there. It
 * is the same lesson the repository has paid for repeatedly: when something fails
 * without a reason, fix the reporting first. `parseCompletionResponse` already
 * does this for the direct SDK path (`No content in completion response`); this
 * is the LangChain path, which never reaches it.
 *
 * Being a `fetch` wrapper it covers `invoke`, `stream` and `batch`, and it
 * survives the `new ChatOpenAI(fields)` clone that `withStructuredOutput` builds
 * — the property that `configuration.fetch` has and an overridden method does
 * not (langchainjs#8586).
 *
 * Having read the body, it also keeps the one number LangChain is about to throw
 * away: `usage.cost`, the charge OpenRouter states on every completion. That is
 * `stated-charge-capture`, and it is here rather than in a fifth wrapper because
 * this is the only place on the path where the body is already parsed.
 *
 * @module shared/llm/empty-response-guard
 */

import { readGenerationIdSlot } from './generation-id-capture';
import { rememberStatedChargeFromBody } from './stated-charge-capture';

/** How much of the body the error quotes. Enough to recognise, short enough to log. */
const BODY_EXCERPT_LIMIT = 400;

/**
 * A provider answered with success and no answer.
 *
 * Distinct from a transport failure and from a structural rejection: the request
 * was accepted, the status says so, and there is simply no completion in it.
 * Carrying the generation id matters because that is what
 * `GET /api/v1/generation` is asked afterwards — and for this failure it finds
 * nothing, which is itself the confirmation that the provider never produced one.
 */
export class EmptyProviderResponseError extends Error {
  readonly status: number;
  readonly generationId: string | undefined;
  readonly bodyExcerpt: string;

  constructor(params: {
    status: number;
    generationId: string | undefined;
    bodyExcerpt: string;
    reason: string;
  }) {
    // The message carries the cause, because the logger prints only `message`
    // (see 'A Swallowed Cause Costs a Paid Run'). Anything left in a field alone
    // is invisible at the moment somebody is reading logs to find out why.
    super(
      `Provider returned ${params.status} with no usable completion (${params.reason}); ` +
        `generationId=${params.generationId ?? 'none'}; body=${params.bodyExcerpt || '<empty>'}`
    );
    this.name = 'EmptyProviderResponseError';
    this.status = params.status;
    this.generationId = params.generationId;
    this.bodyExcerpt = params.bodyExcerpt;
  }
}

/** The request paths whose responses must carry a completion. */
function isCompletionRequest(input: RequestInfo | URL): boolean {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : (input?.url ?? '');
  // `?` and `#` are not expected here, but a path test should not depend on that.
  const path = url.split('?')[0]?.split('#')[0] ?? '';
  return path.endsWith('/chat/completions') || path.endsWith('/completions');
}

/**
 * What the body turned out to be: a usable completion, or the reason it is not.
 *
 * One reading serves both jobs. The guard needs to know whether a completion is
 * there; the ledger needs `usage.cost` out of the same object, because the
 * LangChain path has no other way to reach it (see `stated-charge-capture`).
 * Parsing twice for that would be the only expensive thing in this file.
 */
type BodyReading = { completion: Record<string, unknown> } | { reason: string };

/**
 * Read the body as a completion, or say why it is not one.
 *
 * An `error` member with a 2xx status is included on purpose: OpenRouter does
 * return one, and a caller reading `choices` finds the same `undefined` either
 * way. The difference is that here the provider said what went wrong, and that
 * sentence is worth far more than our own stack.
 */
function readCompletionBody(text: string): BodyReading {
  if (text.trim() === '') return { reason: 'empty body' };

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { reason: 'body is not JSON' };
  }
  if (typeof payload !== 'object' || payload === null) return { reason: 'body is not an object' };

  const body = payload as { choices?: unknown; error?: unknown };
  if (body.error !== undefined && body.choices === undefined) {
    return { reason: 'body carries an error member instead of choices' };
  }
  if (body.choices === undefined) return { reason: 'no choices member' };
  if (!Array.isArray(body.choices)) return { reason: 'choices is not an array' };
  if (body.choices.length === 0) return { reason: 'choices is empty' };

  return { completion: payload as Record<string, unknown> };
}

/**
 * Wrap a `fetch` so a successful response without a completion throws by name.
 *
 * Deliberately narrow. It inspects only completion requests, only 2xx, and only
 * JSON — a streamed response advertises `text/event-stream` and is handed back
 * untouched, because reading it here would consume the stream the caller is
 * about to iterate. Everything it does not understand passes through unchanged:
 * a guard that turns an unfamiliar response into a failed generation would cost
 * more than the defect it was written for.
 *
 * The body is read once and a fresh `Response` is handed on, rather than
 * `clone()`, so an ordinary answer is not buffered twice on its way through.
 */
export function guardAgainstEmptyCompletion(
  baseFetch: typeof globalThis.fetch = globalThis.fetch
): typeof globalThis.fetch {
  return async function emptyResponseAwareFetch(input, init) {
    const response = await baseFetch(input, init);

    if (!response.ok) return response;
    if (!isCompletionRequest(input)) return response;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) return response;

    let text: string;
    try {
      text = await response.text();
    } catch {
      // A body we could not read is not evidence that it was empty.
      return response;
    }

    const reading = readCompletionBody(text);
    if ('completion' in reading) {
      // The only place on this path where the charge is still in reach. It is
      // left in a map and collected by the cost callback, which already holds
      // the key; nothing is written to the ledger from here, or the row would
      // be counted twice.
      rememberStatedChargeFromBody(reading.completion);

      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    throw new EmptyProviderResponseError({
      status: response.status,
      generationId: readGenerationIdSlot()?.generationId,
      bodyExcerpt: text.slice(0, BODY_EXCERPT_LIMIT),
      reason: reading.reason,
    });
  };
}
