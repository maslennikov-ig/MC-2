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
  ZERO_TOLERANCE_SCRIPTS,
} from '../../judge/heuristic-filter';
import {
  classifyTruncationIssue,
  type TruncationIssueKind,
} from '../../judge/filters/structural-checks';
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
// TRUNCATION ISSUE CATEGORIZATION
// ============================================================================

/**
 * Severity bucket for a given truncation issue kind.
 *
 * Maps issue kinds (from structural-checks.ts) to detection-reliability
 * buckets. Used to decide whether truncation should trigger CRITICAL
 * (blocking → REGENERATE) or INFO (non-blocking observation for judge).
 *
 * Policy rationale: after token limits were bumped, real truncation is
 * rare. FP cost (rejected rows, REGENERATE loop) > FN cost (judge still
 * runs as 2nd-tier catch). See ADR / commit 020bed88.
 */
const TRUNCATION_SEVERITY_BUCKET: Record<
  TruncationIssueKind,
  'deterministic' | 'globalEnding' | 'heuristic'
> = {
  // Deterministic: independently indicates truncation
  UNMATCHED_CODE: 'deterministic',
  MID_SENTENCE: 'deterministic',
  SUSPICIOUSLY_SHORT: 'deterministic',
  // Medium-confidence: blocks only in composite with another signal
  GLOBAL_ENDING: 'globalEnding',
  // Heuristic: false-positives on tables/HR/lists/quotes → never block alone
  SECTION_TRUNCATED: 'heuristic',
  CALLOUT_TRUNCATED: 'heuristic',
};

export interface CategorizedTruncationIssues {
  /** Deterministic signals that independently indicate truncation */
  deterministic: string[];
  /** Global last-char check — fragile alone, strong as part of composite */
  globalEnding: string[];
  /** Per-section / callout last-char heuristics — never block on their own */
  heuristic: string[];
  /** Unknown/unclassifiable messages — conservatively treated as heuristic */
  unknown: string[];
}

/**
 * Categorize truncation issues by detection reliability using typed
 * issue-kind codes (no magic-string coupling to structural-checks.ts).
 *
 * Unknown/unclassifiable messages go to `unknown` bucket (not auto-escalated
 * to deterministic) — if someone adds a new check without wiring severity,
 * we fail-open rather than fail-closed to avoid regressions.
 */
export function categorizeTruncationIssues(issues: string[]): CategorizedTruncationIssues {
  const result: CategorizedTruncationIssues = {
    deterministic: [],
    globalEnding: [],
    heuristic: [],
    unknown: [],
  };

  for (const issue of issues) {
    const kind = classifyTruncationIssue(issue);
    if (!kind) {
      result.unknown.push(issue);
      continue;
    }
    const bucket = TRUNCATION_SEVERITY_BUCKET[kind];
    result[bucket].push(issue);
  }

  return result;
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
export function runHeuristicPhase(content: string, language: string): HeuristicCheckResults {
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

  if (
    !languageCheck.passed &&
    languageCheck.foreignCharacters > SELF_REVIEW_CONFIG.criticalLanguageThreshold
  ) {
    const isRetryWithPersistentCJK = retryCount >= MODEL_FALLBACK.maxPrimaryAttempts;

    affectedSections = findSectionsWithForeignCharacters(content, languageCheck.scriptsFound);

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
      const isPartialPossible =
        affectedSections.length > 0 && affectedSections.length < estimatedTotalSections * 0.5;

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
  //
  // Severity policy (post-2026-04-16):
  //   - Deterministic signals → CRITICAL on first hit
  //     (unmatched code fence, <200 chars, explicit mid-sentence pattern).
  //   - Heuristic signals → NEVER block on their own
  //     (per-section last-char, callout-block last-line). These false-positive
  //     on markdown tables, horizontal rules, quote blocks, list endings.
  //     Surfaced as INFO via buildMinorIssues for judge/telemetry.
  //   - Global last-char (Check 1) → CRITICAL only with supporting signal.
  //     Alone it's too fragile (closing punctuation like "Молодец!)" flags false).
  //
  // Rationale: token limits were bumped (4096 floor → 16384 ceiling + overhead
  // multiplier), so real truncation is rare. FP cost (rejected rows, REGENERATE
  // loop) > FN cost (judge still runs as second-tier catch).

  if (!truncationCheck.passed) {
    const categorized = categorizeTruncationIssues(truncationCheck.truncationIssues);
    const hasDeterministic = categorized.deterministic.length > 0;
    const hasGlobalEnding = categorized.globalEnding.length > 0;
    const hasHeuristic = categorized.heuristic.length > 0;
    const hasUnknown = categorized.unknown.length > 0;

    // Composite rule: global-ending alone is fragile; require a second signal.
    // Unknown kinds are conservatively treated as heuristic (fail-open) to
    // avoid silent regressions if structural-checks adds a new message type
    // without updating the severity bucket map.
    const isCritical = hasDeterministic || (hasGlobalEnding && hasHeuristic);

    if (isCritical) {
      issues.push({
        type: 'TRUNCATION',
        severity: 'CRITICAL',
        location: 'global',
        description: truncationCheck.truncationIssues.join('; '),
      });

      nodeLogger.warn({
        msg: 'Critical truncation failure (deterministic or composite signal)',
        deterministicCount: categorized.deterministic.length,
        globalEndingCount: categorized.globalEnding.length,
        heuristicCount: categorized.heuristic.length,
        unknownCount: categorized.unknown.length,
        issues: truncationCheck.truncationIssues,
        lastCharacter: truncationCheck.lastCharacter,
        hasMatchedCodeBlocks: truncationCheck.hasMatchedCodeBlocks,
      });
    } else if (hasHeuristic || hasGlobalEnding || hasUnknown) {
      // Heuristic-only, global-ending-only, or unknown: log for telemetry,
      // do NOT block. buildMinorIssues emits INFO-level for judge visibility.
      const suppressedKinds: string[] = [];
      for (const msg of categorized.heuristic) {
        const kind = classifyTruncationIssue(msg);
        if (kind) suppressedKinds.push(kind);
      }
      for (const msg of categorized.globalEnding) {
        const kind = classifyTruncationIssue(msg);
        if (kind) suppressedKinds.push(kind);
      }
      if (hasUnknown) suppressedKinds.push('UNKNOWN');

      metricsStore.recordTruncationHeuristicSuppressed(suppressedKinds);

      nodeLogger.info({
        msg: 'Heuristic truncation signals ignored (non-blocking)',
        heuristicCount: categorized.heuristic.length,
        globalEndingCount: categorized.globalEnding.length,
        unknownCount: categorized.unknown.length,
        issues: truncationCheck.truncationIssues,
      });
    }
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
export function buildMinorIssues(heuristics: HeuristicCheckResults): SelfReviewIssue[] {
  const { languageCheck, truncationCheck } = heuristics;
  const issues: SelfReviewIssue[] = [];

  const nodeLogger = logger.child({ phase: 'minorIssues' });

  if (!languageCheck.passed) {
    const hasZeroToleranceScripts = languageCheck.scriptsFound.some(script =>
      ZERO_TOLERANCE_SCRIPTS.has(script)
    );

    if (hasZeroToleranceScripts) {
      // Zero-tolerance scripts (CJK/Arabic/Devanagari): mark as FIXABLE for automatic stripping
      issues.push({
        type: 'LANGUAGE',
        severity: 'FIXABLE',
        location: 'global',
        description: `Zero-tolerance foreign characters detected: ${languageCheck.foreignCharacters} chars from ${languageCheck.scriptsFound.join(', ')}. Auto-stripping required. Examples: "${languageCheck.foreignSamples.join('", "')}"`,
      });

      nodeLogger.warn({
        msg: 'Zero-tolerance scripts in minor foreign characters - marked FIXABLE for auto-strip',
        foreignCharacters: languageCheck.foreignCharacters,
        scriptsFound: languageCheck.scriptsFound,
        samples: languageCheck.foreignSamples,
      });
    } else {
      // Non-zero-tolerance scripts: keep as INFO
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
