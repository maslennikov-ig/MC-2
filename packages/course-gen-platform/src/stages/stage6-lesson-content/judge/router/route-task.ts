/**
 * Router decision logic for targeted refinement
 *
 * Pure functions that route refinement tasks to appropriate executors
 * based on issue characteristics and token budget constraints.
 */
import type {
  SectionRefinementTask,
  RouterDecision,
  RoutingConfig,
  FixAction
} from '@megacampus/shared-types';
import { REFINEMENT_CONFIG } from '@megacampus/shared-types';
import { parseSectionIndex as parseSectionIndexUtil } from '../arbiter/section-utils';
import { logger } from '../../../../shared/logger';

/**
 * Route a single task to appropriate executor
 *
 * Decision Matrix:
 * | Condition | Action | Executor |
 * |-----------|--------|----------|
 * | severity=minor AND localizable | SURGICAL_EDIT | patcher |
 * | severity=major AND single section | REGENERATE_SECTION | generator |
 * | severity=critical AND structural | FULL_REGENERATE | generator |
 * | multiple criteria in section | REGENERATE_SECTION | generator |
 * | tone/grammar/clarity issue | SURGICAL_EDIT | patcher |
 * | factual error | REGENERATE_SECTION | generator |
 *
 * @param task - SectionRefinementTask to route
 * @param config - RoutingConfig with budget and preferences
 * @returns RouterDecision with action, executor, estimated tokens
 */
export function routeTask(
  task: SectionRefinementTask,
  config: RoutingConfig
): RouterDecision {
  // Validate input
  if (!task.sourceIssues || task.sourceIssues.length === 0) {
    logger.warn({ taskId: task.sectionId }, 'routeTask called with empty sourceIssues - defaulting to SURGICAL_EDIT');
    return {
      task,
      action: 'SURGICAL_EDIT' as const,
      executor: 'patcher',
      estimatedTokens: REFINEMENT_CONFIG.tokenCosts.patcher.min,
      reason: 'No issues specified - defaulting to minimal surgical edit',
    };
  }

  // Analyze task to determine best action
  const hasFactualError = task.sourceIssues.some(
    i => i.criterion === 'factual_accuracy'
  );
  const hasCriticalStructural = task.sourceIssues.some(
    i => i.severity === 'critical' &&
         (i.criterion === 'pedagogical_structure' || i.criterion === 'learning_objective_alignment')
  );
  const multipleIssues = task.sourceIssues.length > 2;
  const isClarityOnly = task.sourceIssues.every(
    i => i.criterion === 'clarity_readability' ||
         i.criterion === 'engagement_examples'
  );

  let action: FixAction;
  let executor: 'patcher' | 'generator';
  let estimatedTokens: number;
  let reason: string;

  if (hasCriticalStructural) {
    action = 'FULL_REGENERATE';
    executor = 'generator';
    estimatedTokens = REFINEMENT_CONFIG.tokenCosts.fullRegenerate.max;
    reason = 'Critical structural issue requires full regeneration';
  } else if (hasFactualError || multipleIssues) {
    action = 'REGENERATE_SECTION';
    executor = 'generator'; // Generator handles section regeneration now
    estimatedTokens = REFINEMENT_CONFIG.tokenCosts.sectionExpander?.max ??
                     REFINEMENT_CONFIG.tokenCosts.fullRegenerate.max;
    reason = hasFactualError
      ? 'Factual error requires section regeneration with RAG'
      : 'Multiple issues in section - regeneration more efficient';
  } else if (isClarityOnly || task.priority === 'minor') {
    action = 'SURGICAL_EDIT';
    executor = 'patcher';
    estimatedTokens = REFINEMENT_CONFIG.tokenCosts.patcher.max;
    reason = 'Minor/clarity issue suitable for surgical edit';
  } else {
    // Default to surgical edit if within budget
    action = config.preferSurgical ? 'SURGICAL_EDIT' : 'REGENERATE_SECTION';
    executor = config.preferSurgical ? 'patcher' : 'generator';
    estimatedTokens = config.preferSurgical
      ? REFINEMENT_CONFIG.tokenCosts.patcher.max
      : REFINEMENT_CONFIG.tokenCosts.sectionExpander?.max ??
        REFINEMENT_CONFIG.tokenCosts.fullRegenerate.max;
    reason = 'Default routing based on configuration preference';
  }

  return {
    task,
    action,
    executor,
    estimatedTokens,
    reason,
  };
}

/**
 * Create execution batches for parallel processing
 *
 * Rules:
 * 1. Non-adjacent sections (gap > 1) can run in parallel
 * 2. Max 3 concurrent Patchers per batch
 * 3. Section-Expanders run sequentially (higher context needs)
 * 4. Sort by priority (critical > major > minor)
 *
 * @param tasks - All SectionRefinementTasks to batch
 * @param maxConcurrent - Max tasks per batch (default: 3)
 * @returns Array of batches, each batch is array of tasks
 */
export function createExecutionBatches(
  tasks: SectionRefinementTask[],
  maxConcurrent: number = REFINEMENT_CONFIG.parallel.maxConcurrentPatchers
): SectionRefinementTask[][] {
  // Handle edge cases
  if (tasks.length === 0) {
    return [];
  }

  if (tasks.length === 1) {
    return [tasks];
  }

  // Sort by priority
  const priorityOrder = { critical: 0, major: 1, minor: 2 };
  const sortedTasks = [...tasks].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );

  const batches: SectionRefinementTask[][] = [];
  const used = new Set<string>();

  // Greedy coloring algorithm for non-adjacent batching
  for (const task of sortedTasks) {
    if (used.has(task.sectionId)) continue;

    // Find a batch that can accept this task
    let addedToExisting = false;
    for (const batch of batches) {
      if (batch.length >= maxConcurrent) continue;

      // Check adjacency constraint
      const sectionIdx = parseSectionIndex(task.sectionId);
      const canAdd = batch.every(t => {
        const otherIdx = parseSectionIndex(t.sectionId);
        return Math.abs(sectionIdx - otherIdx) > REFINEMENT_CONFIG.parallel.adjacentSectionGap;
      });

      if (canAdd) {
        batch.push(task);
        used.add(task.sectionId);
        addedToExisting = true;
        break;
      }
    }

    if (!addedToExisting) {
      batches.push([task]);
      used.add(task.sectionId);
    }
  }

  return batches;
}

/**
 * Parse section index from sectionId
 * Expected format: "sec_0", "sec_1", "sec_introduction", etc.
 *
 * Re-exports shared utility for backwards compatibility.
 * @see arbiter/section-utils.ts for implementation
 *
 * @param sectionId - Section identifier
 * @returns Numeric index for ordering
 */
export function parseSectionIndex(sectionId: string): number {
  return parseSectionIndexUtil(sectionId);
}
