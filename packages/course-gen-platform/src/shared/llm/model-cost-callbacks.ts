/**
 * Makes a LangChain model price its own calls.
 *
 * The token split lives in the provider's response and is lost by the time a
 * calling node reports one total, so pricing has to happen at the call. This is
 * the LangChain half of that; the OpenAI-SDK half is in `client.ts` (mc2-o7740).
 *
 * @module shared/llm/model-cost-callbacks
 */

import type { ChatOpenAI } from '@langchain/openai';
import type { LLMResult } from '@langchain/core/outputs';

import { recordLlmCallCost, type LlmCostContext } from '../metrics/llm-cost';

/**
 * The stage a phase belongs to, read off the phase name.
 *
 * Phase names are built at runtime (`stage_6_${tier}`), so the prefix is the
 * only reliable link back to a stage.
 *
 * Stage 7 was outside this range until 2026-08-16, so every enrichment call —
 * covers, cards, quizzes, video scripts — was priced by nobody and left no
 * trace row at all.
 */
export function stageOfPhase(phase: string): LlmCostContext['stage'] | undefined {
  const match = /^stage_([1-7])(?:_|$)/u.exec(phase);
  if (match) return `stage_${match[1]}` as LlmCostContext['stage'];
  // Editing phases are named after what the user did, not after a stage:
  // `chat_stage_6_refinement`, `inline_element_crud`. They had no stage, so this
  // returned undefined and the model was handed back with no cost recording at
  // all (mc2-b7olk.5).
  if (/^(chat|inline)_/u.test(phase)) return 'stage_edit';
  return undefined;
}

/**
 * Attaches cost recording to a model.
 *
 * Without a course id there is nothing to attribute the cost to, and the model
 * is returned untouched.
 */
export function attachCostRecording(
  model: ChatOpenAI,
  modelId: string,
  phase: string,
  courseId?: string
): ChatOpenAI {
  const stage = stageOfPhase(phase);
  if (!courseId || !stage) return model;

  model.callbacks = [
    {
      handleLLMEnd: async (output: LLMResult) => {
        const usage = (output.llmOutput?.tokenUsage ?? {}) as {
          promptTokens?: number;
          completionTokens?: number;
        };
        if (usage.promptTokens === undefined && usage.completionTokens === undefined) return;
        await recordLlmCallCost(
          {
            model: modelId,
            inputTokens: usage.promptTokens ?? 0,
            outputTokens: usage.completionTokens ?? 0,
          },
          { courseId, stage, phase }
        );
      },
    },
  ];
  return model;
}
