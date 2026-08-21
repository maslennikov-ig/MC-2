/**
 * The one place an OpenRouter chat client is built.
 *
 * There were four, and only two of them were instrumented. The other two —
 * `stage7-enrichments/services/image-generation-service.ts` and
 * `shared/intent/classifier.ts` — assembled their own `new OpenAI({ baseURL })`,
 * so `x-generation-id` never reached `withGenerationIdCapture` and
 * `GET /api/v1/generation` could never be asked what the call actually cost. For
 * those two the price stayed an estimate forever, which is why the 2026-08-21
 * paid run reconciled to a single named residual: one card image booked at
 * $0.007 against a real $0.045080, 6.4x low (mc2-l17v5).
 *
 * A client built anywhere else is the same bug again, so
 * `tests/unit/shared/llm/one-openrouter-transport.test.ts` fails on a new one.
 *
 * Two entry points because key resolution has two shapes. `LLMClient`'s
 * constructor is synchronous and resolves the env var up front, then re-resolves
 * database-first on the first real use; everything else can simply await. Both
 * end at the same builder, so neither can drift from the other.
 */

import OpenAI from 'openai';

import { getOpenRouterApiKey } from '../services/api-key-service';
import { instrumentFetchWithGenerationId } from './generation-id-capture';

/** Base URL for every OpenRouter call this repository makes. */
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export interface OpenRouterClientOptions {
  /** Per-request wall-clock budget handed to the SDK. */
  timeoutMs?: number;
  /**
   * SDK-level retries. Left at the SDK default unless a caller does its own
   * retrying, in which case it passes 0 and owns the chain.
   */
  maxRetries?: number;
}

/**
 * Build a client from an already-resolved key.
 *
 * The transport is wrapped here and nowhere else: `x-generation-id` arrives with
 * the response headers, before the body, so a wrapper at this level sees the id
 * even for an attempt that goes on to abort — and an aborted attempt is still
 * billed.
 */
export function buildOpenRouterClient(
  apiKey: string,
  options: OpenRouterClientOptions = {}
): OpenAI {
  return new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': process.env.APP_URL || 'https://ai.megacampus.ru',
      'X-Title': 'MegaCampus Course Generator',
    },
    ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
    ...(options.maxRetries === undefined ? {} : { maxRetries: options.maxRetries }),
    fetch: instrumentFetchWithGenerationId(),
    // Mermaid validation installs a JSDOM window in these Node workers. The key
    // stays server-side; this only tells the SDK it is not in a real browser.
    dangerouslyAllowBrowser: true,
  });
}

/**
 * Build a client, resolving the key database-first and falling back to the env.
 *
 * `getOpenRouterApiKey()` rather than `process.env.OPENROUTER_API_KEY`: the
 * classifier read the env directly and so ignored a key rotated in the admin
 * panel, which is a silent way to keep using a retired key.
 */
export async function createOpenRouterClient(
  options: OpenRouterClientOptions = {}
): Promise<OpenAI> {
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error(
      'OpenRouter API key not configured. Set OPENROUTER_API_KEY env var or configure in admin panel.'
    );
  }
  return buildOpenRouterClient(apiKey, options);
}
