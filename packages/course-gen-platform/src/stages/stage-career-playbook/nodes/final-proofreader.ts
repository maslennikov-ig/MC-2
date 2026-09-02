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

/** A fenced code block, whose `##` lines are diagram syntax rather than headings. */
const FENCED_BLOCK = /^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm;

/** A top-level section heading in the assembled guide. */
const SECTION_HEADING = /^##[ \t]+(.+?)[ \t]*$/gm;

/**
 * The document's own section inventory, derived from the assembled markdown.
 *
 * The pass invents missing sections. Measured 2026-09-02 across all three runs
 * of that day, in both languages, against documents whose headings are provably
 * complete — 27 headings, sections 1..26 consecutive, every one of them present:
 *
 * - `cfa66ada` (ru) filed six findings, one of them critical, saying the guide
 *   "does not include a section on typical working day" and four siblings; the
 *   critical also says the guide "jumps from section 4 to section 5", which is
 *   not a gap and reads as a model losing count rather than reading.
 * - `609b5a60` (en) filed "the guide jumps from Block 9 to Block 18", "Block 16
 *   is not present", "Block 14 is not present" — as `info`, so cheap, but the
 *   same failure.
 * - `d50da4b1` (en) filed its own variant as a critical.
 *
 * The trigger is structural, not linguistic: blocks 5 and 26 carry a calibration
 * table that names other sections by title, and checking those names means
 * recalling headings from 25-35k tokens of context. The model guesses and is
 * wrong. So it is given the answer instead — computed by a pattern over the same
 * string the prompt already carries, which cannot disagree with it.
 *
 * @param markdown - the assembled guide
 * @returns one heading per line, numbered in document order
 */
export function buildCareerPlaybookDocumentOutline(markdown: string): string {
  const prose = markdown.replace(FENCED_BLOCK, '');
  const headings = [...prose.matchAll(SECTION_HEADING)].map(match => match[1].trim());

  return headings.map((heading, index) => `${index + 1}. ${heading}`).join('\n');
}

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
    // Only a critical drives regeneration anywhere else in this pipeline, and
    // only a critical drives it here — `deriveProofreaderRegenerations` is the
    // enforcement. Labelling a warning `regenerate` in the stored row promised
    // an action nothing takes: across the three runs of 2026-09-02 it marked 10,
    // 11 and 6 blocks against 8, 7 and 2 blocks with an actual critical.
    action: issue.severity === 'critical' ? ('regenerate' as const) : ('review' as const),
  }));
}

/**
 * Regenerations this pass may request: the blocks it filed a critical against.
 *
 * `needs_regeneration` is a second list the model writes freehand, and nothing
 * required it to agree with the findings above it. `mergeJudgeVerdicts` derives
 * the equivalent list for the cross-block judge from that judge's own gated
 * criticals; this pass trusted the model's list unread.
 *
 * The two disagree in practice. Replaying the node four times on one byte-
 * identical document (2026-09-02, cfa66ada) returned `[]`, `[block_5, block_13,
 * block_9]`, `[block_13]` and `[block_13]` while the findings behind them
 * differed as much again — including a `block_5` entry whose only support was
 * the invented structural gap this module's outline exists to remove.
 *
 * Intersecting keeps the pass's authority exactly where its evidence is, and it
 * cannot silently widen: a block with a critical and no place in the model's
 * list stays out, because the model may have judged it unfixable by regeneration.
 */
export function deriveProofreaderRegenerations(
  verdict: CareerPlaybookJudgeVerdict
): CareerPlaybookBlockId[] {
  const critical = new Set(
    verdict.issues.filter(issue => issue.severity === 'critical').map(issue => issue.block_id)
  );

  return verdict.needs_regeneration.filter(blockId => critical.has(blockId));
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
        document_outline: buildCareerPlaybookDocumentOutline(document),
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
      const supported: CareerPlaybookJudgeVerdict = {
        ...parsed,
        needs_regeneration: deriveProofreaderRegenerations(parsed),
      };
      const unsupported = parsed.needs_regeneration.filter(
        blockId => !supported.needs_regeneration.includes(blockId)
      );
      const { verdict, dropped } = capProofreaderRegenerations(supported);

      logger.info(
        {
          issues: verdict.issues.length,
          criticals: verdict.issues.filter(item => item.severity === 'critical').length,
          needsRegeneration: verdict.needs_regeneration,
          dropped,
          // A block the model asked to regenerate without filing a critical
          // against it. Logged rather than silent: the rate is how this gate's
          // effect is measured on a later run.
          unsupported,
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
