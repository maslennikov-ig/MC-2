/**
 * Conflict resolution using PRIORITY_HIERARCHY
 * @module stages/stage6-lesson-content/judge/arbiter/conflict-resolver
 *
 * Resolves conflicts between judges using:
 * 1. Agreement-based filtering (high/moderate/low)
 * 2. Priority hierarchy (factual_accuracy > learning_objective_alignment > ...)
 * 3. Judge consensus (2+ judges required for moderate agreement)
 *
 * Reference:
 * - specs/018-judge-targeted-refinement/data-model.md
 * - packages/shared-types/src/judge-types.ts (PRIORITY_HIERARCHY)
 */

import type {
  JudgeIssue,
  ConflictResolution,
  IssueSeverity,
} from '@megacampus/shared-types';
import { PRIORITY_HIERARCHY, REFINEMENT_CONFIG } from '@megacampus/shared-types';
import type { AgreementLevel } from './krippendorff';
import { normalizeLocation } from './section-utils';

/**
 * Minimum number of judges required to reach consensus on an issue
 */
const MIN_JUDGES_FOR_CONSENSUS = 2;

/**
 * Result of conflict resolution
 */
export interface ConflictResolutionResult {
  /** Issues accepted after filtering and conflict resolution */
  accepted: JudgeIssue[];
  /** Issues rejected (low agreement, non-critical) */
  rejected: JudgeIssue[];
  /** Log of conflict resolutions */
  log: ConflictResolution[];
}

/**
 * Filter issues based on agreement level
 *
 * Agreement-based filtering rules:
 * - High agreement (α >= 0.80): Accept ALL issues
 * - Moderate agreement (0.67 <= α < 0.80): Accept issues with 2+ judge agreement
 * - Low agreement (α < 0.67): Accept only CRITICAL severity issues
 *
 * @param issues - All issues from all judges
 * @param agreementLevel - Agreement level from Krippendorff's Alpha
 * @param verdictCount - Number of verdicts (judges)
 * @returns Filtered issues (accepted and rejected)
 */
export function filterByAgreement(
  issues: JudgeIssue[],
  agreementLevel: AgreementLevel,
  verdictCount: number
): { accepted: JudgeIssue[]; rejected: JudgeIssue[] } {
  const accepted: JudgeIssue[] = [];
  const rejected: JudgeIssue[] = [];

  // High agreement: accept all issues
  if (agreementLevel === 'high') {
    return { accepted: [...issues], rejected: [] };
  }

  // Count occurrences of similar issues across judges
  // Issues are "similar" if they have same criterion and location
  const issueGroups = groupSimilarIssues(issues);

  for (const group of issueGroups) {
    const judgeCount = group.length;
    const representative = group[0]; // Use first issue as representative

    if (agreementLevel === 'moderate') {
      // Moderate agreement: accept if 2+ judges agree
      if (judgeCount >= MIN_JUDGES_FOR_CONSENSUS || verdictCount < MIN_JUDGES_FOR_CONSENSUS) {
        // If only 1 judge total, accept all issues
        accepted.push(representative);
      } else {
        rejected.push(representative);
      }
    } else {
      // Low agreement: accept only CRITICAL issues
      if (representative.severity === 'critical') {
        accepted.push(representative);
      } else {
        rejected.push(representative);
      }
    }
  }

  return { accepted, rejected };
}

/**
 * Group similar issues across judges
 *
 * Issues are considered similar if they have:
 * - Same criterion
 * - Similar location (normalized)
 *
 * Returns groups where each group contains issues about the same problem.
 */
function groupSimilarIssues(issues: JudgeIssue[]): JudgeIssue[][] {
  const groups: JudgeIssue[][] = [];

  for (const issue of issues) {
    // Find matching group
    let foundGroup = false;
    for (const group of groups) {
      if (issuesSimilar(issue, group[0])) {
        group.push(issue);
        foundGroup = true;
        break;
      }
    }

    // Create new group if no match
    if (!foundGroup) {
      groups.push([issue]);
    }
  }

  return groups;
}

/**
 * Check if two issues are similar
 */
function issuesSimilar(a: JudgeIssue, b: JudgeIssue): boolean {
  // Same criterion
  if (a.criterion !== b.criterion) {
    return false;
  }

  // Similar location (normalized)
  const locA = normalizeLocation(a.location);
  const locB = normalizeLocation(b.location);

  return locA === locB;
}


/**
 * Resolve conflicts between judges using PRIORITY_HIERARCHY
 *
 * When two judges disagree on the same section, the issue with
 * higher priority criterion wins (factual_accuracy > learning_objective_alignment > ...)
 *
 * Process:
 * 1. Filter issues by agreement level
 * 2. Group issues by section
 * 3. For each section with multiple issues, resolve conflicts
 * 4. Log all conflict resolutions
 *
 * @param issues - All issues from all judges
 * @param agreementScore - Krippendorff's Alpha score
 * @returns Conflict resolution result with accepted/rejected/log
 */
export function resolveConflicts(
  issues: JudgeIssue[],
  agreementScore: number
): ConflictResolutionResult {
  // Determine agreement level
  const agreementLevel = interpretAgreementLevel(agreementScore);

  // Estimate verdict count from unique issue patterns
  // In practice, this would come from the clevResult
  const verdictCount = estimateVerdictCount(issues);

  // Filter by agreement level first
  const { accepted: filteredIssues, rejected: rejectedByAgreement } = filterByAgreement(
    issues,
    agreementLevel,
    verdictCount
  );

  // Group issues by section for conflict resolution
  const sectionGroups = groupIssuesBySection(filteredIssues);

  const finalAccepted: JudgeIssue[] = [];
  const finalRejected: JudgeIssue[] = [];
  const conflictLog: ConflictResolution[] = [];

  // Resolve conflicts within each section
  for (const [_section, sectionIssues] of Object.entries(sectionGroups)) {
    if (sectionIssues.length === 1) {
      // No conflict
      finalAccepted.push(sectionIssues[0]);
      continue;
    }

    // Multiple issues in same section - resolve by priority
    const resolved = resolveByPriority(sectionIssues);

    // Add winner to accepted
    finalAccepted.push(resolved.winner);

    // Add losers to rejected
    finalRejected.push(...resolved.losers);

    // Log conflicts
    for (const loser of resolved.losers) {
      conflictLog.push({
        issue1: `[${resolved.winner.criterion}] ${resolved.winner.description.slice(0, 50)}...`,
        issue2: `[${loser.criterion}] ${loser.description.slice(0, 50)}...`,
        resolution: `Prioritized ${resolved.winner.criterion} over ${loser.criterion} (PRIORITY_HIERARCHY)`,
      });
    }
  }

  // Add rejected issues from agreement filtering
  finalRejected.push(...rejectedByAgreement);

  return {
    accepted: finalAccepted,
    rejected: finalRejected,
    log: conflictLog,
  };
}

/**
 * Group issues by section
 */
function groupIssuesBySection(issues: JudgeIssue[]): Record<string, JudgeIssue[]> {
  const groups: Record<string, JudgeIssue[]> = {};

  for (const issue of issues) {
    const section = normalizeLocation(issue.location);
    if (!groups[section]) {
      groups[section] = [];
    }
    groups[section].push(issue);
  }

  return groups;
}

/**
 * Resolve conflicts using PRIORITY_HIERARCHY
 *
 * Returns the highest priority issue and rejected lower-priority issues.
 */
function resolveByPriority(issues: JudgeIssue[]): {
  winner: JudgeIssue;
  losers: JudgeIssue[];
} {
  // Sort by priority (lower index = higher priority)
  const sorted = [...issues].sort((a, b) => {
    const priorityA = PRIORITY_HIERARCHY.indexOf(a.criterion);
    const priorityB = PRIORITY_HIERARCHY.indexOf(b.criterion);

    // If criterion not found in hierarchy, assign lowest priority
    const indexA = priorityA === -1 ? 999 : priorityA;
    const indexB = priorityB === -1 ? 999 : priorityB;

    // If same priority, prefer higher severity
    if (indexA === indexB) {
      return severityRank(b.severity) - severityRank(a.severity);
    }

    return indexA - indexB;
  });

  return {
    winner: sorted[0],
    losers: sorted.slice(1),
  };
}

/**
 * Get severity rank (higher = more severe)
 */
function severityRank(severity: IssueSeverity): number {
  const ranks: Record<IssueSeverity, number> = {
    critical: 3,
    major: 2,
    minor: 1,
  };
  return ranks[severity] || 0;
}

/**
 * Interpret agreement score as level
 *
 * Uses thresholds from REFINEMENT_CONFIG.krippendorff:
 * - High agreement: α >= highAgreement (0.80)
 * - Moderate agreement: α >= moderateAgreement (0.67)
 * - Low agreement: α < moderateAgreement
 */
function interpretAgreementLevel(score: number): AgreementLevel {
  const { highAgreement, moderateAgreement } = REFINEMENT_CONFIG.krippendorff;

  if (score >= highAgreement) return 'high';
  if (score >= moderateAgreement) return 'moderate';
  return 'low';
}

/**
 * Estimates expected verdict count based on operation mode.
 *
 * Heuristic reasoning:
 * - FULL_AUTO: Expects 2 judges by default (can escalate to 3 if disagreement)
 * - SEMI_AUTO: Expects 1 judge (human review supplements automated checks)
 *
 * This is used to normalize agreement calculations when actual
 * verdict count differs from expected due to errors or timeouts.
 *
 * Implementation: Groups issues by criterion and location, then finds
 * the maximum count for any criterion+location pair, which approximates
 * the number of judges that evaluated the content.
 *
 * @param issues - All issues from all judges
 * @returns Estimated number of judges (verdicts)
 */
function estimateVerdictCount(issues: JudgeIssue[]): number {
  // Group by criterion and count unique patterns
  const criterionCounts = new Map<string, number>();

  for (const issue of issues) {
    const key = `${issue.criterion}:${normalizeLocation(issue.location)}`;
    criterionCounts.set(key, (criterionCounts.get(key) || 0) + 1);
  }

  // Max count gives estimate of number of judges
  const counts = Array.from(criterionCounts.values());
  return counts.length > 0 ? Math.max(...counts) : 1;
}
