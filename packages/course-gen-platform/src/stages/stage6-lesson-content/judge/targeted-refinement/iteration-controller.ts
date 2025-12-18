/**
 * Iteration Controller for Targeted Refinement
 * @module stages/stage6-lesson-content/judge/targeted-refinement/iteration-controller
 *
 * Controls refinement iteration flow by deciding when to continue or stop based on:
 * - Score thresholds (mode-specific accept/goodEnough thresholds)
 * - Hard limits (max iterations, token budget, timeout)
 * - Convergence detection (score plateau detection)
 * - Section locks (oscillation prevention after max edits)
 *
 * Based on:
 * - specs/018-judge-targeted-refinement/spec.md (FR-021 to FR-028)
 * - @megacampus/shared-types/judge-types.ts (REFINEMENT_CONFIG)
 */

import type {
  IterationControllerInput,
  IterationControllerOutput,
} from '@megacampus/shared-types';
import { REFINEMENT_CONFIG } from '@megacampus/shared-types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Stopping reason categories
 */
export type StoppingReason =
  | 'continue_more_tasks'
  | 'stop_score_threshold_met'
  | 'stop_max_iterations'
  | 'stop_token_budget'
  | 'stop_timeout'
  | 'stop_converged'
  | 'stop_all_sections_locked';

// ============================================================================
// ITERATION CONTROL
// ============================================================================

/**
 * Decide whether to continue or stop refinement iteration
 *
 * Stopping conditions (in priority order):
 * 1. Score threshold met - latestScore >= acceptThreshold for mode
 * 2. Max iterations reached - iteration >= maxIterations (3)
 * 3. Token budget exhausted - tokensUsed >= maxTokens (15000)
 * 4. Timeout reached - elapsed time >= timeoutMs (5 minutes)
 * 5. Convergence detected - score plateau for 3+ iterations (delta < 0.02)
 * 6. All sections locked - all sections locked after 2 edits each
 *
 * Continue condition:
 * - None of the above, remainingTaskCount > 0
 *
 * @param input - Current iteration state and latest evaluation result
 * @returns Decision on whether to continue, reason, newly locked sections, remaining task count
 *
 * @example
 * ```ts
 * const decision = shouldContinueIteration({
 *   currentState: {
 *     iteration: 1,
 *     scoreHistory: [0.72, 0.78],
 *     contentHistory: [iter0Result, iter1Result],
 *     lockedSections: ['sec_intro'],
 *     sectionEditCount: { sec_intro: 2, sec_body: 1 },
 *     qualityLocks: { clarity_readability: 0.85 },
 *     tokensUsed: 3500,
 *     startTime: Date.now() - 60000,
 *   },
 *   latestScore: 0.78,
 *   operationMode: 'full-auto',
 * });
 * // Returns: { shouldContinue: true, reason: 'continue_more_tasks', ... }
 * ```
 */
export function shouldContinueIteration(
  input: IterationControllerInput,
): IterationControllerOutput {
  const { currentState, latestScore, operationMode } = input;
  const {
    iteration,
    scoreHistory,
    lockedSections,
    sectionEditCount,
    tokensUsed,
    startTime,
  } = currentState;

  // Get mode-specific thresholds
  const modeConfig = REFINEMENT_CONFIG.modes[operationMode];
  const acceptThreshold = modeConfig.acceptThreshold;

  // Get hard limits
  const { maxIterations, maxTokens, timeoutMs } = REFINEMENT_CONFIG.limits;
  const { sectionLockAfterEdits, convergenceThreshold } = REFINEMENT_CONFIG.quality;

  // Calculate elapsed time
  const elapsedMs = Date.now() - startTime;

  // 1. Check if score threshold met
  if (latestScore >= acceptThreshold) {
    return {
      shouldContinue: false,
      reason: 'stop_score_threshold_met',
      newlyLockedSections: [],
      remainingTaskCount: 0,
    };
  }

  // 2. Check if max iterations reached
  if (iteration >= maxIterations) {
    return {
      shouldContinue: false,
      reason: 'stop_max_iterations',
      newlyLockedSections: [],
      remainingTaskCount: 0,
    };
  }

  // 3. Check if token budget exhausted
  if (tokensUsed >= maxTokens) {
    return {
      shouldContinue: false,
      reason: 'stop_token_budget',
      newlyLockedSections: [],
      remainingTaskCount: 0,
    };
  }

  // 4. Check if timeout reached
  if (elapsedMs >= timeoutMs) {
    return {
      shouldContinue: false,
      reason: 'stop_timeout',
      newlyLockedSections: [],
      remainingTaskCount: 0,
    };
  }

  // 5. Check for convergence (score plateau)
  const isConverged = detectConvergence(scoreHistory, convergenceThreshold);
  if (isConverged) {
    return {
      shouldContinue: false,
      reason: 'stop_converged',
      newlyLockedSections: [],
      remainingTaskCount: 0,
    };
  }

  // 6. Update section locks based on edit count
  const newlyLockedSections = updateSectionLocks(sectionEditCount, sectionLockAfterEdits);

  // Convert lockedSections array to Set for easier checking
  const allLockedSections = new Set([...lockedSections, ...newlyLockedSections]);

  // 7. Calculate remaining tasks (sections not locked)
  // In a real implementation, this would filter pending tasks by checking if their
  // targetSectionId is in allLockedSections. For now, we estimate based on edit counts.
  const totalSections = Object.keys(sectionEditCount).length;
  const remainingTaskCount = totalSections - allLockedSections.size;

  // 8. Check if all sections locked
  if (remainingTaskCount === 0 && allLockedSections.size > 0) {
    return {
      shouldContinue: false,
      reason: 'stop_all_sections_locked',
      newlyLockedSections,
      remainingTaskCount: 0,
    };
  }

  // 9. Continue iteration if there are remaining tasks
  return {
    shouldContinue: true,
    reason: 'continue_more_tasks',
    newlyLockedSections,
    remainingTaskCount,
  };
}

/**
 * Update section locks based on edit count
 *
 * Locks sections that have been edited >= maxEdits times to prevent oscillation.
 * This implements the oscillation prevention mechanism described in the spec (FR-023).
 *
 * @param sectionEditCount - Map of section IDs to edit counts
 * @param maxEdits - Maximum edits before locking (default: 2 from REFINEMENT_CONFIG)
 * @returns Array of section IDs that should be newly locked
 *
 * @example
 * ```ts
 * const newlyLocked = updateSectionLocks(
 *   { sec_intro: 2, sec_body: 1, sec_conclusion: 3 },
 *   2
 * );
 * // Returns: ['sec_intro', 'sec_conclusion']
 * ```
 */
export function updateSectionLocks(
  sectionEditCount: Record<string, number>,
  maxEdits: number,
): string[] {
  const lockedSections: string[] = [];

  for (const [sectionId, editCount] of Object.entries(sectionEditCount)) {
    if (editCount >= maxEdits) {
      lockedSections.push(sectionId);
    }
  }

  return lockedSections;
}

/**
 * Detect convergence (score plateau)
 *
 * Returns true if the last 3+ scores show improvement delta < threshold,
 * indicating that further iterations are unlikely to improve quality.
 * This implements the convergence detection mechanism described in the spec (FR-022).
 *
 * Algorithm:
 * 1. Requires at least 3 score data points
 * 2. Calculates delta between consecutive scores
 * 3. If all deltas in last 3 scores < threshold, convergence detected
 *
 * @param scoreHistory - Array of scores from all iterations (oldest to newest)
 * @param threshold - Convergence threshold (default: 0.02 = 2% improvement)
 * @returns True if convergence detected, false otherwise
 *
 * @example
 * ```ts
 * // No convergence - steady improvement
 * detectConvergence([0.70, 0.75, 0.80], 0.02); // false
 *
 * // Convergence detected - plateau
 * detectConvergence([0.70, 0.78, 0.79, 0.79], 0.02); // true
 *
 * // Not enough data
 * detectConvergence([0.70, 0.75], 0.02); // false
 * ```
 */
export function detectConvergence(
  scoreHistory: number[],
  threshold: number,
): boolean {
  // Need at least 3 data points to detect plateau
  if (scoreHistory.length < 3) {
    return false;
  }

  // Get last 3 scores
  const recentScores = scoreHistory.slice(-3);

  // Calculate deltas between consecutive scores
  const deltas: number[] = [];
  for (let i = 1; i < recentScores.length; i++) {
    const delta = Math.abs(recentScores[i] - recentScores[i - 1]);
    deltas.push(delta);
  }

  // Check if average delta is below threshold (less strict than requiring all deltas)
  const avgDelta = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
  return avgDelta < threshold;
}
