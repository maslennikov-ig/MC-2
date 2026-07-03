import { z } from 'zod';
import {
  CareerPlaybookBlockIdSchema,
  type CareerPlaybookJudgeVerdict,
  type CareerPlaybookNodeCost,
} from '@megacampus/shared-types';
import type { CareerPlaybookRuntime } from './runtime';

const JUDGE_PROMPT_KEY = 'career_playbook_cross_block_judge';
const JUDGE_PHASE = 'stage_career_playbook_judge';

const LLMStructuredJudgeIssueSchema = z.object({
  block_id: CareerPlaybookBlockIdSchema,
  severity: z.enum(['critical', 'warning', 'info']),
  description: z.string().min(1),
  suggestion: z.string().min(1).nullable(),
});

const LLMStructuredJudgeVerdictSchema = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(100),
  issues: z.array(LLMStructuredJudgeIssueSchema).max(50),
  needs_regeneration: z.array(CareerPlaybookBlockIdSchema).max(27),
});

export class StructuredJudgeOutputError extends Error {
  constructor(
    message: string,
    readonly nodeCosts: CareerPlaybookNodeCost[]
  ) {
    super(message);
    this.name = 'StructuredJudgeOutputError';
  }
}

function buildNodeCost(result: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs?: number;
  attemptCount?: number;
}): CareerPlaybookNodeCost {
  return {
    node: 'crossBlockJudge',
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: result.costUsd,
    duration_ms: result.durationMs,
    attempts: result.attemptCount,
  };
}

function buildJudgeRepairPrompt(params: {
  originalPrompt: string;
  rawContent: string;
  errorMessage: string;
}): string {
  return `${params.originalPrompt}

SYSTEM REPAIR:
Previous cross-block judge response could not be parsed.
Error: ${params.errorMessage}

Previous response:
${params.rawContent || '[empty response]'}

Return only a valid JSON object matching this shape:
{
  "pass": boolean,
  "score": number between 0 and 100,
  "issues": [
    {
      "block_id": "header or block_1 through block_26",
      "severity": "critical | warning | info",
      "description": "clear issue",
      "suggestion": "clear repair suggestion or null"
    }
  ],
  "needs_regeneration": ["block_1"]
}`;
}

export async function invokeStructuredJudgeWithRepair(
  runtime: CareerPlaybookRuntime,
  prompt: string,
  language: string,
  parseVerdict: (rawContent: string) => CareerPlaybookJudgeVerdict
): Promise<{
  verdict: CareerPlaybookJudgeVerdict;
  nodeCosts: CareerPlaybookNodeCost[];
}> {
  const baseOptions = {
    phaseName: JUDGE_PHASE,
    promptKey: JUDGE_PROMPT_KEY,
    node: 'crossBlockJudge',
    language,
    temperature: 0.2,
    maxTokens: 4_000,
    structuredOutputSchema: LLMStructuredJudgeVerdictSchema,
    structuredOutputName: 'career_playbook_cross_block_judge',
    structuredOutputMethod: 'jsonSchema' as const,
    structuredOutputStrict: true,
  };
  const firstResult = await runtime.invokeLLM(prompt, baseOptions);
  const nodeCosts = [buildNodeCost(firstResult)];

  try {
    return {
      verdict: parseVerdict(firstResult.content),
      nodeCosts,
    };
  } catch (firstError) {
    const repairPrompt = buildJudgeRepairPrompt({
      originalPrompt: prompt,
      rawContent: firstResult.content,
      errorMessage: firstError instanceof Error ? firstError.message : String(firstError),
    });
    const repairResult = await runtime.invokeLLM(repairPrompt, {
      ...baseOptions,
      temperature: 0.1,
      preferFallbackModel: true,
      maxTokensMultiplier: 1.1,
    });
    nodeCosts.push(buildNodeCost(repairResult));

    try {
      return {
        verdict: parseVerdict(repairResult.content),
        nodeCosts,
      };
    } catch (repairError) {
      throw new StructuredJudgeOutputError(
        `initial parse failed (${firstError instanceof Error ? firstError.message : String(firstError)}); repair parse failed (${repairError instanceof Error ? repairError.message : String(repairError)})`,
        nodeCosts
      );
    }
  }
}
