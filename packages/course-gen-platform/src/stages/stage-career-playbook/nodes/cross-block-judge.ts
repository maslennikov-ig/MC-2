import { extractJSON, safeJSONParse } from '@/shared/workspace-utils';
import {
  CareerPlaybookBlockIdSchema,
  CareerPlaybookJudgeIssueSchema,
  CareerPlaybookJudgeVerdictSchema,
  isCareerPlaybookJudgeCriticalCategory,
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
  CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS,
  CAREER_PLAYBOOK_MAX_JUDGE_WINDOW_REGENERATION_ATTEMPTS,
  countCareerPlaybookRegenerationAttemptsForBlocks,
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

function mergeJudgeVerdicts(
  deterministic: CareerPlaybookJudgeVerdict,
  llm: CareerPlaybookJudgeVerdict
): CareerPlaybookJudgeVerdict {
  const gatedLLMIssues = downgradeNonTaxonomyCriticalIssues(llm.issues);
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

function capRegenerationWhenBudgetExhausted(params: {
  verdict: CareerPlaybookJudgeVerdict;
  currentBlockIds: CareerPlaybookBlockId[];
  attempts: Partial<Record<CareerPlaybookBlockId, number>>;
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
  const perBlockBudgetExhausted = scopedNeedsRegeneration.every(
    blockId => (params.attempts[blockId] ?? 0) >= CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS
  );

  if (!windowBudgetExhausted && !perBlockBudgetExhausted) {
    return { verdict: params.verdict, warnings: [] };
  }
  const budgetLabel = windowBudgetExhausted
    ? `${attemptCount}/${CAREER_PLAYBOOK_MAX_JUDGE_WINDOW_REGENERATION_ATTEMPTS}`
    : `per-block ${CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS}/${CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS}; total ${attemptCount}/${CAREER_PLAYBOOK_MAX_JUDGE_WINDOW_REGENERATION_ATTEMPTS}`;

  return {
    verdict: {
      ...params.verdict,
      needs_regeneration: params.verdict.needs_regeneration.filter(
        blockId => !params.currentBlockIds.includes(blockId)
      ),
    },
    warnings: [
      `crossBlockJudge advanced after max regeneration attempts (${budgetLabel}) for ${params.currentBlockIds.join(', ')}; unresolved issues remain in judge verdict.`,
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

    const deterministicVerdict = await runCareerPlaybookDeterministicChecks({
      generatedBlocks: currentBlocks,
      contentLanguage: state.language,
    });

    let verdict = deterministicVerdict;
    const nodeCosts: CareerPlaybookNodeCost[] = [];

    if (options.useLLMJudge) {
      if (!state.roleProfileSpec) {
        return {
          generatedBlocks: attachVerdictToBlocks(currentBlocks, deterministicVerdict),
          lastJudgeVerdict: deterministicVerdict,
          lastJudgedBlockIds: windowBlockIds,
          errors: ['crossBlockJudge failed: roleProfileSpec is missing'],
          currentNode: options.currentNode ?? 'crossBlockJudge',
        };
      }

      try {
        const prompt = await runtime.renderPrompt(JUDGE_PROMPT_KEY, {
          group_id: currentBlockIds.join(', '),
          spec_json: JSON.stringify(state.roleProfileSpec, null, 2),
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
        verdict = mergeJudgeVerdicts(deterministicVerdict, llmVerdict);
      } catch (error) {
        if (error instanceof StructuredJudgeOutputError) {
          nodeCosts.push(...error.nodeCosts);
        }

        return {
          generatedBlocks: attachVerdictToBlocks(currentBlocks, deterministicVerdict),
          judgeVerdicts: [deterministicVerdict],
          lastJudgeVerdict: deterministicVerdict,
          lastJudgedBlockIds: windowBlockIds,
          nodeCosts,
          warnings: [
            `crossBlockJudge degraded to deterministic checks after LLM structured verdict failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ],
          currentNode: options.currentNode ?? 'crossBlockJudge',
        };
      }
    }

    // Cap/window-budget accounting always spans the full window so the per-block (2) and
    // per-window (8) regeneration caps are unchanged by delta scoping.
    const capped = capRegenerationWhenBudgetExhausted({
      verdict,
      currentBlockIds: windowBlockIds,
      attempts: state.blockRegenerationAttempts ?? {},
    });

    return {
      // Only the re-reviewed blocks receive the new verdict; accepted siblings retain the
      // verdict a previous pass of this window attached (delta merge semantics).
      generatedBlocks: attachVerdictToBlocks(currentBlocks, capped.verdict),
      judgeVerdicts: [capped.verdict],
      lastJudgeVerdict: capped.verdict,
      lastJudgedBlockIds: windowBlockIds,
      nodeCosts,
      ...(capped.warnings.length > 0 ? { warnings: capped.warnings } : {}),
      currentNode: options.currentNode ?? 'crossBlockJudge',
    };
  };
}

export const crossBlockJudgeNode = createCrossBlockJudgeNode();
