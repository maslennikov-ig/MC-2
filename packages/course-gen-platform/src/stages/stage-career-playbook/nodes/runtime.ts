import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import type { PhaseModelConfig } from '@/shared/llm/model-config-db';
import { createPromptService } from '@/shared/prompts/prompt-service';
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
}

export interface CareerPlaybookRuntime {
  renderPrompt: (promptKey: string, variables: Record<string, string>) => Promise<string>;
  invokeLLM: (
    prompt: string,
    options: CareerPlaybookLLMCallOptions
  ) => Promise<CareerPlaybookLLMResult>;
}

const FALLBACK_MODEL = 'google/gemini-3-flash-preview';
const DEFAULT_TIMEOUT_MS = 300_000;

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

interface CareerPlaybookModel {
  invoke: (prompt: string) => Promise<{ content: unknown }>;
  withStructuredOutput?: (
    schema: z.ZodTypeAny | Record<string, unknown>,
    config?: {
      name?: string;
      method?: 'functionCalling' | 'jsonMode' | 'jsonSchema';
      strict?: boolean;
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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
      const phaseConfig = await resolvePhaseConfig(modelConfigService, options);
      const attempts = Math.max(1, (phaseConfig.maxRetries ?? 0) + 1);
      let lastError: unknown = null;

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const useFallback = Boolean(options.preferFallbackModel) || attempt > 0;
        const modelId =
          useFallback && phaseConfig.fallbackModelId
            ? phaseConfig.fallbackModelId
            : phaseConfig.modelId;
        const tokenMultiplier = options.maxTokensMultiplier ?? (attempt >= 2 ? 1.25 : 1);
        const maxTokens = Math.ceil(
          (options.maxTokens ?? phaseConfig.maxTokens ?? 12_000) * tokenMultiplier
        );
        const temperature = options.temperature ?? phaseConfig.temperature ?? 0.7;
        const timeoutMs = normalizeTimeoutMs(phaseConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS);

        try {
          const model = createModel(modelId, temperature, maxTokens, timeoutMs);
          const content = await withLLMTimeout(
            invokeModelWithOptionalStructuredOutput(model, prompt, options),
            timeoutMs,
            options
          );

          return {
            content,
            model: modelId,
            inputTokens: estimateTokens(prompt),
            outputTokens: estimateTokens(content),
            costUsd: 0,
          };
        } catch (error) {
          lastError = error;
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
): Promise<string> {
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
    });
    const response = await structuredModel.invoke(prompt);
    return typeof response === 'string' ? response : JSON.stringify(response);
  }

  const response = await model.invoke(prompt);
  return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
}

async function resolvePhaseConfig(
  modelConfigService: CareerPlaybookModelConfigService,
  options: CareerPlaybookLLMCallOptions
) {
  try {
    const config = await modelConfigService.getModelForPhase(
      options.phaseName,
      options.courseId,
      undefined,
      options.language
    );
    return {
      modelId: config.modelId || FALLBACK_MODEL,
      fallbackModelId: config.fallbackModelId ?? FALLBACK_MODEL,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 12_000,
      maxRetries: config.maxRetries ?? 2,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  } catch {
    return {
      modelId: FALLBACK_MODEL,
      fallbackModelId: FALLBACK_MODEL,
      temperature: 0.7,
      maxTokens: 12_000,
      maxRetries: 2,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    };
  }
}
