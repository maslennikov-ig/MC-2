/**
 * Prohibited terms and prompt marker detection
 * @module stages/stage6-lesson-content/judge/filters/prohibited-content
 */

import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { FilterCheckResult } from './types';
import { logger } from '@/shared/logger';

// ============================================================================
// PROHIBITED TERMS CHECK
// ============================================================================

/**
 * Check for prohibited terms from section constraints
 *
 * Checks content for terms specified in section.constraints.prohibited_terms.
 * Returns 1.0 if no violations, reduces by 0.2 per violation (max 5 = 0 score).
 *
 * @param content - Content to check (markdown string)
 * @param lessonSpec - Lesson specification with section constraints
 * @returns Filter check result with violations list
 */
export function checkProhibitedTerms(
  content: string,
  lessonSpec: LessonSpecificationV2
): FilterCheckResult & { violations: string[] } {
  // Collect all prohibited terms from spec sections
  const prohibitedTerms: string[] = [];
  for (const section of lessonSpec.sections) {
    if (section.constraints?.prohibited_terms) {
      prohibitedTerms.push(...section.constraints.prohibited_terms);
    }
  }

  // No prohibited terms defined - perfect score
  if (prohibitedTerms.length === 0) {
    return {
      passed: true,
      actual: 'no violations',
      scoreContribution: 1.0,
      violations: [],
    };
  }

  const contentLower = content.toLowerCase();
  const violations: string[] = [];

  for (const term of prohibitedTerms) {
    if (contentLower.includes(term.toLowerCase())) {
      violations.push(term);
    }
  }

  if (violations.length > 0) {
    logger.debug({
      msg: 'Prohibited terms found in content',
      violations,
      count: violations.length,
    });
  }

  // Each violation reduces score by 20% (max 5 violations = 0 score)
  const scoreContribution = Math.max(0, 1 - violations.length * 0.2);
  const passed = violations.length === 0;

  const result: FilterCheckResult & { violations: string[] } = {
    passed,
    actual: violations.length === 0 ? 'no violations' : `${violations.length} violations`,
    scoreContribution,
    violations,
  };

  if (!passed) {
    result.failure = {
      filter: 'prohibitedTerms',
      expected: '0 violations',
      actual: `${violations.length} violations`,
      severity: 'critical', // Prohibited terms are always critical
    };
    const violationList = violations.slice(0, 5).join(', ');
    const suffix = violations.length > 5 ? ` (+${violations.length - 5} more)` : '';
    result.suggestion = `Content contains prohibited terms: ${violationList}${suffix}. Remove or replace these terms to meet spec constraints.`;
  }

  return result;
}

// ============================================================================
// PROMPT MARKER CHECK (Detects LLM hallucination)
// ============================================================================

/**
 * Prompt template markers that should NEVER appear in generated content.
 * These markers come from patcher-prompt.ts and indicate the model is
 * generating prompt structure instead of actual content.
 */
const PROMPT_TEMPLATE_MARKERS = [
  '## SECTION TITLE',
  '## ORIGINAL CONTENT',
  '## FIX INSTRUCTIONS',
  '## CONTEXT FOR COHERENCE',
  '## TARGET AREA',
  '## OUTPUT REQUIREMENTS',
  'COMPLETE CORRECTED SECTION:',
  '## INLINE FIX INSTRUCTIONS',
] as const;

/**
 * Check for prompt template markers in content (case-insensitive)
 *
 * Detects if LLM output contains patcher prompt structure,
 * which indicates the model is reproducing training data
 * instead of generating actual lesson content.
 *
 * This is a CRITICAL check - presence of ANY marker is a failure.
 *
 * @param content - Content to check (markdown string)
 * @returns Filter check result with detected markers
 */
export function checkPromptMarkers(content: string): FilterCheckResult & {
  detectedMarkers: string[];
} {
  const detectedMarkers: string[] = [];
  const contentLower = content.toLowerCase();

  for (const marker of PROMPT_TEMPLATE_MARKERS) {
    if (contentLower.includes(marker.toLowerCase())) {
      detectedMarkers.push(marker);
    }
  }

  const passed = detectedMarkers.length === 0;
  // Any marker = immediate failure (0 score contribution)
  const scoreContribution = passed ? 1.0 : 0.0;

  const result: FilterCheckResult & { detectedMarkers: string[] } = {
    passed,
    actual: passed ? 'no markers' : `${detectedMarkers.length} markers found`,
    scoreContribution,
    detectedMarkers,
  };

  if (!passed) {
    result.failure = {
      filter: 'promptMarkers',
      expected: '0 prompt markers',
      actual: `${detectedMarkers.length} markers found`,
      severity: 'critical', // Always critical - indicates LLM hallucination
    };
    result.suggestion = `Content contains prompt template markers: ${detectedMarkers.slice(0, 3).join(', ')}${detectedMarkers.length > 3 ? ` (+${detectedMarkers.length - 3} more)` : ''}. This indicates LLM hallucination - content must be regenerated.`;
  }

  if (detectedMarkers.length > 0) {
    logger.warn({
      msg: 'Prompt template markers detected in content (LLM hallucination)',
      markersFound: detectedMarkers.length,
      markers: detectedMarkers,
    });
  }

  return result;
}
