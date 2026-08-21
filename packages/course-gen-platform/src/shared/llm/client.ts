/**
 * LLM Client for OpenRouter Integration
 * @module orchestrator/services/llm-client
 *
 * Direct OpenAI SDK integration with OpenRouter as the provider.
 * Handles API calls, retry logic, error handling, and token tracking.
 *
 * Request building, response parsing, and error handling logic are
 * extracted to client-helpers.ts to reduce method complexity.
 *
 * API Key Resolution:
 * Uses centralized api-key-service for key retrieval.
 * Priority: database (admin panel) -> environment variable
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getModelCapabilities } from '@megacampus/shared-types';
import logger from '../../shared/logger';
import { retryWithBackoff } from '@/shared/workspace-utils';
import { getOpenRouterApiKey, getApiKeySync } from '../services/api-key-service';
import {
  buildCompletionRequest,
  buildChatCompletionRequest,
  parseCompletionResponse,
  handleApiError,
  handleUnknownError,
  applyMandatoryReasoningFloor,
  applyProviderRouting,
  buildProviderPriceCeiling,
} from './client-helpers';
import type { ReasoningRequest, OpenRouterRequestOptions } from './client-helpers';
import {
  withGenerationIdCapture,
  instrumentFetchWithGenerationId,
  annotateErrorWithGenerationId,
  readGenerationIdFromError,
} from './generation-id-capture';
import { fetchGenerationFact, resolveProviderSlug } from './openrouter-generation';
import {
  isMandatoryReasoningRejection,
  rememberMandatoryReasoning,
} from './mandatory-reasoning-recovery';
import {
  recordLlmCallCost,
  settleTraceCostFromProvider,
  type LlmCostContext,
} from '../metrics/llm-cost';
import { logTrace } from '../trace-logger';
import { tokenEstimator } from './token-estimator';

/**
 * Wall-clock budget for a single LLM call, in milliseconds.
 *
 * Derived from measurement, not chosen. Measured on dev 2026-08-14 from inside
 * `megacampus-worker-dev`, through this same SDK, with reasoning already off:
 * the real shape of a Stage 4 call (8204 input tokens, `max_tokens` 16000,
 * temperature 0.7) against the default `~deepseek/deepseek-v4-flash-latest`
 * took 119.0s. The previous budget was 60s, so every Stage 2 and Stage 4 call
 * was aborted at roughly half the model's real answer time, burned all four
 * attempts, and then escalated or failed the course. The 2026-08-14 run never
 * left Stage 4 (mc2-wg60c).
 *
 * The value is twice the measurement. Twice, because the default model carries
 * the `~` prefix — OpenRouter's cheapest provider for it, which is also its
 * most variable — and one measurement of one shape is not a distribution.
 * Still well under the 620s hang seen on 2026-08-13, so a genuine hang is
 * still cut short rather than waited out.
 *
 * Raised from 238_000 on 2026-08-21, again from measurement. The 2026-08-20 run
 * timed the same request shape across the alias's default routing at
 * 29.4 / 72.7 / 93.9 / 205.0s, and the 205.0s tail was a healthy provider being
 * slow, not a hang — a budget of 238s clears it by 16%, which is not a margin.
 * 300_000 clears it by 46% and still cuts a genuine hang short. The owner's
 * standing decision on 2026-08-20 is that waiting is acceptable and failing is
 * not, so the budget goes to the wait.
 *
 * The cost of waiting is real — a doomed call bills for everything the provider
 * generated before we hang up — which is why this was raised only alongside the
 * generation lookup that finally makes those calls countable (mc2-64n8i).
 */
export const DEFAULT_LLM_TIMEOUT_MS = 300_000;

/**
 * How far above a model's published tariff a provider may still serve us.
 *
 * Routing around a provider that failed must not become a licence to spend:
 * OpenRouter picks the cheapest endpoint by default, and the endpoints for one
 * model spread widely — 6.8x across the `deepseek-v4-flash-0731` list. Asking
 * for throughput instead was measured on 2026-08-20 landing on AtlasCloud at
 * seven times the default route's price for the same answer, which is why this
 * is a ceiling and not a preference.
 *
 * 1.5 because the ceiling has one job: exclude the extravagant tail while
 * leaving the ordinary spread — the second- and third-cheapest endpoints a
 * retry legitimately needs — inside it. Tighter than that and a single ignored
 * provider can leave nothing routable.
 */
export const PROVIDER_PRICE_CEILING_MULTIPLIER = 1.5;

/** Symptoms of a provider being at fault rather than our request. */
const PROVIDER_FAILURE_PATTERNS = [
  'timeout',
  'timed out',
  'aborted',
  'econnreset',
  'econnrefused',
  'etimedout',
  'enotfound',
  'socket',
  'connection error',
];

/**
 * Whether OpenRouter refused the request because our price ceiling excluded
 * every endpoint.
 *
 * Matched on the message because it arrives as an ordinary 4xx with no distinct
 * code. Deliberately narrow: this only ever removes a spending limit, so it must
 * not fire on anything else.
 */
export function isPriceCeilingRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('max price');
}

/**
 * Whether the provider that served an attempt is answerable for its failure.
 *
 * A 429 or a 5xx is the provider's; so is a call that never came back. A 4xx we
 * caused — a malformed request, a rejected parameter — is ours, and moving to a
 * different provider would fix nothing while narrowing the pool for the attempts
 * that follow.
 */
function isProviderAnswerableFailure(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    const status: number = (error as { status?: number }).status ?? 0;
    return status === 429 || status >= 500;
  }

  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError' || name === 'TimeoutError') return true;

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return PROVIDER_FAILURE_PATTERNS.some(pattern => message.includes(pattern));
}

/**
 * Options for LLM completion requests
 */
export interface LLMClientOptions {
  /** Model identifier (e.g., 'openai/gpt-oss-20b', 'google/gemini-3.7-flash') */
  model: string;
  /** Maximum output tokens to generate */
  maxTokens?: number;
  /** Temperature (0-2). Lower = more deterministic */
  temperature?: number;
  /** System prompt for model behavior */
  systemPrompt?: string;
  /** Request timeout in milliseconds (default: {@link DEFAULT_LLM_TIMEOUT_MS}) */
  timeout?: number;
  /** Enable prompt caching (for Anthropic models via OpenRouter) */
  enableCaching?: boolean;
  /**
   * Reasoning settings for this call. Omit for the overwhelming majority of
   * phases: deliberation costs tokens and latency, and only helps where the
   * work is genuinely hard.
   */
  reasoning?: ReasoningRequest;
  /**
   * Course, stage and phase this call belongs to. Supply it wherever the
   * caller knows them: without it the call's cost cannot be attributed to a
   * course and is only counted in the provider's own key total.
   */
  costContext?: LlmCostContext;
  /**
   * Transport retries for this call, overriding the client's own count.
   *
   * Set it low where the caller has a better answer than trying again: a route
   * that holds the connection open until the timeout fails identically on every
   * retry, and each one costs a full timeout and real money. Stage 7 quiz spent
   * six such waits — 32 minutes — before giving up (mc2-b7olk.8).
   */
  maxRetries?: number;
}

export interface LLMClientConstructionOptions {
  /** Transport retry count. Defaults to 3; set to 0 when the caller owns retries. */
  maxRetries?: number;
}

/**
 * Response from LLM completion
 */
export interface LLMResponse {
  /** Generated content */
  content: string;
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Total tokens (input + output) */
  totalTokens: number;
  /** Model used for generation */
  model: string;
  /** Finish reason */
  finishReason: string;
  /** Request ID for debugging */
  requestId?: string;
  /**
   * OpenRouter's `x-generation-id` for this attempt.
   *
   * Read from the response headers, which arrive before the body, so it is
   * present even for an attempt we later abort. It is the key to
   * `GET /api/v1/generation`, which answers with what was actually billed and
   * which provider served it.
   */
  generationId?: string;
  /**
   * The endpoint that served this call, as a display name (`Sail Research`).
   *
   * Not a routing slug: `provider.ignore` needs `sail-research`, and the two
   * cannot be derived from one another (see `resolveProviderSlug`).
   */
  providerName?: string;
}

/**
 * LLM Client using OpenAI SDK with OpenRouter backend
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Rate limit handling (429 errors)
 * - Timeout configuration
 * - Comprehensive error handling
 * - Token usage tracking
 * - Centralized API key management (database -> env fallback)
 */
export class LLMClient {
  private client: OpenAI | null = null;
  private maxRetries: number = 3;
  private retryDelays: number[] = [1000, 2000, 4000]; // Exponential backoff
  private initialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Constructor - uses sync fallback for initial setup
   * For proper database-first key resolution, use createLLMClient() factory
   */
  constructor(options: LLMClientConstructionOptions = {}) {
    const configuredRetries = options.maxRetries ?? 3;
    if (
      !Number.isSafeInteger(configuredRetries) ||
      configuredRetries < 0 ||
      configuredRetries > 10
    ) {
      throw new Error('maxRetries must be an integer between 0 and 10');
    }
    this.maxRetries = configuredRetries;
    // Use sync fallback for constructor (env var only)
    const apiKey = getApiKeySync('openrouter');
    if (apiKey) {
      this.initializeClient(apiKey);
    }
    // If no env var, client will be initialized lazily on first use
  }

  /**
   * Initialize OpenAI client with given API key
   */
  private initializeClient(apiKey: string): void {
    const appUrl = process.env.APP_URL || 'https://ai.megacampus.ru';

    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': appUrl,
        'X-Title': 'MegaCampus Course Generator',
      },
      timeout: DEFAULT_LLM_TIMEOUT_MS,
      // The transport is wrapped so `x-generation-id` is captured the moment
      // OpenRouter's headers arrive. Doing it here rather than around the parsed
      // result is the whole point: the body read is what aborts, and an aborted
      // attempt still has an id, a cost and a provider on OpenRouter's side.
      fetch: instrumentFetchWithGenerationId(),
      // Allow browser-like environment (JSDOM for mermaid creates global.window)
      // This is safe because we're running in Node.js, not a real browser
      dangerouslyAllowBrowser: true,
    });

    this.initialized = true;
    logger.info('LLMClient initialized with OpenRouter backend');
  }

  /**
   * Ensure client is initialized with API key from centralized service.
   * Uses promise-based lock to prevent race conditions during concurrent calls.
   */
  private async ensureInitialized(): Promise<void> {
    // Fast path: already initialized
    if (this.initialized && this.client) {
      return;
    }

    // Slow path: use promise lock to prevent concurrent initialization
    if (!this.initializationPromise) {
      this.initializationPromise = this.doInitialize();
    }

    return this.initializationPromise;
  }

  /**
   * Actual initialization logic - called once per initialization cycle
   */
  private async doInitialize(): Promise<void> {
    // Double-check after acquiring lock
    if (this.initialized && this.client) {
      return;
    }

    try {
      const apiKey = await getOpenRouterApiKey();
      if (!apiKey) {
        throw new Error(
          'OpenRouter API key not configured. Set OPENROUTER_API_KEY env var or configure in admin panel.'
        );
      }

      this.initializeClient(apiKey);
    } catch (error) {
      // Reset promise on failure to allow retry
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Reinitialize client with fresh API key from centralized service
   */
  async refreshApiKey(): Promise<void> {
    const apiKey = await getOpenRouterApiKey();
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured');
    }
    this.initializeClient(apiKey);
    logger.info('LLMClient API key refreshed');
  }

  /**
   * Generate a completion for the given prompt
   *
   * @param prompt - User prompt text
   * @param options - Request options (model, temperature, etc.)
   * @returns Promise<LLMResponse> - Generated completion with metadata
   * @throws Error on API failures after retries
   */
  async generateCompletion(prompt: string, options: LLMClientOptions): Promise<LLMResponse> {
    await this.ensureInitialized();

    const {
      model,
      maxTokens = 10000,
      temperature = 0.7,
      systemPrompt = 'You are a helpful assistant that summarizes documents concisely while preserving key information.',
      timeout = DEFAULT_LLM_TIMEOUT_MS,
      enableCaching = false,
      reasoning,
      costContext,
      maxRetries,
    } = options;

    logger.info(
      {
        model,
        promptLength: prompt.length,
        maxTokens,
        temperature,
        enableCaching,
        reasoning: reasoning?.enabled ? reasoning : undefined,
      },
      'Generating LLM completion'
    );

    const [, requestOptions] = buildCompletionRequest(
      model,
      prompt,
      systemPrompt,
      maxTokens,
      temperature,
      enableCaching,
      reasoning
    );

    const inputContentLength = systemPrompt.length + prompt.length;

    const startedAt = Date.now();
    try {
      const response = await this.executeWithRetry(
        requestOptions,
        timeout,
        model,
        inputContentLength,
        'LLM',
        maxRetries
      );
      await this.recordCost(response, costContext, startedAt);
      return response;
    } catch (error) {
      await this.recordFailedCall(model, systemPrompt + prompt, costContext, startedAt, error);
      throw error;
    }
  }

  /**
   * Generate a chat completion with multi-turn conversation support
   *
   * @param messages - Array of chat messages (system, user, assistant)
   * @param options - Request options (model, temperature, etc.)
   * @returns Promise<LLMResponse> - Generated completion with metadata
   * @throws Error on API failures after retries
   */
  async generateChatCompletion(
    messages: ChatCompletionMessageParam[],
    options: Omit<LLMClientOptions, 'systemPrompt'>
  ): Promise<LLMResponse> {
    await this.ensureInitialized();

    const {
      model,
      maxTokens = 10000,
      temperature = 0.7,
      timeout = DEFAULT_LLM_TIMEOUT_MS,
      enableCaching = false,
      reasoning,
      costContext,
      maxRetries,
    } = options;

    logger.info(
      { model, messageCount: messages.length, maxTokens, temperature, enableCaching },
      'Generating chat completion with conversation history'
    );

    const [, requestOptions] = buildChatCompletionRequest(
      model,
      messages,
      maxTokens,
      temperature,
      enableCaching,
      reasoning
    );

    const inputContentLength = messages.reduce((sum, msg) => {
      return sum + (typeof msg.content === 'string' ? msg.content.length : 0);
    }, 0);

    const startedAt = Date.now();
    try {
      const response = await this.executeWithRetry(
        requestOptions,
        timeout,
        model,
        inputContentLength,
        'Chat completion',
        maxRetries
      );
      await this.recordCost(response, costContext, startedAt);
      return response;
    } catch (error) {
      await this.recordFailedCall(
        model,
        messages.map(m => (typeof m.content === 'string' ? m.content : '')).join(' '),
        costContext,
        startedAt,
        error
      );
      throw error;
    }
  }

  /**
   * Prices the call from MODEL_CATALOG and records it against the course.
   *
   * `response.model` is what the provider actually served, which is not always
   * what was asked for once a fallback fires, so the price follows the served
   * model.
   */
  /**
   * Records that a call was made, paid for, and produced nothing.
   *
   * A request that times out has already made the provider generate tokens, and
   * the provider bills them. The price is only recorded after a successful
   * response, so those attempts left no row at all: on 2026-08-17 three quiz
   * attempts died on a four-minute timeout and were invisible in a course total
   * that was already 0.04 short of the invoice (mc2-b7olk.7).
   *
   * The row is written without a price and then asks for one. What the provider
   * generated before we hung up is unknowable *from here* — inventing a number
   * would be worse than an honest gap — but it is not unknowable: the response
   * headers carried an `x-generation-id` before the body did, and
   * `GET /api/v1/generation` still answers for it afterwards. So we do not
   * invent the number, we go and ask for it.
   */
  private async recordFailedCall(
    model: string,
    inputText: string,
    costContext: LlmCostContext | undefined,
    startedAt: number,
    error: unknown
  ): Promise<void> {
    if (!costContext) return;

    const generationId = readGenerationIdFromError(error);

    try {
      const traceId = await logTrace({
        courseId: costContext.courseId,
        stage: costContext.stage,
        phase: costContext.phase,
        stepName: 'llm_call_failed',
        ...(costContext.lessonId ? { lessonId: costContext.lessonId } : {}),
        modelUsed: model,
        durationMs: Date.now() - startedAt,
        errorData: {
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : undefined,
          estimatedInputTokens: tokenEstimator.estimateTokens(inputText),
          // True until the lookup below lands. A row that settles gets a real
          // `cost_usd`; one that never does keeps the honest gap.
          spentButUnpriced: true,
          ...(generationId ? { generationId } : {}),
        },
      });

      settleTraceCostFromProvider(traceId, generationId, model);
    } catch (traceError) {
      logger.warn(
        { error: traceError instanceof Error ? traceError.message : String(traceError), model },
        '[Cost] Could not record a failed LLM call'
      );
    }
  }

  private async recordCost(
    response: LLMResponse,
    costContext: LlmCostContext | undefined,
    startedAt: number
  ): Promise<void> {
    await recordLlmCallCost(
      {
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        ...(response.generationId ? { generationId: response.generationId } : {}),
        ...(response.providerName ? { providerName: response.providerName } : {}),
      },
      costContext ? { durationMs: Date.now() - startedAt, ...costContext } : undefined
    );
  }

  /**
   * Execute a single API request and parse the response.
   *
   * The SDK's own `timeout` option does not bound the call: `fetchWithTimeout`
   * clears its abort timer as soon as `fetch` resolves, and `fetch` resolves on
   * response headers, so the body read runs unbounded. OpenRouter returns
   * headers immediately and then holds the connection for as long as the model
   * takes. Measured on dev 2026-08-13: a Stage 2 summarization call ran 620s
   * against a 60s timeout, never timed out and never retried, and the job it
   * belonged to stayed `active` the whole time. An explicit signal is what
   * actually bounds it, so both are passed: the signal is the enforcement, the
   * option stays for the connect/headers phase.
   *
   * @param requestOptions - OpenRouter request options
   * @param timeout - Wall-clock budget for the whole call in ms
   * @param model - Model identifier for logging/fallback
   * @param inputContentLength - Input content length for token estimation
   * @returns Parsed LLMResponse
   */
  private async executeSingleRequest(
    requestOptions: Parameters<OpenAI['chat']['completions']['create']>[0],
    timeout: number,
    model: string,
    inputContentLength: number
  ): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error('LLM client not initialized');
    }

    const client = this.client;
    return withGenerationIdCapture(async slot => {
      try {
        // Non-streaming request always returns ChatCompletion (not Stream)
        const completion = (await client.chat.completions.create(requestOptions, {
          timeout,
          signal: AbortSignal.timeout(timeout),
        })) as OpenAI.Chat.Completions.ChatCompletion;

        const response = parseCompletionResponse(completion, model, inputContentLength);
        if (slot.generationId) response.generationId = slot.generationId;

        logger.info(
          {
            model: response.model,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            totalTokens: response.totalTokens,
            finishReason: response.finishReason,
            requestId: response.requestId,
            generationId: response.generationId,
            providerName: response.providerName,
          },
          'LLM completion generated successfully'
        );

        return response;
      } catch (error) {
        // Before anything else: an aborted attempt's only trace is this id.
        annotateErrorWithGenerationId(error, slot.generationId);
        // A model that refuses to stop thinking answers 400 to every call, so the
        // retries would all fail the same way. Teach the request instead: the
        // options object is the one the next attempt sends.
        //
        // The condition is "this request has not been fixed yet", not "this model
        // is news". Under concurrency several calls to the same model are refused
        // at once, only the first of them is news, and gating on that would leave
        // every other in-flight request re-sending the body that was just
        // refused. A request that already carries the floor and is still refused
        // falls through to normal error handling.
        const options = requestOptions as OpenRouterRequestOptions;
        if (isMandatoryReasoningRejection(error) && options.reasoning?.effort !== 'low') {
          rememberMandatoryReasoning(model);
          applyMandatoryReasoningFloor(options, model);
          throw error;
        }
        if (error instanceof OpenAI.APIError) {
          handleApiError(error as InstanceType<typeof OpenAI.APIError>, { model });
        }
        handleUnknownError(error, { model });
      }
    });
  }

  /**
   * Run one logical call: attempts, retries, and the routing that connects them.
   *
   * The chain is the unit of provider memory. A provider that fails an attempt
   * is skipped for the remaining attempts of *this* call and forgotten when the
   * call ends — the owner's decision of 2026-08-20, taken deliberately against a
   * standing blocklist: a provider that is degraded this afternoon may be the
   * cheapest working one tomorrow, and a list nobody prunes rots in silence. So
   * the next call starts again at the cheapest endpoint, exactly as before.
   *
   * What makes this worth doing at all: OpenRouter will not do it for us.
   * `allow_fallbacks` moves off a provider that refuses or is down, never one
   * that is merely crawling, and there is no per-request provider timeout. On
   * 2026-08-20 the default route spent 205s on OpenInference at 13 tok/s — an
   * endpoint whose own status was `-2`, degraded — and the repeat with that one
   * provider excluded landed on Sail Research in 58.7s.
   *
   * @param requestOptions - The request, mutated between attempts to carry routing
   * @param timeout - Wall-clock budget for each attempt in ms
   * @param model - Model identifier for logging and for the price ceiling
   * @param inputContentLength - Input content length for token estimation
   * @param label - Label for log messages (e.g., 'LLM' or 'Chat completion')
   * @returns The LLMResponse from the first attempt that succeeds
   */
  private async executeWithRetry(
    requestOptions: OpenRouterRequestOptions,
    timeout: number,
    model: string,
    inputContentLength: number,
    label: string,
    callMaxRetries?: number
  ): Promise<LLMResponse> {
    const maxRetries = callMaxRetries ?? this.maxRetries;

    // Local to this call by construction. No cache, no module state, nothing
    // that outlives the return.
    const ignoredProviderSlugs = new Set<string>();

    const priceCeiling = buildProviderPriceCeiling(model, PROVIDER_PRICE_CEILING_MULTIPLIER);
    if (priceCeiling) {
      applyProviderRouting(requestOptions, { max_price: priceCeiling });
    } else {
      logger.debug(
        { model },
        '[Routing] No published price for this model; the request carries no price ceiling'
      );
    }

    const attempt = async (): Promise<LLMResponse> => {
      applyProviderRouting(requestOptions, { ignore: [...ignoredProviderSlugs] });
      try {
        return await this.executeSingleRequest(requestOptions, timeout, model, inputContentLength);
      } catch (error) {
        // A ceiling nothing can meet is a refusal, not a cheaper route:
        // OpenRouter answers "No endpoints found that satisfy the max price for
        // this request" and the call is simply lost. Measured against the live
        // API on 2026-08-21. That turns one wrong catalogue price into every
        // call for that model failing, so the ceiling gives way rather than the
        // generation.
        if (priceCeiling && isPriceCeilingRefusal(error)) {
          logger.error(
            { model, priceCeiling },
            '[Routing] No provider is within the price ceiling; retrying without it and leaving the catalogue price to be corrected'
          );
          delete requestOptions.extra_body?.provider?.max_price;
          throw error;
        }
        await this.excludeFailedProvider(error, ignoredProviderSlugs, model);
        throw error;
      }
    };

    try {
      return await retryWithBackoff(attempt, {
        maxRetries,
        delays: this.retryDelays,
        onRetry: (attempt: number, error: Error) => {
          logger.warn({ attempt, maxRetries, error: error.message }, `Retrying ${label} request`);
        },
      });
    } catch (error) {
      logger.error(
        { model, error: error instanceof Error ? error.message : String(error) },
        `${label} request failed after all retries`
      );
      throw error;
    }
  }

  /**
   * Add the provider that just failed to this chain's skip list.
   *
   * Only for failures a provider is answerable for — a timeout, a dropped
   * connection, a 429 or a 5xx. A 400 is our own request being wrong, and the
   * next attempt sends a corrected one to the same provider rather than
   * needlessly shrinking the pool.
   *
   * An aborted attempt has no body and therefore no provider name, which is why
   * this asks OpenRouter: the generation record survives our hang-up. The wait
   * is seconds against a timeout that has just cost minutes.
   */
  private async excludeFailedProvider(
    error: unknown,
    ignoredProviderSlugs: Set<string>,
    model: string
  ): Promise<void> {
    try {
      if (!isProviderAnswerableFailure(error)) return;

      const generationId = readGenerationIdFromError(error);
      if (!generationId) return;

      const fact = await fetchGenerationFact(generationId);
      if (!fact?.providerName) return;

      // The slug is not the display name and cannot be derived from it, so an
      // unresolvable name is skipped rather than sent as a string OpenRouter
      // would quietly discard — which would look like routing and be nothing.
      const slug = await resolveProviderSlug(fact.providerName);
      if (!slug) {
        logger.debug(
          { model, providerName: fact.providerName, generationId },
          '[Routing] No slug for this provider; it cannot be routed around'
        );
        return;
      }
      if (ignoredProviderSlugs.has(slug)) return;

      ignoredProviderSlugs.add(slug);
      logger.warn(
        {
          model,
          providerName: fact.providerName,
          providerSlug: slug,
          generationId,
          billedUsd: fact.usageUsd,
          ignoredInThisChain: [...ignoredProviderSlugs],
        },
        '[Routing] Provider failed this attempt; the rest of this call routes around it'
      );
    } catch (routingError) {
      // Routing is an improvement on the retry, never a reason to lose it.
      logger.debug(
        { error: routingError instanceof Error ? routingError.message : String(routingError) },
        '[Routing] Could not identify the provider that failed'
      );
    }
  }

  /**
   * Generate a summary of the given text
   *
   * Convenience method for summarization tasks.
   *
   * @param params - Summarization parameters
   * @returns Promise<LLMResponse> - Summary with metadata
   */
  async generateSummary(params: {
    text: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<LLMResponse> {
    const { text, model = 'openai/gpt-oss-20b', maxTokens = 10000, temperature = 0.7 } = params;

    const systemPrompt = `You are a highly skilled document summarizer. Your task is to create a comprehensive yet concise summary that:
1. Preserves all key information, concepts, and insights
2. Maintains the logical structure and flow of ideas
3. Uses clear, professional language
4. Focuses on essential content while removing redundancy
5. Retains important technical details, examples, and explanations

Create a summary that someone could use to understand the core content without reading the original document.`;

    return this.generateCompletion(text, {
      model,
      maxTokens,
      temperature,
      systemPrompt,
    });
  }

  /**
   * Estimate cost for a completion request (USD)
   *
   * @param response - LLM response with token counts
   * @returns Estimated cost in USD
   */
  estimateCost(response: LLMResponse): number {
    const model = response.model;
    const capabilities = getModelCapabilities(model);
    const modelPricing = capabilities
      ? {
          input: capabilities.inputPricePerMillion,
          output: capabilities.outputPricePerMillion,
        }
      : { input: 0.05, output: 0.15 }; // Preserve the legacy unknown-model fallback.

    const inputCost = (response.inputTokens / 1_000_000) * modelPricing.input;
    const outputCost = (response.outputTokens / 1_000_000) * modelPricing.output;

    return inputCost + outputCost;
  }
}

/**
 * Singleton instance for easy import
 * Note: Uses env var for initial setup. For database-first resolution,
 * call llmClient.refreshApiKey() or use createLLMClient() factory.
 */
export const llmClient = new LLMClient();

/**
 * Factory function to create LLMClient with database-first API key resolution
 *
 * @returns Promise<LLMClient> - Initialized client with proper API key
 */
export async function createLLMClient(
  options: LLMClientConstructionOptions = {}
): Promise<LLMClient> {
  const client = new LLMClient(options);
  await client.refreshApiKey();
  return client;
}
