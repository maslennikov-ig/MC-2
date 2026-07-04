import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import {
  createModelConfigService,
  EMERGENCY_FALLBACK_MODEL,
} from '@/shared/llm/model-config-service';
import type { PhaseModelConfig } from '@/shared/llm/model-config-db';
import { estimateCost, estimateTokenCount } from '@/shared/llm/cost-calculator';
import { createPromptService } from '@/shared/prompts/prompt-service';
import { logger } from '@/shared/logger';
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
    timeoutMs?: number
  ) => CareerPlaybookModel;
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

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const useFallback =
          Boolean(options.preferFallbackModel) || startOnFallbackForLargeInput || attempt > 0;
        const modelId =
          useFallback && phaseConfig.fallbackModelId
            ? phaseConfig.fallbackModelId
            : phaseConfig.modelId;
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

        try {
          const model = createModel(modelId, temperature, maxTokens, timeoutMs);
          const invocation = await withLLMTimeout(
            invokeModelWithOptionalStructuredOutput(model, prompt, options),
            timeoutMs,
            options
          );

          // Prefer real OpenRouter usage (requested via usage.include); fall back to
          // the already-computed length/4 estimate when the provider/structured-output
          // path omits it.
          const inputTokens = invocation.usage?.input_tokens ?? promptTokens;
          const outputTokens =
            invocation.usage?.output_tokens ?? estimateTokenCount(invocation.content);
          const costUsd = estimateCost(modelId, inputTokens + outputTokens, inputTokens);
          const durationMs = Date.now() - attemptStartedAt;
          const totalDurationMs = Date.now() - callStartedAt;

          logger.info(
            {
              phaseName: options.phaseName,
              node: options.node,
              promptKey: options.promptKey,
              modelId,
              attempt,
              durationMs,
              totalDurationMs,
              inputTokens,
              outputTokens,
              costUsd,
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
          };
        } catch (error) {
          lastError = error;
          // The pre-instrumentation catch swallowed retries silently; the failed-attempt
          // warning is the single most valuable diagnostic line for latency/cost runaways.
          logger.warn(
            {
              phaseName: options.phaseName,
              node: options.node,
              promptKey: options.promptKey,
              modelId,
              attempt,
              durationMs: Date.now() - attemptStartedAt,
              error: error instanceof Error ? error.message : String(error),
            },
            'Career Playbook LLM call attempt failed'
          );
        }
      }

      throw lastError instanceof Error ? lastError : new Error('Career Playbook LLM call failed');
    },
  };
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
