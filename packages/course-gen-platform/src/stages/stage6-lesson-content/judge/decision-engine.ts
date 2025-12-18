/**
 * Score-based Decision Engine for Stage 6 Lesson Content
 * @module stages/stage6-lesson-content/judge/decision-engine
 *
 * Implements the decision tree from research:
 *
 * IF score >= 0.90:
 *   -> ACCEPT (or minor polish for high-value content)
 *
 * IF score 0.75-0.90:
 *   IF issues localized (<30% content affected):
 *     -> TARGETED FIX (1 iteration)
 *   ELSE:
 *     -> ITERATIVE REFINEMENT (2 iterations)
 *     IF improvement after iteration 2 < 3%:
 *       -> ACCEPT (diminishing returns)
 *
 * IF score 0.60-0.75:
 *   -> ITERATIVE REFINEMENT (2 iterations)
 *   IF score after iteration 2 < 0.80:
 *     -> REGENERATE with feedback-enhanced prompt
 *
 * IF score < 0.60:
 *   -> IMMEDIATE REGENERATE
 *   Use failure analysis to enhance generation prompt
 *
 * Reference:
 * - docs/research/010-stage6-generation-strategy/
 * - specs/010-stages-456-pipeline/data-model.md
 */

import type {
  JudgeVerdict,
  JudgeRecommendation,
  JudgeIssue,
  JudgeConfidence,
} from '@megacampus/shared-types';
import type { LessonContentBody } from '@megacampus/shared-types/lesson-content';
import { logger } from '@/shared/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Decision actions for the decision engine
 */
export enum DecisionAction {
  /** Content meets quality standards, proceed to publish */
  ACCEPT = 'ACCEPT',
  /** Content has localized issues, apply 1 targeted fix iteration */
  TARGETED_FIX = 'TARGETED_FIX',
  /** Content needs iterative refinement (2 iterations max) */
  ITERATIVE_REFINEMENT = 'ITERATIVE_REFINEMENT',
  /** Content has fundamental issues, regenerate with feedback */
  REGENERATE = 'REGENERATE',
  /** Content persistently fails quality checks, needs human review */
  ESCALATE_TO_HUMAN = 'ESCALATE_TO_HUMAN',
}

/**
 * Context for making a decision
 */
export interface DecisionContext {
  /** Overall quality score (0-1) */
  score: number;
  /** Judge confidence level */
  confidence: JudgeConfidence;
  /** List of identified issues */
  issues: JudgeIssue[];
  /** Current iteration count (0 = initial evaluation) */
  iterationCount: number;
  /** Scores from previous iterations (for trend analysis) */
  previousScores: number[];
  /** Percentage of content affected by issues (0-100) */
  contentAffectedPercentage: number;
  /** Total number of sections in content */
  totalSections?: number;
  /** Whether this is a high-value content (e.g., flagship course) */
  isHighValueContent?: boolean;
}

/**
 * Result of the decision engine
 */
export interface DecisionResult {
  /** Recommended action */
  action: DecisionAction;
  /** Human-readable reason for the decision */
  reason: string;
  /** Maximum iterations to perform (for refinement actions) */
  maxIterations: number;
  /** Target score to achieve */
  targetScore: number;
  /** Feedback to use for regeneration (if action is REGENERATE) */
  feedbackForRegeneration?: string;
  /** Detailed decision factors */
  factors: {
    scoreThreshold: string;
    issueAnalysis: string;
    confidenceLevel: string;
    iterationHistory: string;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Score thresholds for decision boundaries
 */
export const DECISION_THRESHOLDS = {
  /** Score >= 0.90: ACCEPT */
  ACCEPT: 0.90,
  /** Score 0.75-0.90: TARGETED_FIX or ITERATIVE_REFINEMENT */
  HIGH_QUALITY: 0.75,
  /** Score 0.60-0.75: ITERATIVE_REFINEMENT */
  MEDIUM_QUALITY: 0.60,
  /** Score < 0.60: IMMEDIATE REGENERATE */
  LOW_QUALITY: 0.60,
  /** Target score after refinement */
  REFINEMENT_TARGET: 0.80,
} as const;

/**
 * Content affected percentage threshold for localized issues
 */
export const LOCALIZED_ISSUE_THRESHOLD = 30; // 30%

/**
 * Minimum improvement threshold (diminishing returns check)
 */
export const MIN_IMPROVEMENT_THRESHOLD = 0.03; // 3%

/**
 * Maximum iterations before escalation
 */
export const MAX_ITERATIONS = 2;

// ============================================================================
// DECISION LOGIC
// ============================================================================

/**
 * Calculate the percentage of content affected by issues
 *
 * @param issues - List of judge issues
 * @param totalSections - Total number of sections in content
 * @returns Percentage of content affected (0-100)
 */
export function calculateContentAffectedPercentage(
  issues: JudgeIssue[],
  totalSections: number
): number {
  if (totalSections === 0) return 0;
  if (issues.length === 0) return 0;

  // Count unique sections affected
  const affectedSections = new Set<string>();
  const affectedLocations = new Set<string>();

  for (const issue of issues) {
    const location = issue.location.toLowerCase();

    // Check for section references
    const sectionMatch = location.match(/section\s*(\d+)/i);
    if (sectionMatch) {
      affectedSections.add(sectionMatch[1]);
    }

    // Check for intro/conclusion/exercises
    if (location.includes('intro')) {
      affectedLocations.add('intro');
    }
    if (location.includes('conclusion')) {
      affectedLocations.add('conclusion');
    }
    if (location.includes('exercise')) {
      affectedLocations.add('exercise');
    }
    if (location.includes('example')) {
      affectedLocations.add('example');
    }
  }

  // Calculate percentage based on affected areas
  // Sections count as primary content (70% weight)
  // Other locations count as secondary (30% weight)
  const sectionPercentage = (affectedSections.size / totalSections) * 70;
  const otherPercentage = Math.min(affectedLocations.size, 3) / 3 * 30; // Max 3 other locations

  return Math.min(100, sectionPercentage + otherPercentage);
}

/**
 * Check if issues are critical and require immediate attention
 *
 * @param issues - List of judge issues
 * @returns Whether any critical issues exist
 */
function hasCriticalIssues(issues: JudgeIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'critical');
}

/**
 * Count issues by severity
 *
 * @param issues - List of judge issues
 * @returns Count by severity level
 */
function countIssuesBySeverity(issues: JudgeIssue[]): {
  critical: number;
  major: number;
  minor: number;
} {
  return {
    critical: issues.filter((i) => i.severity === 'critical').length,
    major: issues.filter((i) => i.severity === 'major').length,
    minor: issues.filter((i) => i.severity === 'minor').length,
  };
}

/**
 * Check for diminishing returns in iteration history
 *
 * @param previousScores - Scores from previous iterations
 * @param currentScore - Current score
 * @returns Whether improvement is diminishing
 */
function isDiminishingReturns(
  previousScores: number[],
  currentScore: number
): boolean {
  if (previousScores.length === 0) return false;

  const lastScore = previousScores[previousScores.length - 1];
  const improvement = currentScore - lastScore;

  return improvement < MIN_IMPROVEMENT_THRESHOLD;
}

/**
 * Determine if we've exceeded maximum iterations
 *
 * @param iterationCount - Current iteration count
 * @returns Whether max iterations exceeded
 */
function isMaxIterationsExceeded(iterationCount: number): boolean {
  return iterationCount >= MAX_ITERATIONS;
}

// ============================================================================
// MAIN DECISION FUNCTION
// ============================================================================

/**
 * Make a decision based on the evaluation context
 *
 * Implements the research-backed decision tree:
 * - score >= 0.90: ACCEPT
 * - score 0.75-0.90 with localized issues (<30%): TARGETED_FIX
 * - score 0.75-0.90 with widespread issues: ITERATIVE_REFINEMENT
 * - score 0.60-0.75: ITERATIVE_REFINEMENT
 * - score < 0.60: REGENERATE
 *
 * Additional factors:
 * - Low confidence: ESCALATE_TO_HUMAN
 * - Max iterations exceeded: ESCALATE_TO_HUMAN or ACCEPT (diminishing returns)
 * - Critical issues: Increase severity
 *
 * @param context - Decision context with score, issues, and history
 * @returns DecisionResult with action and reasoning
 */
export function makeDecision(context: DecisionContext): DecisionResult {
  const {
    score,
    confidence,
    issues,
    iterationCount,
    previousScores,
    contentAffectedPercentage,
    // isHighValueContent reserved for future premium content handling
  } = context;

  const issueCounts = countIssuesBySeverity(issues);

  // Log decision inputs
  logger.debug({
    msg: 'Making decision',
    score,
    confidence,
    issueCount: issues.length,
    issueCounts,
    iterationCount,
    contentAffectedPercentage,
    previousScores,
  });

  // =========================================================================
  // LOW CONFIDENCE CHECK
  // =========================================================================

  if (confidence === 'low') {
    logger.info({
      msg: 'Low confidence detected, escalating to human',
      score,
      issueCount: issues.length,
    });

    return {
      action: DecisionAction.ESCALATE_TO_HUMAN,
      reason: 'Judge confidence is low, manual review required for reliable assessment',
      maxIterations: 0,
      targetScore: DECISION_THRESHOLDS.REFINEMENT_TARGET,
      factors: {
        scoreThreshold: `Score: ${(score * 100).toFixed(1)}%`,
        issueAnalysis: `${issues.length} issues identified`,
        confidenceLevel: 'LOW - requires human validation',
        iterationHistory: `${iterationCount} iterations completed`,
      },
    };
  }

  // =========================================================================
  // MAX ITERATIONS CHECK
  // =========================================================================

  if (isMaxIterationsExceeded(iterationCount)) {
    // Check for diminishing returns
    if (isDiminishingReturns(previousScores, score)) {
      logger.info({
        msg: 'Max iterations with diminishing returns, accepting current state',
        score,
        iterationCount,
      });

      return {
        action: DecisionAction.ACCEPT,
        reason: 'Max iterations reached with diminishing returns, accepting current quality level',
        maxIterations: 0,
        targetScore: score,
        factors: {
          scoreThreshold: `Score: ${(score * 100).toFixed(1)}%`,
          issueAnalysis: `${issues.length} issues remaining`,
          confidenceLevel: confidence.toUpperCase(),
          iterationHistory: `${iterationCount} iterations, improvement stalled`,
        },
      };
    }

    // Score still below target after max iterations
    if (score < DECISION_THRESHOLDS.REFINEMENT_TARGET) {
      logger.info({
        msg: 'Max iterations reached but quality still low, recommending regeneration',
        score,
        iterationCount,
      });

      return {
        action: DecisionAction.REGENERATE,
        reason: `Quality (${(score * 100).toFixed(1)}%) still below target (${(DECISION_THRESHOLDS.REFINEMENT_TARGET * 100).toFixed(0)}%) after ${iterationCount} iterations`,
        maxIterations: 0,
        targetScore: DECISION_THRESHOLDS.REFINEMENT_TARGET,
        feedbackForRegeneration: buildRegenerationFeedback(issues, score),
        factors: {
          scoreThreshold: `Score: ${(score * 100).toFixed(1)}% < ${(DECISION_THRESHOLDS.REFINEMENT_TARGET * 100).toFixed(0)}% target`,
          issueAnalysis: buildIssueAnalysisSummary(issues),
          confidenceLevel: confidence.toUpperCase(),
          iterationHistory: `${iterationCount} iterations exhausted`,
        },
      };
    }

    // Accept if score is reasonable after max iterations
    return {
      action: DecisionAction.ACCEPT,
      reason: `Max iterations reached, quality (${(score * 100).toFixed(1)}%) acceptable`,
      maxIterations: 0,
      targetScore: score,
      factors: {
        scoreThreshold: `Score: ${(score * 100).toFixed(1)}%`,
        issueAnalysis: `${issues.length} issues remaining`,
        confidenceLevel: confidence.toUpperCase(),
        iterationHistory: `${iterationCount} iterations completed`,
      },
    };
  }

  // =========================================================================
  // SCORE-BASED DECISION TREE
  // =========================================================================

  // EXCELLENT QUALITY (>= 0.90) -> ACCEPT
  if (score >= DECISION_THRESHOLDS.ACCEPT) {
    logger.info({
      msg: 'Excellent quality, accepting content',
      score,
      issueCount: issues.length,
    });

    return {
      action: DecisionAction.ACCEPT,
      reason: `Quality score (${(score * 100).toFixed(1)}%) meets acceptance threshold (${(DECISION_THRESHOLDS.ACCEPT * 100).toFixed(0)}%)`,
      maxIterations: 0,
      targetScore: score,
      factors: {
        scoreThreshold: `Score: ${(score * 100).toFixed(1)}% >= ${(DECISION_THRESHOLDS.ACCEPT * 100).toFixed(0)}%`,
        issueAnalysis: issues.length > 0 ? `${issues.length} minor issues (not blocking)` : 'No issues found',
        confidenceLevel: confidence.toUpperCase(),
        iterationHistory: `${iterationCount} iterations completed`,
      },
    };
  }

  // HIGH QUALITY (0.75-0.90) -> TARGETED_FIX or ITERATIVE_REFINEMENT
  if (score >= DECISION_THRESHOLDS.HIGH_QUALITY) {
    // Check for critical issues that require full refinement
    if (hasCriticalIssues(issues)) {
      logger.info({
        msg: 'High quality but has critical issues, recommending iterative refinement',
        score,
        criticalIssues: issueCounts.critical,
      });

      return {
        action: DecisionAction.ITERATIVE_REFINEMENT,
        reason: `Quality (${(score * 100).toFixed(1)}%) is high but ${issueCounts.critical} critical issues require iterative refinement`,
        maxIterations: MAX_ITERATIONS - iterationCount,
        targetScore: DECISION_THRESHOLDS.ACCEPT,
        factors: {
          scoreThreshold: `Score: ${(score * 100).toFixed(1)}% in high quality range (75-90%)`,
          issueAnalysis: `CRITICAL: ${issueCounts.critical}, Major: ${issueCounts.major}, Minor: ${issueCounts.minor}`,
          confidenceLevel: confidence.toUpperCase(),
          iterationHistory: `${iterationCount} iterations, ${MAX_ITERATIONS - iterationCount} remaining`,
        },
      };
    }

    // Check if issues are localized (<30% content affected)
    if (contentAffectedPercentage < LOCALIZED_ISSUE_THRESHOLD) {
      logger.info({
        msg: 'High quality with localized issues, recommending targeted fix',
        score,
        contentAffected: contentAffectedPercentage,
      });

      return {
        action: DecisionAction.TARGETED_FIX,
        reason: `Quality (${(score * 100).toFixed(1)}%) with localized issues (${contentAffectedPercentage.toFixed(0)}% affected), 1 targeted fix iteration recommended`,
        maxIterations: 1,
        targetScore: DECISION_THRESHOLDS.ACCEPT,
        factors: {
          scoreThreshold: `Score: ${(score * 100).toFixed(1)}% in high quality range (75-90%)`,
          issueAnalysis: `${contentAffectedPercentage.toFixed(0)}% content affected (< ${LOCALIZED_ISSUE_THRESHOLD}% threshold)`,
          confidenceLevel: confidence.toUpperCase(),
          iterationHistory: `${iterationCount} iterations completed`,
        },
      };
    }

    // Widespread issues -> iterative refinement
    logger.info({
      msg: 'High quality with widespread issues, recommending iterative refinement',
      score,
      contentAffected: contentAffectedPercentage,
    });

    return {
      action: DecisionAction.ITERATIVE_REFINEMENT,
      reason: `Quality (${(score * 100).toFixed(1)}%) with widespread issues (${contentAffectedPercentage.toFixed(0)}% affected), iterative refinement recommended`,
      maxIterations: MAX_ITERATIONS - iterationCount,
      targetScore: DECISION_THRESHOLDS.ACCEPT,
      factors: {
        scoreThreshold: `Score: ${(score * 100).toFixed(1)}% in high quality range (75-90%)`,
        issueAnalysis: `${contentAffectedPercentage.toFixed(0)}% content affected (>= ${LOCALIZED_ISSUE_THRESHOLD}% threshold)`,
        confidenceLevel: confidence.toUpperCase(),
        iterationHistory: `${iterationCount} iterations, ${MAX_ITERATIONS - iterationCount} remaining`,
      },
    };
  }

  // MEDIUM QUALITY (0.60-0.75) -> ITERATIVE_REFINEMENT
  if (score >= DECISION_THRESHOLDS.MEDIUM_QUALITY) {
    logger.info({
      msg: 'Medium quality, recommending iterative refinement',
      score,
      issueCount: issues.length,
    });

    return {
      action: DecisionAction.ITERATIVE_REFINEMENT,
      reason: `Quality (${(score * 100).toFixed(1)}%) requires iterative refinement to reach target (${(DECISION_THRESHOLDS.REFINEMENT_TARGET * 100).toFixed(0)}%)`,
      maxIterations: MAX_ITERATIONS - iterationCount,
      targetScore: DECISION_THRESHOLDS.REFINEMENT_TARGET,
      factors: {
        scoreThreshold: `Score: ${(score * 100).toFixed(1)}% in medium quality range (60-75%)`,
        issueAnalysis: buildIssueAnalysisSummary(issues),
        confidenceLevel: confidence.toUpperCase(),
        iterationHistory: `${iterationCount} iterations, ${MAX_ITERATIONS - iterationCount} remaining`,
      },
    };
  }

  // LOW QUALITY (< 0.60) -> IMMEDIATE REGENERATE
  logger.info({
    msg: 'Low quality, recommending immediate regeneration',
    score,
    issueCount: issues.length,
  });

  return {
    action: DecisionAction.REGENERATE,
    reason: `Quality (${(score * 100).toFixed(1)}%) below minimum threshold (${(DECISION_THRESHOLDS.LOW_QUALITY * 100).toFixed(0)}%), regeneration required`,
    maxIterations: 0,
    targetScore: DECISION_THRESHOLDS.REFINEMENT_TARGET,
    feedbackForRegeneration: buildRegenerationFeedback(issues, score),
    factors: {
      scoreThreshold: `Score: ${(score * 100).toFixed(1)}% < ${(DECISION_THRESHOLDS.LOW_QUALITY * 100).toFixed(0)}% minimum`,
      issueAnalysis: buildIssueAnalysisSummary(issues),
      confidenceLevel: confidence.toUpperCase(),
      iterationHistory: `${iterationCount} iterations (regeneration recommended)`,
    },
  };
}

// ============================================================================
// FEEDBACK GENERATION
// ============================================================================

/**
 * Build a summary of issue analysis
 *
 * @param issues - List of judge issues
 * @returns Human-readable summary
 */
function buildIssueAnalysisSummary(issues: JudgeIssue[]): string {
  const counts = countIssuesBySeverity(issues);
  const parts: string[] = [];

  if (counts.critical > 0) parts.push(`${counts.critical} critical`);
  if (counts.major > 0) parts.push(`${counts.major} major`);
  if (counts.minor > 0) parts.push(`${counts.minor} minor`);

  if (parts.length === 0) return 'No issues identified';
  return `${parts.join(', ')} issues found`;
}

/**
 * Build feedback for regeneration prompt enhancement
 *
 * Extracts key failure points from verdict to guide regeneration.
 *
 * @param issues - Judge verdict with issues
 * @param score - Overall quality score
 * @returns Formatted feedback string for regeneration prompt
 */
export function buildRegenerationFeedback(
  issues: JudgeIssue[],
  score: number
): string {
  // Group issues by criterion
  const issuesByCriterion = new Map<string, JudgeIssue[]>();
  for (const issue of issues) {
    const existing = issuesByCriterion.get(issue.criterion) || [];
    existing.push(issue);
    issuesByCriterion.set(issue.criterion, existing);
  }

  // Build feedback sections
  const sections: string[] = [];

  sections.push(`## Previous Generation Quality: ${(score * 100).toFixed(1)}%`);
  sections.push('');
  sections.push('## Key Issues to Address in Regeneration:');

  // Sort criteria by issue severity (critical first)
  const sortedCriteria = Array.from(issuesByCriterion.entries()).sort((a, b) => {
    const aHasCritical = a[1].some((i) => i.severity === 'critical');
    const bHasCritical = b[1].some((i) => i.severity === 'critical');
    if (aHasCritical && !bHasCritical) return -1;
    if (!aHasCritical && bHasCritical) return 1;
    return b[1].length - a[1].length;
  });

  for (const [criterion, criterionIssues] of sortedCriteria) {
    sections.push('');
    sections.push(`### ${criterion.replace(/_/g, ' ').toUpperCase()}`);

    for (const issue of criterionIssues) {
      sections.push(`- [${issue.severity.toUpperCase()}] ${issue.description}`);
      sections.push(`  Fix: ${issue.suggestedFix}`);
    }
  }

  sections.push('');
  sections.push('## Regeneration Guidelines:');
  sections.push('1. Focus on addressing the critical and major issues above');
  sections.push('2. Ensure all learning objectives are properly addressed');
  sections.push('3. Maintain consistent terminology and style');
  sections.push('4. Include sufficient examples and exercises');

  return sections.join('\n');
}

/**
 * Map DecisionAction to JudgeRecommendation
 *
 * Provides compatibility with existing JudgeRecommendation enum.
 *
 * @param action - Decision action
 * @returns Corresponding JudgeRecommendation
 */
export function actionToRecommendation(action: DecisionAction): JudgeRecommendation {
  const mapping: Record<DecisionAction, JudgeRecommendation> = {
    [DecisionAction.ACCEPT]: 'ACCEPT',
    [DecisionAction.TARGETED_FIX]: 'ACCEPT_WITH_MINOR_REVISION',
    [DecisionAction.ITERATIVE_REFINEMENT]: 'ITERATIVE_REFINEMENT',
    [DecisionAction.REGENERATE]: 'REGENERATE',
    [DecisionAction.ESCALATE_TO_HUMAN]: 'ESCALATE_TO_HUMAN',
  };

  return mapping[action];
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick decision function for simple cases
 *
 * Creates a DecisionContext from a JudgeVerdict and content,
 * then makes a decision.
 *
 * @param verdict - Judge verdict
 * @param content - Lesson content body
 * @param iterationCount - Current iteration count
 * @param previousScores - Optional previous scores
 * @returns Decision result
 */
export function makeDecisionFromVerdict(
  verdict: JudgeVerdict,
  content: LessonContentBody,
  iterationCount: number = 0,
  previousScores: number[] = []
): DecisionResult {
  const context: DecisionContext = {
    score: verdict.overallScore,
    confidence: verdict.confidence,
    issues: verdict.issues,
    iterationCount,
    previousScores,
    contentAffectedPercentage: calculateContentAffectedPercentage(
      verdict.issues,
      content.sections.length
    ),
    totalSections: content.sections.length,
  };

  return makeDecision(context);
}
