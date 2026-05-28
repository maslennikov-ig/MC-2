import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import type { PhaseModelConfig } from '@/shared/llm/model-config-db';
import { createPromptService } from '@/shared/prompts/prompt-service';

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
}

export interface CareerPlaybookRuntimeDependencies {
  promptService?: CareerPlaybookPromptService;
  modelConfigService?: CareerPlaybookModelConfigService;
  createModel?: (modelId: string, temperature: number, maxTokens: number) => CareerPlaybookModel;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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

        try {
          const model = createModel(modelId, temperature, maxTokens);
          const response = await model.invoke(prompt);
          const content =
            typeof response.content === 'string'
              ? response.content
              : JSON.stringify(response.content);

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
    };
  } catch {
    return {
      modelId: FALLBACK_MODEL,
      fallbackModelId: FALLBACK_MODEL,
      temperature: 0.7,
      maxTokens: 12_000,
      maxRetries: 2,
    };
  }
}
