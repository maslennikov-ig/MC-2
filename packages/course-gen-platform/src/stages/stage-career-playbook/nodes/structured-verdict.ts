/**
 * Career Playbook — one verdict call, asked of the provider as a schema
 * @module stages/stage-career-playbook/nodes/structured-verdict
 *
 * Two nodes ask the model for the same thing: a `CareerPlaybookJudgeVerdict`.
 * The cross-block judge asked for it as a JSON schema the provider must satisfy;
 * the whole-document proofreader asked for it as prose and hoped, and on
 * 2026-09-01 run db9d3ff9 that difference cost the Russian guide its entire
 * proofreading pass — three calls, three parse failures, three paid responses
 * nobody could read.
 *
 * The failure has nothing to do with Russian grammar and everything to do with
 * what a Russian guide quotes. Replayed at HEAD, the model wrote
 *
 *     "description": "... не совпадает с названием раздела 22 — «"Как со мной
 *     работать" (заполняется сотрудником)» ..."
 *
 * and those inner straight quotes end the JSON string four words early:
 * `Expected ',' or '}' after property value`, the exact error the run recorded.
 * The document's own block title carries them, so the model is quoting
 * faithfully. Every repair strategy fails, because nothing downstream can tell a
 * quote that closes a value from a quote inside one.
 *
 * A constrained decoder never emits it. That is the whole fix, and it was
 * already here — it just belonged to one caller.
 */

import { z } from 'zod';
import {
  CareerPlaybookBlockIdSchema,
  CareerPlaybookJudgeIssueCategorySchema,
  type CareerPlaybookJudgeVerdict,
  type CareerPlaybookNodeCost,
} from '@megacampus/shared-types';
import { buildCareerPlaybookAbortedAttemptCosts, type CareerPlaybookRuntime } from './runtime';

// Estimated-prompt-token threshold above which a judge call starts on the fallback
// model instead of the primary. The final full-document judge (~31.5k tokens) used
// to start on v4-flash and burn a 300s timeout before the retry net escalated to
// v4-pro; starting large-input judge calls fallback-first removes that waste while
// the retry net stays as the safety net. Group-window judges have smaller input, so
// this size gate leaves them on the primary model.
const DEFAULT_JUDGE_FALLBACK_TOKEN_THRESHOLD = 28_000;
const JUDGE_FALLBACK_TOKEN_THRESHOLD_ENV = 'CAREER_PLAYBOOK_JUDGE_FALLBACK_TOKEN_THRESHOLD';

/**
 * Resolve the judge large-input routing threshold (estimated prompt tokens) from
 * `CAREER_PLAYBOOK_JUDGE_FALLBACK_TOKEN_THRESHOLD`. An unset, non-numeric, or
 * non-positive value yields the default so a bad env value can never silently
 * disable the routing.
 */
export function resolveJudgeFallbackTokenThreshold(
  value: string | undefined = process.env[JUDGE_FALLBACK_TOKEN_THRESHOLD_ENV]
): number {
  if (!value) return DEFAULT_JUDGE_FALLBACK_TOKEN_THRESHOLD;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return DEFAULT_JUDGE_FALLBACK_TOKEN_THRESHOLD;
  }
  return parsed;
}

const LLMStructuredJudgeIssueSchema = z.object({
  block_id: CareerPlaybookBlockIdSchema,
  severity: z.enum(['critical', 'warning', 'info']),
  // Required: the judge must classify every issue so the regeneration gate can tell
  // taxonomy-backed criticals apart from stylistic ones.
  category: CareerPlaybookJudgeIssueCategorySchema,
  description: z.string().min(1),
  suggestion: z.string().min(1).nullable(),
});

/** The verdict shape both reviewing nodes ask the provider to satisfy. */
export const CAREER_PLAYBOOK_STRUCTURED_VERDICT_SCHEMA = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(100),
  issues: z.array(LLMStructuredJudgeIssueSchema).max(50),
  needs_regeneration: z.array(CareerPlaybookBlockIdSchema).max(27),
});

/** Which node is asking, and how its call is routed. */
export interface StructuredVerdictCall {
  phaseName: string;
  promptKey: string;
  node: string;
  language: string;
  maxTokens: number;
  /**
   * Route a call whose input exceeds this many estimated tokens to the fallback
   * model up front. The judge sets it, to skip a primary-model timeout it has
   * measured; the proofreader's reason is different and unconditional, below.
   */
  preferFallbackModelAboveTokens?: number;
}

export class StructuredVerdictOutputError extends Error {
  constructor(
    message: string,
    readonly nodeCosts: CareerPlaybookNodeCost[]
  ) {
    super(message);
    this.name = 'StructuredVerdictOutputError';
  }
}

function buildNodeCost(
  node: string,
  result: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    costUnknown?: boolean;
    durationMs?: number;
    attemptCount?: number;
    generationId?: string;
  }
): CareerPlaybookNodeCost {
  return {
    node,
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: result.costUsd,
    ...(result.costUnknown ? { cost_unknown: true } : {}),
    duration_ms: result.durationMs,
    attempts: result.attemptCount,
    // Carried so `settleCareerPlaybookNodeCosts` can replace the estimate above
    // with what OpenRouter actually charged.
    ...(result.generationId ? { generation_id: result.generationId } : {}),
    // The provider answered and billed. Whether the answer parsed is a separate
    // question, and one the receipt must not decide by omitting the row: run
    // db9d3ff9 paid for three proofreader responses that appear nowhere in its
    // cost breakdown, because the old catch recorded aborted attempts only.
    outcome: 'succeeded' as const,
  };
}

function buildVerdictRepairPrompt(params: {
  originalPrompt: string;
  rawContent: string;
  errorMessage: string;
}): string {
  return `${params.originalPrompt}

SYSTEM REPAIR:
Previous response could not be parsed.
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
      "category": "contradiction | format_minimum | wrong_language | unresolved_placeholder | invented_number | metric_conflict | unsourced_claim | stale_date | unmarked_example | style",
      "description": "clear issue",
      "suggestion": "clear repair suggestion or null"
    }
  ],
  "needs_regeneration": ["block_1"]
}`;
}

export async function invokeStructuredVerdictWithRepair(
  runtime: CareerPlaybookRuntime,
  prompt: string,
  call: StructuredVerdictCall,
  parseVerdict: (rawContent: string) => CareerPlaybookJudgeVerdict
): Promise<{
  verdict: CareerPlaybookJudgeVerdict;
  nodeCosts: CareerPlaybookNodeCost[];
}> {
  const baseOptions = {
    phaseName: call.phaseName,
    promptKey: call.promptKey,
    node: call.node,
    language: call.language,
    temperature: 0.2,
    maxTokens: call.maxTokens,
    ...(call.preferFallbackModelAboveTokens !== undefined
      ? { preferFallbackModelAboveTokens: call.preferFallbackModelAboveTokens }
      : {}),
    structuredOutputSchema: CAREER_PLAYBOOK_STRUCTURED_VERDICT_SCHEMA,
    structuredOutputName: call.promptKey,
    structuredOutputMethod: 'jsonSchema' as const,
    structuredOutputStrict: true,
  };
  const firstResult = await runtime.invokeLLM(prompt, baseOptions);
  const nodeCosts = [
    buildNodeCost(call.node, firstResult),
    ...buildCareerPlaybookAbortedAttemptCosts(call.node, firstResult.abortedAttempts),
  ];

  try {
    return {
      verdict: parseVerdict(firstResult.content),
      nodeCosts,
    };
  } catch (firstError) {
    const repairPrompt = buildVerdictRepairPrompt({
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
    nodeCosts.push(
      buildNodeCost(call.node, repairResult),
      ...buildCareerPlaybookAbortedAttemptCosts(call.node, repairResult.abortedAttempts)
    );

    try {
      return {
        verdict: parseVerdict(repairResult.content),
        nodeCosts,
      };
    } catch (repairError) {
      throw new StructuredVerdictOutputError(
        `initial parse failed (${firstError instanceof Error ? firstError.message : String(firstError)}); repair parse failed (${repairError instanceof Error ? repairError.message : String(repairError)})`,
        nodeCosts
      );
    }
  }
}
