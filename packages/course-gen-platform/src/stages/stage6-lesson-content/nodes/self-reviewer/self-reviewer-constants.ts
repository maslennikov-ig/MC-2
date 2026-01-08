/**
 * Self-Reviewer Constants and Configuration
 * @module stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-constants
 *
 * Centralized constants, schemas, and configuration for the self-reviewer node.
 */

import { z } from 'zod';
import { getTokenMultiplier } from '@megacampus/shared-types';
import type { LessonContentBody } from '@megacampus/shared-types/lesson-content';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Token usage for heuristic-only checks (no LLM calls).
 * Used when skipping LLM review due to critical failures.
 */
export const HEURISTIC_TOKENS_USED = 0;

/**
 * Per-attempt timeout for LLM self-review in milliseconds.
 * With 3 retries and exponential backoff (1s, 2s delays), max total time is ~100s.
 * Falls back to heuristic-only result after all retries fail.
 */
export const LLM_PER_ATTEMPT_TIMEOUT_MS = 30000;

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Zod schema for validating LLM issue response
 * Validates type and severity against allowed values, with fallback for unknown types
 */
export const LLMIssueSchema = z.object({
  type: z.enum(['LANGUAGE', 'TRUNCATION', 'ALIGNMENT', 'HALLUCINATION', 'HYGIENE', 'EMPTY', 'SHORT_SECTION', 'LOGIC']).catch('HYGIENE'),
  severity: z.enum(['CRITICAL', 'FIXABLE', 'COMPLEX', 'INFO']).catch('INFO'),
  location: z.string().default('global'),
  description: z.string().default('Unknown issue'),
});

// ============================================================================
// TYPES
// ============================================================================

/**
 * LLM response schema from self-reviewer prompt
 * Note: patched_content is optional - we use programmatic patching for HYGIENE issues
 */
export interface SelfReviewerLLMResponse {
  status: 'PASS' | 'PASS_WITH_FLAGS' | 'FIXED' | 'REGENERATE' | 'FLAG_TO_JUDGE';
  reasoning: string;
  issues: Array<{
    type: string;
    severity: string;
    location: string;
    description: string;
  }>;
  patched_content?: LessonContentBody | null;
}

/**
 * Heuristic check details for trace logging
 */
export interface HeuristicCheckDetails {
  languageCheck: {
    passed: boolean;
    foreignCharacters: number;
    scriptsFound: string[];
  };
  truncationCheck: {
    passed: boolean;
    issues: string[];
  };
  mermaidCheck?: {
    passed: boolean;
    issues: string[];
    affectedDiagrams: number;
    totalDiagrams: number;
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Self-Review configuration
 * Adjust thresholds based on production data
 *
 * Language threshold rationale:
 * - Code blocks are already excluded from checks (technical terms safe)
 * - In Russian educational content, CJK/Arabic chars in prose = always an error
 * - 10+ foreign chars indicates systematic generation issue, not typo
 * - Better to regenerate than ship low-quality content to users
 */
export const SELF_REVIEW_CONFIG = {
  /** Threshold for critical language failures (>10 chars = REGENERATE) */
  criticalLanguageThreshold: 10,
  /** Threshold for critical truncation failures (>2 issues = REGENERATE) */
  criticalTruncationThreshold: 2,
  /** Minimum maxTokens for self-reviewer response (high for JSON generation reliability) */
  minResponseTokens: 4000,
  /** Overhead tokens for status/reasoning/issues (without patched_content) */
  responseOverheadTokens: 1200,
  /** Buffer multiplier for maxTokens calculation (generous for JSON reliability) */
  tokenBufferMultiplier: 1.5,
} as const;

/**
 * Calculate dynamic maxTokens for self-reviewer LLM response
 *
 * The response may include patched_content (entire lesson content),
 * so maxTokens must accommodate the full content size + overhead.
 *
 * Formula: max(minTokens, (contentTokens + overhead) * buffer)
 *
 * @param contentLength - Length of lesson content in characters
 * @param language - Target language code (affects chars-per-token ratio)
 * @returns Calculated maxTokens for LLM call
 */
export function calculateSelfReviewerMaxTokens(contentLength: number, language: string): number {
  const multiplier = getTokenMultiplier(language);

  // Calculate content tokens (same logic as estimateSelfReviewerTokens)
  // Latin: ~4 chars/token, Cyrillic: ~3 chars/token
  const charsPerToken = 4 / multiplier;
  const contentTokens = Math.ceil(contentLength / charsPerToken);

  // Response needs: overhead + potentially full content (if FIXED with patched_content)
  const requiredTokens = contentTokens + SELF_REVIEW_CONFIG.responseOverheadTokens;

  // Apply buffer and ensure minimum
  const bufferedTokens = Math.ceil(requiredTokens * SELF_REVIEW_CONFIG.tokenBufferMultiplier);
  const maxTokens = Math.max(bufferedTokens, SELF_REVIEW_CONFIG.minResponseTokens);

  return maxTokens;
}
