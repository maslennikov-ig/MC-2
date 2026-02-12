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
import logger from '../../shared/logger';
import { retryWithBackoff } from '../../shared/utils/retry';
import { getOpenRouterApiKey, getApiKeySync } from '../services/api-key-service';
import {
  buildCompletionRequest,
  buildChatCompletionRequest,
  parseCompletionResponse,
  handleApiError,
  handleUnknownError,
} from './client-helpers';

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
    const appUrl = process.env.APP_URL || 'https://ai.megacampus.ru';

    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': appUrl,
        'X-Title': 'MegaCampus Course Generator',
      },
      timeout: 60000, // 60s default timeout
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
      timeout = 60000,
      enableCaching = false,
    } = options;

    logger.info(
      { model, promptLength: prompt.length, maxTokens, temperature, enableCaching },
      'Generating LLM completion'
    );

    const [, requestOptions] = buildCompletionRequest(
      model,
      prompt,
      systemPrompt,
      maxTokens,
      temperature,
      enableCaching
    );

    const inputContentLength = systemPrompt.length + prompt.length;

    return this.executeWithRetry(
      () => this.executeSingleRequest(requestOptions, timeout, model, inputContentLength),
      model,
      'LLM'
    );
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
      timeout = 60000,
      enableCaching = false,
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
      enableCaching
    );

    const inputContentLength = messages.reduce((sum, msg) => {
      return sum + (typeof msg.content === 'string' ? msg.content.length : 0);
    }, 0);

    return this.executeWithRetry(
      () => this.executeSingleRequest(requestOptions, timeout, model, inputContentLength),
      model,
      'Chat completion'
    );
  }

  /**
   * Execute a single API request and parse the response.
   *
   * @param requestOptions - OpenRouter request options
   * @param timeout - Request timeout in ms
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

    // Pricing per 1M tokens (USD)
    const pricing: Record<string, { input: number; output: number }> = {
      'openai/gpt-oss-20b': { input: 0.03, output: 0.14 },
      'openai/gpt-oss-120b': { input: 0.04, output: 0.4 },
      'google/gemini-2.5-flash-preview': { input: 0.1, output: 0.4 },
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
 * @returns Promise<LLMClient> - Initialized client with proper API key
 */
export async function createLLMClient(): Promise<LLMClient> {
  const client = new LLMClient();
  await client.refreshApiKey();
  return client;
}
