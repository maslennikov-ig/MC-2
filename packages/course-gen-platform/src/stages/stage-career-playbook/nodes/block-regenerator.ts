import {
  type CareerPlaybookBlockId,
  type CareerPlaybookBlockState,
  type CareerPlaybookJudgeIssue,
  type CareerPlaybookJudgeVerdict,
  type CareerPlaybookNodeCost,
  type CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import {
  formatCareerPlaybookCitableBlocks,
  getCareerPlaybookBlockAudiences,
} from './audience-scope';
import { CAREER_PLAYBOOK_FINAL_BLOCK_ORDER } from './final-assembler';
import {
  buildCareerPlaybookAbortedAttemptCosts,
  CareerPlaybookLLMCallError,
  createCareerPlaybookRuntime,
  type CareerPlaybookRuntime,
} from './runtime';
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
import type { CareerPlaybookGraphStateType, CareerPlaybookGraphStateUpdate } from '../state';

export const BLOCK_REGENERATOR_PROMPT_KEY = 'career_playbook_block_regenerator';
export const BLOCK_REGENERATOR_PHASE = 'stage_career_playbook_regenerator';
export const CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS = 2;
export const CAREER_PLAYBOOK_MAX_JUDGE_WINDOW_REGENERATION_ATTEMPTS = 8;

const BLOCK_NAMES: Record<CareerPlaybookBlockId, string> = {
  header: 'Header',
  block_1: 'Mission and key results',
  block_2: 'Anti-goals',
  block_3: 'Responsibility zones',
  block_4: 'Duties',
  block_5: 'Decision authority matrix',
  block_6: 'KPI and metrics',
  block_7: 'Competencies',
  block_8: 'Tools and technologies',
  block_9: 'Human-AI collaboration',
  block_10: 'Dependencies',
  block_11: 'Career path',
  block_12: 'Candidate profile',
  block_13: 'Day in the life',
  block_14: 'Onboarding',
  block_15: 'Motivation',
  block_16: 'Main process',
  block_17: 'Red flags',
  block_18: 'FAQ',
  block_19: 'Industry context',
  block_20: 'Business model',
  block_21: 'Failure modes',
  block_22: 'Role README',
  block_23: 'Continuity plan',
  block_24: 'Role Canvas',
  block_25: 'Footer',
  block_26: 'Implementation checklist',
};

export interface RegenerateCareerPlaybookBlockInput {
  blockId: CareerPlaybookBlockId;
  roleProfileSpec: CareerPlaybookRoleProfileSpec;
  language: string;
  originalBlock?: CareerPlaybookBlockState | null;
  /**
   * Every judge finding against this block, not the first one.
   *
   * A block gets two attempts. Told about one finding per attempt, a block the
   * judge faulted three times could never come back clean however many
   * regenerations it was given: run `638ed691` shipped **five** criticals on
   * block 26 after spending both of its attempts, and run `d5137bc5` shipped
   * two or three on each of six blocks. That reads as a cap set too low. It is
   * not: the cap was never the binding constraint, the briefing was.
   */
  issues: readonly Pick<CareerPlaybookJudgeIssue, 'description' | 'suggestion'>[];
  userInstruction?: string | null;
  otherBlocks?: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
  now?: () => Date;
}

export interface RegenerateCareerPlaybookBlockResult {
  blockId: CareerPlaybookBlockId;
  block: CareerPlaybookBlockState;
  nodeCost: CareerPlaybookNodeCost;
  /** Unknown-cost rows for attempts that never returned before this call succeeded. */
  abortedCosts: CareerPlaybookNodeCost[];
}

export interface CareerPlaybookPendingRegeneration {
  blockId: CareerPlaybookBlockId;
  issues: CareerPlaybookJudgeIssue[];
  attempts: number;
  /** Drawn from the final-window reserve rather than the ordinary budget. */
  fromReserve?: boolean;
}

function compactMarkdown(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

export function getCareerPlaybookBlockName(blockId: CareerPlaybookBlockId): string {
  return BLOCK_NAMES[blockId];
}

function getExpectedHeadingPattern(blockId: CareerPlaybookBlockId): RegExp {
  if (blockId === 'header') {
    return /^##\s+Header\s*$/im;
  }

  const blockNumber = blockId.replace('block_', '');
  return new RegExp(`^##\\s+${blockNumber}\\.\\s+`, 'im');
}

function topLevelCareerPlaybookBlockHeadings(markdown: string): string[] {
  return markdown.match(/^##\s+(?:Header\s*$|(?:[1-9]|1[0-9]|2[0-6])\.\s+.*$)/gim) ?? [];
}

export function validateRegeneratedCareerPlaybookBlockMarkdown(
  blockId: CareerPlaybookBlockId,
  markdown: string
): string {
  const content = markdown.trim();
  if (!content) {
    throw new Error(`Regenerated ${blockId} returned empty markdown`);
  }

  const topLevelHeadings = topLevelCareerPlaybookBlockHeadings(content);
  if (topLevelHeadings.length !== 1) {
    throw new Error(
      `Regenerated ${blockId} must contain exactly one top-level Career Playbook block heading`
    );
  }

  if (!getExpectedHeadingPattern(blockId).test(content)) {
    throw new Error(`Regenerated ${blockId} is missing the expected heading for ${blockId}`);
  }

  return content;
}

export function buildOtherBlocksBrief(
  otherBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> | undefined,
  targetBlockId: CareerPlaybookBlockId
): string {
  const targetAudiences = getCareerPlaybookBlockAudiences(targetBlockId);
  const lines = CAREER_PLAYBOOK_FINAL_BLOCK_ORDER.flatMap(blockId => {
    if (blockId === targetBlockId) return [];
    if (
      !getCareerPlaybookBlockAudiences(blockId).some(audience => targetAudiences.includes(audience))
    ) {
      return [];
    }

    const content = otherBlocks?.[blockId]?.content;
    if (!content || content.trim().length === 0) return [];

    return [`${blockId}: ${compactMarkdown(content).slice(0, 500)}`];
  });

  return lines.length > 0 ? lines.join('\n') : 'none';
}

/**
 * One finding per line, numbered so the two lists line up.
 *
 * A single finding stays a bare sentence: numbering one item would read as a
 * list with an item missing.
 */
function formatRegenerationIssues(
  issues: readonly Pick<CareerPlaybookJudgeIssue, 'description' | 'suggestion'>[],
  pick: (issue: Pick<CareerPlaybookJudgeIssue, 'description' | 'suggestion'>) => string
): string {
  if (issues.length === 0) return 'none';
  if (issues.length === 1) return pick(issues[0]);

  return issues.map((issue, index) => `${index + 1}. ${pick(issue)}`).join('\n');
}

export function buildBlockRegeneratorPromptVariables(
  input: RegenerateCareerPlaybookBlockInput
): Record<string, string> {
  return {
    block_id: input.blockId,
    block_name: getCareerPlaybookBlockName(input.blockId),
    original_content: input.originalBlock?.content.trim() || 'none',
    issue_description: formatRegenerationIssues(input.issues, issue => issue.description),
    suggestion: formatRegenerationIssues(input.issues, issue => issue.suggestion ?? 'none'),
    user_instruction: input.userInstruction?.trim() || 'none',
    spec_json: JSON.stringify(input.roleProfileSpec, null, 2),
    // Without the ledgers a regeneration prompted by a metric conflict simply
    // invents a third value: it is told the block is wrong but not what right is.
    metric_ledger_md: formatCareerPlaybookMetricLedgerForPrompt(
      getCareerPlaybookMetricLedger(input.roleProfileSpec)
    ),
    // Same reasoning for rhythms: a regeneration prompted by a cadence conflict
    // is told which block is wrong, and needs to be told which rhythm is right.
    cadence_ledger_md: formatCareerPlaybookCadenceLedgerForPrompt(
      getCareerPlaybookCadenceLedger(input.roleProfileSpec)
    ),
    milestone_ledger_md: formatCareerPlaybookMilestoneLedgerForPrompt(
      getCareerPlaybookMilestoneLedger(input.roleProfileSpec)
    ),
    evidence_ledger_md: formatCareerPlaybookEvidenceLedgerForPrompt(
      getCareerPlaybookEvidenceLedger(input.roleProfileSpec)
    ),
    generated_on: input.roleProfileSpec.generated_on ?? new Date().toISOString().slice(0, 10),
    block_audiences_md: `- ${input.blockId}: ${getCareerPlaybookBlockAudiences(input.blockId).join(', ')}`,
    // A regeneration prompted by an unreadable reference is told the pointer is
    // wrong; without this it is not told which pointers are right, and would
    // spend both attempts reproducing the same defect.
    citable_blocks_md: formatCareerPlaybookCitableBlocks([input.blockId]),
    other_blocks_brief: buildOtherBlocksBrief(input.otherBlocks, input.blockId),
    content_language: input.language,
  };
}

function buildNodeCost(result: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costUnknown?: boolean;
  durationMs?: number;
  attemptCount?: number;
  generationId?: string;
}): CareerPlaybookNodeCost {
  return {
    node: 'blockRegenerator',
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
    outcome: 'succeeded',
  };
}

export async function regenerateCareerPlaybookBlock(
  input: RegenerateCareerPlaybookBlockInput,
  runtime: CareerPlaybookRuntime = createCareerPlaybookRuntime()
): Promise<RegenerateCareerPlaybookBlockResult> {
  const prompt = await runtime.renderPrompt(
    BLOCK_REGENERATOR_PROMPT_KEY,
    buildBlockRegeneratorPromptVariables(input)
  );
  const llmResult = await runtime.invokeLLM(prompt, {
    phaseName: BLOCK_REGENERATOR_PHASE,
    promptKey: BLOCK_REGENERATOR_PROMPT_KEY,
    node: 'blockRegenerator',
    temperature: 0.4,
    maxTokens: 6_000,
  });
  const generatedAt = (input.now ?? (() => new Date()))().toISOString();
  const attempt = (input.originalBlock?.attempt ?? 0) + 1;
  const content = validateRegeneratedCareerPlaybookBlockMarkdown(input.blockId, llmResult.content);

  const block: CareerPlaybookBlockState = {
    content,
    status: 'generated',
    judge_verdict: null,
    generated_at: generatedAt,
    llm_model: llmResult.model,
    attempt,
  };

  return {
    blockId: input.blockId,
    block,
    nodeCost: buildNodeCost(llmResult),
    abortedCosts: buildCareerPlaybookAbortedAttemptCosts(
      'blockRegenerator',
      llmResult.abortedAttempts
    ),
  };
}

/**
 * Every finding the verdict holds against this block, criticals first.
 *
 * Ordering matters when a block is faulted more than twice and still runs out
 * of attempts: the attempt should be spent on what blocks publication, not on
 * whichever finding the judge happened to write down first.
 */
function issuesForBlock(
  verdict: CareerPlaybookJudgeVerdict,
  blockId: CareerPlaybookBlockId
): CareerPlaybookJudgeIssue[] {
  const severityRank = { critical: 0, warning: 1, info: 2 } as const;
  const issues = verdict.issues
    .filter(issue => issue.block_id === blockId)
    .sort((left, right) => severityRank[left.severity] - severityRank[right.severity]);

  if (issues.length > 0) return issues;

  return [
    {
      block_id: blockId,
      severity: 'warning',
      description: `Regenerate ${blockId} based on the cross-block judge verdict.`,
      suggestion: 'Preserve the block contract and fix the judge finding.',
    },
  ];
}

export interface SelectCareerPlaybookRegenerationInput {
  verdict?: CareerPlaybookJudgeVerdict | null;
  blockIds: CareerPlaybookBlockId[];
  attempts: Partial<Record<CareerPlaybookBlockId, number>>;
  maxAttempts?: number;
  maxWindowAttempts?: number;
  /**
   * Blocks allowed to draw on the final-window reserve once the ordinary window
   * budget is spent. Empty or absent means the budget is the whole answer.
   */
  reservedWindowBlockIds?: readonly CareerPlaybookBlockId[];
  /**
   * Reserve attempts already granted in this run.
   *
   * Carried rather than derived. "Attempts beyond the window budget" looks like
   * the same number and is not: the final window sums attempts across every
   * block, so a run that spent 19 of 8 on group remediations is at 11 over
   * budget having drawn nothing from the reserve at all.
   */
  reservedWindowAttemptsSpent?: number;
  maxReservedWindowAttempts?: number;
}

/**
 * Extra regenerations available at the final full-document window, beyond the
 * ordinary window budget of 8.
 *
 * Run 2896e72f ended with block_13 carrying two criticals and zero regeneration
 * attempts: the final pass was the first to flag it, and by then unrelated group
 * remediations had spent 19 of 8. Its surviving defects are "found too late to
 * fix", not "told one complaint at a time", so the answer is not a higher
 * per-block cap — a block that already had two attempts does not need a third.
 * It is a small reserve for a block that has had none.
 *
 * Bounded twice over: three across the whole run (the spend is derived from the
 * attempts already made, so repeated final passes cannot each take three), and
 * only for a block sitting at zero with a critical against it.
 */
export const CAREER_PLAYBOOK_FINAL_WINDOW_RESERVE_ATTEMPTS = 3;

/**
 * Select every block the current judge verdict flags that can still be regenerated
 * within the caps, ordered fewest-attempts-first. Applies the same per-block cap and
 * window budget as the singular selector, then trims the batch to whatever window
 * budget remains so caps are never exceeded across a single judge window. Batching
 * lets one blockRegenerator visit fix all flagged blocks before the next re-judge,
 * shrinking judge calls per window without loosening any cap.
 */
export function selectPendingCareerPlaybookRegenerations(
  input: SelectCareerPlaybookRegenerationInput
): CareerPlaybookPendingRegeneration[] {
  const maxAttempts = input.maxAttempts ?? CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS;
  const maxWindowAttempts =
    input.maxWindowAttempts ?? CAREER_PLAYBOOK_MAX_JUDGE_WINDOW_REGENERATION_ATTEMPTS;
  const verdict = input.verdict;
  if (!verdict?.needs_regeneration.length || verdict.pass) {
    return [];
  }

  const spentWindow = countCareerPlaybookRegenerationAttemptsForBlocks(
    input.attempts,
    input.blockIds
  );
  const remainingWindow = maxWindowAttempts - spentWindow;
  if (remainingWindow <= 0) {
    return selectReservedRegenerations(input, verdict);
  }

  const candidates = verdict.needs_regeneration
    .map((blockId, order) => ({
      blockId,
      order,
      attempts: input.attempts[blockId] ?? 0,
    }))
    .filter(candidate => input.blockIds.includes(candidate.blockId))
    .filter(candidate => candidate.attempts < maxAttempts)
    .sort((left, right) => left.attempts - right.attempts || left.order - right.order);

  return candidates.slice(0, remainingWindow).map(candidate => ({
    blockId: candidate.blockId,
    issues: issuesForBlock(verdict, candidate.blockId),
    attempts: candidate.attempts,
  }));
}

/**
 * The reserve, once the ordinary window budget is spent.
 *
 * Everything about it is deliberately narrow. Only a listed block qualifies —
 * the caller decides that, and today only the final full-document judge lists
 * any. Only a block at zero attempts, so this never becomes a third try at
 * something two rewrites failed to fix. Only a block with a critical against it,
 * because a warning was never going to regenerate anything anyway.
 *
 * The remaining reserve comes from `reservedWindowAttemptsSpent`, which the
 * caller carries in state, so repeated final passes cannot each take three.
 */
function selectReservedRegenerations(
  input: SelectCareerPlaybookRegenerationInput,
  verdict: CareerPlaybookJudgeVerdict
): CareerPlaybookPendingRegeneration[] {
  const reserved = new Set(input.reservedWindowBlockIds ?? []);
  if (reserved.size === 0) return [];

  const maxReserve =
    input.maxReservedWindowAttempts ?? CAREER_PLAYBOOK_FINAL_WINDOW_RESERVE_ATTEMPTS;
  const remainingReserve = maxReserve - (input.reservedWindowAttemptsSpent ?? 0);
  if (remainingReserve <= 0) return [];

  const hasCritical = (blockId: CareerPlaybookBlockId): boolean =>
    verdict.issues.some(issue => issue.block_id === blockId && issue.severity === 'critical');

  return verdict.needs_regeneration
    .filter(blockId => input.blockIds.includes(blockId))
    .filter(blockId => reserved.has(blockId))
    .filter(blockId => (input.attempts[blockId] ?? 0) === 0)
    .filter(hasCritical)
    .slice(0, remainingReserve)
    .map(blockId => ({
      blockId,
      issues: issuesForBlock(verdict, blockId),
      attempts: 0,
      fromReserve: true,
    }));
}

export function selectPendingCareerPlaybookRegeneration(
  input: SelectCareerPlaybookRegenerationInput
): CareerPlaybookPendingRegeneration | null {
  return selectPendingCareerPlaybookRegenerations(input)[0] ?? null;
}

export function countCareerPlaybookRegenerationAttemptsForBlocks(
  attempts: Partial<Record<CareerPlaybookBlockId, number>>,
  blockIds: CareerPlaybookBlockId[]
): number {
  return blockIds.reduce((total, blockId) => total + (attempts[blockId] ?? 0), 0);
}

export function createBlockRegeneratorNode(
  runtime: CareerPlaybookRuntime = createCareerPlaybookRuntime()
) {
  return async function blockRegeneratorNode(
    state: CareerPlaybookGraphStateType
  ): Promise<CareerPlaybookGraphStateUpdate> {
    if (!state.roleProfileSpec) {
      return {
        errors: ['blockRegenerator failed: roleProfileSpec is missing'],
        lastRegenerationBatchSize: 0,
        currentNode: 'blockRegenerator',
      };
    }

    const roleProfileSpec = state.roleProfileSpec;
    const pendingBatch = selectPendingCareerPlaybookRegenerations({
      verdict: state.lastJudgeVerdict,
      blockIds: state.lastJudgedBlockIds,
      attempts: state.blockRegenerationAttempts,
      reservedWindowBlockIds: state.windowBudgetExemptBlockIds,
      reservedWindowAttemptsSpent: state.finalWindowReserveSpent,
    });

    if (pendingBatch.length === 0) {
      // Nothing eligible: every flagged block sits at its per-block/window cap, so this
      // pass makes zero LLM calls and zero changes. Record the empty batch so the router
      // advances instead of re-judging identical content.
      return {
        lastRegenerationBatchSize: 0,
        currentNode: 'blockRegenerator',
      };
    }

    // Snapshot generatedBlocks before the batch so every regenerated block reads the
    // same pre-batch sibling briefs; the full re-judge of the window gates them
    // together regardless, so intra-batch staleness is acceptable.
    const otherBlocksSnapshot = state.generatedBlocks;
    const regenerable = pendingBatch.filter(pending =>
      Boolean(state.generatedBlocks[pending.blockId])
    );
    const missing = pendingBatch.filter(pending => !state.generatedBlocks[pending.blockId]);

    const settled = await Promise.allSettled(
      regenerable.map(pending =>
        regenerateCareerPlaybookBlock(
          {
            blockId: pending.blockId,
            roleProfileSpec,
            language: state.language,
            originalBlock: state.generatedBlocks[pending.blockId],
            issues: pending.issues,
            otherBlocks: otherBlocksSnapshot,
          },
          runtime
        )
      )
    );

    const generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> = {};
    const blockRegenerationAttempts: Partial<Record<CareerPlaybookBlockId, number>> = {};
    const nodeCosts: CareerPlaybookNodeCost[] = [];
    const warnings: string[] = [];
    // A selected-but-missing block cannot be regenerated; preserve the prior
    // single-block behavior of surfacing it as an error (without consuming an attempt).
    const errors = missing.map(pending => `blockRegenerator failed: ${pending.blockId} is missing`);

    settled.forEach((outcome, index) => {
      const pending = regenerable[index];
      // Consume one attempt for every attempted block (success and failure alike) to
      // keep the window-budget accounting identical to the single-block path.
      blockRegenerationAttempts[pending.blockId] = pending.attempts + 1;

      if (outcome.status === 'fulfilled') {
        generatedBlocks[pending.blockId] = outcome.value.block;
        nodeCosts.push(outcome.value.nodeCost, ...outcome.value.abortedCosts);
        return;
      }

      // A regeneration that failed outright still consumed provider time; keep
      // its attempts on the receipt rather than dropping the cost silently.
      if (outcome.reason instanceof CareerPlaybookLLMCallError) {
        nodeCosts.push(
          ...buildCareerPlaybookAbortedAttemptCosts(
            'blockRegenerator',
            outcome.reason.abortedAttempts
          )
        );
      }

      warnings.push(
        `blockRegenerator retained ${pending.blockId}: ${
          outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
        }`
      );
    });

    // Every reserve draw is counted, including one that failed: it consumed an
    // attempt and a provider call, and a reserve that only counts successes
    // would fund a retry loop the per-block cap was written to prevent.
    const reserveDraws = pendingBatch.filter(pending => pending.fromReserve).length;

    return {
      ...(Object.keys(generatedBlocks).length > 0 ? { generatedBlocks } : {}),
      ...(Object.keys(blockRegenerationAttempts).length > 0 ? { blockRegenerationAttempts } : {}),
      ...(nodeCosts.length > 0 ? { nodeCosts } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(errors.length > 0 ? { errors } : {}),
      ...(reserveDraws > 0
        ? { finalWindowReserveSpent: (state.finalWindowReserveSpent ?? 0) + reserveDraws }
        : {}),
      // Non-zero eligible batch: this pass attempted regeneration (success or failure),
      // so the window must be re-judged to gate the changed content.
      lastRegenerationBatchSize: pendingBatch.length,
      currentNode: 'blockRegenerator',
    };
  };
}
