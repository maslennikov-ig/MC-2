import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { resolveModelWithFallback } from '@/shared/llm/model-config-service';
import { createPromptService } from '@/shared/prompts/prompt-service';

export interface CareerPlaybookLLMCallOptions {
  phaseName: string;
  promptKey: string;
  node: string;
  temperature?: number;
  maxTokens?: number;
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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function createCareerPlaybookRuntime(): CareerPlaybookRuntime {
  const promptService = createPromptService();

  return {
    renderPrompt: (promptKey, variables) => promptService.renderPrompt(promptKey, variables),
    invokeLLM: async (prompt, options) => {
      const modelId = await resolveModelWithFallback({
        phaseName: options.phaseName,
        fallbackModel: FALLBACK_MODEL,
        logContext: {
          node: options.node,
          promptKey: options.promptKey,
        },
      });
      const model = createOpenRouterModel(
        modelId,
        options.temperature ?? 0.7,
        options.maxTokens ?? 12_000
      );
      const response = await model.invoke(prompt);
      const content =
        typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      return {
        content,
        model: modelId,
        inputTokens: estimateTokens(prompt),
        outputTokens: estimateTokens(content),
        costUsd: 0,
      };
    },
  };
}
