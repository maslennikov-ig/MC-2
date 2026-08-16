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
} from './client-helpers';
import type { ReasoningRequest, OpenRouterRequestOptions } from './client-helpers';
import {
  isMandatoryReasoningRejection,
  rememberMandatoryReasoning,
} from './mandatory-reasoning-recovery';
import { recordLlmCallCost, type LlmCostContext } from '../metrics/llm-cost';

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
 */
export const DEFAULT_LLM_TIMEOUT_MS = 238_000;

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
    const response = await this.executeWithRetry(
      () => this.executeSingleRequest(requestOptions, timeout, model, inputContentLength),
      model,
      'LLM'
    );
    await this.recordCost(response, costContext, startedAt);
    return response;
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
    const response = await this.executeWithRetry(
      () => this.executeSingleRequest(requestOptions, timeout, model, inputContentLength),
      model,
      'Chat completion'
    );
    await this.recordCost(response, costContext, startedAt);
    return response;
  }

  /**
   * Prices the call from MODEL_CATALOG and records it against the course.
   *
   * `response.model` is what the provider actually served, which is not always
   * what was asked for once a fallback fires, so the price follows the served
   * model.
   */
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

    try {
      // Non-streaming request always returns ChatCompletion (not Stream)
      const completion = (await this.client.chat.completions.create(requestOptions, {
        timeout,
        signal: AbortSignal.timeout(timeout),
      })) as OpenAI.Chat.Completions.ChatCompletion;

      const response = parseCompletionResponse(completion, model, inputContentLength);

      logger.info(
        {
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          totalTokens: response.totalTokens,
          finishReason: response.finishReason,
          requestId: response.requestId,
        },
        'LLM completion generated successfully'
      );

      return response;
    } catch (error) {
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
  }

  /**
   * Execute a request function with retry logic and proper error logging.
   *
   * @param requestFn - The async function to execute (and retry on failure)
   * @param model - Model identifier for logging
   * @param label - Label for log messages (e.g., 'LLM' or 'Chat completion')
   * @returns The LLMResponse from the request
   */
  private async executeWithRetry(
    requestFn: () => Promise<LLMResponse>,
    model: string,
    label: string
  ): Promise<LLMResponse> {
    try {
      return await retryWithBackoff(requestFn, {
        maxRetries: this.maxRetries,
        delays: this.retryDelays,
        onRetry: (attempt, error) => {
          logger.warn(
            { attempt, maxRetries: this.maxRetries, error: error.message },
            `Retrying ${label} request`
          );
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
