/**
 * Content Validation Module
 * @module stages/stage6-lesson-content/validation/content-validator
 *
 * Comprehensive content quality validation that consolidates all checks
 * into a single unified validator. Aggregates results from:
 * - validateGeneratedContent (prompt marker detection)
 * - checkLanguageConsistency (CJK character detection)
 * - checkMermaidSyntax (diagram syntax validation)
 * - checkSectionDuplication (duplicate section detection)
 * - checkPromptMarkers (hallucination detection)
 * - sanitizeMermaidBlocks (auto-fix Mermaid issues)
 *
 * Used in:
 * - patcher/index.ts (before returning patched content)
 * - generator (after content generation)
 * - final lesson assembly
 *
 * Reference:
 * - docs/research/010-stage6-generation-strategy/cascade-evaluation.md
 * - specs/010-stages-456-pipeline/data-model.md
 */

import { logger } from '@/shared/logger';
import { validateGeneratedContent } from '../nodes/generator/generator-content';
import {
  checkLanguageConsistency,
  checkMermaidSyntax,
  checkSectionDuplication,
  checkPromptMarkers,
} from '../judge/heuristic-filter';
import { sanitizeMermaidBlocks } from '../utils/mermaid-sanitizer';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Issue type classification
 */
export type ContentIssueType =
  | 'PROMPT_MARKER' // LLM hallucination (reproducing training data)
  | 'CJK_CHARACTERS' // Chinese/Japanese/Korean in non-CJK content
  | 'MERMAID_SYNTAX' // Broken Mermaid diagram syntax
  | 'DUPLICATE_SECTION' // Repeated section titles
  | 'LANGUAGE_INCONSISTENCY'; // Mixed scripts (Cyrillic in English, etc.)

/**
 * Issue severity levels
 */
export type ContentIssueSeverity = 'critical' | 'major' | 'minor';

/**
 * Individual content quality issue
 */
export interface ContentIssue {
  /** Type of issue detected */
  type: ContentIssueType;
  /** Severity level (determines blocking behavior) */
  severity: ContentIssueSeverity;
  /** Human-readable description */
  description: string;
  /** Optional location info (line number, section name, etc.) */
  location?: string;
}

/**
 * Comprehensive content validation result
 */
export interface ContentValidationResult {
  /** Whether content passes all validation checks */
  isValid: boolean;
  /** Overall quality score (0-1) */
  score: number;
  /** List of detected issues */
  issues: ContentIssue[];
  /** Content with auto-fixes applied (Mermaid sanitization) */
  sanitizedContent?: string;
}

// ============================================================================
// SEVERITY WEIGHTS FOR SCORE CALCULATION
// ============================================================================

/**
 * Score reduction per issue severity
 * - Critical: -0.3 (30% score reduction per issue)
 * - Major: -0.15 (15% score reduction per issue)
 * - Minor: -0.05 (5% score reduction per issue)
 */
const SEVERITY_WEIGHTS = {
  critical: 0.3,
  major: 0.15,
  minor: 0.05,
} as const;

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate lesson content for quality issues
 *
 * Runs all validation checks in parallel and aggregates results.
 * Applies auto-fixes (Mermaid sanitization) and calculates quality score.
 *
 * **Validation Checks:**
 * 1. Prompt markers (critical: LLM hallucination)
 * 2. Language consistency (critical: CJK in Russian, etc.)
 * 3. Mermaid syntax (major: diagram rendering issues)
 * 4. Section duplication (major: repeated content)
 *
 * **Auto-fixes:**
 * - Mermaid syntax sanitization (escaped quotes, arrow syntax, etc.)
 *
 * **Score Calculation:**
 * - Starts at 1.0 (perfect)
 * - Reduces by severity weight per issue
 * - Final score clamped to [0, 1]
 *
 * **Validity:**
 * - isValid = true if no CRITICAL issues
 * - Major/minor issues reduce score but don't block
 *
 * @param content - Raw lesson content (markdown string)
 * @param language - Expected language code (ru, en, zh, etc.)
 * @returns Validation result with score, issues, and sanitized content
 *
 * @example
 * ```typescript
 * const result = validateLessonContent(rawContent, 'ru');
 *
 * if (!result.isValid) {
 *   logger.error({ issues: result.issues }, 'Content validation failed');
 *   // Handle critical issues (regenerate content)
 * } else if (result.score < 0.7) {
 *   logger.warn({ score: result.score }, 'Content quality below threshold');
 *   // Handle quality concerns (review/patch)
 * } else {
 *   // Use sanitized content
 *   const finalContent = result.sanitizedContent || content;
 * }
 * ```
 */
export function validateLessonContent(
  content: string,
  language: string = 'ru'
): ContentValidationResult {
  const startTime = Date.now();
  const issues: ContentIssue[] = [];

  // -------------------------------------------------------------------------
  // Step 1: Run all validation checks in parallel
  // -------------------------------------------------------------------------

  // Check 1: Prompt markers (from generator-content.ts)
  const promptMarkerCheck = validateGeneratedContent(content);
  if (!promptMarkerCheck.isValid) {
    for (const marker of promptMarkerCheck.detectedMarkers) {
      issues.push({
        type: 'PROMPT_MARKER',
        severity: 'critical',
        description: `Prompt template marker detected: "${marker}"`,
        location: 'content',
      });
    }
  }

  // Check 2: Alternative prompt marker check (from heuristic-filter.ts)
  // This catches additional markers not in generator-content list
  const heuristicPromptCheck = checkPromptMarkers(content);
  if (!heuristicPromptCheck.passed) {
    for (const marker of heuristicPromptCheck.detectedMarkers) {
      // Avoid duplicate issues
      const alreadyReported = issues.some(
        issue => issue.type === 'PROMPT_MARKER' && issue.description.includes(marker)
      );
      if (!alreadyReported) {
        issues.push({
          type: 'PROMPT_MARKER',
          severity: 'critical',
          description: `Prompt template marker detected: "${marker}"`,
          location: 'content',
        });
      }
    }
  }

  // Check 3: Language consistency (CJK in Russian, etc.)
  const languageCheck = checkLanguageConsistency(content, language);
  if (!languageCheck.passed) {
    issues.push({
      type: 'LANGUAGE_INCONSISTENCY',
      severity: 'critical',
      description: `Found ${languageCheck.foreignCharacters} unexpected characters from ${languageCheck.scriptsFound.join(', ')} script(s)`,
      location: `Examples: ${languageCheck.foreignSamples.slice(0, 3).join(', ')}`,
    });

    // Add CJK-specific issue if CJK script detected
    if (languageCheck.scriptsFound.includes('CJK')) {
      issues.push({
        type: 'CJK_CHARACTERS',
        severity: 'critical',
        description: `Chinese/Japanese/Korean characters detected in ${language} content`,
        location: `Samples: ${languageCheck.foreignSamples.slice(0, 3).join(', ')}`,
      });
    }
  }

  // Check 4: Mermaid syntax issues
  const mermaidCheck = checkMermaidSyntax(content);
  if (!mermaidCheck.passed) {
    issues.push({
      type: 'MERMAID_SYNTAX',
      severity: 'major',
      description: `Mermaid syntax issues in ${mermaidCheck.affectedDiagrams}/${mermaidCheck.totalDiagrams} diagrams`,
      location: mermaidCheck.mermaidIssues.slice(0, 3).join('; '),
    });
  }

  // Check 5: Section duplication
  const duplicationCheck = checkSectionDuplication(content);
  if (!duplicationCheck.passed) {
    const severity: ContentIssueSeverity =
      duplicationCheck.duplicatePairs.length > 2 ? 'critical' : 'major';
    issues.push({
      type: 'DUPLICATE_SECTION',
      severity,
      description: `Found ${duplicationCheck.duplicatePairs.length} duplicate section pairs`,
      location: duplicationCheck.duplicatePairs
        .slice(0, 2)
        .map(p => `"${p.title1}" ≈ "${p.title2}"`)
        .join('; '),
    });
  }

  // -------------------------------------------------------------------------
  // Step 2: Apply auto-fixes (Mermaid sanitization)
  // -------------------------------------------------------------------------

  const sanitizeResult = sanitizeMermaidBlocks(content);
  const sanitizedContent = sanitizeResult.modified ? sanitizeResult.content : undefined;

  if (sanitizeResult.modified) {
    logger.debug(
      {
        fixCount: sanitizeResult.fixes.length,
        fixTypes: sanitizeResult.fixes.map(f => f.type),
      },
      'Content validator: Applied Mermaid auto-fixes'
    );
  }

  // -------------------------------------------------------------------------
  // Step 3: Calculate quality score
  // -------------------------------------------------------------------------

  let score = 1.0;

  // Reduce score based on issue severity
  for (const issue of issues) {
    score -= SEVERITY_WEIGHTS[issue.severity];
  }

  // Clamp score to [0, 1]
  score = Math.max(0, Math.min(1, score));

  // -------------------------------------------------------------------------
  // Step 4: Determine validity (no critical issues)
  // -------------------------------------------------------------------------

  const hasCriticalIssues = issues.some(issue => issue.severity === 'critical');
  const isValid = !hasCriticalIssues;

  const durationMs = Date.now() - startTime;

  // -------------------------------------------------------------------------
  // Step 5: Log results
  // -------------------------------------------------------------------------

  if (!isValid) {
    logger.warn(
      {
        isValid,
        score: score.toFixed(2),
        criticalIssues: issues.filter(i => i.severity === 'critical').length,
        majorIssues: issues.filter(i => i.severity === 'major').length,
        minorIssues: issues.filter(i => i.severity === 'minor').length,
        durationMs,
      },
      'Content validation FAILED'
    );
  } else if (score < 0.7) {
    logger.warn(
      {
        isValid,
        score: score.toFixed(2),
        issueCount: issues.length,
        durationMs,
      },
      'Content validation passed but quality score below threshold'
    );
  } else {
    logger.info(
      {
        isValid,
        score: score.toFixed(2),
        issueCount: issues.length,
        durationMs,
      },
      'Content validation passed'
    );
  }

  return {
    isValid,
    score,
    issues,
    sanitizedContent,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get issues by severity level
 *
 * @param result - Validation result
 * @param severity - Severity level to filter by
 * @returns Issues matching the severity level
 */
export function getIssuesBySeverity(
  result: ContentValidationResult,
  severity: ContentIssueSeverity
): ContentIssue[] {
  return result.issues.filter(issue => issue.severity === severity);
}

/**
 * Get issues by type
 *
 * @param result - Validation result
 * @param type - Issue type to filter by
 * @returns Issues matching the type
 */
export function getIssuesByType(
  result: ContentValidationResult,
  type: ContentIssueType
): ContentIssue[] {
  return result.issues.filter(issue => issue.type === type);
}

/**
 * Format validation result as human-readable string
 *
 * @param result - Validation result
 * @returns Formatted string with score and issues
 */
export function formatValidationResult(result: ContentValidationResult): string {
  const lines: string[] = [];

  lines.push(`Content Validation: ${result.isValid ? 'PASSED' : 'FAILED'}`);
  lines.push(`Quality Score: ${(result.score * 100).toFixed(0)}%`);

  if (result.issues.length > 0) {
    lines.push(`\nIssues (${result.issues.length}):`);

    // Group by severity
    const critical = getIssuesBySeverity(result, 'critical');
    const major = getIssuesBySeverity(result, 'major');
    const minor = getIssuesBySeverity(result, 'minor');

    if (critical.length > 0) {
      lines.push(`\n  CRITICAL (${critical.length}):`);
      for (const issue of critical) {
        lines.push(`    - ${issue.description}`);
        if (issue.location) {
          lines.push(`      Location: ${issue.location}`);
        }
      }
    }

    if (major.length > 0) {
      lines.push(`\n  MAJOR (${major.length}):`);
      for (const issue of major) {
        lines.push(`    - ${issue.description}`);
        if (issue.location) {
          lines.push(`      Location: ${issue.location}`);
        }
      }
    }

    if (minor.length > 0) {
      lines.push(`\n  MINOR (${minor.length}):`);
      for (const issue of minor) {
        lines.push(`    - ${issue.description}`);
      }
    }
  } else {
    lines.push('\nNo issues detected.');
  }

  return lines.join('\n');
}
