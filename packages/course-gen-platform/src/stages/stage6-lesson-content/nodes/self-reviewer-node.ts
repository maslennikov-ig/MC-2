/**
 * Self-Reviewer Node for Stage 6 Lesson Content Generation
 * @module stages/stage6-lesson-content/nodes/self-reviewer-node
 *
 * Implements Fail-Fast pre-judge validation to reduce Judge token costs by 30-50%.
 * Runs between Smoother and Judge nodes.
 *
 * Architecture:
 * 1. Phase 1: Heuristic Pre-Checks (FREE, no LLM cost)
 *    - Language consistency (Unicode script detection)
 *    - Content truncation (incomplete sentences, unmatched code blocks)
 *    - Critical errors trigger immediate REGENERATE
 *
 * 2. Phase 2: LLM-based Self-Review (if heuristics pass)
 *    - Semantic validation using self-reviewer-prompt.ts
 *    - Self-fix capability for hygiene issues
 *    - Factual accuracy and alignment checks
 *
 * Status outcomes:
 * - PASS: Content clean, proceed to Judge
 * - PASS_WITH_FLAGS: Minor observations noted, proceed to Judge
 * - FIXED: Content patched, proceed to Judge with patched_content
 * - REGENERATE: Fatal errors, skip Judge and return failure
 * - FLAG_TO_JUDGE: Semantic issues flagged for Judge attention
 *
 * Reference:
 * - docs/DeepThink/enrichment-add-flow-ux-analysis.md
 * - specs/022-lesson-enrichments/stage-7-lesson-enrichments.md
 */

import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { metricsStore } from '@/orchestrator/metrics';
import type {
  LessonGraphStateType,
  LessonGraphStateUpdate,
} from '../state';
import type {
  SelfReviewResult,
  SelfReviewIssue,
  SelfReviewStatus,
  ProgressSummary,
  NodeAttemptSummary,
  SummaryItem,
} from '@megacampus/shared-types/judge-types';
import {
  checkLanguageConsistency,
  checkContentTruncation,
  checkMermaidSyntax,
} from '../judge/heuristic-filter';
import { MODEL_FALLBACK } from '../config';
import { locationToSectionId } from '../utils/markdown-section-parser';
import { LLMClient } from '@/shared/llm';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import {
  buildSelfReviewerSystemPrompt,
  buildSelfReviewerUserMessage,
  estimateSelfReviewerTokens,
} from '../judge/self-reviewer/self-reviewer-prompt';
import { getTokenMultiplier } from '@megacampus/shared-types';
import type { LessonContentBody } from '@megacampus/shared-types/lesson-content';
import { LessonContentBodySchema } from '@megacampus/shared-types/lesson-content';
import { z } from 'zod';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Token usage for heuristic-only checks (no LLM calls).
 * Used when skipping LLM review due to critical failures.
 */
const HEURISTIC_TOKENS_USED = 0;

/**
 * Per-attempt timeout for LLM self-review in milliseconds.
 * With 3 retries and exponential backoff (1s, 2s delays), max total time is ~100s.
 * Falls back to heuristic-only result after all retries fail.
 */
const LLM_PER_ATTEMPT_TIMEOUT_MS = 30000;

/**
 * Zod schema for validating LLM issue response
 * Validates type and severity against allowed values, with fallback for unknown types
 */
const LLMIssueSchema = z.object({
  type: z.enum(['LANGUAGE', 'TRUNCATION', 'ALIGNMENT', 'HALLUCINATION', 'HYGIENE', 'EMPTY', 'SHORT_SECTION', 'LOGIC']).catch('HYGIENE'),
  severity: z.enum(['CRITICAL', 'FIXABLE', 'COMPLEX', 'INFO']).catch('INFO'),
  location: z.string().default('global'),
  description: z.string().default('Unknown issue'),
});

/**
 * LLM response schema from self-reviewer prompt
 * Note: patched_content is optional - we use programmatic patching for HYGIENE issues
 */
interface SelfReviewerLLMResponse {
  status: SelfReviewStatus;
  reasoning: string;
  issues: Array<{
    type: string;
    severity: string;
    location: string;
    description: string;
  }>;
  patched_content?: LessonContentBody | null;
}

// ============================================================================
// FOREIGN CHARACTER SECTION DETECTION
// ============================================================================

/**
 * Unicode ranges for foreign script detection (matching heuristic-filter.ts)
 *
 * IMPORTANT: Do NOT use /g flag here!
 * RegExp.test() with /g flag retains lastIndex between calls, causing
 * intermittent failures when checking multiple sections. Without /g,
 * test() always starts from index 0.
 */
const FOREIGN_SCRIPT_PATTERNS: Record<string, RegExp> = {
  CJK: /[\u4E00-\u9FFF\u3400-\u4DBF]/,
  ARABIC: /[\u0600-\u06FF]/,
  DEVANAGARI: /[\u0900-\u097F]/,
  THAI: /[\u0E00-\u0E7F]/,
  HEBREW: /[\u0590-\u05FF]/,
};

/**
 * Find sections containing foreign script characters
 *
 * Parses markdown into sections and checks each for unexpected characters.
 * Returns section IDs (introduction, section_1, section_2, summary) for partial regeneration.
 *
 * @param content - Full markdown content
 * @param scriptsToFind - Scripts to look for (e.g., ['CJK', 'ARABIC'])
 * @returns Array of affected section IDs
 */
function findSectionsWithForeignCharacters(
  content: string,
  scriptsToFind: string[]
): string[] {
  const affectedSections: string[] = [];

  // Split content by ## headers (markdown section boundaries)
  const sectionRegex = /^##\s+(.+)$/gm;
  const sections: Array<{ title: string; content: string; startIndex: number }> = [];

  let match: RegExpExecArray | null;
  let sectionNumber = 0;

  // Extract introduction (content before first ## header)
  const firstHeaderMatch = content.match(/^##\s+/m);
  if (firstHeaderMatch && firstHeaderMatch.index !== undefined && firstHeaderMatch.index > 0) {
    sections.push({
      title: 'Introduction',
      content: content.slice(0, firstHeaderMatch.index),
      startIndex: 0,
    });
  }

  // Extract sections
  const matches: Array<{ title: string; index: number }> = [];
  while ((match = sectionRegex.exec(content)) !== null) {
    matches.push({ title: match[1], index: match.index });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i < matches.length - 1 ? matches[i + 1].index : content.length;
    sections.push({
      title: matches[i].title,
      content: content.slice(start, end),
      startIndex: start,
    });
  }

  // Check each section for foreign characters
  for (const section of sections) {
    // Remove code blocks before checking (foreign chars in code are OK)
    const proseContent = section.content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');

    let hasForeignChars = false;
    for (const scriptKey of scriptsToFind) {
      const pattern = FOREIGN_SCRIPT_PATTERNS[scriptKey];
      if (pattern && pattern.test(proseContent)) {
        hasForeignChars = true;
        break;
      }
    }

    if (hasForeignChars) {
      // Map section title to section ID
      const lowerTitle = section.title.toLowerCase();

      if (lowerTitle.includes('введение') || lowerTitle.includes('introduction')) {
        affectedSections.push('introduction');
      } else if (lowerTitle.includes('итог') || lowerTitle.includes('заключение') ||
                 lowerTitle.includes('summary') || lowerTitle.includes('conclusion')) {
        affectedSections.push('summary');
      } else {
        // For numbered sections, extract section number
        sectionNumber++;
        affectedSections.push(`section_${sectionNumber}`);
      }
    } else {
      // Still increment section number for non-intro/summary sections
      const lowerTitle = section.title.toLowerCase();
      if (!lowerTitle.includes('введение') && !lowerTitle.includes('introduction') &&
          !lowerTitle.includes('итог') && !lowerTitle.includes('заключение') &&
          !lowerTitle.includes('summary') && !lowerTitle.includes('conclusion') &&
          section.title !== 'Introduction') {
        sectionNumber++;
      }
    }
  }

  // Deduplicate
  return [...new Set(affectedSections)];
}

/**
 * Common chatbot artifact patterns to remove
 * These are AI-generated phrases that shouldn't appear in educational content
 * Patterns use multiline mode (m) and don't require start/end anchors to catch mid-text occurrences
 *
 * Pattern design:
 * - Each pattern targets a specific chatbot phrase style
 * - Use .*? for minimal matching to avoid over-removal
 * - Include sentence-ending punctuation to capture complete phrases
 */
const CHATBOT_ARTIFACT_PATTERNS: RegExp[] = [
  // English patterns - sentences that can appear anywhere
  /Sure[,!]?\s*(?:here\s+is|I('ll|'d)\s+(?:explain|help|provide)|let\s+me).*?[!.]/gim,
  /(?:As\s+)?(?:an?\s+)?AI\s+(?:language\s+)?model.*?[.!]/gim,
  /I\s+(?:hope|think)\s+this\s+(?:\w+\s+)?helps?.*?[!.]/gim,
  /(?:In\s+conclusion,?\s+)?I\s+have\s+(?:explained|shown|demonstrated).*?[.!]/gim,
  /Let\s+me\s+know\s+if\s+(?:you\s+)?(?:need|have|want).*?[.!]/gim,
  /Feel\s+free\s+to\s+(?:ask|reach\s+out).*?[.!]/gim,
  /(?:Certainly|Absolutely)[!,]?\s*(?:I('ll|'d)\s+)?.*?[!.]/gim,
  /Of\s+course[!,]?\s*(?:I('ll|'d)\s+)?.*?[!.]/gim,
  // Russian patterns
  /Конечно[,!]?\s*(?:я\s+)?(?:объясню|расскажу|помогу).*?[!.]/gim,
  /Как\s+(?:языковая\s+)?модель\s+(?:ИИ|AI).*?[.!]/gim,
  /Надеюсь,?\s+(?:это\s+)?(?:поможет|помогло).*?[!.]/gim,
  /(?:В\s+заключение,?\s+)?я\s+(?:объяснил|рассказал|показал).*?[.!]/gim,
  /(?:Если\s+)?(?:у\s+вас\s+)?есть\s+(?:вопросы|что-то).*?[.!]/gim,
];

/**
 * Protected block placeholder for code/mermaid blocks during artifact removal
 */
interface ProtectedBlock {
  placeholder: string;
  content: string;
}

/**
 * Remove chatbot artifacts from content while preserving code blocks and mermaid diagrams
 *
 * CRITICAL: Mermaid diagrams and code blocks are protected infrastructure.
 * They are extracted before processing and restored after, ensuring they
 * remain completely untouched by artifact removal patterns.
 *
 * @param content - Raw markdown content
 * @returns Cleaned content with artifacts removed (code/mermaid intact)
 *
 * @example
 * ```typescript
 * const content = 'Sure, here is the lesson!\n```mermaid\ngraph TD\nA --> B\n```';
 * const cleaned = removeChatbotArtifacts(content);
 * // Mermaid preserved, "Sure, here is the lesson!" removed
 * ```
 */
export function removeChatbotArtifacts(content: string): string {
  // Step 1: Extract and protect code blocks (including mermaid)
  // Pattern matches ```language ... ``` blocks
  const protectedBlocks: ProtectedBlock[] = [];
  let blockIndex = 0;

  // Replace all code blocks with placeholders
  let processedContent = content.replace(
    /```[\s\S]*?```/g,
    (match) => {
      const placeholder = `__PROTECTED_BLOCK_${blockIndex}__`;
      protectedBlocks.push({ placeholder, content: match });
      blockIndex++;
      return placeholder;
    }
  );

  // Also protect inline code (backticks)
  processedContent = processedContent.replace(
    /`[^`]+`/g,
    (match) => {
      const placeholder = `__PROTECTED_INLINE_${blockIndex}__`;
      protectedBlocks.push({ placeholder, content: match });
      blockIndex++;
      return placeholder;
    }
  );

  // Also protect LaTeX formulas
  processedContent = processedContent.replace(
    /\$\$[\s\S]*?\$\$/g,
    (match) => {
      const placeholder = `__PROTECTED_LATEX_BLOCK_${blockIndex}__`;
      protectedBlocks.push({ placeholder, content: match });
      blockIndex++;
      return placeholder;
    }
  );
  processedContent = processedContent.replace(
    /\$[^$]+\$/g,
    (match) => {
      const placeholder = `__PROTECTED_LATEX_INLINE_${blockIndex}__`;
      protectedBlocks.push({ placeholder, content: match });
      blockIndex++;
      return placeholder;
    }
  );

  // Step 2: Apply chatbot artifact removal to prose text only
  for (const pattern of CHATBOT_ARTIFACT_PATTERNS) {
    processedContent = processedContent.replace(pattern, '');
  }

  // Step 3: Restore all protected blocks
  // IMPORTANT: Use a function replacement to avoid $ being interpreted as special replacement pattern
  // In String.replace(), $$ means literal $, so "$$x$$" would become "$x$" if not escaped
  for (const block of protectedBlocks) {
    processedContent = processedContent.replace(block.placeholder, () => block.content);
  }

  // Clean up multiple consecutive newlines created by removal
  processedContent = processedContent.replace(/\n{3,}/g, '\n\n');

  // Trim leading/trailing whitespace
  processedContent = processedContent.trim();

  return processedContent;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Heuristic check details for trace logging
 */
interface HeuristicCheckDetails {
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
// CONSTANTS
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
function calculateSelfReviewerMaxTokens(contentLength: number, language: string): number {
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Retry helper with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier: number;
    retryOn?: (error: Error) => boolean;
  }
): Promise<T> {
  const { maxAttempts, delayMs, backoffMultiplier, retryOn } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const shouldRetry = retryOn ? retryOn(lastError) : true;
      if (!shouldRetry || attempt === maxAttempts) {
        throw lastError;
      }

      const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Build heuristic check details for trace logging
 *
 * @param languageCheck - Language consistency check result
 * @param truncationCheck - Content truncation check result
 * @returns Structured heuristic details
 */
function buildHeuristicDetails(
  languageCheck: ReturnType<typeof checkLanguageConsistency>,
  truncationCheck: ReturnType<typeof checkContentTruncation>,
  mermaidCheck?: ReturnType<typeof checkMermaidSyntax>
): HeuristicCheckDetails {
  const details: HeuristicCheckDetails = {
    languageCheck: {
      passed: languageCheck.passed,
      foreignCharacters: languageCheck.foreignCharacters,
      scriptsFound: languageCheck.scriptsFound,
    },
    truncationCheck: {
      passed: truncationCheck.passed,
      issues: truncationCheck.truncationIssues,
    },
  };

  if (mermaidCheck) {
    details.mermaidCheck = {
      passed: mermaidCheck.passed,
      issues: mermaidCheck.mermaidIssues,
      affectedDiagrams: mermaidCheck.affectedDiagrams,
      totalDiagrams: mermaidCheck.totalDiagrams,
    };
  }

  return details;
}

/**
 * Determine final status based on issues
 *
 * @param criticalIssues - Critical issues found
 * @param minorIssues - Minor issues found
 * @returns Self-review status
 */
function determineFinalStatus(
  criticalIssues: SelfReviewIssue[],
  minorIssues: SelfReviewIssue[]
): SelfReviewStatus {
  if (criticalIssues.length > 0) {
    return 'REGENERATE';
  }

  if (minorIssues.length > 0) {
    return 'PASS_WITH_FLAGS';
  }

  return 'PASS';
}

/**
 * Extract unique section IDs from issues that are fixable
 *
 * Only includes sections with FIXABLE or COMPLEX issues (not CRITICAL).
 * Used to populate sectionsToRegenerate for partial content fixes.
 *
 * @param issues - List of self-review issues
 * @returns Array of unique section IDs
 */
function extractSectionsToRegenerate(issues: SelfReviewIssue[]): string[] {
  const sectionIds = new Set<string>();

  for (const issue of issues) {
    // Only include fixable/complex issues, not critical (which require full regen)
    if (issue.severity === 'CRITICAL') {
      continue;
    }

    // Map location to section ID
    const sectionId = locationToSectionId(issue.location);
    if (sectionId) {
      sectionIds.add(sectionId);
    }
  }

  return Array.from(sectionIds);
}

/**
 * Build reasoning message based on status and issues
 *
 * @param status - Self-review status
 * @param criticalCount - Number of critical issues
 * @param minorCount - Number of minor issues
 * @returns Human-readable reasoning
 */
function buildReasoningMessage(
  status: SelfReviewStatus,
  criticalCount: number,
  minorCount: number
): string {
  switch (status) {
    case 'REGENERATE':
      return `Critical issues detected: ${criticalCount} critical failures found in heuristic checks`;
    case 'PASS_WITH_FLAGS':
      return `Heuristic checks passed with ${minorCount} minor observations`;
    case 'PASS':
      return 'Content passed all heuristic pre-checks';
    case 'FIXED':
      return 'Content patched to fix minor hygiene issues';
    case 'FLAG_TO_JUDGE':
      return 'Semantic issues flagged for Judge attention';
    default:
      return 'Unknown status';
  }
}

/**
 * Build heuristic-only result when LLM review is skipped
 */
function buildHeuristicOnlyResult(
  heuristicDetails: HeuristicCheckDetails,
  issues: SelfReviewIssue[],
  language: string,
  state: LessonGraphStateType,
  startTime: number
): LessonGraphStateUpdate {
  const criticalIssues = issues.filter((i) => i.severity === 'CRITICAL');
  const minorIssues = issues.filter((i) => i.severity !== 'CRITICAL');
  const durationMs = Date.now() - startTime;
  const finalStatus = determineFinalStatus(criticalIssues, minorIssues);
  const reasoning = buildReasoningMessage(finalStatus, criticalIssues.length, minorIssues.length);

  const result: SelfReviewResult = {
    status: finalStatus,
    reasoning: `${reasoning} (LLM review skipped)`,
    issues,
    patchedContent: null,
    tokensUsed: HEURISTIC_TOKENS_USED,
    durationMs,
    heuristicsPassed: true,
    heuristicDetails,
  };

  const progress = buildSelfReviewProgressSummary(
    finalStatus,
    issues,
    language,
    heuristicDetails,
    false, // llmReviewPerformed
    false, // patchedContent
    durationMs,
    (state.retryCount || 0) + 1,
    state.progressSummary
  );

  return {
    currentNode: 'selfReviewer',
    selfReviewResult: result,
    progressSummary: progress,
  };
}

/**
 * Attempt to repair truncated JSON
 *
 * Handles common truncation patterns:
 * - Unterminated strings: add closing quote
 * - Unclosed arrays: add ]
 * - Unclosed objects: add }
 * - Truncated patched_content: remove incomplete field and set to null
 *
 * @param jsonString - Potentially truncated JSON string
 * @returns Repaired JSON string or original if repair fails
 */
function repairTruncatedJson(jsonString: string): string {
  let repaired = jsonString.trim();

  // Strategy 1: If patched_content is truncated, remove it entirely
  // Pattern: "patched_content": { or "patched_content": "
  // followed by incomplete content until end
  const patchedContentMatch = repaired.match(/"patched_content"\s*:\s*[{\["]/);
  if (patchedContentMatch) {
    const startIndex = patchedContentMatch.index!;
    // Check if this is at the end and truncated (no proper closing)
    const afterPatchedContent = repaired.slice(startIndex);
    // If there's no complete JSON structure after patched_content, truncate it
    try {
      // Try to find if patched_content is complete by checking bracket balance
      let depth = 0;
      let inStr = false;
      let esc = false;
      let foundStart = false;
      let endIndex = -1;

      for (let i = 0; i < afterPatchedContent.length; i++) {
        const c = afterPatchedContent[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"' && !esc) { inStr = !inStr; continue; }
        if (inStr) continue;

        if (c === '{' || c === '[') {
          if (!foundStart) foundStart = true;
          depth++;
        } else if (c === '}' || c === ']') {
          depth--;
          if (foundStart && depth === 0) {
            endIndex = i;
            break;
          }
        }
      }

      // If we didn't find a complete patched_content, remove it
      if (endIndex === -1) {
        repaired = repaired.slice(0, startIndex) + '"patched_content": null';
        logger.debug({ msg: 'Removed truncated patched_content field' });
      }
    } catch {
      // On any error, just remove patched_content
      repaired = repaired.slice(0, startIndex) + '"patched_content": null';
    }
  }

  // Strategy 2: Remove trailing incomplete key-value pairs
  repaired = repaired.replace(/,\s*"[^"]*":\s*$/, '');
  repaired = repaired.replace(/,\s*"[^"]*"\s*$/, '');
  repaired = repaired.replace(/,\s*$/, '');

  // Strategy 3: Count and close brackets/braces
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces--;
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets--;
    }
  }

  // If we're still in a string, close it
  if (inString) {
    repaired += '"';
  }

  // Close any unclosed brackets and braces
  while (openBrackets > 0) {
    repaired += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    repaired += '}';
    openBraces--;
  }

  return repaired;
}

/**
 * Parse LLM response from self-reviewer
 *
 * Extracts JSON from response and validates structure.
 * Includes JSON repair for truncated responses from models that stop early.
 *
 * @param responseContent - Raw LLM response content
 * @returns Parsed response or null if invalid
 */
function parseSelfReviewerResponse(responseContent: string): SelfReviewerLLMResponse | null {
  try {
    // Strip markdown code block wrapper if present
    // Uses greedy matching and explicit boundary detection to handle nested code blocks
    let jsonContent = responseContent.trim();

    // Pattern 1: Response wrapped in ```json ... ``` or ``` ... ```
    // Use greedy match to get the OUTERMOST block (handles nested code blocks in content)
    if (jsonContent.startsWith('```')) {
      // Find the opening line (```json or just ```)
      const firstNewline = jsonContent.indexOf('\n');
      if (firstNewline > 0) {
        // Strip opening ``` line
        jsonContent = jsonContent.slice(firstNewline + 1);
      }
      // Find the closing ``` - it should be at the END of the response
      // Look for ``` that's on its own line at the end
      const closingMatch = jsonContent.match(/\n```\s*$/);
      if (closingMatch) {
        jsonContent = jsonContent.slice(0, closingMatch.index);
      } else if (jsonContent.endsWith('```')) {
        // Closing ``` without newline
        jsonContent = jsonContent.slice(0, -3);
      }
    }

    // Pattern 2: Response has ``` somewhere in the middle but JSON is before it
    // This can happen if model adds explanation after JSON
    // Try to find a complete JSON object
    jsonContent = jsonContent.trim();

    // Try direct parse first
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (parseError) {
      // Try to repair truncated JSON
      logger.debug({
        msg: 'Attempting JSON repair for truncated response',
        originalError: parseError instanceof Error ? parseError.message : String(parseError),
        contentPreview: jsonContent.slice(-100),
      });

      const repairedJson = repairTruncatedJson(jsonContent);
      try {
        parsed = JSON.parse(repairedJson);
        logger.info({ msg: 'Successfully repaired truncated JSON response' });
      } catch {
        // Repair failed
        return null;
      }
    }

    // Validate structure - at minimum need status and reasoning
    if (
      parsed &&
      typeof parsed === 'object' &&
      'status' in parsed &&
      'reasoning' in parsed
    ) {
      // Ensure issues array exists (may be truncated/missing)
      const result = parsed as SelfReviewerLLMResponse;
      if (!result.issues) {
        result.issues = [];
      }
      // patched_content may be null or truncated - that's OK
      return result;
    }

    return null;
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Failed to parse self-reviewer LLM response');
    return null;
  }
}

/**
 * Build localized progress summary for UI display
 *
 * Generates user-friendly messages about what happened during self-review.
 * Messages are localized based on the course language.
 *
 * @param status - Self-review status
 * @param issues - Issues found during review
 * @param language - Target language ('ru' or 'en')
 * @param heuristicDetails - Details from heuristic checks
 * @param llmReviewPerformed - Whether LLM review was performed
 * @param patchedContent - Whether content was auto-fixed
 * @param durationMs - Duration in milliseconds
 * @param attempt - Current attempt number
 * @param existingProgress - Existing progress summary to append to
 * @returns Updated progress summary
 */
function buildSelfReviewProgressSummary(
  status: SelfReviewStatus,
  issues: SelfReviewIssue[],
  language: string,
  heuristicDetails: HeuristicCheckDetails | undefined,
  llmReviewPerformed: boolean,
  patchedContent: boolean,
  durationMs: number,
  attempt: number,
  existingProgress: ProgressSummary | null
): ProgressSummary {
  const isRussian = language === 'ru';

  // Build issues found list
  const issuesFound: SummaryItem[] = [];

  const criticalIssues = issues.filter((i) => i.severity === 'CRITICAL');
  const minorIssues = issues.filter((i) => i.severity !== 'CRITICAL');

  if (criticalIssues.length > 0) {
    for (const issue of criticalIssues) {
      if (issue.type === 'LANGUAGE') {
        issuesFound.push({
          text: isRussian
            ? `Критическая ошибка языка: обнаружены посторонние символы`
            : `Critical language error: foreign characters detected`,
          severity: 'error',
        });
      } else if (issue.type === 'TRUNCATION') {
        issuesFound.push({
          text: isRussian
            ? `Критическая ошибка структуры: контент обрезан или повреждён`
            : `Critical structure error: content truncated or corrupted`,
          severity: 'error',
        });
      } else {
        issuesFound.push({
          text: issue.description,
          severity: 'error',
        });
      }
    }
  }

  if (minorIssues.length > 0) {
    issuesFound.push({
      text: isRussian
        ? `Найдено ${minorIssues.length} незначительных замечаний`
        : `Found ${minorIssues.length} minor observations`,
      severity: 'warning',
    });
  }

  // Build actions performed list
  const actionsPerformed: SummaryItem[] = [];

  if (heuristicDetails) {
    actionsPerformed.push({
      text: isRussian
        ? `Проверка языка: ${heuristicDetails.languageCheck.passed ? 'пройдена' : 'обнаружены проблемы'}`
        : `Language check: ${heuristicDetails.languageCheck.passed ? 'passed' : 'issues found'}`,
      severity: 'info',
    });
    actionsPerformed.push({
      text: isRussian
        ? `Проверка структуры: ${heuristicDetails.truncationCheck.passed ? 'пройдена' : 'обнаружены проблемы'}`
        : `Structure check: ${heuristicDetails.truncationCheck.passed ? 'passed' : 'issues found'}`,
      severity: 'info',
    });
  }

  if (llmReviewPerformed) {
    actionsPerformed.push({
      text: isRussian
        ? `LLM-проверка выполнена`
        : `LLM review completed`,
      severity: 'info',
    });

    if (patchedContent) {
      const fixedCount = issues.filter((i) => i.severity === 'FIXABLE').length;
      actionsPerformed.push({
        text: isRussian
          ? `Исправлено: ${fixedCount} проблем автоматически устранено`
          : `Fixed: ${fixedCount} issues automatically resolved`,
        severity: 'info',
      });
    }
  }

  // Build outcome message
  let outcome: string;
  switch (status) {
    case 'PASS':
      outcome = isRussian
        ? '→ Направлено в Judge для оценки качества'
        : '→ Routed to Judge for quality evaluation';
      break;
    case 'PASS_WITH_FLAGS':
      outcome = isRussian
        ? '→ Направлено в Judge с отмеченными замечаниями'
        : '→ Routed to Judge with flagged observations';
      break;
    case 'REGENERATE':
      outcome = isRussian
        ? '→ Требуется полная регенерация контента'
        : '→ Full content regeneration required';
      break;
    case 'FIXED':
      outcome = isRussian
        ? '→ Исправлено, направлено в Judge'
        : '→ Fixed, routed to Judge';
      break;
    default:
      outcome = isRussian
        ? '→ Направлено в Judge'
        : '→ Routed to Judge';
  }

  // Create attempt summary
  const attemptSummary: NodeAttemptSummary = {
    node: 'selfReviewer',
    attempt,
    status: status === 'REGENERATE' ? 'failed' : 'completed',
    resultLabel: status,
    issuesFound,
    actionsPerformed,
    outcome,
    startedAt: new Date(),
    durationMs,
    tokensUsed: HEURISTIC_TOKENS_USED,
  };

  // Merge with existing progress or create new
  const existingAttempts = existingProgress?.attempts || [];

  return {
    status: status === 'REGENERATE' ? 'failed' : 'reviewing',
    currentPhase: isRussian ? 'Проверка качества' : 'Quality review',
    language,
    attempts: [...existingAttempts, attemptSummary],
    outcome: status === 'REGENERATE' ? outcome : undefined,
  };
}

// ============================================================================
// MAIN NODE FUNCTION
// ============================================================================

/**
 * Self-Reviewer Node - Pre-judge validation with two-phase Fail-Fast architecture
 *
 * Implements complete two-phase validation:
 * 1. FREE heuristic pre-checks (language consistency, content truncation)
 *    - Critical failures (>20 foreign chars, >2 truncation issues) → immediate REGENERATE
 *    - Minor issues added for LLM review
 * 2. LLM-based semantic review with self-fix capability
 *    - Uses buildSelfReviewerSystemPrompt() and buildSelfReviewerUserMessage()
 *    - Returns FIXED status with patchedContent for hygiene issues
 *    - Retry logic (3 attempts, exponential backoff) with heuristic fallback
 *
 * @param state - Current graph state with generatedContent
 * @returns Updated state with selfReviewResult (and updated generatedContent if patched)
 */
export async function selfReviewerNode(
  state: LessonGraphStateType
): Promise<LessonGraphStateUpdate> {
  const startTime = Date.now();
  const nodeLogger = logger.child({
    node: 'selfReviewer',
    lessonId: state.lessonSpec?.lesson_id,
  });

  try {
    nodeLogger.info({ msg: 'Starting self-review' });

    // ============================================================================
    // VALIDATION: Check for generated content
    // ============================================================================

    const generatedContent = state.generatedContent;
    if (!generatedContent) {
      nodeLogger.warn({ msg: 'No generated content to review' });

      const result: SelfReviewResult = {
        status: 'REGENERATE',
        reasoning: 'No content available for review',
        issues: [
          {
            type: 'EMPTY',
            severity: 'CRITICAL',
            location: 'global',
            description: 'Generated content is missing or empty',
          },
        ],
        patchedContent: null,
        tokensUsed: HEURISTIC_TOKENS_USED,
        durationMs: Date.now() - startTime,
        heuristicsPassed: false,
      };

      const emptyContentProgress = buildSelfReviewProgressSummary(
        'REGENERATE',
        result.issues,
        state.language || 'en',
        undefined,
        false, // llmReviewPerformed
        false, // patchedContent
        result.durationMs,
        (state.retryCount || 0) + 1,
        state.progressSummary
      );

      // Log trace for UI visibility
      await logTrace({
        courseId: state.courseId,
        lessonId: state.lessonUuid || undefined,
        stage: 'stage_6',
        phase: 'selfReviewer',
        stepName: 'selfReviewer_complete',
        inputData: {
          lessonLabel: state.lessonSpec?.lesson_id ?? 'unknown',
          lessonTitle: state.lessonSpec?.title ?? 'Untitled',
        },
        outputData: {
          status: result.status,
          issuesCount: result.issues.length,
          heuristicsPassed: result.heuristicsPassed,
          progressSummary: emptyContentProgress,
        },
        durationMs: result.durationMs,
      });

      return {
        currentNode: 'selfReviewer',
        selfReviewResult: result,
        progressSummary: emptyContentProgress,
      };
    }

    const language = state.language || 'en';
    const issues: SelfReviewIssue[] = [];

    // ============================================================================
    // PHASE 1: Heuristic Pre-Checks (FREE, no LLM)
    // ============================================================================

    nodeLogger.debug({ msg: 'Running heuristic pre-checks' });

    // Check 1: Language consistency
    const languageCheck = checkLanguageConsistency(generatedContent, language);

    // Check 2: Content truncation
    const truncationCheck = checkContentTruncation(generatedContent);

    // Check 3: Mermaid syntax (catches issues after sanitizer)
    const mermaidCheck = checkMermaidSyntax(generatedContent);

    // ============================================================================
    // CRITICAL FAILURE ANALYSIS
    // ============================================================================

    // NOTE: checkLanguageConsistency fails at >5 chars (heuristic threshold)
    // but self-reviewer escalates to CRITICAL at >10 chars.
    // Progressive severity:
    // - 0-5 chars: PASS (clean)
    // - 6-10 chars: PASS_WITH_FLAGS (minor issue, proceed to LLM review)
    // - 11+ chars: REGENERATE (critical issue, skip LLM, full regeneration)

    // Language failures: More than 10 foreign characters triggers regeneration
    // Strategy (based on MODEL_FALLBACK.maxPrimaryAttempts = 2):
    // - retryCount=0: 1st attempt - Partial section regeneration with primary model
    // - retryCount=1: 2nd attempt - Still use primary model (partial/full regeneration)
    // - retryCount>=2: 3rd+ attempt - Switch to fallback model (non-Chinese)
    // This prevents Chinese model (mimo) from inserting CJK repeatedly
    if (!languageCheck.passed && languageCheck.foreignCharacters > SELF_REVIEW_CONFIG.criticalLanguageThreshold) {
      const currentRetryCount = state.retryCount ?? 0;
      const isRetryWithPersistentCJK = currentRetryCount >= MODEL_FALLBACK.maxPrimaryAttempts;

      // Find which specific sections contain foreign characters
      const affectedSections = findSectionsWithForeignCharacters(
        generatedContent,
        languageCheck.scriptsFound
      );

      // Check if we need model fallback (CJK persists after partial regeneration)
      if (isRetryWithPersistentCJK) {
        // Switch to fallback model (non-Chinese) for full regeneration
        // This prevents the Chinese model from inserting CJK characters again
        issues.push({
          type: 'LANGUAGE',
          severity: 'CRITICAL',
          location: 'global',
          description: `Persistent CJK issue after ${currentRetryCount} retry(ies). Switching to fallback model (${MODEL_FALLBACK.fallback}) for full regeneration.`,
        });

        // Record model fallback metric for monitoring
        metricsStore.recordModelFallback('cjk', 'stage6');

        nodeLogger.warn({
          msg: 'Persistent CJK issue - switching to fallback model for full regeneration',
          foreignCharacters: languageCheck.foreignCharacters,
          scriptsFound: languageCheck.scriptsFound,
          samples: languageCheck.foreignSamples,
          affectedSections,
          retryCount: currentRetryCount,
          fallbackModel: MODEL_FALLBACK.fallback,
        });

        // Return early with modelOverride set to fallback
        // This will be picked up by the generator node
        const heuristicDetails = buildHeuristicDetails(languageCheck, truncationCheck, mermaidCheck);
        const durationMs = Date.now() - startTime;

        const result: SelfReviewResult = {
          status: 'REGENERATE',
          reasoning: `Persistent foreign characters (${languageCheck.scriptsFound.join(', ')}) after ${currentRetryCount} retry(ies). Switching to fallback model for regeneration.`,
          issues,
          patchedContent: null,
          tokensUsed: HEURISTIC_TOKENS_USED,
          durationMs,
          heuristicsPassed: false,
          heuristicDetails,
        };

        const fallbackProgress = buildSelfReviewProgressSummary(
          'REGENERATE',
          issues,
          language,
          heuristicDetails,
          false,
          false,
          durationMs,
          currentRetryCount + 1,
          state.progressSummary
        );

        return {
          currentNode: 'selfReviewer',
          selfReviewResult: result,
          progressSummary: fallbackProgress,
          modelOverride: MODEL_FALLBACK.fallback, // Switch to non-Chinese model
          retryCount: currentRetryCount + 1,
        };
      }

      // First attempt: Try partial regeneration with primary model
      const totalSections = state.lessonSpec?.sections?.length ?? 0;
      const introAndSummary = 2; // intro + summary
      const estimatedTotalSections = totalSections + introAndSummary;
      const isPartialPossible = affectedSections.length > 0 &&
                                affectedSections.length < estimatedTotalSections * 0.5;

      if (isPartialPossible) {
        // COMPLEX severity: Triggers partial section regeneration
        // Push one issue per section so extractSectionsToRegenerate() can map each
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
        // CRITICAL severity: Triggers full regeneration (too many sections affected)
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

    // Truncation failures: More than 2 truncation issues is critical
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

    // Mermaid syntax issues: Trigger REGENERATE (sanitizer already tried to fix, need fresh generation)
    // Why CRITICAL instead of FLAG_TO_JUDGE:
    // - Sanitizer runs first during generation, fixing escaped quotes
    // - If issues remain (unclosed brackets, invalid arrows), LLM needs to regenerate
    // - Self-regeneration is cheaper than Judge review
    // - Generator will retry with Mermaid guidelines in prompt
    if (!mermaidCheck.passed) {
      issues.push({
        type: 'HYGIENE' as const,
        severity: 'CRITICAL', // Triggers REGENERATE → self-regeneration (not expensive Judge)
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

    // ============================================================================
    // CRITICAL ISSUES: Return REGENERATE immediately
    // ============================================================================

    const criticalIssues = issues.filter((i) => i.severity === 'CRITICAL');
    if (criticalIssues.length > 0) {
      nodeLogger.warn({
        msg: 'Critical heuristic failures detected, skipping LLM review',
        criticalCount: criticalIssues.length,
        issues: criticalIssues.map((i) => i.description),
      });

      const heuristicDetails = buildHeuristicDetails(languageCheck, truncationCheck, mermaidCheck);
      const durationMs = Date.now() - startTime;

      const result: SelfReviewResult = {
        status: 'REGENERATE',
        reasoning: buildReasoningMessage('REGENERATE', criticalIssues.length, 0),
        issues,
        patchedContent: null,
        tokensUsed: HEURISTIC_TOKENS_USED,
        durationMs,
        heuristicsPassed: false,
        heuristicDetails,
      };

      const criticalProgress = buildSelfReviewProgressSummary(
        'REGENERATE',
        issues,
        language,
        heuristicDetails,
        false, // llmReviewPerformed (skipped due to critical failures)
        false, // patchedContent
        durationMs,
        (state.retryCount || 0) + 1,
        state.progressSummary
      );

      // Log trace for UI visibility
      await logTrace({
        courseId: state.courseId,
        lessonId: state.lessonUuid || undefined,
        stage: 'stage_6',
        phase: 'selfReviewer',
        stepName: 'selfReviewer_complete',
        inputData: {
          lessonLabel: state.lessonSpec?.lesson_id ?? 'unknown',
          lessonTitle: state.lessonSpec?.title ?? 'Untitled',
        },
        outputData: {
          status: result.status,
          issuesCount: result.issues.length,
          criticalIssuesCount: criticalIssues.length,
          heuristicsPassed: result.heuristicsPassed,
          heuristicDetails: result.heuristicDetails,
          progressSummary: criticalProgress,
        },
        durationMs: result.durationMs,
      });

      return {
        currentNode: 'selfReviewer',
        selfReviewResult: result,
        progressSummary: criticalProgress,
      };
    }

    // ============================================================================
    // MINOR ISSUES: Add INFO-level observations
    // ============================================================================

    // Minor language issues (1-20 foreign characters)
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

    // Minor truncation issues (1-2 issues)
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

    nodeLogger.debug({
      msg: 'Heuristic pre-checks passed',
      languageCheckPassed: languageCheck.passed,
      truncationCheckPassed: truncationCheck.passed,
      minorIssuesCount: issues.length,
    });

    // ============================================================================
    // PHASE 2: LLM-based Self-Review
    // ============================================================================

    nodeLogger.debug({ msg: 'Running LLM-based semantic review' });

    // Get model for self-review from ModelConfigService
    // Use phase-based config - Stage 6 has multiple phases, not a single stage config
    const modelConfigService = createModelConfigService();
    const estimatedTokens = estimateSelfReviewerTokens(generatedContent, state.ragChunks || [], language);
    const normalizedLanguage: 'ru' | 'en' = language === 'ru' ? 'ru' : 'en';
    const phaseConfig = await modelConfigService.getModelForPhase(
      'stage_6_refinement',
      undefined,
      estimatedTokens,
      normalizedLanguage
    );

    nodeLogger.info({
      msg: 'Calling LLM for semantic self-review',
      model: phaseConfig.modelId,
      estimatedTokens,
    });

    // Build prompts - pass raw markdown content directly
    const systemPrompt = buildSelfReviewerSystemPrompt();
    const userMessage = buildSelfReviewerUserMessage(
      language,
      state.lessonSpec,
      state.ragChunks || [],
      generatedContent
    );

    // Call LLM with retry and timeout
    const llmClient = new LLMClient();
    let llmResponse;
    let tokensUsed = 0;

    // Calculate dynamic maxTokens based on content length and language
    // Must be large enough to accommodate patched_content if FIXED status
    const dynamicMaxTokens = calculateSelfReviewerMaxTokens(generatedContent.length, language);

    nodeLogger.debug({
      msg: 'Calculated dynamic maxTokens for self-reviewer',
      contentLength: generatedContent.length,
      language,
      calculatedMaxTokens: dynamicMaxTokens,
    });

    const options = {
      model: phaseConfig.modelId,
      temperature: 0.1, // Low for deterministic evaluation
      maxTokens: dynamicMaxTokens,
      systemPrompt,
      timeout: LLM_PER_ATTEMPT_TIMEOUT_MS,
    };

    try {
      // Use per-attempt timeout via options.timeout (30s per attempt)
      // With 3 retries + exponential backoff: max ~90s total
      // No global timeout race - let retries complete properly
      llmResponse = await withRetry(() => llmClient.generateCompletion(userMessage, options), {
        maxAttempts: 3,
        delayMs: 1000,
        backoffMultiplier: 2,
        retryOn: (error) => {
          const message = error.message.toLowerCase();
          return message.includes('timeout') ||
                 message.includes('rate limit') ||
                 message.includes('network') ||
                 message.includes('503') ||
                 message.includes('429') ||
                 message.includes('econnreset') ||
                 message.includes('socket');
        },
      });

      tokensUsed = llmResponse.totalTokens;

      nodeLogger.debug({
        msg: 'LLM self-review response received',
        tokensUsed,
        responseLength: llmResponse.content.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // All retries exhausted - fall back to heuristics
      nodeLogger.warn({ msg: 'LLM review failed after retries, falling back to heuristics-only', error: errorMessage });
      return buildHeuristicOnlyResult(
        buildHeuristicDetails(languageCheck, truncationCheck, mermaidCheck),
        issues,
        language,
        state,
        startTime
      );
    }

    // Parse LLM response
    const parsed = parseSelfReviewerResponse(llmResponse.content);
    if (!parsed) {
      nodeLogger.warn({
        msg: 'Failed to parse LLM self-review response',
        responsePreview: llmResponse.content.slice(0, 200),
      });

      // Fallback to heuristic-only result
      const heuristicDetails = buildHeuristicDetails(languageCheck, truncationCheck, mermaidCheck);
      const durationMs = Date.now() - startTime;
      const finalStatus = determineFinalStatus(criticalIssues, issues);
      const reasoning = buildReasoningMessage(finalStatus, criticalIssues.length, issues.length);

      const result: SelfReviewResult = {
        status: finalStatus,
        reasoning: `${reasoning} (LLM review failed: invalid response format)`,
        issues,
        patchedContent: null,
        tokensUsed,
        durationMs,
        heuristicsPassed: true,
        heuristicDetails,
      };

      const parseFallbackProgress = buildSelfReviewProgressSummary(
        finalStatus,
        issues,
        language,
        heuristicDetails,
        false, // llmReviewPerformed
        false, // patchedContent
        durationMs,
        (state.retryCount || 0) + 1,
        state.progressSummary
      );

      return {
        currentNode: 'selfReviewer',
        selfReviewResult: result,
        progressSummary: parseFallbackProgress,
      };
    }

    // Map LLM issues to SelfReviewIssue format with Zod validation
    // Invalid issues are logged and coerced to safe defaults
    const llmIssues: SelfReviewIssue[] = parsed.issues
      .map((issue) => {
        const validated = LLMIssueSchema.safeParse(issue);
        if (!validated.success) {
          nodeLogger.warn({
            msg: 'Invalid LLM issue format, using defaults',
            issue,
            errors: validated.error.errors.map(e => e.message),
          });
          // Use catch() defaults from schema
          return LLMIssueSchema.parse(issue);
        }
        return validated.data;
      });

    // Combine heuristic and LLM issues
    const allIssues = [...issues, ...llmIssues];

    // ============================================================================
    // BUILD FINAL RESULT
    // ============================================================================

    const heuristicDetails = buildHeuristicDetails(languageCheck, truncationCheck, mermaidCheck);
    const durationMs = Date.now() - startTime;

    // Extract sections that need regeneration (non-critical issues with specific locations)
    const sectionsToRegenerate = extractSectionsToRegenerate(allIssues);

    const result: SelfReviewResult = {
      status: parsed.status,
      reasoning: parsed.reasoning,
      issues: allIssues,
      patchedContent: parsed.patched_content,
      sectionsToRegenerate: sectionsToRegenerate.length > 0 ? sectionsToRegenerate : undefined,
      tokensUsed,
      durationMs,
      heuristicsPassed: true,
      heuristicDetails,
    };

    nodeLogger.info({
      msg: 'Self-review completed with LLM',
      status: result.status,
      issuesCount: result.issues.length,
      heuristicIssues: issues.length,
      llmIssues: llmIssues.length,
      wasPatched: result.patchedContent !== null,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
    });

    const successProgress = buildSelfReviewProgressSummary(
      result.status,
      allIssues,
      language,
      heuristicDetails,
      true, // llmReviewPerformed
      result.patchedContent !== null, // patchedContent
      durationMs,
      (state.retryCount || 0) + 1,
      state.progressSummary
    );

    // Log trace for UI visibility with enhanced LLM details
    await logTrace({
      courseId: state.courseId,
      lessonId: state.lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'selfReviewer',
      stepName: 'selfReviewer_complete',
      inputData: {
        lessonLabel: state.lessonSpec.lesson_id,
        lessonTitle: state.lessonSpec.title,
      },
      outputData: {
        status: result.status,
        reasoning: result.reasoning,
        issuesCount: result.issues.length,
        issuesByType: {
          LANGUAGE: allIssues.filter(i => i.type === 'LANGUAGE').length,
          TRUNCATION: allIssues.filter(i => i.type === 'TRUNCATION').length,
          ALIGNMENT: allIssues.filter(i => i.type === 'ALIGNMENT').length,
          HALLUCINATION: allIssues.filter(i => i.type === 'HALLUCINATION').length,
          HYGIENE: allIssues.filter(i => i.type === 'HYGIENE').length,
          EMPTY: allIssues.filter(i => i.type === 'EMPTY').length,
          SHORT_SECTION: allIssues.filter(i => i.type === 'SHORT_SECTION').length,
          LOGIC: allIssues.filter(i => i.type === 'LOGIC').length,
        },
        heuristicsPassed: result.heuristicsPassed,
        heuristicDetails: result.heuristicDetails,
        llmReviewPerformed: true,
        tokensUsed: result.tokensUsed,
        wasPatched: result.patchedContent !== null,
        progressSummary: successProgress,
      },
      durationMs: result.durationMs,
    });

    // If content was patched, validate and update generatedContent in state
    const stateUpdate: LessonGraphStateUpdate = {
      currentNode: 'selfReviewer',
      selfReviewResult: result,
      progressSummary: successProgress,
    };

    // PROGRAMMATIC PATCHING: If status is FIXED but no patched_content from LLM,
    // try to apply automatic fixes for HYGIENE issues
    if (result.status === 'FIXED' && !result.patchedContent) {
      const hygieneIssues = allIssues.filter(
        i => i.type === 'HYGIENE' && i.severity === 'FIXABLE'
      );
      const onlyHygieneIssues = hygieneIssues.length === allIssues.length && hygieneIssues.length > 0;

      if (onlyHygieneIssues && state.generatedContent) {
        nodeLogger.info({
          msg: 'Applying programmatic fix for HYGIENE issues',
          issuesCount: hygieneIssues.length,
        });

        // Apply programmatic removal of chatbot artifacts
        const cleanedContent = removeChatbotArtifacts(state.generatedContent);

        // Check if anything was actually removed
        if (cleanedContent.length < state.generatedContent.length) {
          stateUpdate.generatedContent = cleanedContent;
          result.reasoning += ' (Fixed programmatically)';
          nodeLogger.info({
            msg: 'Chatbot artifacts removed programmatically',
            originalLength: state.generatedContent.length,
            cleanedLength: cleanedContent.length,
            removedChars: state.generatedContent.length - cleanedContent.length,
          });
        } else {
          // No changes made, downgrade to PASS_WITH_FLAGS
          result.status = 'PASS_WITH_FLAGS';
          result.reasoning += ' (No programmatic fix applied)';
          stateUpdate.selfReviewResult = result;
        }
      } else {
        // Non-hygiene issues require manual intervention, downgrade status
        result.status = 'PASS_WITH_FLAGS';
        result.reasoning += ' (FIXED status without patch, downgraded)';
        stateUpdate.selfReviewResult = result;
      }
    }

    if (result.patchedContent) {
      // Validate patchedContent structure
      const validation = LessonContentBodySchema.safeParse(result.patchedContent);

      if (!validation.success) {
        nodeLogger.warn({
          msg: 'Invalid patchedContent from LLM, downgrading status',
          errors: validation.error.errors.map(e => e.message),
        });

        // Downgrade status to match reality (no valid patch available)
        result.patchedContent = null;
        const hasCriticalIssues = allIssues.some(i => i.severity === 'CRITICAL');
        const hasMinorIssues = allIssues.some(i => i.severity === 'INFO' || i.severity === 'FIXABLE');
        result.status = hasCriticalIssues
          ? 'REGENERATE'
          : hasMinorIssues
            ? 'PASS_WITH_FLAGS'
            : 'PASS';
        result.reasoning += ' (LLM patch rejected: invalid schema)';

        // Update stateUpdate with corrected result
        stateUpdate.selfReviewResult = result;
      } else {
        stateUpdate.generatedContent = JSON.stringify(result.patchedContent, null, 2);
        nodeLogger.info({ msg: 'Content successfully patched by self-reviewer' });
      }
    }

    return stateUpdate;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    nodeLogger.error({
      msg: 'Self-reviewer node error',
      error: errorMessage,
    });

    const durationMs = Date.now() - startTime;
    const errorResult: SelfReviewResult = {
      status: 'REGENERATE',
      reasoning: `Self-review failed: ${errorMessage}`,
      issues: [{
        type: 'EMPTY',
        severity: 'CRITICAL',
        location: 'global',
        description: `Self-review error: ${errorMessage}`,
      }],
      patchedContent: null,
      tokensUsed: HEURISTIC_TOKENS_USED,
      durationMs,
      heuristicsPassed: false,
    };

    const errorProgress = buildSelfReviewProgressSummary(
      'REGENERATE',
      errorResult.issues,
      state.language || 'en',
      undefined,
      false, // llmReviewPerformed
      false, // patchedContent
      durationMs,
      (state.retryCount || 0) + 1,
      state.progressSummary
    );

    // Log trace for UI visibility (error case)
    await logTrace({
      courseId: state.courseId,
      lessonId: state.lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'selfReviewer',
      stepName: 'selfReviewer_error',
      inputData: {
        lessonLabel: state.lessonSpec.lesson_id,
        lessonTitle: state.lessonSpec.title,
      },
      outputData: {
        status: errorResult.status,
        issuesCount: errorResult.issues.length,
        progressSummary: errorProgress,
      },
      errorData: {
        error: errorMessage,
      },
      durationMs,
    });

    return {
      currentNode: 'selfReviewer',
      selfReviewResult: errorResult,
      progressSummary: errorProgress,
    };
  }
}
