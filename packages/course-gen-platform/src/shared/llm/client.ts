/**
 * LLM Client for OpenRouter Integration
 * @module orchestrator/services/llm-client
 *
 * Direct OpenAI SDK integration with OpenRouter as the provider.
 * Handles API calls, retry logic, error handling, and token tracking.
 *
 * API Key Resolution:
 * Uses centralized api-key-service for key retrieval.
 * Priority: database (admin panel) -> environment variable
 */

import OpenAI from 'openai';
import logger from '../../shared/logger';
import { retryWithBackoff } from '../../shared/utils/retry';
import { getOpenRouterApiKey, getApiKeySync } from '../services/api-key-service';

/**
 * Options for LLM completion requests
 */
export interface LLMClientOptions {
  /** Model identifier (e.g., 'openai/gpt-oss-20b', 'google/gemini-2.5-flash-preview') */
  model: string;
  /** Maximum output tokens to generate */
  maxTokens?: number;
  /** Temperature (0-2). Lower = more deterministic */
  temperature?: number;
  /** System prompt for model behavior */
  systemPrompt?: string;
  /** Request timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Enable prompt caching (for Anthropic models via OpenRouter) */
  enableCaching?: boolean;
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
  constructor() {
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
    const appUrl = process.env.APP_URL || 'https://megacampus.ai';

    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': appUrl,
        'X-Title': 'MegaCampus Course Generator',
      },
      timeout: 60000, // 60s default timeout
    });

    this.initialized = true;
    logger.info('LLMClient initialized with OpenRouter backend');
  }

  /**
   * Ensure client is initialized with API key from centralized service
   * This method is called before each request to ensure we have the latest key
   * Uses promise-based lock to prevent race conditions during concurrent calls
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
   * Separated from ensureInitialized() to enable proper locking
   */
  private async doInitialize(): Promise<void> {
    // Double-check after acquiring lock
    if (this.initialized && this.client) {
      return;
    }

    try {
      const apiKey = await getOpenRouterApiKey();
      if (!apiKey) {
        throw new Error('OpenRouter API key not configured. Set OPENROUTER_API_KEY env var or configure in admin panel.');
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
   * Call this when API key may have changed in admin panel
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
  async generateCompletion(
    prompt: string,
    options: LLMClientOptions
  ): Promise<LLMResponse> {
    // Ensure client is initialized with API key from centralized service
    await this.ensureInitialized();

    const {
      model,
      maxTokens = 10000,
      temperature = 0.7,
      systemPrompt = 'You are a helpful assistant that summarizes documents concisely while preserving key information.',
      timeout = 60000,
      enableCaching = false,
    } = options;

    logger.info({
      model,
      promptLength: prompt.length,
      maxTokens,
      temperature,
      enableCaching,
    }, 'Generating LLM completion');

    // Retry logic for transient errors
    const executeRequest = async (): Promise<LLMResponse> => {
      try {
        // Client is guaranteed to be initialized after ensureInitialized()
        if (!this.client) {
          throw new Error('LLM client not initialized');
        }
        // Build messages array
        const messages: any[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ];

        // Add cache_control to system message if caching is enabled
        // This is an OpenRouter extension for Anthropic models
        if (enableCaching && model.includes('anthropic')) {
          messages[0].cache_control = { type: 'ephemeral' };
        }

        // Build request options
        const requestOptions: any = {
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
        };

        // Add OpenRouter-specific cache enablement
        if (enableCaching && model.includes('anthropic')) {
          requestOptions.extra_body = {
            provider: { cache_control: true },
          };
        }

        const completion = await this.client.chat.completions.create(
          requestOptions,
          {
            timeout,
          }
        );

        const choice = completion.choices[0];
        if (!choice?.message?.content) {
          throw new Error('No content in completion response');
        }

        const usage = completion.usage;
        if (!usage) {
          throw new Error('No usage data in completion response');
        }

        const response: LLMResponse = {
          content: choice.message.content,
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          model: completion.model || model,
          finishReason: choice.finish_reason || 'unknown',
          requestId: (completion as any)._request_id,
        };

        logger.info({
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          totalTokens: response.totalTokens,
          finishReason: response.finishReason,
          requestId: response.requestId,
        }, 'LLM completion generated successfully');

        return response;
      } catch (error) {
        // Enhanced error handling
        if (error instanceof OpenAI.APIError) {
          logger.error({
            status: error.status,
            message: error.message,
            requestId: (error as any).request_id,
            code: (error as any).code,
          }, 'OpenAI API error');

          // Check if error is retryable
          const isRetryable = this.isRetryableError(error);

          if (!isRetryable) {
            throw new Error(`Non-retryable API error (${error.status}): ${error.message}`);
          }

          // Re-throw to trigger retry
          throw error;
        }

        // Unknown error
        logger.error({ error }, 'Unknown error during LLM request');
        throw error;
      }
    };

    // Execute with retry logic
    try {
      return await retryWithBackoff(executeRequest, {
        maxRetries: this.maxRetries,
        delays: this.retryDelays,
        onRetry: (attempt, error) => {
          logger.warn({
            attempt,
            maxRetries: this.maxRetries,
            error: error.message,
          }, 'Retrying LLM request');
        },
      });
    } catch (error) {
      logger.error({
        model,
        error: error instanceof Error ? error.message : String(error),
      }, 'LLM request failed after all retries');
      throw error;
    }
  }

  /**
   * Determine if an API error is retryable
   *
   * Retryable errors:
   * - 429 (Rate limit)
   * - 500 (Internal server error)
   * - 502 (Bad gateway)
   * - 503 (Service unavailable)
   * - 504 (Gateway timeout)
   * - Network errors (ECONNRESET, ETIMEDOUT, etc.)
   *
   * Non-retryable errors:
   * - 400 (Bad request)
   * - 401 (Unauthorized)
   * - 403 (Forbidden)
   * - 404 (Not found)
   * - 422 (Unprocessable entity)
   */
  private isRetryableError(error: InstanceType<typeof OpenAI.APIError>): boolean {
    const retryableStatuses = [429, 500, 502, 503, 504];

    if (retryableStatuses.includes(error.status || 0)) {
      return true;
    }

    // Check for network-level errors
    const message = error.message.toLowerCase();
    const networkErrors = [
      'timeout',
      'econnreset',
      'econnrefused',
      'etimedout',
      'enotfound',
      'socket',
    ];

    return networkErrors.some(pattern => message.includes(pattern));
  }

  /**
   * Generate a summary of the given text
   *
   * Convenience method for summarization tasks. Uses a specialized system prompt
   * for document summarization.
   *
   * @param params - Summarization parameters
   * @param params.text - Text to summarize
   * @param params.model - Model to use (default: 'openai/gpt-oss-20b')
   * @param params.maxTokens - Maximum output tokens (default: 10000)
   * @param params.temperature - Temperature for generation (default: 0.7)
   * @returns Promise<LLMResponse> - Summary with metadata
   * @throws Error on API failures after retries
   */
  async generateSummary(params: {
    text: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<LLMResponse> {
    const {
      text,
      model = 'openai/gpt-oss-20b',
      maxTokens = 10000,
      temperature = 0.7,
    } = params;

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
   * Uses model-specific pricing from OpenRouter:
   * - openai/gpt-oss-20b: $0.03/1M input, $0.14/1M output
   * - openai/gpt-oss-120b: $0.04/1M input, $0.40/1M output
   * - google/gemini-2.5-flash-preview: $0.10/1M input, $0.40/1M output
   *
   * @param response - LLM response with token counts
   * @returns Estimated cost in USD
   */
  estimateCost(response: LLMResponse): number {
    const model = response.model;

    // Pricing per 1M tokens (USD)
    const pricing: Record<string, { input: number; output: number }> = {
      'openai/gpt-oss-20b': { input: 0.03, output: 0.14 },
      'openai/gpt-oss-120b': { input: 0.04, output: 0.40 },
      'google/gemini-2.5-flash-preview': { input: 0.10, output: 0.40 },
    };

    const modelPricing = pricing[model] || { input: 0.05, output: 0.15 }; // Default fallback

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
 * Use this when you need to ensure the API key is loaded from database if configured.
 *
 * @returns Promise<LLMClient> - Initialized client with proper API key
 *
 * @example
 * ```typescript
 * const client = await createLLMClient();
 * const response = await client.generateCompletion(prompt, options);
 * ```
 */
export async function createLLMClient(): Promise<LLMClient> {
  const client = new LLMClient();
  await client.refreshApiKey();
  return client;
}
