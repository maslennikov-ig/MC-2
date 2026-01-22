/**
 * Validation Orchestrator
 *
 * RT-007 Phase 3: Orchestrates validation with severity-based filtering
 *
 * This orchestrator:
 * - Runs all validators for course structure
 * - Categorizes results by severity (ERROR/WARNING/INFO)
 * - Blocks progression ONLY on ERROR-level issues
 * - Logs WARNING and INFO for monitoring
 * - Calculates overall quality score
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-007-bloom-taxonomy-validation-improvements.md (lines 860-890)
 */

import type { CourseStructure } from '@megacampus/shared-types';
import { ValidationSeverity, type ValidationResult } from '@megacampus/shared-types';
import { validateBloomsTaxonomy, hasNonMeasurableVerb } from './blooms-validators';
import { validatePlaceholders, scanForPlaceholders } from './placeholder-validator';
import { validateDurationProportionality } from './duration-validator';
import { logTrace } from '../../../shared/trace-logger';
import logger from '../../../shared/logger';

/**
 * Validation issue with context
 */
export interface ValidationIssue {
  rule: string;
  severity: ValidationSeverity;
  path?: string; // Path to the field that failed (e.g., "sections[0].lessons[1].lesson_objectives[0]")
  issues?: string[];
  warnings?: string[];
  info?: string[];
  suggestion?: string;
  score?: number;
}

/**
 * Orchestrated validation result
 */
export interface OrchestratedValidationResult {
  passed: boolean; // Only FALSE if errors.length > 0
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
  overallScore: number; // 0.0-1.0 weighted quality score
  recommendation: 'PROCEED' | 'REGENERATE'; // Action recommendation
  summary: {
    totalValidations: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}

/**
 * Orchestrate validation for entire course structure
 *
 * RT-007 Phase 3: Severity-based filtering
 * - ERROR: Blocks progression
 * - WARNING: Logs but allows progression
 * - INFO: Monitoring only
 *
 * @param structure - Course structure to validate
 * @param courseId - Optional course ID for trace logging (Issue #13)
 * @returns Orchestrated validation result
 */
export async function orchestrateValidation(
  structure: CourseStructure,
  courseId?: string
): Promise<OrchestratedValidationResult> {
  const results: ValidationResult[] = [];
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  // 1. Validate placeholders in entire structure
  const placeholderIssues = scanForPlaceholders(structure);
  if (placeholderIssues.length > 0) {
    // Categorize placeholder issues by severity
    for (const issue of placeholderIssues) {
      const text = extractTextFromPath(structure, issue);
      const result = validatePlaceholders(text);
      results.push(result);

      if (result.severity === ValidationSeverity.ERROR && result.issues) {
        errors.push({
          rule: 'placeholder_detection',
          severity: ValidationSeverity.ERROR,
          path: issue,
          issues: result.issues,
          suggestion: result.suggestion,
          score: result.score,
        });

        // T013: Log placeholder validation failure to error_logs
        if (courseId) {
          logger.warn(
            {
              courseId,
              ruleId: 'placeholder_detection',
              severity: 'WARNING',
              path: issue,
              suggestion: result.suggestion,
              issues: result.issues,
            },
            'Validation warning: placeholder detected'
          );
        }
      } else if (result.severity === ValidationSeverity.WARNING && result.warnings) {
        warnings.push({
          rule: 'placeholder_detection',
          severity: ValidationSeverity.WARNING,
          path: issue,
          warnings: result.warnings,
          suggestion: result.suggestion,
          score: result.score,
        });

        // T013: Log placeholder validation warning to error_logs
        if (courseId) {
          logger.warn(
            {
              courseId,
              ruleId: 'placeholder_detection',
              severity: 'WARNING',
              path: issue,
              suggestion: result.suggestion,
              warnings: result.warnings,
            },
            'Validation warning: placeholder pattern detected'
          );
        }
      }
    }
  }

  // 2. Validate learning objectives (Bloom's taxonomy + non-measurable verbs)
  // Note: ALL learning objectives at ALL levels are simple strings, not LearningObjective objects
  const allObjectives: Array<{ text: string; language: string; path: string }> = [];

  // Determine language from structure (fallback to 'en')
  // CourseStructure doesn't have metadata property - fields are at top level
  const structureLanguage = 'en'; // Default, could be extracted from frontend_parameters if available

  // Course-level outcomes (can be strings or objects)
  structure.learning_outcomes.forEach((outcome: unknown, idx: number) => {
    const text = typeof outcome === 'string' ? outcome : (outcome as { text: string }).text;
    allObjectives.push({ text, language: structureLanguage, path: `learning_outcomes[${idx}]` });
  });

  // Section-level objectives (strings)
  structure.sections.forEach((section, sectionIdx) => {
    section.learning_objectives.forEach((text, objIdx) => {
      allObjectives.push({
        text,
        language: structureLanguage,
        path: `sections[${sectionIdx}].learning_objectives[${objIdx}]`,
      });
    });

    // Lesson-level objectives (strings)
    section.lessons.forEach((lesson, lessonIdx) => {
      lesson.lesson_objectives.forEach((text, objIdx) => {
        allObjectives.push({
          text,
          language: structureLanguage,
          path: `sections[${sectionIdx}].lessons[${lessonIdx}].lesson_objectives[${objIdx}]`,
        });
      });
    });
  });

  // Validate each objective
  for (const { text, language, path } of allObjectives) {
    // Check for non-measurable verbs (ERROR)
    if (hasNonMeasurableVerb(text, language)) {
      errors.push({
        rule: 'non_measurable_verbs',
        severity: ValidationSeverity.ERROR,
        path,
        issues: [
          `Non-measurable verb detected in "${text}". Cannot verify learning through assessment.`,
        ],
        suggestion: 'Replace with measurable action verbs (e.g., explain, demonstrate, analyze)',
        score: 0.0,
      });
      continue; // Skip Bloom's validation if non-measurable verb found
    }

    // Check Bloom's taxonomy (WARNING on failure)
    const bloomsResult = validateBloomsTaxonomy(text, language);
    results.push(bloomsResult);

    if (!bloomsResult.passed && bloomsResult.severity === ValidationSeverity.WARNING) {
      warnings.push({
        rule: 'blooms_taxonomy_whitelist',
        severity: ValidationSeverity.WARNING,
        path,
        warnings: bloomsResult.warnings,
        suggestion: bloomsResult.suggestion,
        score: bloomsResult.score,
      });
    } else if (bloomsResult.passed && bloomsResult.info) {
      info.push({
        rule: 'blooms_taxonomy_whitelist',
        severity: ValidationSeverity.INFO,
        path,
        info: bloomsResult.info,
        score: bloomsResult.score,
      });
    }
  }

  // T013: Log Bloom's taxonomy validation results to generation_trace
  if (courseId && allObjectives.length > 0) {
    const bloomsPassedCount =
      allObjectives.length - warnings.filter(w => w.rule === 'blooms_taxonomy_whitelist').length;

    await logTrace({
      courseId,
      stage: 'stage_5',
      phase: 'validation',
      stepName: 'validate_blooms',
      inputData: {
        ruleId: 'blooms_taxonomy',
        objectivesCount: allObjectives.length,
      },
      outputData: {
        passed: bloomsPassedCount === allObjectives.length,
        checkedItems: allObjectives.length,
        passedItems: bloomsPassedCount,
        failedItems: allObjectives.length - bloomsPassedCount,
        warnings: warnings.filter(w => w.rule === 'blooms_taxonomy_whitelist').length,
      },
      qualityScore: allObjectives.length > 0 ? bloomsPassedCount / allObjectives.length : 1.0,
      durationMs: 0,
    });
  }

  // 3. Validate duration proportionality for all lessons
  let durationPassedCount = 0;
  let durationTotalCount = 0;

  structure.sections.forEach((section, sectionIdx) => {
    section.lessons.forEach((lesson, lessonIdx) => {
      const durationResult = validateDurationProportionality(lesson);
      results.push(durationResult);
      durationTotalCount++;

      const path = `sections[${sectionIdx}].lessons[${lessonIdx}]`;

      if (durationResult.severity === ValidationSeverity.ERROR && durationResult.issues) {
        errors.push({
          rule: 'duration_min',
          severity: ValidationSeverity.ERROR,
          path,
          issues: durationResult.issues,
          suggestion: durationResult.suggestion,
          score: durationResult.score,
        });

        // T013: Log duration validation failure to error_logs
        if (courseId) {
          logger.warn(
            {
              courseId,
              ruleId: 'duration_min',
              severity: 'ERROR',
              path,
              suggestion: durationResult.suggestion,
              issues: durationResult.issues,
            },
            'Validation error: duration below minimum threshold'
          );
        }
      } else if (
        durationResult.severity === ValidationSeverity.WARNING &&
        durationResult.warnings
      ) {
        warnings.push({
          rule: 'duration_max',
          severity: ValidationSeverity.WARNING,
          path,
          warnings: durationResult.warnings,
          suggestion: durationResult.suggestion,
          score: durationResult.score,
        });

        // T013: Log duration validation warning to error_logs
        if (courseId) {
          logger.warn(
            {
              courseId,
              ruleId: 'duration_max',
              severity: 'WARNING',
              path,
              suggestion: durationResult.suggestion,
              warnings: durationResult.warnings,
            },
            'Validation warning: duration above maximum threshold'
          );
        }
      } else if (durationResult.severity === ValidationSeverity.INFO && durationResult.info) {
        info.push({
          rule: durationResult.metadata?.rule || 'duration_proportionality',
          severity: ValidationSeverity.INFO,
          path,
          info: durationResult.info,
          score: durationResult.score,
        });
        durationPassedCount++; // INFO severity means passed
      } else if (durationResult.passed) {
        durationPassedCount++; // Explicit pass
      }
    });
  });

  // T013: Log duration validation results to generation_trace
  if (courseId && durationTotalCount > 0) {
    await logTrace({
      courseId,
      stage: 'stage_5',
      phase: 'validation',
      stepName: 'validate_duration',
      inputData: {
        ruleId: 'duration_proportionality',
        lessonsCount: durationTotalCount,
      },
      outputData: {
        passed: durationPassedCount === durationTotalCount,
        checkedItems: durationTotalCount,
        passedItems: durationPassedCount,
        failedItems: durationTotalCount - durationPassedCount,
        errors: errors.filter(e => e.rule === 'duration_min').length,
        warnings: warnings.filter(w => w.rule === 'duration_max').length,
      },
      qualityScore: durationTotalCount > 0 ? durationPassedCount / durationTotalCount : 1.0,
      durationMs: 0,
    });
  }

  // Calculate overall quality score (weighted by severity)
  const overallScore = calculateWeightedScore(results);

  // Block ONLY on errors
  const passed = errors.length === 0;

  return {
    passed,
    errors,
    warnings,
    info,
    overallScore,
    recommendation: passed ? 'PROCEED' : 'REGENERATE',
    summary: {
      totalValidations: results.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      infoCount: info.length,
    },
  };
}

/**
 * Calculate weighted quality score from validation results
 *
 * Weights:
 * - ERROR: 0.0 (always fails)
 * - WARNING: 0.7-0.9 (partial credit)
 * - INFO/PASS: 1.0 (full credit)
 *
 * @param results - All validation results
 * @returns Overall quality score 0.0-1.0
 */
function calculateWeightedScore(results: ValidationResult[]): number {
  if (results.length === 0) return 1.0;

  const totalScore = results.reduce((sum, result) => sum + result.score, 0);
  return totalScore / results.length;
}

/**
 * Extract text from structure using validation issue path
 *
 * @param structure - Course structure
 * @param path - Validation issue path (e.g., "sections[0].lesson_title")
 * @returns Extracted text for validation
 */
function extractTextFromPath(structure: unknown, path: string): string {
  // Simple path extraction (for placeholder detection)
  // This is a helper to get the actual text value from nested paths
  const parts = path.split(/[\.\[\]]+/).filter(Boolean);
  let current: any = structure;

  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = current[part];
    } else {
      return '';
    }
  }

  return typeof current === 'string' ? current : '';
}
