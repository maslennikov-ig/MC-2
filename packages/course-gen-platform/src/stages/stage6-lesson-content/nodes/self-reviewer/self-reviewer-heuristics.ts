/**
 * Self-Reviewer Heuristic Functions
 * @module stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics
 *
 * Contains foreign character detection and chatbot artifact removal logic.
 * These are fast, no-LLM-cost heuristic checks.
 */

import { CONTENT_LABELS } from '@megacampus/shared-types';

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
 *
 * Note: FOREIGN_SCRIPT_STRIP_PATTERNS below intentionally use /g because
 * they are consumed by .replace()/.match() (which reset lastIndex), not .test().
 * extractForeignCharFragments creates new RegExp instances for matchAll iteration.
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
export function findSectionsWithForeignCharacters(
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
      } else if (
        lowerTitle.includes('итог') ||
        lowerTitle.includes('заключение') ||
        lowerTitle.includes('summary') ||
        lowerTitle.includes('conclusion')
      ) {
        affectedSections.push('summary');
      } else {
        // For numbered sections, extract section number
        sectionNumber++;
        affectedSections.push(`section_${sectionNumber}`);
      }
    } else {
      // Still increment section number for non-intro/summary sections
      const lowerTitle = section.title.toLowerCase();
      if (
        !lowerTitle.includes('введение') &&
        !lowerTitle.includes('introduction') &&
        !lowerTitle.includes('итог') &&
        !lowerTitle.includes('заключение') &&
        !lowerTitle.includes('summary') &&
        !lowerTitle.includes('conclusion') &&
        section.title !== 'Introduction'
      ) {
        sectionNumber++;
      }
    }
  }

  // Deduplicate
  return [...new Set(affectedSections)];
}

// ============================================================================
// FOREIGN CHARACTER FRAGMENT EXTRACTION
// ============================================================================

/**
 * Detected foreign character fragment with surrounding context
 */
export interface ForeignCharFragment {
  /** The text fragment containing foreign characters (3-80 chars) */
  fragment: string;
  /** Surrounding context for LLM understanding (up to 150 chars) */
  context: string;
  /** Detected script types (e.g., ['CJK']) */
  scriptTypes: string[];
}

/**
 * Extract text fragments containing foreign characters with surrounding context
 *
 * Used to provide precise guidance to the LLM self-reviewer about which
 * parts of the content need translation or correction.
 *
 * @param content - Full markdown content
 * @param scriptsFound - Script types detected (e.g., ['CJK', 'ARABIC'])
 * @returns Array of fragments with context
 */
export function extractForeignCharFragments(
  content: string,
  scriptsFound: string[]
): ForeignCharFragment[] {
  const fragments: ForeignCharFragment[] = [];

  // Remove code blocks from analysis
  const proseContent = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');

  for (const scriptKey of scriptsFound) {
    const pattern = FOREIGN_SCRIPT_PATTERNS[scriptKey];
    if (!pattern) continue;

    // Use matchAll for safe iteration (no lastIndex mutation)
    const globalPattern = new RegExp(pattern.source, 'g');
    for (const match of proseContent.matchAll(globalPattern)) {
      const charIndex = match.index;
      const foreignChars = match[0];

      // Extract fragment: foreign chars + 20 chars before and after
      const fragStart = Math.max(0, charIndex - 20);
      const fragEnd = Math.min(proseContent.length, charIndex + foreignChars.length + 20);
      const fragment = proseContent.slice(fragStart, fragEnd).trim();

      // Extract broader context: up to 75 chars before and after
      const ctxStart = Math.max(0, charIndex - 75);
      const ctxEnd = Math.min(proseContent.length, charIndex + foreignChars.length + 75);
      const context = proseContent.slice(ctxStart, ctxEnd).trim();

      fragments.push({
        fragment,
        context,
        scriptTypes: [scriptKey],
      });
    }
  }

  return fragments;
}

// ============================================================================
// MARKDOWN ELEMENT PROTECTION UTILITY
// ============================================================================

/**
 * Result of protecting markdown elements from text processing
 */
interface ProtectedContent {
  /** Content with protected elements replaced by placeholders */
  content: string;
  /** Call to restore original elements back into processed content */
  restore: (processedContent: string) => string;
}

/**
 * Protect markdown elements from modification during text processing
 *
 * Replaces code blocks, inline code, and LaTeX formulas with unique placeholders.
 * Returns a restore function that puts them back. This ensures code/mermaid/LaTeX
 * are never modified by text processing operations.
 *
 * Protection order matters: code blocks first (greedy), then inline code,
 * then LaTeX blocks (greedy), then LaTeX inline. This prevents inner patterns
 * from being matched before outer ones.
 *
 * @param content - Raw markdown content with elements to protect
 * @returns Object with placeholder-replaced content and a restore function
 */
export function protectMarkdownElements(content: string): ProtectedContent {
  const protectedBlocks: Array<{ placeholder: string; content: string }> = [];
  let blockIndex = 0;

  // Protect code blocks (```...```) - must be first to catch nested backticks
  let processedContent = content.replace(/```[\s\S]*?```/g, match => {
    const placeholder = `__PROT_BLOCK_${blockIndex}__`;
    protectedBlocks.push({ placeholder, content: match });
    blockIndex++;
    return placeholder;
  });

  // Protect inline code (`...`)
  processedContent = processedContent.replace(/`[^`]+`/g, match => {
    const placeholder = `__PROT_INLINE_${blockIndex}__`;
    protectedBlocks.push({ placeholder, content: match });
    blockIndex++;
    return placeholder;
  });

  // Protect LaTeX blocks ($$...$$) - must be before inline LaTeX
  processedContent = processedContent.replace(/\$\$[\s\S]*?\$\$/g, match => {
    const placeholder = `__PROT_LATEX_B_${blockIndex}__`;
    protectedBlocks.push({ placeholder, content: match });
    blockIndex++;
    return placeholder;
  });

  // Protect LaTeX inline ($...$)
  processedContent = processedContent.replace(/\$[^$]+\$/g, match => {
    const placeholder = `__PROT_LATEX_I_${blockIndex}__`;
    protectedBlocks.push({ placeholder, content: match });
    blockIndex++;
    return placeholder;
  });

  return {
    content: processedContent,
    restore: (processed: string): string => {
      let result = processed;
      // Order doesn't matter: each placeholder is unique, no nesting possible
      for (const block of protectedBlocks) {
        // Use function replacement to avoid $ special replacement characters
        result = result.replace(block.placeholder, () => block.content);
      }
      return result;
    },
  };
}

// ============================================================================
// FOREIGN SCRIPT CHARACTER STRIPPING
// ============================================================================

/**
 * Global regex patterns for foreign script character removal
 * Uses /g flag since we need to replace ALL occurrences
 */
const FOREIGN_SCRIPT_STRIP_PATTERNS: Record<string, RegExp> = {
  CJK: /[\u4E00-\u9FFF\u3400-\u4DBF]+/g,
  ARABIC: /[\u0600-\u06FF]+/g,
  DEVANAGARI: /[\u0900-\u097F]+/g,
  THAI: /[\u0E00-\u0E7F]+/g,
  HEBREW: /[\u0590-\u05FF]+/g,
};

/**
 * Strip foreign script characters from content while preserving code blocks
 *
 * Used as a safety net after LLM review to catch small foreign character leaks
 * (1-10 chars) that the LLM didn't fix. Protects code blocks, inline code,
 * LaTeX, and mermaid diagrams from modification.
 *
 * @param content - Markdown content potentially containing foreign characters
 * @param scriptsToStrip - Script names to remove (e.g., ['CJK', 'ARABIC'])
 * @returns Object with cleaned content and count of fixes applied
 *
 * @example
 * ```typescript
 * const result = stripForeignScriptCharacters(
 *   'Текст с公司的 примером',
 *   ['CJK']
 * );
 * // result.content === 'Текст с примером'
 * // result.fixCount === 1
 * ```
 */
export function stripForeignScriptCharacters(
  content: string,
  scriptsToStrip: string[]
): { content: string; fixCount: number } {
  let fixCount = 0;

  const { content: proseContent, restore } = protectMarkdownElements(content);
  let processedContent = proseContent;

  // Strip foreign characters from prose text
  for (const scriptKey of scriptsToStrip) {
    const sourcePattern = FOREIGN_SCRIPT_STRIP_PATTERNS[scriptKey];
    if (sourcePattern) {
      // Create new instance to avoid mutating shared module-level constant
      const pattern = new RegExp(sourcePattern.source, 'g');
      const matches = processedContent.match(pattern);
      if (matches) {
        fixCount += matches.length;
      }
      processedContent = processedContent.replace(pattern, '');
    }
  }

  // Clean up whitespace artifacts from removal
  processedContent = processedContent.replace(/ {2,}/g, ' ');
  processedContent = processedContent.replace(/ ([.,;:!?])/g, '$1');
  processedContent = processedContent.replace(/\n{3,}/g, '\n\n');

  // Restore protected blocks
  processedContent = restore(processedContent);

  return { content: processedContent.trim(), fixCount };
}

// ============================================================================
// CHATBOT ARTIFACT REMOVAL
// ============================================================================

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
  const { content: proseContent, restore } = protectMarkdownElements(content);
  let processedContent = proseContent;

  // Apply chatbot artifact removal to prose text only
  for (const pattern of CHATBOT_ARTIFACT_PATTERNS) {
    processedContent = processedContent.replace(pattern, '');
  }

  // Restore protected blocks
  processedContent = restore(processedContent);

  // Clean up multiple consecutive newlines
  processedContent = processedContent.replace(/\n{3,}/g, '\n\n');

  return processedContent.trim();
}

// ============================================================================
// ENGLISH STRUCTURAL HEADER REPLACEMENT
// ============================================================================

/**
 * Lazy-initialized map from lowercase English label values to Russian equivalents.
 * Only entries where the English and Russian values differ are included.
 */
let enToRuHeaderMap: Map<string, string> | null = null;

function getEnToRuHeaderMap(): Map<string, string> {
  if (enToRuHeaderMap) return enToRuHeaderMap;

  enToRuHeaderMap = new Map<string, string>();
  const enLabels = CONTENT_LABELS['en'];
  const ruLabels = CONTENT_LABELS['ru'];

  if (!enLabels || !ruLabels) {
    return new Map();
  }

  for (const key of Object.keys(enLabels) as Array<keyof typeof enLabels>) {
    const enValue = enLabels[key];
    const ruValue = ruLabels[key];
    if (enValue.toLowerCase() !== ruValue.toLowerCase()) {
      enToRuHeaderMap.set(enValue.toLowerCase(), ruValue);
    }
  }

  return enToRuHeaderMap;
}

/**
 * Create regex matching structural LLM artifact headers like "## SECTION CONCLUSION",
 * "## MODULE INTRODUCTION", etc. These are not real content labels — they are
 * markers that LLMs sometimes emit. Matched lines are removed entirely.
 *
 * Factory function avoids module-level stateful /g regex (lastIndex mutation risk).
 */
function createStructuralArtifactRegex(): RegExp {
  return /^(#{1,6}\s*)(SECTION|MODULE|COURSE|LESSON)\s+(CONCLUSION|INTRODUCTION|SUMMARY|OVERVIEW|DIGEST)\s*$/gim;
}

/**
 * Replace English structural headers with Russian equivalents (ru-only heuristic)
 *
 * For Russian-language content, replaces headers like `## Introduction` with
 * `## Введение` using the CONTENT_LABELS map. Also removes LLM structural
 * artifact headers like `## SECTION CONCLUSION` entirely.
 *
 * CRITICAL: Only activates when targetLanguage === 'ru'. For all other languages
 * the function returns content unchanged to prevent false positives.
 *
 * Code blocks and LaTeX are protected before processing via protectMarkdownElements.
 *
 * @param content - Raw markdown content
 * @param targetLanguage - ISO 639-1 language code of the target lesson
 * @returns Object with modified content and count of replacements/removals made
 */
export function replaceEnglishStructuralHeaders(
  content: string,
  targetLanguage: string
): { content: string; replacedCount: number } {
  if (targetLanguage !== 'ru') {
    return { content, replacedCount: 0 };
  }

  const { content: safeContent, restore } = protectMarkdownElements(content);
  let replacedCount = 0;
  const headerMap = getEnToRuHeaderMap();

  // Step 1: Replace known English labels with Russian equivalents in headers
  let processed = safeContent.replace(/^(#{1,6}\s+)(.+)$/gm, (match, hashes, headerText) => {
    const trimmed = headerText.trim().toLowerCase();
    const replacement = headerMap.get(trimmed);
    if (replacement) {
      replacedCount++;
      return `${hashes}${replacement}`;
    }
    return match;
  });

  // Step 2: Remove structural LLM artifact headers entirely (e.g. "## SECTION CONCLUSION")
  processed = processed.replace(createStructuralArtifactRegex(), () => {
    replacedCount++;
    return '';
  });

  // Clean up multiple blank lines left by removals
  processed = processed.replace(/\n{3,}/g, '\n\n');

  return { content: restore(processed), replacedCount };
}
