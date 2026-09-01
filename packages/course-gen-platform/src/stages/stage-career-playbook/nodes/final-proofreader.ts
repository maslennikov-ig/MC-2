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
 *
 * It asks for its verdict the way the judge does — as a schema the provider must
 * satisfy — since 2026-09-01. Asking in prose worked for five English runs and
 * then lost the Russian run's entire pass: three calls, three unparseable
 * answers, three warnings nobody reads. `structured-verdict.ts` carries the
 * character that broke it.
 */

import type {
  CareerPlaybookBlockId,
  CareerPlaybookJudgeVerdict,
  CareerPlaybookNodeCost,
  CareerPlaybookQualityIssue,
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
  invokeStructuredVerdictWithRepair,
  StructuredVerdictOutputError,
} from './structured-verdict';
import {
  formatCareerPlaybookCadenceLedgerForPrompt,
  formatCareerPlaybookEvidenceLedgerForPrompt,
  formatCareerPlaybookMetricLedgerForPrompt,
  formatCareerPlaybookMilestoneLedgerForPrompt,
  getCareerPlaybookCadenceLedger,
  getCareerPlaybookEvidenceLedger,
  getCareerPlaybookMetricLedger,
  getCareerPlaybookMilestoneLedger,
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

/** What a failed proofreading pass still owes the cost receipt. */
function proofreaderFailureCosts(error: unknown): CareerPlaybookNodeCost[] {
  if (error instanceof StructuredVerdictOutputError) return error.nodeCosts;
  if (error instanceof CareerPlaybookLLMCallError) {
    return buildCareerPlaybookAbortedAttemptCosts('finalProofreader', error.abortedAttempts);
  }
  return [];
}

/**
 * The pass's findings, in the shape the stored row keeps.
 *
 * `collectJudgeQualityIssues` in the handler builds `q_a_data.quality_issues` by
 * walking `generatedBlocks` for a per-block `judge_verdict`. The proofreader
 * reads the assembled document and hangs its verdict on no block, so until this
 * existed its findings reached nothing: runs 422471a2 and 208746e3 (2026-09-01)
 * paid for the pass and kept, between them, one line naming a block id. What it
 * objected to — and whether the objection was right, which is the open question
 * on the model behind it — was gone the moment the graph finished.
 *
 * `qualityIssues` is already merged into the stored list by
 * `buildCareerPlaybookQualityIssues`, so the route exists; only the entry did
 * not.
 */
export function buildProofreaderQualityIssues(
  verdict: CareerPlaybookJudgeVerdict
): CareerPlaybookQualityIssue[] {
  return verdict.issues.map((issue, index) => ({
    id: `final_proofreader:${issue.block_id}:${index}`,
    source: 'final_proofreader' as const,
    severity: issue.severity,
    blockId: issue.block_id,
    ...(issue.category ? { category: issue.category } : {}),
    title:
      issue.severity === 'critical'
        ? 'Проблема качества документа'
        : 'Замечание к качеству документа',
    message: issue.description,
    ...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
    action: issue.severity === 'info' ? ('review' as const) : ('regenerate' as const),
  }));
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
        cadence_ledger_md: formatCareerPlaybookCadenceLedgerForPrompt(
          getCareerPlaybookCadenceLedger(state.roleProfileSpec)
        ),
        milestone_ledger_md: formatCareerPlaybookMilestoneLedgerForPrompt(
          getCareerPlaybookMilestoneLedger(state.roleProfileSpec)
        ),
        evidence_ledger_md: formatCareerPlaybookEvidenceLedgerForPrompt(
          getCareerPlaybookEvidenceLedger(state.roleProfileSpec)
        ),
        generated_on: state.roleProfileSpec.generated_on ?? new Date().toISOString().slice(0, 10),
        content_language: state.language,
      });

      const { verdict: parsed, nodeCosts } = await invokeStructuredVerdictWithRepair(
        runtime,
        prompt,
        {
          phaseName: PROOFREADER_PHASE,
          promptKey: PROOFREADER_PROMPT_KEY,
          node: 'finalProofreader',
          language: state.language,
          maxTokens: PROOFREADER_MAX_TOKENS,
        },
        parseCareerPlaybookJudgeVerdict
      );
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
        // The capped verdict drives regeneration; the parsed one is what the
        // pass actually found. A finding dropped by the cap is exactly the one
        // the stored row needs to keep, because nothing downstream will act on
        // it.
        ...(parsed.issues.length > 0
          ? { qualityIssues: buildProofreaderQualityIssues(parsed) }
          : {}),
        nodeCosts,
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
        // A skipped pass is still a paid one. `StructuredVerdictOutputError`
        // carries the calls that answered; `CareerPlaybookLLMCallError` carries
        // the attempts that never did.
        nodeCosts: proofreaderFailureCosts(error),
        currentNode: 'finalProofreader',
      };
    }
  };
}
