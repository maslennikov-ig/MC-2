import { extractJSON, safeJSONParse } from '@/shared/workspace-utils';
import {
  CareerPlaybookBlockIdSchema,
  CareerPlaybookJudgeIssueSchema,
  CareerPlaybookJudgeVerdictSchema,
  isCareerPlaybookJudgeCriticalCategory,
  CAREER_PLAYBOOK_BLOCK_CATALOG,
  type CareerPlaybookBlockId,
  type CareerPlaybookBlockState,
  type CareerPlaybookJudgeIssue,
  type CareerPlaybookJudgeVerdict,
  type CareerPlaybookNodeCost,
} from '@megacampus/shared-types';
import type {
  CareerPlaybookGraphStateType,
  CareerPlaybookGraphStateUpdate,
  CareerPlaybookGroupResult,
  CareerPlaybookGraphNode,
} from '../state';
import { createCareerPlaybookRuntime, type CareerPlaybookRuntime } from './runtime';
import {
  CAREER_PLAYBOOK_FINAL_WINDOW_RESERVE_ATTEMPTS,
  CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS,
  CAREER_PLAYBOOK_MAX_JUDGE_WINDOW_REGENERATION_ATTEMPTS,
  countCareerPlaybookRegenerationAttemptsForBlocks,
  selectPendingCareerPlaybookRegenerations,
} from './block-regenerator';
import {
  invokeStructuredJudgeWithRepair,
  StructuredJudgeOutputError,
} from './cross-block-judge-structured';
import { validateCareerPlaybookMermaidSyntax } from './mermaid-quality';
import { getTargetLanguageTextViolations } from './language-consistency';
import { findUnresolvedFillablePlaceholders } from './placeholder-detection';

import {
  validateAntiGoalsMinimum,
  validateDecisionMatrixMinimum,
  validateFailureModesMinimum,
  validateMermaidCoverage,
  type ValidateMermaidCoverageOptions,
} from './cross-block-judge-checks';
import {
  runCareerPlaybookContractChecks,
  type CareerPlaybookQualityCheckContext,
} from './quality-checks';
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
import { getCareerPlaybookBusinessContext } from './business-context';
import { formatCareerPlaybookBlockAudiences } from './audience-scope';
import {
  CareerPlaybookSemanticEmbeddingCache,
  CareerPlaybookSemanticRepetitionProviderError,
  evaluateCareerPlaybookSemanticRepetition,
  isCareerPlaybookSemanticRepetitionIssue,
} from './semantic-repetition';

export {
  CAREER_PLAYBOOK_MERMAID_REQUIREMENTS,
  countMermaidDiagrams,
  validateAntiGoalsMinimum,
  validateDecisionMatrixMinimum,
  validateFailureModesMinimum,
  validateMermaidCoverage,
  type MermaidDiagramRequirement,
  type ValidateMermaidCoverageOptions,
} from './cross-block-judge-checks';

const JUDGE_PROMPT_KEY = 'career_playbook_cross_block_judge';

export interface RunDeterministicChecksInput {
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
  mermaid?: ValidateMermaidCoverageOptions;
  /**
   * Content language of the generated blocks (e.g. 'ru'). When provided, blocks
   * are checked for target-language violations. Omit to skip the language check.
   */
  contentLanguage?: string;
  /**
   * Ledger context for the quality-contract checks (metric conflicts, unsourced
   * statistics, unmarked examples, stale dates). Omit to skip them — legacy
   * specs carry no ledgers and must still judge cleanly.
   */
  contract?: CareerPlaybookQualityCheckContext;
  /** Disable for bounded group windows; the full-document final judge must run this gate. */
  semanticRepetition?: boolean;
  onSemanticRepetitionCost?: (cost: CareerPlaybookNodeCost) => void;
  semanticEmbeddingCache?: CareerPlaybookSemanticEmbeddingCache;
  semanticEmbeddingCacheNamespace?: string;
}

export interface CreateCrossBlockJudgeNodeOptions {
  currentBlockIds?: CareerPlaybookBlockId[];
  useLLMJudge?: boolean;
  runtime?: CareerPlaybookRuntime;
  currentNode?: CareerPlaybookGraphNode;
  /**
   * Delta re-judge: after a regeneration, re-review only the regenerated blocks in a
   * bounded group window instead of the whole window. Defaults to the
   * CAREER_PLAYBOOK_DELTA_REJUDGE env flag (on unless explicitly disabled). Only applies
   * when `currentBlockIds` is set — the final full-document judge always reviews every
   * block so it stays the cross-block safety net.
   */
  deltaReJudge?: boolean;
}

const DELTA_REJUDGE_ENV_KEY = 'CAREER_PLAYBOOK_DELTA_REJUDGE';

/**
 * Whether delta re-judge is enabled. Defaults to on; set CAREER_PLAYBOOK_DELTA_REJUDGE to
 * one of 0/false/off/no/disabled to revert to full-window re-judge (the reliability-first
 * escape hatch — the final full-document judge stays the cross-block safety net either way).
 */
export function isCareerPlaybookDeltaReJudgeEnabled(
  value = process.env[DELTA_REJUDGE_ENV_KEY]
): boolean {
  if (value == null) return true;
  const normalized = value.trim().toLowerCase();
  if (normalized === '') return true;
  return !['0', 'false', 'off', 'no', 'disabled'].includes(normalized);
}

/**
 * Split a judge window into the block ids that should actually be re-reviewed this pass.
 *
 * After a regeneration only the regenerated blocks carry a null `judge_verdict` (the
 * regenerator clears it); every already-accepted sibling still carries the verdict this
 * window's previous judge pass attached. When the window is a strict mix of the two, only
 * the regenerated delta is re-reviewed and the accepted siblings keep their last verdict.
 *
 * The FIRST judge of a window (every block still unjudged) and the all-failed-regeneration
 * fallback (no block was cleared, so the delta would be empty) both return the whole window,
 * preserving the original full-window behavior.
 */
export function selectDeltaReJudgeBlockIds(
  windowBlockIds: CareerPlaybookBlockId[],
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): CareerPlaybookBlockId[] {
  const regenerated = windowBlockIds.filter(
    blockId => generatedBlocks[blockId]?.judge_verdict == null
  );
  const alreadyJudged = windowBlockIds.filter(
    blockId => generatedBlocks[blockId]?.judge_verdict != null
  );

  if (regenerated.length > 0 && alreadyJudged.length > 0) {
    return regenerated;
  }

  return windowBlockIds;
}

export function validateBlockLanguageConsistency(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  contentLanguage: string
): CareerPlaybookJudgeIssue[] {
  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const [blockId, blockState] of Object.entries(generatedBlocks)) {
    const content = blockState?.content;
    if (!content) continue;

    const violations = getTargetLanguageTextViolations(content, contentLanguage, blockId);
    if (violations.length === 0) continue;

    issues.push({
      block_id: blockId,
      severity: 'critical',
      description: `${blockId} contains text that is not in the target content language (${contentLanguage}): ${violations.join('; ')}`,
      suggestion: `Rewrite ${blockId} so all user-facing text is in the target content language (${contentLanguage}).`,
    });
  }

  return issues;
}

export function validateFillablePlaceholderResolution(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): CareerPlaybookJudgeIssue[] {
  const issues: CareerPlaybookJudgeIssue[] = [];

  for (const [blockId, blockState] of Object.entries(generatedBlocks)) {
    const content = blockState?.content;
    if (!content) continue;

    const placeholders = findUnresolvedFillablePlaceholders(content);
    if (placeholders.length === 0) continue;

    const uniquePlaceholders = Array.from(new Set(placeholders));
    issues.push({
      block_id: blockId,
      severity: 'critical',
      description: `${blockId} contains ${uniquePlaceholders.length} unresolved fillable placeholder(s): ${uniquePlaceholders.join(', ')}.`,
      suggestion: `Replace each raw placeholder in ${blockId} with a concrete value or an explicit "field to fill" phrase.`,
    });
  }

  return issues;
}

function scoreFromIssues(issues: CareerPlaybookJudgeIssue[]): number {
  return Math.max(
    0,
    100 -
      issues.reduce((penalty, issue) => {
        if (issue.severity === 'critical') return penalty + 20;
        if (issue.severity === 'warning') return penalty + 10;
        return penalty + 5;
      }, 0)
  );
}

function uniqueBlockIds(blockIds: CareerPlaybookBlockId[]): CareerPlaybookBlockId[] {
  return Array.from(new Set(blockIds));
}

function verdictFromIssues(issues: CareerPlaybookJudgeIssue[]): CareerPlaybookJudgeVerdict {
  const needsRegeneration = uniqueBlockIds(
    issues.filter(issue => issue.severity !== 'info').map(issue => issue.block_id)
  );

  return {
    pass: issues.length === 0,
    score: scoreFromIssues(issues),
    issues,
    needs_regeneration: needsRegeneration,
  };
}

function normalizeJudgeBlockId(value: unknown): CareerPlaybookBlockId | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'header') return 'header';

  const blockMatch = normalized.match(/^block_0?([1-9]|1[0-9]|2[0-6])$/);
  if (blockMatch) {
    return `block_${blockMatch[1]}`;
  }

  const numberMatch = normalized.match(/^0?([1-9]|1[0-9]|2[0-6])$/);
  if (numberMatch) {
    return `block_${numberMatch[1]}`;
  }

  const parsed = CareerPlaybookBlockIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeJudgeIssueCandidate(candidate: unknown): CareerPlaybookJudgeIssue | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;

  const issue = { ...(candidate as Record<string, unknown>) };
  const blockId = normalizeJudgeBlockId(issue.block_id);
  if (!blockId) return null;

  issue.block_id = blockId;
  if (
    issue.suggestion === null ||
    (typeof issue.suggestion === 'string' && issue.suggestion.trim().length === 0)
  ) {
    delete issue.suggestion;
  }

  const parsed = CareerPlaybookJudgeIssueSchema.safeParse(issue);
  return parsed.success ? parsed.data : null;
}

function normalizeJudgeVerdictCandidate(candidate: unknown): unknown {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate;

  const verdict = { ...(candidate as Record<string, unknown>) };
  if (Array.isArray(verdict.issues)) {
    verdict.issues = verdict.issues
      .map(issue => normalizeJudgeIssueCandidate(issue))
      .filter((issue): issue is CareerPlaybookJudgeIssue => Boolean(issue));
  }
  if (Array.isArray(verdict.needs_regeneration)) {
    verdict.needs_regeneration = uniqueBlockIds(
      verdict.needs_regeneration
        .map(blockId => normalizeJudgeBlockId(blockId))
        .filter((blockId): blockId is CareerPlaybookBlockId => Boolean(blockId))
    );
  }

  return verdict;
}

export async function runCareerPlaybookDeterministicChecks(
  input: RunDeterministicChecksInput
): Promise<CareerPlaybookJudgeVerdict> {
  const { generatedBlocks } = input;
  const issues: CareerPlaybookJudgeIssue[] = [];

  const antiGoals = generatedBlocks.block_2?.content;
  if (antiGoals) {
    issues.push(...validateAntiGoalsMinimum(antiGoals));
  }

  const decisionMatrix = generatedBlocks.block_5?.content;
  if (decisionMatrix) {
    issues.push(...validateDecisionMatrixMinimum(decisionMatrix));
  }

  const failureModes = generatedBlocks.block_21?.content;
  if (failureModes) {
    issues.push(...validateFailureModesMinimum(failureModes));
  }

  issues.push(...validateMermaidCoverage(generatedBlocks, input.mermaid));
  issues.push(...(await validateCareerPlaybookMermaidSyntax(generatedBlocks)));

  if (input.contentLanguage) {
    issues.push(...validateBlockLanguageConsistency(generatedBlocks, input.contentLanguage));
  }

  issues.push(...validateFillablePlaceholderResolution(generatedBlocks));

  if (input.contract) {
    issues.push(...runCareerPlaybookContractChecks(generatedBlocks, input.contract));
  }

  if (input.semanticRepetition !== false) {
    issues.push(
      ...(await evaluateCareerPlaybookSemanticRepetition(generatedBlocks, {
        onNodeCost: input.onSemanticRepetitionCost,
        cache: input.semanticEmbeddingCache,
        cacheNamespace: input.semanticEmbeddingCacheNamespace,
      }))
    );
  }

  return verdictFromIssues(issues);
}

export function parseCareerPlaybookJudgeVerdict(rawContent: string): CareerPlaybookJudgeVerdict {
  const parsed = safeJSONParse(extractJSON(rawContent));
  return CareerPlaybookJudgeVerdictSchema.parse(normalizeJudgeVerdictCandidate(parsed));
}

/**
 * Severity gate for LLM judge issues: a `critical` issue only stays critical when
 * its `category` is in the regeneration taxonomy (spec contradiction, missing
 * format minimum, wrong language, unresolved placeholder, invented number). A
 * critical issue that is stylistic, or that the model left uncategorized, is
 * defensively downgraded to `warning` so it stays visible but can never drive
 * block regeneration. Deterministic issues never reach this path — they carry no
 * category and are merged through unchanged.
 */
function downgradeNonTaxonomyCriticalIssues(
  issues: CareerPlaybookJudgeIssue[]
): CareerPlaybookJudgeIssue[] {
  return issues.map(issue => {
    if (issue.severity !== 'critical') return issue;
    if (isCareerPlaybookJudgeCriticalCategory(issue.category)) return issue;
    return { ...issue, severity: 'warning' as const };
  });
}

/**
 * A judge `unresolved_placeholder` critical that the deterministic scan cannot
 * confirm is downgraded to a warning.
 *
 * All eight of them in the 2026-08-30 run pointed at the contract's own example
 * marker — "(example — replace with the company's actual CRM)" — which every
 * unverified company-specific value is REQUIRED to carry. Two rules of the same
 * contract pull opposite ways there, and the judge resolved it wrongly eight
 * times; each one bought a regeneration that could only make a correct block
 * worse. `validateFillablePlaceholderResolution` already owns this question and
 * answers it from the text, so it decides.
 */
export function downgradeUnconfirmedPlaceholderIssues(
  issues: CareerPlaybookJudgeIssue[],
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): CareerPlaybookJudgeIssue[] {
  return issues.map(issue => {
    if (issue.severity !== 'critical' || issue.category !== 'unresolved_placeholder') return issue;

    const content = generatedBlocks[issue.block_id]?.content ?? '';
    if (findUnresolvedFillablePlaceholders(content).length > 0) return issue;

    return {
      ...issue,
      severity: 'warning' as const,
      description: `${issue.description} — downgraded: the placeholder scan finds no fill-in field here, and the example marker is contracted output rather than a placeholder.`,
    };
  });
}

/**
 * Categories where a deterministic check, not the model, is the authority.
 *
 * Each of these has a pure function over the block text that answers the same
 * question — `validateRelativeDates` for a stale year, `validateExampleMarking`
 * for an unmarked example, `validateCrossViewReference` for a reference the
 * reader cannot follow, `validateMetricLedgerConsistency` for a threshold,
 * `validateUnsourcedStatistics`/`validateSourceAttribution` for an attribution.
 * When the check ran over a block and stayed silent, the judge's critical about
 * that block in that category is not confirmed by anything.
 *
 * Deliberately absent: `contradiction` and `invented_number` (no deterministic
 * check covers the general case — they are exactly what the LLM contour exists
 * for), `format_minimum` (only three blocks have minimums) and `wrong_language`
 * (the checker is scoped to whole-block language, the judge can see a single
 * foreign sentence).
 */
const DETERMINISTICALLY_OWNED_CATEGORIES = new Set([
  'stale_date',
  'unmarked_example',
  'unreadable_reference',
  'metric_conflict',
  'unsourced_claim',
]);

/**
 * A judge critical in a deterministically-owned category that the deterministic
 * pass did not also find is downgraded to a warning.
 *
 * Run 2896e72f filed a `stale_date` critical against block_25 whose own text
 * read "…is otherwise compliant; no defect is established here", and the block
 * went to regeneration anyway. That is the shape of mc2-1mr7r, which a prompt
 * ruling reduced (25 -> 9 -> 7 -> 11 criticals over four runs) but could not
 * remove, because the model writing the verdict is the thing being guarded.
 *
 * The rule is about authority, not about wording. Matching the prose of a
 * self-refuting verdict is what mc2-1mr7r's own gate did, and one reworded
 * sentence blinds it; here `validateRelativeDates` already skips block_25 as the
 * footer — the one place an absolute date belongs — so the claim is unconfirmed
 * on the merits without reading a single word of it.
 *
 * Two guards on the downgrade, both in the direction of keeping the finding:
 *
 * - Only a block the deterministic pass actually covered may be downgraded.
 *   The checks run over `currentBlocks` while the judge also sees previously
 *   generated groups, so "no deterministic issue here" and "no deterministic
 *   check ran here" are different facts, and only the first one is evidence.
 * - The downgrade is recorded in the description, so the rate stays measurable
 *   from a stored verdict without a re-run.
 */
export function downgradeUnconfirmedDeterministicIssues(
  issues: CareerPlaybookJudgeIssue[],
  deterministic: CareerPlaybookJudgeVerdict,
  coveredBlockIds: readonly CareerPlaybookBlockId[]
): CareerPlaybookJudgeIssue[] {
  const covered = new Set(coveredBlockIds);
  const confirmed = new Set(
    deterministic.issues
      .filter(issue => issue.category)
      .map(issue => `${issue.block_id}|${issue.category}`)
  );

  return issues.map(issue => {
    if (issue.severity !== 'critical') return issue;
    if (!issue.category || !DETERMINISTICALLY_OWNED_CATEGORIES.has(issue.category)) return issue;
    if (!covered.has(issue.block_id)) return issue;
    if (confirmed.has(`${issue.block_id}|${issue.category}`)) return issue;

    return {
      ...issue,
      severity: 'warning' as const,
      description: `${issue.description} — downgraded: the deterministic ${issue.category} check ran over ${issue.block_id} and found nothing, and it owns this question.`,
    };
  });
}

function mergeJudgeVerdicts(
  deterministic: CareerPlaybookJudgeVerdict,
  llm: CareerPlaybookJudgeVerdict,
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): CareerPlaybookJudgeVerdict {
  const gatedLLMIssues = downgradeUnconfirmedDeterministicIssues(
    downgradeUnconfirmedPlaceholderIssues(
      downgradeNonTaxonomyCriticalIssues(llm.issues),
      generatedBlocks
    ),
    deterministic,
    Object.keys(generatedBlocks)
  );
  const regenerationEligibleBlockIds = uniqueBlockIds(
    gatedLLMIssues.filter(issue => issue.severity === 'critical').map(issue => issue.block_id)
  );

  return {
    pass: deterministic.pass && llm.pass,
    score: Math.min(deterministic.score, llm.score),
    issues: [...deterministic.issues, ...gatedLLMIssues],
    needs_regeneration: uniqueBlockIds([
      ...deterministic.needs_regeneration,
      ...llm.needs_regeneration.filter(blockId => regenerationEligibleBlockIds.includes(blockId)),
    ]),
  };
}

/**
 * Which blocks may draw on the final-window reserve.
 *
 * Two populations, both of them "this block has not had its turn":
 *
 * - a block the full-document semantic gate flags, which is the last
 *   correctness boundary the document passes through;
 * - a block the final pass is the FIRST to flag. Run 2896e72f left block_13
 *   holding two criticals with zero attempts, because by the time the
 *   full-document pass reached it the window budget stood at 19 of 8. That is
 *   not a block that failed to use its attempts.
 *
 * Empty for a group window. The reserve exists because the final pass sees the
 * whole document for the first time; a group window has no such excuse.
 */
function selectWindowBudgetExemptBlockIds(params: {
  isFinalWindow: boolean;
  verdict: CareerPlaybookJudgeVerdict;
  deterministicVerdict: CareerPlaybookJudgeVerdict;
  windowBlockIds: CareerPlaybookBlockId[];
  attempts: Partial<Record<CareerPlaybookBlockId, number>>;
}): CareerPlaybookBlockId[] {
  if (!params.isFinalWindow) return [];

  const semanticRepetitionBlockIds = params.deterministicVerdict.issues
    .filter(isCareerPlaybookSemanticRepetitionIssue)
    .map(issue => issue.block_id);
  const firstFlaggedHere = params.verdict.needs_regeneration.filter(
    blockId => params.windowBlockIds.includes(blockId) && (params.attempts[blockId] ?? 0) === 0
  );

  return uniqueBlockIds([...semanticRepetitionBlockIds, ...firstFlaggedHere]);
}

function capRegenerationWhenBudgetExhausted(params: {
  verdict: CareerPlaybookJudgeVerdict;
  currentBlockIds: CareerPlaybookBlockId[];
  attempts: Partial<Record<CareerPlaybookBlockId, number>>;
  windowBudgetExemptBlockIds?: readonly CareerPlaybookBlockId[];
  reserveSpent?: number;
}): { verdict: CareerPlaybookJudgeVerdict; warnings: string[] } {
  const scopedNeedsRegeneration = params.verdict.needs_regeneration.filter(blockId =>
    params.currentBlockIds.includes(blockId)
  );

  if (scopedNeedsRegeneration.length === 0) {
    return { verdict: params.verdict, warnings: [] };
  }

  const attemptCount = countCareerPlaybookRegenerationAttemptsForBlocks(
    params.attempts,
    params.currentBlockIds
  );
  const windowBudgetExhausted =
    attemptCount >= CAREER_PLAYBOOK_MAX_JUDGE_WINDOW_REGENERATION_ATTEMPTS;
  const windowBudgetExemptBlockIds = new Set(params.windowBudgetExemptBlockIds ?? []);
  const cappedBlockIds = scopedNeedsRegeneration.filter(
    blockId =>
      (params.attempts[blockId] ?? 0) >= CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS ||
      (windowBudgetExhausted && !windowBudgetExemptBlockIds.has(blockId))
  );

  if (cappedBlockIds.length === 0) {
    return { verdict: params.verdict, warnings: [] };
  }
  // The reserve spend is named, not implied. Without it the next reader of this
  // warning sees "19/8" again and concludes the block never had a chance, which
  // is exactly the reading that cost run 2896e72f its diagnosis.
  const reserveLabel =
    windowBudgetExemptBlockIds.size > 0
      ? `; final-window reserve ${params.reserveSpent ?? 0}/${CAREER_PLAYBOOK_FINAL_WINDOW_RESERVE_ATTEMPTS}`
      : '';
  const budgetLabel = windowBudgetExhausted
    ? `${attemptCount}/${CAREER_PLAYBOOK_MAX_JUDGE_WINDOW_REGENERATION_ATTEMPTS}${reserveLabel}`
    : `per-block ${CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS}/${CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS}; total ${attemptCount}/${CAREER_PLAYBOOK_MAX_JUDGE_WINDOW_REGENERATION_ATTEMPTS}${reserveLabel}`;

  return {
    verdict: {
      ...params.verdict,
      needs_regeneration: params.verdict.needs_regeneration.filter(
        blockId => !cappedBlockIds.includes(blockId)
      ),
    },
    warnings: [
      `crossBlockJudge advanced after max regeneration attempts (${budgetLabel}) for ${params.currentBlockIds.join(', ')}; unresolved issues remain in judge verdict.`,
    ],
  };
}

/**
 * Does the document still carry an unremediated semantic repetition?
 *
 * Asks the executor, not the verdict. Until 2026-08-31 the two disagreed: the
 * window-budget exemption above lived only in this node's bookkeeping, while
 * `selectPendingCareerPlaybookRegenerations` refused every block once the window
 * was spent, exempt or not, and `routeAfterBlockRegeneration` sent an empty
 * batch straight to END. The exemption therefore changed nothing for anybody,
 * including the semantic repetitions it was written for. It now travels through
 * `windowBudgetExemptBlockIds` in state and buys a bounded reserve — but the
 * question is still asked of the executor, because "listed in
 * needs_regeneration" and "something will actually regenerate it" remain
 * different facts (the reserve is three, and a listed block may not get one).
 *
 * The answer is reported, not fatal. "We could not measure" and "we measured,
 * found one pair, and ran out of attempts" are different failures: the first
 * leaves us blind to the document and stays fail-closed inside
 * `CareerPlaybookSemanticRepetitionProviderError`; the second leaves us knowing
 * exactly what is in it. On 2026-08-30 the second one discarded 27 finished
 * blocks and $0.087 of billed generation over a single flagged pair, so it now
 * completes the playbook and records the pair instead.
 *
 * The warning carries the measurements — both block ids, the cosine and the
 * threshold all come from the issue description — because the same run proved
 * a gate that names only a block id cannot be diagnosed without paying for
 * another run. `for <ids>;` is load-bearing: `collectWarningQualityIssues`
 * parses exactly that shape to attach the issue to its blocks.
 */
function buildSemanticGateOutcome(params: {
  isFinalWindow: boolean;
  deterministicVerdict: CareerPlaybookJudgeVerdict;
  routedVerdict: CareerPlaybookJudgeVerdict;
  windowBlockIds: CareerPlaybookBlockId[];
  attempts: Partial<Record<CareerPlaybookBlockId, number>>;
}): { errors: string[]; warnings: string[] } {
  const none = { errors: [], warnings: [] };
  if (!params.isFinalWindow) return none;

  const semanticIssues = params.deterministicVerdict.issues.filter(
    isCareerPlaybookSemanticRepetitionIssue
  );
  const semanticRepetitionBlockIds = uniqueBlockIds(semanticIssues.map(issue => issue.block_id));
  if (semanticRepetitionBlockIds.length === 0) return none;

  const pending = selectPendingCareerPlaybookRegenerations({
    verdict: params.routedVerdict,
    blockIds: params.windowBlockIds,
    attempts: params.attempts,
  });
  const willRemediate = pending.some(entry => semanticRepetitionBlockIds.includes(entry.blockId));
  if (willRemediate) return none;

  const measurements = [...new Set(semanticIssues.map(issue => issue.description))];

  return {
    errors: [],
    warnings: [
      `crossBlockJudge exhausted semantic repetition remediation for ${semanticRepetitionBlockIds.join(
        ', '
      )}; the playbook ships with the repetition recorded: ${measurements.join(' ')}`,
    ],
  };
}

function selectGeneratedBlocks(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  blockIds?: CareerPlaybookBlockId[]
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  if (!blockIds) {
    return generatedBlocks;
  }

  return Object.fromEntries(
    blockIds
      .map(blockId => [blockId, generatedBlocks[blockId]] as const)
      .filter((entry): entry is readonly [CareerPlaybookBlockId, CareerPlaybookBlockState] =>
        Boolean(entry[1])
      )
  );
}

function joinBlockMarkdown(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): string {
  return Object.entries(generatedBlocks)
    .map(([, blockState]) => blockState?.content)
    .filter((content): content is string => Boolean(content))
    .join('\n\n');
}

function groupContainsAnyBlock(
  group: CareerPlaybookGroupResult,
  blockIds: CareerPlaybookBlockId[]
): boolean {
  return group.blockIds.some(blockId => blockIds.includes(blockId));
}

function joinPreviousGroupMarkdown(
  generatedGroups: Partial<Record<string, CareerPlaybookGroupResult>>,
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  currentBlockIds: CareerPlaybookBlockId[]
): string {
  return Object.values(generatedGroups)
    .filter((group): group is CareerPlaybookGroupResult => Boolean(group))
    .filter(group => !groupContainsAnyBlock(group, currentBlockIds))
    .map(group => {
      const regeneratedMarkdown = group.blockIds
        .map(blockId => generatedBlocks[blockId]?.content)
        .filter((content): content is string => Boolean(content))
        .join('\n\n');

      return regeneratedMarkdown || group.markdown;
    })
    .join('\n\n');
}

function attachVerdictToBlocks(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  verdict: CareerPlaybookJudgeVerdict
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  return Object.fromEntries(
    Object.entries(generatedBlocks).map(([blockId, blockState]) => [
      blockId,
      blockState
        ? {
            ...blockState,
            judge_verdict: verdict,
          }
        : blockState,
    ])
  );
}

export function createCrossBlockJudgeNode(options: CreateCrossBlockJudgeNodeOptions = {}) {
  const runtime = options.runtime ?? createCareerPlaybookRuntime();
  const semanticEmbeddingCache = options.currentBlockIds
    ? undefined
    : new CareerPlaybookSemanticEmbeddingCache();

  return async function crossBlockJudgeNode(
    state: CareerPlaybookGraphStateType
  ): Promise<CareerPlaybookGraphStateUpdate> {
    // The window is the full set of blocks this judge is responsible for (a fixed group, or
    // the whole document for the final judge). Routing, cap accounting, and lastJudgedBlockIds
    // always operate on the full window so the regeneration loop and window budget are
    // unchanged; only the content actually shown to the judge (currentBlocks) may narrow to
    // the regenerated delta on a re-judge.
    const windowBlocks = selectGeneratedBlocks(state.generatedBlocks, options.currentBlockIds);
    const windowBlockIds = Object.keys(windowBlocks);

    if (windowBlockIds.length === 0) {
      return {
        errors: ['crossBlockJudge failed: no generated blocks to judge'],
        currentNode: options.currentNode ?? 'crossBlockJudge',
      };
    }

    // Delta re-judge only applies to bounded group windows (options.currentBlockIds set); the
    // final full-document judge (no currentBlockIds) always reviews every block so it stays the
    // cross-block safety net after any regeneration.
    const deltaReJudgeEnabled =
      Boolean(options.currentBlockIds) &&
      (options.deltaReJudge ?? isCareerPlaybookDeltaReJudgeEnabled());
    const scopedBlockIds = deltaReJudgeEnabled
      ? selectDeltaReJudgeBlockIds(windowBlockIds, state.generatedBlocks)
      : windowBlockIds;
    const currentBlocks =
      scopedBlockIds === windowBlockIds
        ? windowBlocks
        : selectGeneratedBlocks(state.generatedBlocks, scopedBlockIds);
    const currentBlockIds = Object.keys(currentBlocks);

    // Anti-goals may live outside the current window (block 2 belongs to group 1),
    // so the conflict check reads them from the full block set, not the delta.
    const contractContext: CareerPlaybookQualityCheckContext | undefined = state.roleProfileSpec
      ? {
          metricLedger: getCareerPlaybookMetricLedger(state.roleProfileSpec),
          evidenceLedger: getCareerPlaybookEvidenceLedger(state.roleProfileSpec),
          cadenceLedger: getCareerPlaybookCadenceLedger(state.roleProfileSpec),
          milestoneLedger: getCareerPlaybookMilestoneLedger(state.roleProfileSpec),
          generatedOn: state.roleProfileSpec.generated_on,
          businessContextMode: state.qaData
            ? getCareerPlaybookBusinessContext(state.qaData).mode
            : undefined,
          publishedAntiGoals: state.generatedBlocks.block_2?.content
            ? [state.generatedBlocks.block_2.content]
            : [],
        }
      : undefined;

    const nodeCosts: CareerPlaybookNodeCost[] = [];
    const deterministicInput: RunDeterministicChecksInput = {
      generatedBlocks: currentBlocks,
      contentLanguage: state.language,
      contract: contractContext,
      semanticRepetition: options.currentBlockIds === undefined,
      onSemanticRepetitionCost: cost => nodeCosts.push(cost),
      semanticEmbeddingCache,
      semanticEmbeddingCacheNamespace: state.playbookId,
    };
    let deterministicVerdict: CareerPlaybookJudgeVerdict;
    try {
      deterministicVerdict = await runCareerPlaybookDeterministicChecks(deterministicInput);
    } catch (error) {
      if (!(error instanceof CareerPlaybookSemanticRepetitionProviderError)) throw error;
      const warning = `semantic repetition checks unavailable: ${error.message}`;
      throw new CareerPlaybookSemanticRepetitionProviderError(
        warning,
        { cause: error },
        nodeCosts,
        [warning]
      );
    }

    let verdict = deterministicVerdict;
    const isFinalWindow = options.currentBlockIds === undefined;
    const attempts = state.blockRegenerationAttempts ?? {};

    if (options.useLLMJudge) {
      if (!state.roleProfileSpec) {
        return {
          generatedBlocks: attachVerdictToBlocks(currentBlocks, deterministicVerdict),
          lastJudgeVerdict: deterministicVerdict,
          lastJudgedBlockIds: windowBlockIds,
          nodeCosts,
          errors: ['crossBlockJudge failed: roleProfileSpec is missing'],
          currentNode: options.currentNode ?? 'crossBlockJudge',
        };
      }

      try {
        const prompt = await runtime.renderPrompt(JUDGE_PROMPT_KEY, {
          group_id: currentBlockIds.join(', '),
          spec_json: JSON.stringify(state.roleProfileSpec, null, 2),
          // Every canonical block, not just this window: the judge compares the
          // current group against previously generated groups too, so it needs
          // the full block-to-reader map to tell a same-view contradiction from
          // allowed repetition between views with no shared reader.
          block_audiences_md: formatCareerPlaybookBlockAudiences(
            CAREER_PLAYBOOK_BLOCK_CATALOG.map(block => block.blockId)
          ),
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
          // Exclude the whole current window (not just the delta) from the previous-groups
          // context so a delta re-judge keeps the same prior-groups view as the first judge;
          // the delta block's accepted siblings are neither re-shown nor duplicated here.
          prev_groups_content:
            joinPreviousGroupMarkdown(
              state.generatedGroups,
              state.generatedBlocks,
              windowBlockIds
            ) || 'none',
          current_group_content: joinBlockMarkdown(currentBlocks),
        });
        const judgeResult = await invokeStructuredJudgeWithRepair(
          runtime,
          prompt,
          state.language,
          parseCareerPlaybookJudgeVerdict
        );
        nodeCosts.push(...judgeResult.nodeCosts);
        const llmVerdict = judgeResult.verdict;
        verdict = mergeJudgeVerdicts(deterministicVerdict, llmVerdict, currentBlocks);
      } catch (error) {
        if (error instanceof StructuredJudgeOutputError) {
          nodeCosts.push(...error.nodeCosts);
        }

        // A degraded LLM judge must not also degrade the deterministic semantic
        // gate: the deterministic verdict returned here still carries its issues,
        // so the same question is asked on this path too.
        const degradedSemantic = buildSemanticGateOutcome({
          isFinalWindow,
          deterministicVerdict,
          routedVerdict: deterministicVerdict,
          windowBlockIds,
          attempts,
        });

        return {
          generatedBlocks: attachVerdictToBlocks(currentBlocks, deterministicVerdict),
          judgeVerdicts: [deterministicVerdict],
          lastJudgeVerdict: deterministicVerdict,
          lastJudgedBlockIds: windowBlockIds,
          // The reserve is a property of the window, not of the LLM contour: a
          // block the deterministic checks are the first to flag at the final
          // pass has had no turn either.
          windowBudgetExemptBlockIds: selectWindowBudgetExemptBlockIds({
            isFinalWindow,
            verdict: deterministicVerdict,
            deterministicVerdict,
            windowBlockIds,
            attempts,
          }),
          nodeCosts,
          warnings: [
            `crossBlockJudge degraded to deterministic checks after LLM structured verdict failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            ...degradedSemantic.warnings,
          ],
          ...(degradedSemantic.errors.length > 0 ? { errors: degradedSemantic.errors } : {}),
          currentNode: options.currentNode ?? 'crossBlockJudge',
        };
      }
    }

    // Cap/window-budget accounting always spans the full window so the per-block (2) and
    // per-window (8) regeneration caps are unchanged by delta scoping.
    const windowBudgetExemptBlockIds = selectWindowBudgetExemptBlockIds({
      isFinalWindow,
      verdict,
      deterministicVerdict,
      windowBlockIds,
      attempts,
    });
    const capped = capRegenerationWhenBudgetExhausted({
      verdict,
      currentBlockIds: windowBlockIds,
      attempts,
      // The full-document semantic gate is the final correctness boundary. A
      // block it flags may use its own remaining per-block attempts even when
      // unrelated group remediations already consumed the general window cap.
      windowBudgetExemptBlockIds: isFinalWindow ? windowBudgetExemptBlockIds : undefined,
      reserveSpent: state.finalWindowReserveSpent,
    });
    const semantic = buildSemanticGateOutcome({
      isFinalWindow,
      deterministicVerdict,
      routedVerdict: capped.verdict,
      windowBlockIds,
      attempts,
    });
    const warnings = [...capped.warnings, ...semantic.warnings];

    return {
      // Only the re-reviewed blocks receive the new verdict; accepted siblings retain the
      // verdict a previous pass of this window attached (delta merge semantics).
      generatedBlocks: attachVerdictToBlocks(currentBlocks, capped.verdict),
      judgeVerdicts: [capped.verdict],
      lastJudgeVerdict: capped.verdict,
      lastJudgedBlockIds: windowBlockIds,
      // Always written, including the empty list: a group window must clear what
      // a previous final pass left, or a block would keep its reserve claim into
      // a window that never granted one.
      windowBudgetExemptBlockIds,
      nodeCosts,
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(semantic.errors.length > 0 ? { errors: semantic.errors } : {}),
      currentNode: options.currentNode ?? 'crossBlockJudge',
    };
  };
}

export const crossBlockJudgeNode = createCrossBlockJudgeNode();
