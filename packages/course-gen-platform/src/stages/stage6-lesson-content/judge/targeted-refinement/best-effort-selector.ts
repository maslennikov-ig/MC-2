/**
 * Best-Effort Selector for Targeted Refinement
 * @module stages/stage6-lesson-content/judge/targeted-refinement/best-effort-selector
 *
 * Handles full-auto mode fallback when max iterations reached.
 * Selects the best iteration from history and generates improvement hints.
 *
 * Functions:
 * 1. selectBestIteration() - finds highest-scoring iteration from history
 * 2. generateImprovementHints() - extracts hints from unresolved issues
 * 3. determineQualityStatus() - maps score to quality status
 *
 * Reference:
 * - specs/018-judge-targeted-refinement/data-model.md
 * - specs/018-judge-targeted-refinement/research.md
 */

import type {
  BestEffortSelectorInput,
  BestEffortSelectorOutput,
  BestEffortResult,
  QualityStatus,
  RefinementStatus,
  JudgeIssue,
  IterationResult,
  OperationMode,
} from '@megacampus/shared-types';
import { REFINEMENT_CONFIG } from '@megacampus/shared-types';

// ============================================================================
// MAIN SELECTOR FUNCTION
// ============================================================================

/**
 * Select the best iteration when max iterations reached
 *
 * Process:
 * 1. Find iteration with highest score from history
 * 2. Determine quality status based on score and mode thresholds
 * 3. Determine final refinement status
 * 4. Generate improvement hints from unresolved issues
 * 5. Return BestEffortSelectorOutput with selected result
 *
 * @param input - BestEffortSelectorInput with iteration history, unresolved issues, operation mode
 * @returns BestEffortSelectorOutput with best result, selection reason, final status
 */
export function selectBestIteration(input: BestEffortSelectorInput): BestEffortSelectorOutput {
  const { iterationHistory, unresolvedIssues, operationMode } = input;

  // Find iteration with highest score
  const bestIteration = findBestIteration(iterationHistory);

  if (!bestIteration) {
    throw new Error('Cannot select best iteration: iteration history is empty. This indicates a bug in the refinement loop - at least iteration 0 should exist.');
  }

  const { iteration, index } = bestIteration;

  // Determine quality status based on score and operation mode
  const qualityStatus = determineQualityStatus(iteration.score, operationMode);

  // Determine final refinement status
  const finalStatus = determineFinalStatus(qualityStatus, operationMode);

  // Generate improvement hints from unresolved issues
  const improvementHints = generateImprovementHints(unresolvedIssues, 5);

  // Build best effort result
  const bestResult: BestEffortResult = {
    content: iteration.content,
    bestScore: iteration.score,
    qualityStatus,
    unresolvedIssues,
    improvementHints,
  };

  // Build selection reason
  const selectionReason = buildSelectionReason(
    index,
    iteration.score,
    qualityStatus,
    operationMode,
    iterationHistory.length
  );

  return {
    bestResult,
    selectedIteration: index,
    selectionReason,
    finalStatus,
  };
}

// ============================================================================
// ITERATION SELECTION
// ============================================================================

/**
 * Find the iteration with the highest score
 *
 * @param history - Array of IterationResults
 * @returns Best iteration with its index, or null if history is empty
 */
function findBestIteration(
  history: IterationResult[]
): { iteration: IterationResult; index: number } | null {
  if (history.length === 0) {
    return null;
  }

  let bestIteration = history[0];
  let bestIndex = 0;

  for (let i = 1; i < history.length; i++) {
    if (history[i].score > bestIteration.score) {
      bestIteration = history[i];
      bestIndex = i;
    }
  }

  return { iteration: bestIteration, index: bestIndex };
}

// ============================================================================
// QUALITY STATUS DETERMINATION
// ============================================================================

/**
 * Determine quality status based on score and operation mode thresholds
 *
 * Uses thresholds from REFINEMENT_CONFIG.modes[operationMode]:
 * - score >= acceptThreshold → 'good'
 * - score >= goodEnoughThreshold → 'acceptable'
 * - else → 'below_standard'
 *
 * @param score - Overall quality score (0-1)
 * @param operationMode - Operation mode ('semi-auto' | 'full-auto')
 * @returns QualityStatus ('good' | 'acceptable' | 'below_standard')
 */
export function determineQualityStatus(score: number, operationMode: OperationMode): QualityStatus {
  const modeConfig = REFINEMENT_CONFIG.modes[operationMode];

  if (score >= modeConfig.acceptThreshold) {
    return 'good';
  }

  if (score >= modeConfig.goodEnoughThreshold) {
    return 'acceptable';
  }

  return 'below_standard';
}

// ============================================================================
// REFINEMENT STATUS DETERMINATION
// ============================================================================

/**
 * Determine final refinement status based on quality status and operation mode
 *
 * Decision matrix:
 * - 'good' → 'accepted'
 * - 'acceptable' → 'accepted_warning'
 * - 'below_standard' + full-auto → 'best_effort'
 * - 'below_standard' + semi-auto → 'escalated'
 *
 * @param qualityStatus - Quality status from determineQualityStatus()
 * @param operationMode - Operation mode ('semi-auto' | 'full-auto')
 * @returns RefinementStatus
 */
function determineFinalStatus(
  qualityStatus: QualityStatus,
  operationMode: OperationMode
): RefinementStatus {
  if (qualityStatus === 'good') {
    return 'accepted';
  }

  if (qualityStatus === 'acceptable') {
    return 'accepted_warning';
  }

  // below_standard
  if (operationMode === 'full-auto') {
    return 'best_effort';
  }

  return 'escalated';
}

// ============================================================================
// IMPROVEMENT HINTS GENERATION
// ============================================================================

/**
 * Generate improvement hints from unresolved issues
 *
 * Process:
 * 1. Group issues by criterion
 * 2. Sort by severity (critical > major > minor)
 * 3. Take top N issues
 * 4. Format as actionable hints
 *
 * @param unresolvedIssues - List of unresolved JudgeIssues
 * @param maxHints - Maximum number of hints to generate (default: 5)
 * @returns Array of improvement hint strings
 */
export function generateImprovementHints(
  unresolvedIssues: JudgeIssue[],
  maxHints: number = 5
): string[] {
  if (unresolvedIssues.length === 0) {
    return [];
  }

  // Sort issues by severity (critical > major > minor)
  const sortedIssues = [...unresolvedIssues].sort((a, b) => {
    const severityRank = { critical: 3, major: 2, minor: 1 };
    return severityRank[b.severity] - severityRank[a.severity];
  });

  // Take top N issues
  const topIssues = sortedIssues.slice(0, maxHints);

  // Format as actionable hints
  return topIssues.map((issue) => {
    const criterion = issue.criterion.replace(/_/g, ' ');
    const fix = issue.suggestedFix || issue.description;

    return `Improve ${criterion}: ${fix}`;
  });
}

// ============================================================================
// SELECTION REASON BUILDER
// ============================================================================

/**
 * Build a human-readable selection reason
 *
 * @param iterationIndex - Index of selected iteration
 * @param score - Score of selected iteration
 * @param qualityStatus - Quality status
 * @param operationMode - Operation mode
 * @param totalIterations - Total number of iterations attempted
 * @returns Selection reason string
 */
function buildSelectionReason(
  iterationIndex: number,
  score: number,
  qualityStatus: QualityStatus,
  operationMode: OperationMode,
  totalIterations: number
): string {
  const scorePercent = (score * 100).toFixed(1);
  const iterationLabel = iterationIndex === 0 ? 'initial' : `iteration ${iterationIndex}`;

  let reason = `Selected ${iterationLabel} content with score ${scorePercent}% (quality: ${qualityStatus})`;

  if (totalIterations > 1) {
    reason += ` after ${totalIterations} refinement attempts`;
  }

  if (operationMode === 'full-auto') {
    if (qualityStatus === 'below_standard') {
      reason += '. Note: Quality is below standard but this is the best available result.';
    } else if (qualityStatus === 'acceptable') {
      reason += '. Quality is acceptable with minor issues.';
    }
  } else {
    // semi-auto
    if (qualityStatus === 'below_standard') {
      reason += '. Manual review recommended due to below-standard quality.';
    }
  }

  return reason;
}
