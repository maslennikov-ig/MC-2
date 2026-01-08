/**
 * Self-Reviewer Phase Functions
 * @module stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-phases
 *
 * Phase 1 heuristic checks and critical issue handling.
 */

import { logger } from '@/shared/logger';
import { metricsStore } from '@/orchestrator/metrics';
import type { SelfReviewIssue } from '@megacampus/shared-types/judge-types';
import {
  checkLanguageConsistency,
  checkContentTruncation,
  checkMermaidSyntax,
} from '../../judge/heuristic-filter';
import { MODEL_FALLBACK } from '../../config';
import { SELF_REVIEW_CONFIG } from './self-reviewer-constants';
import { findSectionsWithForeignCharacters } from './self-reviewer-heuristics';

// ============================================================================
// TYPES
// ============================================================================

/** Result type from checkLanguageConsistency */
export type LanguageCheckResult = ReturnType<typeof checkLanguageConsistency>;
/** Result type from checkContentTruncation */
export type TruncationCheckResult = ReturnType<typeof checkContentTruncation>;
/** Result type from checkMermaidSyntax */
export type MermaidCheckResult = ReturnType<typeof checkMermaidSyntax>;

export interface HeuristicCheckResults {
  languageCheck: LanguageCheckResult;
  truncationCheck: TruncationCheckResult;
  mermaidCheck: MermaidCheckResult;
}

export interface CriticalIssueAnalysis {
  issues: SelfReviewIssue[];
  requiresModelFallback: boolean;
  fallbackModel: string | null;
  affectedSections: string[];
}

// ============================================================================
// HEURISTIC PHASE
// ============================================================================

/**
 * Run Phase 1: Heuristic Pre-Checks (FREE, no LLM)
 *
 * Performs language consistency, truncation, and mermaid syntax checks.
 *
 * @param content - Generated content to check
 * @param language - Target language code
 * @returns Heuristic check results
 */
export function runHeuristicPhase(
  content: string,
  language: string
): HeuristicCheckResults {
  const languageCheck = checkLanguageConsistency(content, language);
  const truncationCheck = checkContentTruncation(content);
  const mermaidCheck = checkMermaidSyntax(content);

  return { languageCheck, truncationCheck, mermaidCheck };
}

// ============================================================================
// CRITICAL ISSUE ANALYSIS
// ============================================================================

/**
 * Analyze heuristic results for critical issues
 *
 * Determines if issues are critical enough to trigger regeneration,
 * and whether model fallback is needed for persistent CJK issues.
 *
 * @param content - Generated content for section analysis
 * @param heuristics - Results from runHeuristicPhase
 * @param language - Target language code
 * @param retryCount - Current retry attempt number
 * @param totalSections - Total number of sections in lesson
 * @returns Analysis with issues and fallback decision
 */
export function analyzeCriticalIssues(
  content: string,
  heuristics: HeuristicCheckResults,
  language: string,
  retryCount: number,
  totalSections: number
): CriticalIssueAnalysis {
  const { languageCheck, truncationCheck, mermaidCheck } = heuristics;
  const issues: SelfReviewIssue[] = [];
  let requiresModelFallback = false;
  let fallbackModel: string | null = null;
  let affectedSections: string[] = [];

  const nodeLogger = logger.child({ phase: 'criticalIssueAnalysis' });

  // ============================================================================
  // LANGUAGE FAILURES
  // ============================================================================

  if (!languageCheck.passed && languageCheck.foreignCharacters > SELF_REVIEW_CONFIG.criticalLanguageThreshold) {
    const isRetryWithPersistentCJK = retryCount >= MODEL_FALLBACK.maxPrimaryAttempts;

    affectedSections = findSectionsWithForeignCharacters(
      content,
      languageCheck.scriptsFound
    );

    if (isRetryWithPersistentCJK) {
      // Persistent CJK - switch to fallback model
      issues.push({
        type: 'LANGUAGE',
        severity: 'CRITICAL',
        location: 'global',
        description: `Persistent CJK issue after ${retryCount} retry(ies). Switching to fallback model (${MODEL_FALLBACK.fallback}) for full regeneration.`,
      });

      requiresModelFallback = true;
      fallbackModel = MODEL_FALLBACK.fallback;

      metricsStore.recordModelFallback('cjk', 'stage6');

      nodeLogger.warn({
        msg: 'Persistent CJK issue - switching to fallback model for full regeneration',
        foreignCharacters: languageCheck.foreignCharacters,
        scriptsFound: languageCheck.scriptsFound,
        samples: languageCheck.foreignSamples,
        retryCount,
        fallbackModel,
      });
    } else {
      // First attempts: try partial or full regeneration
      const introAndSummary = 2;
      const estimatedTotalSections = totalSections + introAndSummary;
      const isPartialPossible = affectedSections.length > 0 &&
                                affectedSections.length < estimatedTotalSections * 0.5;

      if (isPartialPossible) {
        for (const sectionId of affectedSections) {
          issues.push({
            type: 'LANGUAGE',
            severity: 'COMPLEX',
            location: sectionId,
            description: `Foreign characters from ${languageCheck.scriptsFound.join(', ')} scripts found in ${sectionId}. Expected language: ${language}. Targeting for partial regeneration.`,
          });
        }

        nodeLogger.warn({
          msg: 'Foreign character issue - targeting sections for partial regeneration',
          foreignCharacters: languageCheck.foreignCharacters,
          scriptsFound: languageCheck.scriptsFound,
          samples: languageCheck.foreignSamples,
          affectedSections,
          totalSections: estimatedTotalSections,
          partialRegeneration: true,
        });
      } else {
        issues.push({
          type: 'LANGUAGE',
          severity: 'CRITICAL',
          location: 'global',
          description: `Found ${languageCheck.foreignCharacters} foreign characters from ${languageCheck.scriptsFound.join(', ')} scripts affecting ${affectedSections.length} sections. Expected language: ${language}. Full regeneration required.`,
        });

        nodeLogger.warn({
          msg: 'Critical language consistency failure - full regeneration required',
          foreignCharacters: languageCheck.foreignCharacters,
          scriptsFound: languageCheck.scriptsFound,
          samples: languageCheck.foreignSamples,
          affectedSections,
          totalSections: estimatedTotalSections,
          partialRegeneration: false,
        });
      }
    }
  }

  // ============================================================================
  // TRUNCATION FAILURES
  // ============================================================================

  if (!truncationCheck.passed && truncationCheck.truncationIssues.length > SELF_REVIEW_CONFIG.criticalTruncationThreshold) {
    issues.push({
      type: 'TRUNCATION',
      severity: 'CRITICAL',
      location: 'global',
      description: truncationCheck.truncationIssues.join('; '),
    });

    nodeLogger.warn({
      msg: 'Critical truncation failure',
      issuesCount: truncationCheck.truncationIssues.length,
      issues: truncationCheck.truncationIssues,
      lastCharacter: truncationCheck.lastCharacter,
      hasMatchedCodeBlocks: truncationCheck.hasMatchedCodeBlocks,
    });
  }

  // ============================================================================
  // MERMAID SYNTAX ISSUES
  // ============================================================================

  if (!mermaidCheck.passed) {
    issues.push({
      type: 'HYGIENE' as const,
      severity: 'CRITICAL',
      location: 'global',
      description: `Mermaid syntax issues (regeneration needed): ${mermaidCheck.mermaidIssues.slice(0, 3).join('; ')}${mermaidCheck.mermaidIssues.length > 3 ? ` (+${mermaidCheck.mermaidIssues.length - 3} more)` : ''}`,
    });

    nodeLogger.warn({
      msg: 'Mermaid syntax issues detected after sanitizer - triggering regeneration',
      totalDiagrams: mermaidCheck.totalDiagrams,
      affectedDiagrams: mermaidCheck.affectedDiagrams,
      issues: mermaidCheck.mermaidIssues,
    });
  }

  return {
    issues,
    requiresModelFallback,
    fallbackModel,
    affectedSections,
  };
}

/**
 * Build minor (INFO-level) issues from heuristic results
 *
 * Called when heuristics don't find critical issues but have minor observations.
 *
 * @param heuristics - Results from runHeuristicPhase
 * @returns Array of INFO-level issues
 */
export function buildMinorIssues(
  heuristics: HeuristicCheckResults
): SelfReviewIssue[] {
  const { languageCheck, truncationCheck } = heuristics;
  const issues: SelfReviewIssue[] = [];

  const nodeLogger = logger.child({ phase: 'minorIssues' });

  if (!languageCheck.passed) {
    issues.push({
      type: 'LANGUAGE',
      severity: 'INFO',
      location: 'global',
      description: `Minor script mixing: ${languageCheck.foreignCharacters} foreign characters from ${languageCheck.scriptsFound.join(', ')}. Examples: "${languageCheck.foreignSamples.join('", "')}"`,
    });

    nodeLogger.debug({
      msg: 'Minor language consistency issues',
      foreignCharacters: languageCheck.foreignCharacters,
      samples: languageCheck.foreignSamples,
    });
  }

  if (!truncationCheck.passed) {
    issues.push({
      type: 'TRUNCATION',
      severity: 'INFO',
      location: 'global',
      description: truncationCheck.truncationIssues.join('; '),
    });

    nodeLogger.debug({
      msg: 'Minor truncation issues',
      issues: truncationCheck.truncationIssues,
    });
  }

  return issues;
}
