import type { HeuristicFilterResult } from '../judge/heuristic-filter';
import type { LessonQualitySignals } from '@megacampus/shared-types/lesson-content';
import type { PresentationCriticResult } from './presentation-critic';

export enum QualityRemediationAction {
  SAFE_AUTO_FIX = 'SAFE_AUTO_FIX',
  PARTIAL_REGEN = 'PARTIAL_REGEN',
  FULL_REGEN = 'FULL_REGEN',
  WARN_ONLY = 'WARN_ONLY',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
}

export interface QualityRemediationSummary {
  action: QualityRemediationAction | null;
  lessonFlags: string[];
  courseFlags: string[];
  lessonCounters: NonNullable<LessonQualitySignals['lesson_counters']>;
  reasons: string[];
  shouldRunPresentationCritic: boolean;
}

const ACTION_PRIORITY: Record<QualityRemediationAction, number> = {
  [QualityRemediationAction.SAFE_AUTO_FIX]: 1,
  [QualityRemediationAction.WARN_ONLY]: 2,
  [QualityRemediationAction.PARTIAL_REGEN]: 3,
  [QualityRemediationAction.FULL_REGEN]: 4,
  [QualityRemediationAction.REVIEW_REQUIRED]: 5,
};

function bumpAction(
  current: QualityRemediationAction | null,
  next: QualityRemediationAction
): QualityRemediationAction {
  if (!current) {
    return next;
  }

  return ACTION_PRIORITY[next] > ACTION_PRIORITY[current] ? next : current;
}

function countConclusionHeadings(headers: string[]): number {
  return headers.filter(header =>
    /заключ|итог|вывод|резюме|summary|conclusion|takeaway/i.test(header)
  ).length;
}

export function summarizeDetailedHeuristicResult(
  result: HeuristicFilterResult
): QualityRemediationSummary {
  let action: QualityRemediationAction | null = null;
  const lessonFlags: string[] = [];
  const reasons: string[] = [];

  const calloutCount = result.metrics.calloutDensity?.calloutCount ?? 0;
  const codeBlockCount = result.metrics.codeBlockAudienceMatch?.codeBlockCount ?? 0;
  const englishHeaderCount = result.metrics.headerLanguage?.englishHeaders.length ?? 0;
  const sectionCount = result.metrics.sectionCount ?? 0;
  const duplicateHeaderCount =
    result.metrics.sectionDuplication?.duplicatePairs.filter(pair => pair.similarity === 1)
      .length ?? 0;
  const conclusionHeadingCount = countConclusionHeadings(result.metrics.foundSections ?? []);
  const markdownAutoFixedRules = result.metrics.markdownStructure?.autoFixedRules ?? [];

  if (markdownAutoFixedRules.length > 0) {
    action = bumpAction(action, QualityRemediationAction.SAFE_AUTO_FIX);
    lessonFlags.push('deterministic_autofix_applied');
    reasons.push(`auto-fixed: ${markdownAutoFixedRules.join(', ')}`);
  }

  if (sectionCount === 0) {
    action = bumpAction(action, QualityRemediationAction.FULL_REGEN);
    lessonFlags.push('zero_sections_blocking');
    reasons.push('content contains zero parsed sections');
  }

  if (
    (result.metrics.markdownStructure?.criticalIssues ?? 0) > 0 ||
    (result.metrics.markdownStructure?.majorIssues ?? 0) > 0
  ) {
    action = bumpAction(action, QualityRemediationAction.FULL_REGEN);
    lessonFlags.push('markdown_structure_blocking');
    reasons.push('markdown structure remains invalid after deterministic fixes');
  }

  if (duplicateHeaderCount > 0) {
    action = bumpAction(action, QualityRemediationAction.FULL_REGEN);
    lessonFlags.push('duplicate_headers_blocking');
    reasons.push('exact duplicate section headers detected');
  }

  if (calloutCount >= 5) {
    action = bumpAction(action, QualityRemediationAction.FULL_REGEN);
    lessonFlags.push('callout_density_blocking');
    reasons.push(`callout count ${calloutCount} exceeds hard cap`);
  } else if (calloutCount >= 3) {
    action = bumpAction(action, QualityRemediationAction.WARN_ONLY);
    lessonFlags.push('callout_density_warning');
    reasons.push(`callout count ${calloutCount} exceeds soft cap`);
  }

  const contentArchetype = result.metrics.codeBlockAudienceMatch?.contentArchetype ?? '';
  if (contentArchetype !== 'code_tutorial') {
    if (codeBlockCount >= 4) {
      action = bumpAction(action, QualityRemediationAction.FULL_REGEN);
      lessonFlags.push('code_blocks_blocking');
      reasons.push(`non-technical lesson contains ${codeBlockCount} code blocks`);
    } else if (codeBlockCount >= 1) {
      action = bumpAction(action, QualityRemediationAction.WARN_ONLY);
      lessonFlags.push('code_blocks_warn_only');
      reasons.push(`non-technical lesson contains ${codeBlockCount} code blocks`);
    }
  }

  if (englishHeaderCount > 0) {
    action = bumpAction(action, QualityRemediationAction.PARTIAL_REGEN);
    lessonFlags.push('header_language_partial_regen');
    reasons.push(`${englishHeaderCount} section header(s) appear to be in English`);
  }

  if (result.failures.some(failure => failure.filter === 'contentTruncation')) {
    action = bumpAction(action, QualityRemediationAction.FULL_REGEN);
    lessonFlags.push('content_truncation_blocking');
    reasons.push('content truncation detected');
  }

  return {
    action,
    lessonFlags,
    courseFlags: [],
    lessonCounters: {
      section_count: sectionCount,
      callout_count: calloutCount,
      code_block_count: codeBlockCount,
      english_header_count: englishHeaderCount,
      duplicate_header_count: duplicateHeaderCount,
      conclusion_heading_count: conclusionHeadingCount,
    },
    reasons,
    shouldRunPresentationCritic: action === QualityRemediationAction.WARN_ONLY,
  };
}

/**
 * Build QA signals from quality remediation and presentation critic results.
 *
 * Shared between judge-node-helpers (processJudgeDecision) and
 * judge-refinement-helpers (handleNoVerdict) to avoid diverging copies.
 */
export function buildQaSignals(
  qualitySummary: QualityRemediationSummary | undefined,
  presentationCritic: PresentationCriticResult | undefined,
  action: QualityRemediationAction | null,
  qualityRetryCount: number
): LessonQualitySignals | null {
  if (!qualitySummary && !presentationCritic) {
    return null;
  }

  return {
    version: 1,
    lesson_counters: qualitySummary?.lessonCounters ?? {},
    lesson_flags:
      qualitySummary && qualitySummary.lessonFlags.length > 0
        ? qualitySummary.lessonFlags
        : undefined,
    course_flags:
      qualitySummary && qualitySummary.courseFlags.length > 0
        ? qualitySummary.courseFlags
        : undefined,
    remediation_action: action ?? undefined,
    quality_retry_count: qualityRetryCount,
    selective_critic: presentationCritic
      ? {
          invoked: presentationCritic.invoked,
          finding_count: presentationCritic.findingCount,
          upgraded_action: presentationCritic.upgradedAction ?? undefined,
        }
      : undefined,
  };
}
