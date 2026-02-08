/**
 * InlineFixer - Zero-token surgical fixes
 * @module stages/stage6-lesson-content/judge/inline-fixer
 *
 * Attempts to apply Judge's inlineReplacement directly via string replacement.
 * Falls back to Patcher/Expander if replacement fails.
 *
 * Algorithm: Cascade Search
 * 1. Exact match
 * 2. Flexible regex (normalized whitespace)
 * 3. Fallback to LLM
 *
 * Token savings: ~1500 tokens per successful inline fix
 * (avoids calling Patcher LLM for simple text replacements)
 */

import type { JudgeIssue, TargetedIssue, JudgeCriterion } from '@megacampus/shared-types';
import { logger } from '@/shared/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface InlineFixResult {
  /** Whether all eligible fixes were applied successfully */
  success: boolean;
  /** Modified content */
  content: string;
  /** IDs of successfully applied fixes */
  appliedFixes: string[];
  /** Issues that couldn't be fixed inline (need LLM) */
  failedFixes: TargetedIssue[];
  /** Metrics for tracking */
  metrics: {
    attempted: number;
    succeeded: number;
    failed: number;
    tokensSaved: number; // Estimate: succeeded * 1500
  };
}

export interface ApplyFixResult {
  success: boolean;
  content: string;
  reason?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Blacklist: criteria that need LLM creativity
 * These require understanding context and generating new content.
 * Any criteria NOT in this list can potentially use inline fixes
 * if they have quotedText + inlineReplacement.
 *
 * Whitelist criteria (factual_accuracy, clarity_readability) are implicitly
 * handled - they're not in blacklist and are most likely to have inline fixes.
 */
const INLINE_FIX_BLACKLIST = new Set<JudgeCriterion>([
  'pedagogical_structure', // requires restructuring
  'engagement_examples', // requires creative generation
  'completeness', // requires adding new content
]);

/**
 * Configuration constants
 */
const CONFIG = {
  /** Maximum length for inline replacement */
  MAX_REPLACEMENT_LENGTH: 300,
  /** Minimum ratio of replacement to original (0.5 = 50%) */
  MIN_LENGTH_RATIO: 0.5,
  /** Maximum ratio of replacement to original (2.0 = 200%) */
  MAX_LENGTH_RATIO: 2.0,
  /** Estimated tokens saved per successful inline fix */
  TOKENS_SAVED_PER_FIX: 1500,
};

// ============================================================================
// ELIGIBILITY CHECK
// ============================================================================

/**
 * Check if issue is eligible for inline fix
 *
 * Criteria:
 * 1. Must have both quotedText and inlineReplacement
 * 2. Criterion must not be in blacklist
 * 3. Replacement length within reasonable bounds
 */
export function isEligibleForInlineFix(issue: JudgeIssue | TargetedIssue): boolean {
  // Must have both quotedText and inlineReplacement
  if (!issue.quotedText || !issue.inlineReplacement) {
    return false;
  }

  // Must not be in blacklist (needs LLM creativity)
  if (INLINE_FIX_BLACKLIST.has(issue.criterion)) {
    return false;
  }

  // Length heuristic: if replacement is >50% different, probably needs LLM
  const lengthRatio = issue.inlineReplacement.length / issue.quotedText.length;
  if (lengthRatio < CONFIG.MIN_LENGTH_RATIO || lengthRatio > CONFIG.MAX_LENGTH_RATIO) {
    return false;
  }

  // Size limit: very large replacements should go to LLM
  if (issue.inlineReplacement.length > CONFIG.MAX_REPLACEMENT_LENGTH) {
    return false;
  }

  return true;
}

// ============================================================================
// CASCADE SEARCH
// ============================================================================

interface CascadeSearchResult {
  found: boolean;
  index: number;
  matchedText: string;
  method: 'exact' | 'flexible' | 'not_found';
}

/**
 * Try to find text using cascade search
 *
 * 1. Exact match (fastest, most reliable)
 * 2. Flexible regex (normalized whitespace)
 * 3. Not found (fallback to LLM)
 */
function cascadeSearch(content: string, searchText: string): CascadeSearchResult {
  // 1. Exact match
  const exactIndex = content.indexOf(searchText);
  if (exactIndex !== -1) {
    return { found: true, index: exactIndex, matchedText: searchText, method: 'exact' };
  }

  // 2. Flexible regex: normalize whitespace
  const escapedText = escapeRegex(searchText);
  const flexiblePattern = escapedText.replace(/\\s+/g, '\\s+');
  const regex = new RegExp(flexiblePattern);
  const match = content.match(regex);

  if (match && match.index !== undefined) {
    return { found: true, index: match.index, matchedText: match[0], method: 'flexible' };
  }

  // 3. Not found
  return { found: false, index: -1, matchedText: '', method: 'not_found' };
}

// ============================================================================
// MARKDOWN VALIDATION
// ============================================================================

/**
 * Basic markdown integrity validation
 *
 * Checks that replacement didn't break markdown structure:
 * - Balanced inline markers (**, `, _)
 * - Balanced code blocks (```)
 */
function validateMarkdownIntegrity(content: string): boolean {
  // Check balanced inline markers
  const inlineMarkers = ['**', '`', '_'];
  for (const marker of inlineMarkers) {
    const count = (content.match(new RegExp(escapeRegex(marker), 'g')) || []).length;
    if (count % 2 !== 0) {
      return false;
    }
  }

  // Check code blocks are balanced
  const codeBlockCount = (content.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    return false;
  }

  return true;
}

// ============================================================================
// APPLY FIX
// ============================================================================

/**
 * Apply inline fix to section content
 *
 * Steps:
 * 1. Cascade search for quotedText
 * 2. Verify uniqueness (exactly 1 occurrence)
 * 3. Apply replacement
 * 4. Validate markdown integrity
 */
export function applyInlineFix(
  sectionContent: string,
  issue: JudgeIssue | TargetedIssue
): ApplyFixResult {
  const issueId = 'id' in issue ? issue.id : 'unknown';

  if (!issue.quotedText || !issue.inlineReplacement) {
    return { success: false, content: sectionContent, reason: 'missing_replacement' };
  }

  // Cascade search
  const search = cascadeSearch(sectionContent, issue.quotedText);

  if (!search.found) {
    logger.debug(
      { issueId, quotedText: issue.quotedText.slice(0, 50) },
      'InlineFixer: text not found, falling back to Patcher'
    );
    return { success: false, content: sectionContent, reason: 'text_not_found' };
  }

  // Check uniqueness: must be exactly 1 occurrence
  const occurrences = sectionContent.split(search.matchedText).length - 1;
  if (occurrences > 1) {
    logger.debug(
      { issueId, occurrences },
      'InlineFixer: multiple occurrences found, falling back to Patcher'
    );
    return { success: false, content: sectionContent, reason: 'multiple_occurrences' };
  }

  // Apply replacement
  const newContent = sectionContent.replace(search.matchedText, issue.inlineReplacement);

  // Validate: basic markdown integrity check
  if (!validateMarkdownIntegrity(newContent)) {
    logger.warn({ issueId }, 'InlineFixer: replacement broke markdown, rolling back');
    return { success: false, content: sectionContent, reason: 'markdown_broken' };
  }

  logger.info(
    {
      issueId,
      criterion: issue.criterion,
      originalLength: issue.quotedText.length,
      replacementLength: issue.inlineReplacement.length,
      searchMethod: search.method,
    },
    'InlineFixer: successfully applied inline fix'
  );

  return { success: true, content: newContent };
}

// ============================================================================
// PROCESS BATCH
// ============================================================================

/**
 * Process all issues for a section, applying inline fixes where possible
 *
 * Returns:
 * - Modified content with successful fixes applied
 * - List of applied fix IDs
 * - List of failed issues (need Patcher/Expander)
 * - Metrics for tracking
 */
export function processInlineFixes(
  sectionContent: string,
  issues: TargetedIssue[]
): InlineFixResult {
  let content = sectionContent;
  const appliedFixes: string[] = [];
  const failedFixes: TargetedIssue[] = [];
  let attempted = 0;

  for (const issue of issues) {
    if (!isEligibleForInlineFix(issue)) {
      failedFixes.push(issue);
      continue;
    }

    attempted++;
    const result = applyInlineFix(content, issue);

    if (result.success) {
      content = result.content;
      appliedFixes.push(issue.id);
    } else {
      failedFixes.push(issue);
    }
  }

  const metrics = {
    attempted,
    succeeded: appliedFixes.length,
    failed: attempted - appliedFixes.length,
    tokensSaved: appliedFixes.length * CONFIG.TOKENS_SAVED_PER_FIX,
  };

  if (appliedFixes.length > 0) {
    logger.info({ metrics, appliedFixIds: appliedFixes }, 'InlineFixer: batch processing complete');
  }

  return {
    success: failedFixes.length === 0,
    content,
    appliedFixes,
    failedFixes,
    metrics,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// FEATURE FLAG
// ============================================================================

/**
 * Feature flag for gradual rollout
 * Set FEATURE_INLINE_FIXER=false to disable
 */
export const INLINE_FIXER_ENABLED = process.env.FEATURE_INLINE_FIXER !== 'false';
