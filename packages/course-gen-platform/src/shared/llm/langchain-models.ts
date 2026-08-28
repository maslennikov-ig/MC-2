/**
 * LangChain OpenRouter Model Configuration
 *
 * Also known as: Model Selector Service (Task T022)
 *
 * Helper functions for creating LangChain ChatOpenAI instances configured for OpenRouter.
 * Supports multi-phase multi-model orchestration with per-phase model selection.
 *
 * This file implements the Model Selector Service (T022) requirements:
 * - Per-phase model selection from database (llm_model_config)
 * - 3-tier fallback logic: course override -> global default -> hardcoded fallback
 * - Returns configured ChatOpenAI instances with model_id, temperature, max_tokens
 *
 * API Key Resolution:
 * Uses centralized api-key-service for key retrieval.
 * Priority: database (admin panel) -> environment variable
 *
 * NOTE: This utility was moved from `src/stages/stage4-analysis/utils/langchain-models.ts`
 * to `src/shared/llm/langchain-models.ts` to break circular dependencies where
 * `shared/regeneration/` was importing from `stages/`.
 *
 * @module shared/llm/langchain-models
 */

import { ChatOpenAI } from '@langchain/openai';
import {
  requiresReasoningNow,
  withMandatoryReasoningRecoveryFetch,
} from './mandatory-reasoning-recovery';
import { costRecordingCallbacks } from './model-cost-callbacks';
import type { PhaseName } from '@megacampus/shared-types/model-config';
import { createModelConfigService, resolveDefaultPhaseConfig } from './model-config-service';
import { buildReasoningPayload, toProviderKwargs } from './client-helpers';
import type { OpenRouterProviderRouting } from './client-helpers';
import { instrumentFetchWithGenerationId } from './generation-id-capture';
import { guardAgainstEmptyCompletion } from './empty-response-guard';
import { resolveServiceTier, withFlexCapacityFallbackFetch } from './service-tier';
import logger from '../logger';
import { getOpenRouterApiKey, getApiKeySync } from '../services/api-key-service';
import type { LanguageCode } from '@/shared/workspace-utils';
import {
  modelSupportsTemperature,
  modelSupportsReasoning,
  getModelCapabilities,
  MANDATORY_REASONING_RESERVE_TOKENS,
} from '@megacampus/shared-types';

/** Reasoning settings as a phase config supplies them. */
export interface LangchainReasoningRequest {
  enabled: boolean;
  effort?: 'low' | 'medium' | 'high' | null;
  maxTokens?: number | null;
}

/**
 * OpenRouter API base URL
 * All OpenRouter models are accessible via this endpoint
 */
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Singleton ModelConfigService instance
 */
const modelConfigService = createModelConfigService();

/**
 * The one transport every LangChain model on this path is built with.
 *
 * Both wrappers have to ride in `configuration`, because that is a constructor
 * field and therefore the only thing that survives the `new ChatOpenAI(fields)`
 * clone `withStructuredOutput` builds. Anything attached to the instance
 * afterwards is dropped — which is how structured calls lost their price
 * (mc2-258fi) and their mandatory-reasoning recovery (mc2-148j9).
 *
 * Order matters, and there are three reasons for this one. The reasoning
 * recovery is outermost, so the generation id deposited by the retry replaces
 * the refused request's and the ledger names the call that was actually served.
 * The flex fallback sits directly below it, so a request re-sent at the default
 * tariff is still covered by the recovery if the provider then refuses it for a
 * different reason. The empty-completion guard sits below both and above the id
 * capture: below, because a 400 the recovery is about to retry must reach it as
 * a response and not as a throw; above, because the id has to be in the slot
 * before the guard can put it into the error (mc2-f1tqd).
 */
function openRouterTransport(modelId: string): typeof globalThis.fetch {
  return withMandatoryReasoningRecoveryFetch(
    modelId,
    withFlexCapacityFallbackFetch(
      modelId,
      guardAgainstEmptyCompletion(instrumentFetchWithGenerationId())
    )
  );
}

/**
 * Build the provider-specific half of a ChatOpenAI config.
 *
 * Two provider facts are handled here rather than at every call site:
 * `temperature` is silently ignored by models that do not accept it (OpenAI's
 * GPT-5.6 series), and reasoning tokens are billed out of `maxTokens`, so a
 * reasoning budget has to be added to the answer budget rather than shared
 * with it.
 */
export function buildProviderParams(
  modelId: string,
  temperature: number,
  maxTokens: number,
  reasoning?: LangchainReasoningRequest,
  providerRouting?: OpenRouterProviderRouting,
  phase?: string
): {
  temperature?: number;
  maxTokens: number;
  modelKwargs: Record<string, unknown>;
} {
  // `usage: {include: true}` is kept, and it is worth saying that it buys
  // nothing today: measured on the live API 2026-08-25, OpenRouter returns
  // `usage.cost` with or without it. It stays because it is the documented way
  // to ask for the accounting block we now read the charge out of, it costs
  // nothing, and the alternative is depending on undocumented default behaviour
  // for a number the ledger is built on.
  const modelKwargs: Record<string, unknown> = { usage: { include: true } };
  let effectiveMaxTokens = maxTokens;

  // Provider routing rides in `modelKwargs` on this path, the way `extra_body`
  // carries it on the direct SDK path.
  const provider = toProviderKwargs(providerRouting);
  if (provider) modelKwargs.provider = provider;

  // Half price for work nobody is waiting on. Named as a tier rather than as an
  // endpoint tag because this path has no endpoint list to choose a tag from;
  // a model with no flex endpoint is simply served normally. A phase we cannot
  // name gets the default tariff — see `resolveServiceTier`.
  if (resolveServiceTier(phase) === 'flex') modelKwargs.service_tier = 'flex';

  if (reasoning?.enabled) {
    if (modelSupportsReasoning(modelId)) {
      // OpenRouter rejects a request carrying both controls; the budget wins
      // because the answer budget below is grown by exactly this number.
      modelKwargs.reasoning = buildReasoningPayload(reasoning);
      if (reasoning.maxTokens) effectiveMaxTokens += reasoning.maxTokens;
    } else {
      logger.warn(
        { modelId },
        'Phase asks for reasoning but the model does not accept it - sending the request without it'
      );
    }
  } else if (requiresReasoningNow(modelId)) {
    // Some models refuse to switch it off at all and answer 400 to the attempt.
    // Ask for the least of it and grow the budget it will be billed against
    // (see applyMandatoryReasoningFloor in client-helpers).
    modelKwargs.reasoning = { effort: 'low' };
    const ceiling = getModelCapabilities(modelId)?.maxOutputTokens ?? null;
    const grown = effectiveMaxTokens + MANDATORY_REASONING_RESERVE_TOKENS;
    effectiveMaxTokens = ceiling === null ? grown : Math.min(grown, ceiling);
  } else if (modelSupportsReasoning(modelId)) {
    // A phase that did not ask for deliberation has to say so: models that
    // reason by default otherwise spend the answer budget on it (see
    // client-helpers).
    modelKwargs.reasoning = { enabled: false };
  }

  return {
    ...(modelSupportsTemperature(modelId) ? { temperature } : {}),
    maxTokens: effectiveMaxTokens,
    modelKwargs,
  };
}

/**
 * What a model needs in order to charge its calls to something.
 *
 * It has to be known at construction time, not attached afterwards: see
 * `costRecordingCallbacks`.
 */
export interface ModelCostContext {
  phase: string;
  courseId?: string;
}

/**
 * Creates a ChatOpenAI instance configured for OpenRouter (sync version)
 *
 * Note: Uses environment variable only. For database-first key resolution,
 * use createOpenRouterModelAsync() instead.
 *
 * @param modelId - OpenRouter model identifier (e.g., 'openai/gpt-oss-20b')
 * @param temperature - Model temperature (0-2, default: 0.7)
 * @param maxTokens - Maximum output tokens (default: 4096)
 * @returns Configured ChatOpenAI instance
 *
 * @example
 * // Create 20B model for classification
 * const model = createOpenRouterModel('openai/gpt-oss-20b', 0.7, 4096);
 *
 * @example
 * // Create 120B model for expert analysis
 * const expertModel = createOpenRouterModel('deepseek/deepseek-v4-flash', 0.5, 8000);
 */
export function createOpenRouterModel(
  modelId: string,
  temperature: number = 0.7,
  maxTokens: number = 4096,
  timeoutMs?: number,
  reasoning?: LangchainReasoningRequest,
  providerRouting?: OpenRouterProviderRouting,
  costContext?: ModelCostContext
): ChatOpenAI {
  const apiKey = getApiKeySync('openrouter');

  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY environment variable is required for LangChain integration. ' +
        'For database-first key resolution, use createOpenRouterModelAsync() instead.'
    );
  }

  const callbacks = costContext
    ? costRecordingCallbacks(modelId, costContext.phase, costContext.courseId)
    : undefined;

  return new ChatOpenAI({
    model: modelId,
    configuration: { baseURL: OPENROUTER_BASE_URL, fetch: openRouterTransport(modelId) },
    apiKey,
    ...(callbacks ? { callbacks } : {}),
    ...(timeoutMs ? { timeout: timeoutMs } : {}),
    ...buildProviderParams(
      modelId,
      temperature,
      maxTokens,
      reasoning,
      providerRouting,
      costContext?.phase
    ),
  });
}

/**
 * A model that prices its own calls, for the stages that pick their own model
 * instead of going through `getModelForPhase`.
 *
 * One call rather than build-then-attach, because attaching afterwards does not
 * survive `withStructuredOutput` — the reason is in `costRecordingCallbacks`,
 * and it cost every structured call its price.
 */
export function createCostRecordingModel(
  modelId: string,
  temperature: number,
  maxTokens: number,
  phase: string,
  courseId?: string,
  reasoning?: LangchainReasoningRequest
): ChatOpenAI {
  return createOpenRouterModel(modelId, temperature, maxTokens, undefined, reasoning, undefined, {
    phase,
    ...(courseId ? { courseId } : {}),
  });
}

/**
 * The same, resolving the key from the admin panel rather than the process env.
 *
 * Preferred wherever the caller can await: a key replaced in the admin panel is
 * only seen by this path. Stage 5 read `process.env.OPENROUTER_API_KEY` in two
 * places and would have ignored such a replacement entirely (mc2-me7nx).
 */
export async function createCostRecordingModelAsync(
  modelId: string,
  temperature: number,
  maxTokens: number,
  phase: string,
  courseId?: string,
  reasoning?: LangchainReasoningRequest,
  timeoutMs?: number
): Promise<ChatOpenAI> {
  return createOpenRouterModelAsync(
    modelId,
    temperature,
    maxTokens,
    timeoutMs,
    reasoning,
    undefined,
    {
      phase,
      ...(courseId ? { courseId } : {}),
    }
  );
}

/**
 * Creates a ChatOpenAI instance with database-first API key resolution
 *
 * This is the preferred method for creating OpenRouter models.
 * Resolves API key from database first, then falls back to env var.
 *
 * @param modelId - OpenRouter model identifier (e.g., 'openai/gpt-oss-20b')
 * @param temperature - Model temperature (0-2, default: 0.7)
 * @param maxTokens - Maximum output tokens (default: 4096)
 * @returns Promise<ChatOpenAI> - Configured ChatOpenAI instance
 *
 * @example
 * // Create model with database-first key resolution
 * const model = await createOpenRouterModelAsync('deepseek/deepseek-v4-flash', 0.5, 8000);
 */
export async function createOpenRouterModelAsync(
  modelId: string,
  temperature: number = 0.7,
  maxTokens: number = 4096,
  timeoutMs?: number,
  reasoning?: LangchainReasoningRequest,
  providerRouting?: OpenRouterProviderRouting,
  costContext?: ModelCostContext
): Promise<ChatOpenAI> {
  const apiKey = await getOpenRouterApiKey();

  if (!apiKey) {
    throw new Error(
      'OpenRouter API key not configured. Set OPENROUTER_API_KEY env var or configure in admin panel.'
    );
  }

  const callbacks = costContext
    ? costRecordingCallbacks(modelId, costContext.phase, costContext.courseId)
    : undefined;

  return new ChatOpenAI({
    model: modelId,
    configuration: { baseURL: OPENROUTER_BASE_URL, fetch: openRouterTransport(modelId) },
    apiKey,
    ...(callbacks ? { callbacks } : {}),
    ...(timeoutMs ? { timeout: timeoutMs } : {}),
    ...buildProviderParams(
      modelId,
      temperature,
      maxTokens,
      reasoning,
      providerRouting,
      costContext?.phase
    ),
  });
}

/**
 * Retrieves the appropriate ChatOpenAI model for a specific analysis phase
 *
 * Lookup logic (3-tier fallback):
 * 1. Course-specific override (if courseId provided)
 * 2. Global default configuration
 * 3. Hardcoded fallback (if database unavailable)
 *
 * @param phase - Analysis phase identifier
 * @param courseId - Optional course UUID for course-specific overrides
 * @param tokenCount - Optional token count for tier selection
 * @param language - Optional language code (LanguageCode: 'ru', 'en', or any ISO 639-1 code)
 * @returns Configured ChatOpenAI instance
 *
 * @throws Error if database lookup fails and no hardcoded fallback exists
 *
 * @example
 * // Get model for Phase 1 Classification (global config)
 * const model = await getModelForPhase('stage_4_classification');
 *
 * @example
 * // Get model for Phase 3 Expert Analysis with course override
 * const expertModel = await getModelForPhase(
 *   'stage_4_expert',
 *   '550e8400-e29b-41d4-a716-446655440000'
 * );
 */
export async function getModelForPhase(
  phase: PhaseName,
  courseId?: string,
  tokenCount?: number,
  language?: LanguageCode
): Promise<ChatOpenAI> {
  try {
    const config = await modelConfigService.getModelForPhase(phase, courseId, tokenCount, language);

    if (config.source === 'database') {
      logger.info(
        {
          phase,
          modelId: config.modelId,
          tier: config.tier,
          tokenCount,
          language,
          source: 'database',
        },
        'Using database model config'
      );
    } else {
      logger.info(
        { phase, modelId: config.modelId, language, source: 'hardcoded' },
        'Using hardcoded fallback model config'
      );
    }

    // Use async version for database-first API key resolution.
    // `config.reasoning` has to travel with the rest of the phase config: a
    // phase that reads its reasoning budget out of the database and then drops
    // it before the request is a phase that thinks it deliberates and does not.
    return await createOpenRouterModelAsync(
      config.modelId,
      config.temperature,
      config.maxTokens,
      undefined,
      config.reasoning,
      undefined,
      { phase, ...(courseId ? { courseId } : {}) }
    );
  } catch (err) {
    logger.warn(
      { phase, error: err },
      'ModelConfigService lookup failed, using hardcoded fallback'
    );
    return await getHardcodedFallbackModelAsync(phase);
  }
}

/**
 * The model for a phase when `ModelConfigService` cannot answer at all.
 *
 * Reads the committed snapshot of `llm_model_config` — the same table the
 * superadmin panel edits — and falls through to its `global_default` row for a
 * phase the snapshot does not name.
 *
 * It used to read `PHASE_FALLBACK_CONFIG`, a second table of the same fact kept
 * by hand. By 2026-08-27 the two disagreed on **eleven** phases: `stage_5_normal`
 * and `stage_5_escalation` said `moonshotai/kimi-k2-thinking` where the database
 * said Luna, `stage_5_complex` said `qwen/qwen3.7-plus`, `stage_7_cover` still
 * named the image model replaced that morning, and `emergency` named an alias
 * rather than a pinned snapshot. This is not a dormant branch: every failure of
 * the config service lands here, which is why sixty days of `generation_trace`
 * held eleven distinct model ids against nine configured ones (mc2-a6qxc,
 * mc2-u8kwx).
 *
 * A hand-kept copy of a table the operator can already edit is not a safety net.
 * It is a second answer nobody can see, reached at the worst possible moment.
 *
 * @param phase - Analysis phase identifier
 * @returns Promise<ChatOpenAI> - Configured ChatOpenAI instance
 * @throws Error if neither the phase nor `global_default` is in the snapshot
 */
async function getHardcodedFallbackModelAsync(phase: PhaseName): Promise<ChatOpenAI> {
  const config = resolveDefaultPhaseConfig(phase);

  if (!config) {
    throw new Error(`Unknown phase: ${phase}. Cannot determine hardcoded fallback.`);
  }

  return await createOpenRouterModelAsync(
    config.modelId,
    config.temperature,
    config.maxTokens,
    undefined,
    config.reasoning
  );
}

/**
 * Safely extract text from LangChain MessageContent (string | ContentBlock[]).
 * Returns string as-is; for non-string content, returns JSON representation.
 */
export function getTextContent(content: string | unknown[]): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}
