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

/** What `POST /api/v1/images` is asked for. */
export interface OpenRouterImageRequest {
  model: string;
  prompt: string;
  /**
   * `auto | low | medium | high`, and the whole reason this entry point exists.
   *
   * Measured on `openai/gpt-5-image-mini`, 1024x1024, one prompt: low 272 image
   * tokens for $0.002341, medium 1056 for $0.008613, high 4160 for $0.033445.
   * Chat completions has no equivalent — `image_config` carries `aspect_ratio`
   * and `image_size` and is Gemini-only — so every card was billed at whatever
   * `auto` chose (mc2-xbqz8).
   */
  quality?: 'auto' | 'low' | 'medium' | 'high';
  aspectRatio?: string;
  /**
   * Pictures the model should look at before drawing, as `data:` URLs.
   *
   * The wire shape is not guessed. `POST /api/v1/images` validates this with Zod
   * and says what it wants: an array of `{type: 'image_url', image_url: {url}}`,
   * exactly the chat content-part shape. An array of bare data-URL strings is
   * rejected with "expected object", and `{url}` without `type` with "invalid
   * value". `openai/gpt-5-image-mini` accepts up to 16.
   *
   * Charged as `input_image` — $0.0000025 per token on the incumbent, which is
   * a rounding error against the picture it is steering.
   */
  inputReferences?: string[];
  signal?: AbortSignal;
}

/** The part of the response this repository reads. */
export interface OpenRouterImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
  };
}

/**
 * Generate an image through OpenRouter's dedicated Images API.
 *
 * Here rather than in the image service because this module owns the base URL
 * and the instrumented `fetch`, and the guard test says so. The same wrapper is
 * used, so `x-generation-id` lands in the `withGenerationIdCapture` slot exactly
 * as it does for a chat call — which is what lets an image settle against
 * `GET /api/v1/generation` instead of keeping an estimate.
 *
 * A raw `fetch` and not the OpenAI SDK: `/images` is OpenRouter's own endpoint,
 * not an OpenAI-compatible one, and `client.images.generate` would post to
 * `/images/generations` with a different body.
 */
export async function createOpenRouterImage(
  request: OpenRouterImageRequest
): Promise<OpenRouterImageResponse> {
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error(
      'OpenRouter API key not configured. Set OPENROUTER_API_KEY env var or configure in admin panel.'
    );
  }

  const instrumentedFetch = instrumentFetchWithGenerationId();
  const response = await instrumentedFetch(`${OPENROUTER_BASE_URL}/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'https://ai.megacampus.ru',
      'X-Title': 'MegaCampus Course Generator',
    },
    body: JSON.stringify({
      model: request.model,
      prompt: request.prompt,
      ...(request.quality ? { quality: request.quality } : {}),
      ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}),
      ...(request.inputReferences?.length
        ? {
            input_references: request.inputReferences.map(url => ({
              type: 'image_url',
              image_url: { url },
            })),
          }
        : {}),
    }),
    ...(request.signal ? { signal: request.signal } : {}),
  });

  if (!response.ok) {
    const said = await response.text().catch(() => '');
    throw new Error(`OpenRouter images ${response.status}: ${said.slice(0, 400)}`);
  }

  return (await response.json()) as OpenRouterImageResponse;
}
