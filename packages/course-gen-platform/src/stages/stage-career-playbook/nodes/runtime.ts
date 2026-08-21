import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { PROVIDER_PRICE_CEILING_MULTIPLIER, isPriceCeilingRefusal } from '@/shared/llm/client';
import { buildProviderPriceCeiling } from '@/shared/llm/client-helpers';
import type { OpenRouterProviderRouting } from '@/shared/llm/client-helpers';
import { withGenerationIdCapture, type GenerationIdSlot } from '@/shared/llm/generation-id-capture';
import { fetchGenerationFact, resolveProviderSlug } from '@/shared/llm/openrouter-generation';
import {
  createModelConfigService,
  EMERGENCY_FALLBACK_MODEL,
} from '@/shared/llm/model-config-service';
import type { PhaseModelConfig } from '@/shared/llm/model-config-db';
import { estimateCost, estimateTokenCount } from '@/shared/llm/cost-calculator';
import { createPromptService } from '@/shared/prompts/prompt-service';
import { logger } from '@/shared/logger';
import type { CareerPlaybookNodeCost } from '@megacampus/shared-types';
import type { z } from 'zod';

export interface CareerPlaybookLLMCallOptions {
  phaseName: string;
  promptKey: string;
  node: string;
  courseId?: string;
  language?: string;
  temperature?: number;
  maxTokens?: number;
  preferFallbackModel?: boolean;
  // When set, a call whose estimated prompt tokens exceed this threshold starts on
  // the fallback model instead of the primary. Lets large-context callers (the
  // final full-document judge) skip a first attempt the primary would almost
  // certainly time out on, while the retry net below still escalates on failure.
  preferFallbackModelAboveTokens?: number;
  maxTokensMultiplier?: number;
  structuredOutputSchema?: z.ZodTypeAny | Record<string, unknown>;
  structuredOutputName?: string;
  structuredOutputMethod?: 'functionCalling' | 'jsonMode' | 'jsonSchema';
  structuredOutputStrict?: boolean;
}

/**
 * An attempt that never returned a usable response. It produced no usage record,
 * so its cost is unknown rather than zero — the provider may still bill tokens
 * generated before the abort. Recording these is what turns the cost receipt
 * from "what we can see" into "what actually happened".
 */
export interface CareerPlaybookAbortedAttempt {
  model: string;
  attempt: number;
  durationMs: number;
  error: string;
  /**
   * OpenRouter's id for the attempt, captured from the response headers before
   * the body — and therefore before the abort. It is what makes the sentence
   * above ("its cost is unknown") no longer true.
   */
  generationId?: string;
  /** Display name of the endpoint that served it, from the generation record. */
  providerName?: string;
  /** What OpenRouter actually billed for the attempt we walked away from. */
  costUsd?: number;
}

export interface CareerPlaybookLLMResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  // Total wall-clock across every attempt this call consumed, and how many attempts
  // ran before success. Required so downstream node-cost sites and the retry audit
  // always carry timing/attempt ground truth.
  durationMs: number;
  attemptCount: number;
  /** Attempts that failed before this call eventually succeeded. */
  abortedAttempts: CareerPlaybookAbortedAttempt[];
  /** OpenRouter's id for the attempt that succeeded, when one was captured. */
  generationId?: string;
  /** Display name of the endpoint that served the successful attempt. */
  providerName?: string;
}

/** Thrown when every attempt failed, so the aborted attempts still reach the receipt. */
export class CareerPlaybookLLMCallError extends Error {
  constructor(
    message: string,
    readonly abortedAttempts: CareerPlaybookAbortedAttempt[],
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'CareerPlaybookLLMCallError';
  }
}

/**
 * Convert aborted attempts into node-cost rows.
 *
 * An attempt whose generation record came back is priced from it and counts
 * towards the total like any other call — because it was billed like any other
 * call. On 2026-08-20 four such attempts cost 120s each and appeared nowhere,
 * which is most of why a $0.077338 ledger met a $0.144177 invoice (mc2-64n8i).
 *
 * An attempt whose record never came back keeps the old honest shape: zero, and
 * `cost_unknown` so a reader knows the total is a lower bound.
 */
export function buildCareerPlaybookAbortedAttemptCosts(
  node: string,
  abortedAttempts: readonly CareerPlaybookAbortedAttempt[] | undefined
): CareerPlaybookNodeCost[] {
  return (abortedAttempts ?? []).map(attempt => {
    // `typeof`, not truthiness: a provider that billed exactly $0 measured that,
    // and filing it as unknown would put it back among the holes we are closing.
    const billed = typeof attempt.costUsd === 'number';
    return {
      node,
      model: attempt.model,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: billed ? (attempt.costUsd as number) : 0,
      duration_ms: attempt.durationMs,
      attempts: attempt.attempt + 1,
      outcome: 'aborted' as const,
      cost_unknown: !billed,
      error: attempt.error,
      ...(attempt.generationId ? { generation_id: attempt.generationId } : {}),
      ...(attempt.providerName ? { provider_name: attempt.providerName } : {}),
      ...(billed ? { billed_by_provider: true } : {}),
    };
  });
}

export interface CareerPlaybookRuntime {
  renderPrompt: (promptKey: string, variables: Record<string, string>) => Promise<string>;
  invokeLLM: (
    prompt: string,
    options: CareerPlaybookLLMCallOptions
  ) => Promise<CareerPlaybookLLMResult>;
}

const DEFAULT_TIMEOUT_MS = 300_000;

// Floor for the output-token budget when the max-context guard has to clamp it
// so a still-usable generation is attempted instead of a zero/negative budget.
const MIN_GUARDED_OUTPUT_TOKENS = 512;

interface CareerPlaybookPromptService {
  renderPrompt: (promptKey: string, variables: Record<string, string>) => Promise<string>;
}

interface CareerPlaybookModelConfigService {
  getModelForPhase: (
    phaseName: string,
    courseId?: string,
    tokenCount?: number,
    language?: string
  ) => Promise<Partial<PhaseModelConfig> & { modelId: string }>;
}

interface CareerPlaybookModelUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface CareerPlaybookModelInvocation {
  content: string;
  usage?: CareerPlaybookModelUsage;
}

interface CareerPlaybookModel {
  invoke: (
    prompt: string
  ) => Promise<{ content: unknown; usage_metadata?: CareerPlaybookModelUsage }>;
  withStructuredOutput?: (
    schema: z.ZodTypeAny | Record<string, unknown>,
    config?: {
      name?: string;
      method?: 'functionCalling' | 'jsonMode' | 'jsonSchema';
      strict?: boolean;
      includeRaw?: boolean;
    }
  ) => { invoke: (prompt: string) => Promise<unknown> };
}

export interface CareerPlaybookRuntimeDependencies {
  promptService?: CareerPlaybookPromptService;
  modelConfigService?: CareerPlaybookModelConfigService;
  createModel?: (
    modelId: string,
    temperature: number,
    maxTokens: number,
    timeoutMs?: number,
    reasoning?: undefined,
    providerRouting?: OpenRouterProviderRouting
  ) => CareerPlaybookModel;
}

/**
 * The attempt at which a call gives up on its primary model.
 *
 * Attempt 0 and attempt 1 both run on the phase's primary; only from attempt 2
 * does the fallback take over. Before 2026-08-21 the switch happened at attempt
 * 1, which spent three of `stage_career_playbook_spec`'s four attempts on its
 * fallback — the `~deepseek/...-latest` alias, median 102s that week — against a
 * 120s budget. All four timed out and the playbook failed (mc2-64n8i).
 *
 * A second run at the primary is worth having now in a way it was not before:
 * the failed provider is excluded from it, so it reaches a different endpoint
 * rather than repeating the same one. The fallback still exists, and still
 * catches a model that cannot produce the shape at all — it is simply no longer
 * the first thing tried after a single slow provider.
 */
const FALLBACK_FROM_ATTEMPT = 2;

/**
 * Which model this attempt runs on.
 *
 * A caller that explicitly asked for the fallback — a repair after the primary
 * has already failed, or an input too large for the primary's window — gets it
 * from attempt 0. Those are decisions the call site has made with information
 * this function does not have.
 */
function selectAttemptModel(
  phaseConfig: { modelId: string; fallbackModelId?: string },
  options: CareerPlaybookLLMCallOptions,
  attempt: number,
  startOnFallbackForLargeInput: boolean
): string {
  const useFallback =
    Boolean(options.preferFallbackModel) ||
    startOnFallbackForLargeInput ||
    attempt >= FALLBACK_FROM_ATTEMPT;

  return useFallback && phaseConfig.fallbackModelId
    ? phaseConfig.fallbackModelId
    : phaseConfig.modelId;
}

function normalizeTimeoutMs(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function timeoutErrorMessage(options: CareerPlaybookLLMCallOptions, timeoutMs: number): string {
  return `Career Playbook LLM call timed out after ${timeoutMs}ms (${options.phaseName}/${options.node})`;
}

async function withLLMTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number | undefined,
  options: CareerPlaybookLLMCallOptions
): Promise<T> {
  if (!timeoutMs) return operation;

  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(timeoutErrorMessage(options, timeoutMs))),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function createCareerPlaybookRuntime(
  dependencies: CareerPlaybookRuntimeDependencies = {}
): CareerPlaybookRuntime {
  const promptService = dependencies.promptService ?? createPromptService();
  const modelConfigService = dependencies.modelConfigService ?? createModelConfigService();
  const createModel = dependencies.createModel ?? createOpenRouterModel;

  return {
    renderPrompt: (promptKey, variables) => promptService.renderPrompt(promptKey, variables),
    invokeLLM: async (prompt, options) => {
      // Feed the rendered prompt size into model routing so large source-evidence
      // packs resolve the extended-context tier instead of always defaulting to
      // standard (which previously happened because tokenCount was never passed).
      const promptTokens = estimateTokenCount(prompt);
      const phaseConfig = await resolvePhaseConfig(modelConfigService, options, promptTokens);
      const attempts = Math.max(1, (phaseConfig.maxRetries ?? 0) + 1);
      // Large-context inputs (e.g. the final full-document judge) start on the
      // fallback model so the doomed primary-model first attempt/timeout is skipped.
      // The retry loop below is unchanged — it still escalates on failure — so this
      // only removes wasted primary attempts, it never weakens the safety net.
      const startOnFallbackForLargeInput =
        typeof options.preferFallbackModelAboveTokens === 'number' &&
        options.preferFallbackModelAboveTokens > 0 &&
        promptTokens > options.preferFallbackModelAboveTokens;
      if (startOnFallbackForLargeInput) {
        logger.info(
          {
            phaseName: options.phaseName,
            node: options.node,
            promptKey: options.promptKey,
            promptTokens,
            preferFallbackModelAboveTokens: options.preferFallbackModelAboveTokens,
          },
          'Career Playbook large-input call routed to fallback model first'
        );
      }
      let lastError: unknown = null;
      const callStartedAt = Date.now();
      const abortedAttempts: CareerPlaybookAbortedAttempt[] = [];

      // Lives and dies with this call, deliberately. The owner's decision of
      // 2026-08-20: no standing blocklist, because a provider that is degraded
      // now may be the cheapest working one next time, and a list nobody prunes
      // goes stale in silence. The next call starts at the cheapest again.
      const ignoredProviderSlugs = new Set<string>();

      // A ceiling no endpoint can meet is a refusal, not a cheaper route —
      // OpenRouter answers "No endpoints found that satisfy the max price for
      // this request". One wrong catalogue price would otherwise fail every
      // attempt identically, so the ceiling gives way and the generation lives.
      let priceCeilingRefused = false;

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const modelId = selectAttemptModel(
          phaseConfig,
          options,
          attempt,
          startOnFallbackForLargeInput
        );
        const tokenMultiplier = options.maxTokensMultiplier ?? (attempt >= 2 ? 1.25 : 1);
        const requestedMaxTokens = Math.ceil(
          (options.maxTokens ?? phaseConfig.maxTokens ?? 12_000) * tokenMultiplier
        );
        const maxTokens = guardOutputAgainstContextWindow(
          promptTokens,
          requestedMaxTokens,
          phaseConfig.maxContextTokens,
          options
        );
        const temperature = options.temperature ?? phaseConfig.temperature ?? 0.7;
        const timeoutMs = normalizeTimeoutMs(phaseConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        const attemptStartedAt = Date.now();

        const priceCeiling = priceCeilingRefused
          ? undefined
          : buildProviderPriceCeiling(modelId, PROVIDER_PRICE_CEILING_MULTIPLIER);
        const providerRouting: OpenRouterProviderRouting = {
          ...(ignoredProviderSlugs.size > 0 ? { ignore: [...ignoredProviderSlugs] } : {}),
          ...(priceCeiling ? { max_price: priceCeiling } : {}),
        };

        // Hoisted so the id survives the throw: on an abort it is the only thing
        // the attempt leaves behind, and it is what identifies both the provider
        // to route around and the amount actually billed.
        let slotRef: GenerationIdSlot | undefined;

        try {
          const invocation = await withGenerationIdCapture(async slot => {
            slotRef = slot;
            const model = createModel(
              modelId,
              temperature,
              maxTokens,
              timeoutMs,
              undefined,
              providerRouting
            );
            return await withLLMTimeout(
              invokeModelWithOptionalStructuredOutput(model, prompt, options),
              timeoutMs,
              options
            );
          });

          return await settleSuccessfulAttempt({
            invocation,
            options,
            modelId,
            attempt,
            promptTokens,
            generationId: slotRef?.generationId,
            attemptStartedAt,
            callStartedAt,
            abortedAttempts,
          });
        } catch (error) {
          lastError = error;
          if (priceCeiling && isPriceCeilingRefusal(error)) {
            priceCeilingRefused = true;
            logger.error(
              { phaseName: options.phaseName, node: options.node, modelId, priceCeiling },
              'No provider is within the Career Playbook price ceiling; retrying without it and leaving the catalogue price to be corrected'
            );
          }

          await recordFailedAttempt({
            error,
            options,
            modelId,
            attempt,
            generationId: slotRef?.generationId,
            durationMs: Date.now() - attemptStartedAt,
            abortedAttempts,
            ignoredProviderSlugs,
          });
        }
      }

      throw new CareerPlaybookLLMCallError(
        lastError instanceof Error ? lastError.message : 'Career Playbook LLM call failed',
        abortedAttempts,
        lastError
      );
    },
  };
}

/**
 * Turn a successful invocation into a result, priced from the provider where it
 * will say and from the catalogue where it will not.
 *
 * The catalogue is the fallback now rather than the source: it was wrong for
 * three of the models this pipeline routes to on 2026-08-20, by factors from
 * 0.5x to 1.8x, which is why a $0.077338 ledger could not be reconciled against
 * a $0.144177 invoice (mc2-jukal).
 */
async function settleSuccessfulAttempt(params: {
  invocation: CareerPlaybookModelInvocation;
  options: CareerPlaybookLLMCallOptions;
  modelId: string;
  attempt: number;
  promptTokens: number;
  generationId: string | undefined;
  attemptStartedAt: number;
  callStartedAt: number;
  abortedAttempts: CareerPlaybookAbortedAttempt[];
}): Promise<CareerPlaybookLLMResult> {
  const { invocation, options, modelId, attempt, generationId } = params;

  // Prefer real OpenRouter usage (requested via usage.include); fall back to the
  // already-computed length/4 estimate when the provider/structured-output path
  // omits it.
  const inputTokens = invocation.usage?.input_tokens ?? params.promptTokens;
  const outputTokens = invocation.usage?.output_tokens ?? estimateTokenCount(invocation.content);
  const estimatedCostUsd = estimateCost(modelId, inputTokens + outputTokens, inputTokens);

  const fact = generationId
    ? await fetchGenerationFact(generationId, {
        // A shorter budget than the failure path gets: this is holding up a call
        // that already succeeded, and an unanswered receipt only means the
        // estimate stands.
        initialDelayMs: 1_500,
        retry: false,
      })
    : null;

  // `??`, not `||`: a provider that charged exactly $0 measured that.
  const costUsd = fact?.usageUsd ?? estimatedCostUsd;
  const totalDurationMs = Date.now() - params.callStartedAt;

  logger.info(
    {
      phaseName: options.phaseName,
      node: options.node,
      promptKey: options.promptKey,
      modelId,
      attempt,
      durationMs: Date.now() - params.attemptStartedAt,
      totalDurationMs,
      inputTokens,
      outputTokens,
      costUsd,
      estimatedCostUsd,
      billedByProvider: fact?.usageUsd !== undefined && fact?.usageUsd !== null,
      providerName: fact?.providerName,
      servedModel: fact?.model,
      generationId,
    },
    'Career Playbook LLM call succeeded'
  );

  return {
    content: invocation.content,
    model: modelId,
    inputTokens,
    outputTokens,
    costUsd,
    durationMs: totalDurationMs,
    attemptCount: attempt + 1,
    abortedAttempts: params.abortedAttempts,
    ...(generationId ? { generationId } : {}),
    ...(fact?.providerName ? { providerName: fact.providerName } : {}),
  };
}

/**
 * Record what a failed attempt cost and who to route around next time.
 *
 * One lookup answers both questions. The wait is seconds against a timeout that
 * has already cost minutes, and before this existed those attempts left nothing
 * at all: four of them, 120s each, were most of the 46% gap on 2026-08-20
 * (mc2-64n8i).
 */
async function recordFailedAttempt(params: {
  error: unknown;
  options: CareerPlaybookLLMCallOptions;
  modelId: string;
  attempt: number;
  generationId: string | undefined;
  durationMs: number;
  abortedAttempts: CareerPlaybookAbortedAttempt[];
  ignoredProviderSlugs: Set<string>;
}): Promise<void> {
  const { error, options, modelId, attempt, generationId, durationMs } = params;
  const errorMessage = error instanceof Error ? error.message : String(error);

  const fact = generationId ? await fetchGenerationFact(generationId) : null;

  if (fact?.providerName) {
    const slug = await resolveProviderSlug(fact.providerName);
    if (slug) params.ignoredProviderSlugs.add(slug);
  }

  params.abortedAttempts.push({
    model: modelId,
    attempt,
    durationMs,
    error: errorMessage,
    ...(generationId ? { generationId } : {}),
    ...(fact?.providerName ? { providerName: fact.providerName } : {}),
    // `== null` covers both "no record" and "record without a charge"; a real
    // zero is neither, and is kept.
    ...(fact?.usageUsd == null ? {} : { costUsd: fact.usageUsd }),
  });

  // The pre-instrumentation catch swallowed retries silently; the failed-attempt
  // warning is the single most valuable diagnostic line for latency/cost runaways.
  logger.warn(
    {
      phaseName: options.phaseName,
      node: options.node,
      promptKey: options.promptKey,
      modelId,
      attempt,
      durationMs,
      error: errorMessage,
      generationId,
      providerName: fact?.providerName,
      billedUsd: fact?.usageUsd,
      ignoredInThisChain: [...params.ignoredProviderSlugs],
    },
    'Career Playbook LLM call attempt failed'
  );
}

async function invokeModelWithOptionalStructuredOutput(
  model: CareerPlaybookModel,
  prompt: string,
  options: CareerPlaybookLLMCallOptions
): Promise<CareerPlaybookModelInvocation> {
  if (options.structuredOutputSchema) {
    if (!model.withStructuredOutput) {
      throw new Error(
        'Structured output requested but current Career Playbook model does not support it'
      );
    }

    const structuredModel = model.withStructuredOutput(options.structuredOutputSchema, {
      name: options.structuredOutputName,
      method: options.structuredOutputMethod,
      strict: options.structuredOutputStrict,
      // includeRaw returns { raw, parsed }, so we can read real usage_metadata off
      // the underlying AIMessage instead of always estimating token counts.
      includeRaw: true,
    });
    const response = (await structuredModel.invoke(prompt)) as {
      raw?: { usage_metadata?: CareerPlaybookModelUsage };
      parsed?: unknown;
    };
    const parsed = response?.parsed;
    return {
      content: typeof parsed === 'string' ? parsed : JSON.stringify(parsed),
      usage: response?.raw?.usage_metadata,
    };
  }

  const response = await model.invoke(prompt);
  return {
    content:
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content),
    usage: response.usage_metadata,
  };
}

/**
 * Validate the output-token budget against the resolved model's context window.
 * Passing the rendered prompt size into routing already prefers the extended
 * tier for large source-evidence packs; this is the last-line guard that keeps
 * `prompt + requested output` inside the selected model so an oversized request
 * is clamped (or surfaced) up front instead of burning retries on provider-side
 * context-length rejections, which is one driver of the observed cost/TTL runaways.
 */
function guardOutputAgainstContextWindow(
  promptTokens: number,
  requestedMaxTokens: number,
  maxContextTokens: number | null | undefined,
  options: CareerPlaybookLLMCallOptions
): number {
  if (!maxContextTokens || maxContextTokens <= 0) {
    // Unknown context window (no DB/default value): nothing to guard against.
    return requestedMaxTokens;
  }

  const availableForOutput = maxContextTokens - promptTokens;
  if (availableForOutput >= requestedMaxTokens) {
    return requestedMaxTokens;
  }

  if (availableForOutput >= MIN_GUARDED_OUTPUT_TOKENS) {
    // Prompt fits but leaves less room than requested: clamp output to fit.
    return availableForOutput;
  }

  // Prompt alone (near-)fills the window; clamping output cannot make it fit.
  // Surface it so extended-tier routing/config can be corrected.
  logger.warn(
    {
      phaseName: options.phaseName,
      node: options.node,
      promptTokens,
      maxContextTokens,
      requestedMaxTokens,
    },
    'Career Playbook prompt exceeds model context window; extended-tier routing may be misconfigured'
  );
  return Math.min(requestedMaxTokens, MIN_GUARDED_OUTPUT_TOKENS);
}

interface CareerPlaybookPhaseModelOverride {
  modelId: string;
  fallbackModelId?: string;
}

// Track the last malformed override payload we warned about so a stable bad env
// value logs exactly once instead of on every LLM call, while a changed value can
// still surface a fresh warning.
let lastWarnedPhaseModelOverridesRaw: string | null = null;

/**
 * Parse `CAREER_PLAYBOOK_PHASE_MODEL_OVERRIDES` (JSON: phaseName -> {modelId,
 * fallbackModelId?}). Default-off: an unset/empty value yields no overrides.
 * Malformed JSON is ignored (warn once) so a bad env value can never break
 * generation — it just falls back to the DB-routed model config.
 */
function parseCareerPlaybookPhaseModelOverrides(
  raw: string | undefined
): Record<string, CareerPlaybookPhaseModelOverride> {
  if (!raw || raw.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('overrides must be a JSON object keyed by phase name');
    }

    const overrides: Record<string, CareerPlaybookPhaseModelOverride> = {};
    for (const [phase, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const candidate = value as Record<string, unknown>;
      if (typeof candidate.modelId !== 'string' || candidate.modelId.trim().length === 0) continue;

      overrides[phase] = {
        modelId: candidate.modelId,
        ...(typeof candidate.fallbackModelId === 'string' &&
        candidate.fallbackModelId.trim().length > 0
          ? { fallbackModelId: candidate.fallbackModelId }
          : {}),
      };
    }
    return overrides;
  } catch (error) {
    if (lastWarnedPhaseModelOverridesRaw !== raw) {
      lastWarnedPhaseModelOverridesRaw = raw;
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Ignoring malformed CAREER_PLAYBOOK_PHASE_MODEL_OVERRIDES'
      );
    }
    return {};
  }
}

function applyCareerPlaybookPhaseModelOverride<
  T extends { modelId: string; fallbackModelId: string },
>(config: T, override: CareerPlaybookPhaseModelOverride | undefined): T {
  if (!override) return config;

  return {
    ...config,
    modelId: override.modelId,
    fallbackModelId: override.fallbackModelId ?? config.fallbackModelId,
  };
}

async function resolvePhaseConfig(
  modelConfigService: CareerPlaybookModelConfigService,
  options: CareerPlaybookLLMCallOptions,
  promptTokens?: number
) {
  const override = parseCareerPlaybookPhaseModelOverrides(
    process.env.CAREER_PLAYBOOK_PHASE_MODEL_OVERRIDES
  )[options.phaseName];

  try {
    const config = await modelConfigService.getModelForPhase(
      options.phaseName,
      options.courseId,
      promptTokens,
      options.language
    );
    return applyCareerPlaybookPhaseModelOverride(
      {
        modelId: config.modelId || EMERGENCY_FALLBACK_MODEL,
        fallbackModelId: config.fallbackModelId ?? EMERGENCY_FALLBACK_MODEL,
        temperature: config.temperature ?? 0.7,
        maxTokens: config.maxTokens ?? 12_000,
        maxRetries: config.maxRetries ?? 2,
        timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxContextTokens: config.maxContextTokens ?? null,
      },
      override
    );
  } catch {
    return applyCareerPlaybookPhaseModelOverride(
      {
        modelId: EMERGENCY_FALLBACK_MODEL,
        fallbackModelId: EMERGENCY_FALLBACK_MODEL,
        temperature: 0.7,
        maxTokens: 12_000,
        maxRetries: 2,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        maxContextTokens: null,
      },
      override
    );
  }
}
