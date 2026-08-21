/**
 * Career Playbook — whole-document proofreading pass
 * @module stages/stage-career-playbook/nodes/final-proofreader
 *
 * Every other reviewer in this pipeline sees one group of blocks at a time. That
 * is enough for the defect classes a pattern can express, and it was enough to
 * take the 2026-08-11 run from fourteen scorecard criticals to zero — but an
 * end-to-end read of that same "clean" output scored 3.9/5 and found six defects
 * no window could have caught. The clearest: hiring authority granted in block 5
 * ("no approval required"), routed through CRO sign-off in block 16, and
 * described a third way in block 24. Three blocks, three groups, no reviewer who
 * saw all of them.
 *
 * This node is that reader. It runs once, on the assembled document, between
 * final assembly and the final judge, and its findings enter the existing
 * regeneration path unchanged.
 *
 * It exists now because the owner removed the latency budget: quality first.
 */

import type {
  CareerPlaybookBlockId,
  CareerPlaybookJudgeVerdict,
  CareerPlaybookNodeCost,
} from '@megacampus/shared-types';
import { logger } from '@/shared/logger';
import type { CareerPlaybookGraphStateType, CareerPlaybookGraphStateUpdate } from '../state';
import {
  buildCareerPlaybookAbortedAttemptCosts,
  CareerPlaybookLLMCallError,
  createCareerPlaybookRuntime,
  type CareerPlaybookRuntime,
} from './runtime';
import {
  formatCareerPlaybookEvidenceLedgerForPrompt,
  formatCareerPlaybookMetricLedgerForPrompt,
  getCareerPlaybookEvidenceLedger,
  getCareerPlaybookMetricLedger,
} from './quality-ledger';
import { parseCareerPlaybookJudgeVerdict } from './cross-block-judge';

export const PROOFREADER_PROMPT_KEY = 'career_playbook_final_proofreader';
export const PROOFREADER_PHASE = 'stage_career_playbook_proofreader';

/**
 * Output budget. The pass reports findings, not prose, so a modest ceiling is
 * enough; the input is what is large.
 */
const PROOFREADER_MAX_TOKENS = 4_000;

/**
 * Blocks the proofreader may send back for regeneration in one pass.
 *
 * A whole-document reader can legitimately find something wrong with a dozen
 * blocks at once. Letting all of them through would spend the entire window
 * budget on one opinion, so the pass is capped and the most consequential
 * findings — which the prompt asks for first — win.
 */
export const CAREER_PLAYBOOK_MAX_PROOFREADER_REGENERATIONS = 3;

function buildNodeCost(result: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs?: number;
  attemptCount?: number;
  generationId?: string;
}): CareerPlaybookNodeCost {
  return {
    node: 'finalProofreader',
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: result.costUsd,
    duration_ms: result.durationMs,
    attempts: result.attemptCount,
    // Carried so `settleCareerPlaybookNodeCosts` can replace the estimate above
    // with what OpenRouter actually charged.
    ...(result.generationId ? { generation_id: result.generationId } : {}),
    outcome: 'succeeded',
  };
}

/** Keep only the regenerations this pass is allowed to request. */
export function capProofreaderRegenerations(
  verdict: CareerPlaybookJudgeVerdict,
  max = CAREER_PLAYBOOK_MAX_PROOFREADER_REGENERATIONS
): { verdict: CareerPlaybookJudgeVerdict; dropped: CareerPlaybookBlockId[] } {
  if (verdict.needs_regeneration.length <= max) return { verdict, dropped: [] };

  const kept = verdict.needs_regeneration.slice(0, max);
  const dropped = verdict.needs_regeneration.slice(max);

  return {
    verdict: { ...verdict, needs_regeneration: kept },
    dropped,
  };
}

export function createCareerPlaybookProofreaderNode(
  runtime: CareerPlaybookRuntime = createCareerPlaybookRuntime()
) {
  return async function finalProofreaderNode(
    state: CareerPlaybookGraphStateType
  ): Promise<CareerPlaybookGraphStateUpdate> {
    const document = state.finalMarkdown;
    if (!document || !state.roleProfileSpec) {
      return { currentNode: 'finalProofreader' };
    }

    try {
      const prompt = await runtime.renderPrompt(PROOFREADER_PROMPT_KEY, {
        full_document: document,
        metric_ledger_md: formatCareerPlaybookMetricLedgerForPrompt(
          getCareerPlaybookMetricLedger(state.roleProfileSpec)
        ),
        evidence_ledger_md: formatCareerPlaybookEvidenceLedgerForPrompt(
          getCareerPlaybookEvidenceLedger(state.roleProfileSpec)
        ),
        generated_on: state.roleProfileSpec.generated_on ?? new Date().toISOString().slice(0, 10),
        content_language: state.language,
      });

      const result = await runtime.invokeLLM(prompt, {
        phaseName: PROOFREADER_PHASE,
        promptKey: PROOFREADER_PROMPT_KEY,
        node: 'finalProofreader',
        language: state.language,
        temperature: 0.2,
        maxTokens: PROOFREADER_MAX_TOKENS,
      });

      const parsed = parseCareerPlaybookJudgeVerdict(result.content);
      const { verdict, dropped } = capProofreaderRegenerations(parsed);

      logger.info(
        {
          issues: verdict.issues.length,
          criticals: verdict.issues.filter(item => item.severity === 'critical').length,
          needsRegeneration: verdict.needs_regeneration,
          dropped,
        },
        'Career Playbook whole-document proofreading pass completed'
      );

      return {
        judgeVerdicts: [verdict],
        lastJudgeVerdict: verdict,
        lastJudgedBlockIds: verdict.needs_regeneration,
        nodeCosts: [
          buildNodeCost(result),
          ...buildCareerPlaybookAbortedAttemptCosts('finalProofreader', result.abortedAttempts),
        ],
        ...(dropped.length > 0
          ? {
              warnings: [
                `finalProofreader capped regeneration at ${CAREER_PLAYBOOK_MAX_PROOFREADER_REGENERATIONS}; unaddressed blocks remain in the verdict: ${dropped.join(', ')}.`,
              ],
            }
          : {}),
        currentNode: 'finalProofreader',
      };
    } catch (error) {
      // A failed proofreading pass must never lose an otherwise complete
      // document: the pass is additive quality, not a gate on delivery.
      return {
        warnings: [
          `finalProofreader skipped: ${error instanceof Error ? error.message : String(error)}`,
        ],
        nodeCosts:
          error instanceof CareerPlaybookLLMCallError
            ? buildCareerPlaybookAbortedAttemptCosts('finalProofreader', error.abortedAttempts)
            : [],
        currentNode: 'finalProofreader',
      };
    }
  };
}
