/**
 * OLX Policy Files Generator
 * @module integrations/lms/openedx/olx/templates/policies
 *
 * Generates policy.json and grading_policy.json files for Open edX OLX format.
 * Policy files define course-level configuration and grading rules.
 */

import type { OlxCourseMeta } from '@megacampus/shared-types';

/**
 * Policy configuration for a course
 */
interface PolicyConfig {
  display_name: string;
  start: string | null;
  end: string | null;
  enrollment_start: string | null;
  enrollment_end: string | null;
  advertised_start: string | null;
  is_new: boolean;
  language: string;
}

/**
 * Generate policy.json content
 *
 * Creates the course policy configuration file.
 * This file contains course-level settings like enrollment dates,
 * display names, and language settings.
 *
 * @param meta - Course metadata
 * @returns JSON string for policies/{run}/policy.json
 *
 * @example
 * ```typescript
 * const policyJson = generatePolicyJson({
 *   org: 'MegaCampus',
 *   course: 'AI101',
 *   run: 'self_paced',
 *   display_name: 'Основы ИИ',
 *   language: 'ru',
 *   start: '2025-01-01T00:00:00Z'
 * });
 * // Generates policy.json with course configuration
 * ```
 */
export function generatePolicyJson(meta: OlxCourseMeta): string {
  const policy: PolicyConfig = {
    display_name: meta.display_name,
    start: meta.start ?? null,
    end: meta.end ?? null,
    enrollment_start: null,
    enrollment_end: null,
    advertised_start: null,
    is_new: true,
    language: meta.language,
  };

  const policyWrapper = {
    'course/course': policy,
  };

  return JSON.stringify(policyWrapper, null, 2) + '\n';
}

/**
 * Grading policy configuration
 */
interface GradingPolicy {
  GRADER: Array<never>; // Empty array for simple pass/fail
  GRADE_CUTOFFS: {
    Pass: number;
  };
}

/**
 * Generate grading_policy.json content
 *
 * Creates a minimal grading policy with simple pass/fail grading.
 * Students need 50% or higher to pass.
 *
 * Future enhancement: Support custom grading schemes with weighted
 * assignments, multiple grade levels, etc.
 *
 * @returns JSON string for policies/{run}/grading_policy.json
 *
 * @example
 * ```typescript
 * const gradingPolicyJson = generateGradingPolicyJson();
 * // Generates grading_policy.json with 50% pass threshold
 * ```
 */
export function generateGradingPolicyJson(): string {
  const gradingPolicy: GradingPolicy = {
    GRADER: [],
    GRADE_CUTOFFS: {
      Pass: 0.5,
    },
  };

  return JSON.stringify(gradingPolicy, null, 2) + '\n';
}
