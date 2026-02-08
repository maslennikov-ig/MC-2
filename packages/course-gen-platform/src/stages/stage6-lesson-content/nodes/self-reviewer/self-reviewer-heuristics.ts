/**
 * Self-Reviewer Heuristic Functions
 * @module stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics
 *
 * Contains foreign character detection and chatbot artifact removal logic.
 * These are fast, no-LLM-cost heuristic checks.
 */

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
  let processedContent = content.replace(/```[\s\S]*?```/g, match => {
    const placeholder = `__PROTECTED_BLOCK_${blockIndex}__`;
    protectedBlocks.push({ placeholder, content: match });
    blockIndex++;
    return placeholder;
  });

  // Also protect inline code (backticks)
  processedContent = processedContent.replace(/`[^`]+`/g, match => {
    const placeholder = `__PROTECTED_INLINE_${blockIndex}__`;
    protectedBlocks.push({ placeholder, content: match });
    blockIndex++;
    return placeholder;
  });

  // Also protect LaTeX formulas
  processedContent = processedContent.replace(/\$\$[\s\S]*?\$\$/g, match => {
    const placeholder = `__PROTECTED_LATEX_BLOCK_${blockIndex}__`;
    protectedBlocks.push({ placeholder, content: match });
    blockIndex++;
    return placeholder;
  });
  processedContent = processedContent.replace(/\$[^$]+\$/g, match => {
    const placeholder = `__PROTECTED_LATEX_INLINE_${blockIndex}__`;
    protectedBlocks.push({ placeholder, content: match });
    blockIndex++;
    return placeholder;
  });

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
