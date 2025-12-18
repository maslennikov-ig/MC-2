/**
 * Markdown Output Parser for Stage 6
 * Parses LLM markdown output into structured LessonContent
 * @module stages/stage6-lesson-content/utils/markdown-parser
 *
 * This module provides utilities for parsing LLM-generated markdown
 * into structured lesson content format. It extracts:
 * - Title and introduction
 * - Content sections with titles
 * - Exercises from markdown
 * - Heading structure for validation
 *
 * @see specs/010-stages-456-pipeline/data-model.md
 * @see packages/shared-types/src/lesson-content.ts
 */

import type { ContentSection } from '@megacampus/shared-types/lesson-content';
import { logger } from '@/shared/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Parsed markdown content structure
 */
export interface ParsedMarkdown {
  /** Extracted lesson title */
  title: string;
  /** Introduction content (before first section) */
  introduction: string;
  /** Parsed content sections */
  sections: ContentSection[];
  /** Extracted exercise content */
  exercises: string[];
  /** Summary/conclusion content */
  summary: string;
  /** Total word count (excluding code blocks) */
  wordCount: number;
  /** Heading structure for validation */
  headingStructure: string[];
}

/**
 * Markdown structure validation result
 */
export interface MarkdownValidationResult {
  /** Whether the structure is valid */
  valid: boolean;
  /** List of validation issues found */
  issues: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Regex patterns for markdown parsing
 */
const PATTERNS = {
  /** Match H1 headers */
  h1: /^#\s+(.+)$/m,
  /** Match H2 headers */
  h2: /^##\s+(.+)$/gm,
  /** Match H3 headers */
  h3: /^###\s+(.+)$/gm,
  /** Match code blocks (to exclude from word count) */
  codeBlock: /```[\s\S]*?```/g,
  /** Match inline code (to exclude from word count) */
  inlineCode: /`[^`]+`/g,
  /** Match HTML comments */
  htmlComment: /<!--[\s\S]*?-->/g,
  /** Match exercise sections */
  exerciseSection: /##\s*(?:Exercises?|Practice|Problems?|Questions?)\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/gi,
  /** Match summary sections */
  summarySection: /##\s*(?:Summary|Conclusion|Key\s*Takeaways?|Wrap[- ]?up)\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/gi,
  /** Match introduction section */
  introSection: /##\s*Introduction\s*\n([\s\S]*?)(?=\n##\s)/i,
};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Parse markdown content into structured format
 *
 * Extracts title, introduction, sections, exercises, and summary
 * from LLM-generated markdown content.
 *
 * @param markdown - Raw markdown content from LLM
 * @returns Parsed markdown structure
 *
 * @example
 * ```typescript
 * const markdown = `# Lesson Title
 *
 * ## Introduction
 * This is the intro...
 *
 * ## Section 1
 * Content here...
 *
 * ## Exercises
 * 1. Exercise one...
 *
 * ## Summary
 * Key takeaways...`;
 *
 * const parsed = parseMarkdownContent(markdown);
 * // Returns: { title: 'Lesson Title', introduction: '...', sections: [...], ... }
 * ```
 */
export function parseMarkdownContent(markdown: string): ParsedMarkdown {
  if (!markdown || typeof markdown !== 'string') {
    logger.warn(
      { hasMarkdown: !!markdown, type: typeof markdown },
      'parseMarkdownContent: Invalid or empty markdown'
    );
    return {
      title: '',
      introduction: '',
      sections: [],
      exercises: [],
      summary: '',
      wordCount: 0,
      headingStructure: [],
    };
  }

  const trimmedMarkdown = markdown.trim();

  // Extract title (H1)
  const title = extractTitle(trimmedMarkdown);

  // Extract heading structure
  const headingStructure = extractHeadingStructure(trimmedMarkdown);

  // Extract introduction
  const introduction = extractIntroduction(trimmedMarkdown);

  // Extract content sections
  const sections = extractSections(trimmedMarkdown);

  // Extract exercises
  const exercises = extractExercises(trimmedMarkdown);

  // Extract summary
  const summary = extractSummary(trimmedMarkdown);

  // Count words
  const wordCount = countWords(trimmedMarkdown);

  logger.debug(
    {
      title,
      introLength: introduction.length,
      sectionsCount: sections.length,
      exercisesCount: exercises.length,
      summaryLength: summary.length,
      wordCount,
      headingsCount: headingStructure.length,
    },
    'parseMarkdownContent: Parsing complete'
  );

  return {
    title,
    introduction,
    sections,
    exercises,
    summary,
    wordCount,
    headingStructure,
  };
}

/**
 * Extract sections from markdown by headers
 *
 * Parses H2 headers and their content into ContentSection objects.
 * Excludes special sections (Introduction, Exercises, Summary).
 *
 * @param markdown - Raw markdown content
 * @returns Array of content sections
 *
 * @example
 * ```typescript
 * const markdown = `## Section 1
 * Content for section 1...
 *
 * ## Section 2
 * Content for section 2...`;
 *
 * const sections = extractSections(markdown);
 * // Returns: [
 * //   { title: 'Section 1', content: 'Content for section 1...' },
 * //   { title: 'Section 2', content: 'Content for section 2...' }
 * // ]
 * ```
 */
export function extractSections(markdown: string): ContentSection[] {
  if (!markdown) {
    return [];
  }

  const sections: ContentSection[] = [];

  // Special section titles to exclude
  const specialSections = [
    'introduction',
    'exercises',
    'exercise',
    'practice',
    'problems',
    'problem',
    'questions',
    'question',
    'summary',
    'conclusion',
    'key takeaways',
    'key takeaway',
    'wrap-up',
    'wrapup',
    'wrap up',
  ];

  // Split by H2 headers
  const h2Pattern = /^##\s+(.+)$/gm;
  const matches: { title: string; index: number }[] = [];

  let match;
  while ((match = h2Pattern.exec(markdown)) !== null) {
    matches.push({
      title: match[1].trim(),
      index: match.index,
    });
  }

  // Extract content between headers
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const title = currentMatch.title;

    // Skip special sections
    if (specialSections.some((s) => title.toLowerCase().includes(s))) {
      continue;
    }

    // Get content between this header and the next (or end)
    const startIndex = currentMatch.index;
    const headerLength = `## ${title}\n`.length;
    const contentStart = startIndex + headerLength;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index : markdown.length;

    let content = markdown.slice(contentStart, contentEnd).trim();

    // Remove any trailing H1 header if present
    content = content.replace(/\n#\s+.+$/m, '').trim();

    if (content.length > 0) {
      sections.push({
        title,
        content,
      });
    }
  }

  logger.debug(
    {
      totalH2Found: matches.length,
      contentSections: sections.length,
    },
    'extractSections: Sections extracted'
  );

  return sections;
}

/**
 * Count words in markdown (excluding code blocks)
 *
 * Counts words in text content, excluding:
 * - Code blocks (```...```)
 * - Inline code (`...`)
 * - HTML comments (<!--...-->)
 * - Markdown syntax characters
 *
 * @param markdown - Raw markdown content
 * @returns Word count
 *
 * @example
 * ```typescript
 * const markdown = `This is some text with code:
 * \`\`\`javascript
 * const x = 1;
 * \`\`\`
 * And more text here.`;
 *
 * const count = countWords(markdown);
 * // Returns: 8 (excludes code block content)
 * ```
 */
export function countWords(markdown: string): number {
  if (!markdown) {
    return 0;
  }

  // Remove code blocks
  let text = markdown.replace(PATTERNS.codeBlock, '');

  // Remove inline code
  text = text.replace(PATTERNS.inlineCode, '');

  // Remove HTML comments
  text = text.replace(PATTERNS.htmlComment, '');

  // Remove markdown syntax
  text = text
    .replace(/#{1,6}\s/g, '') // Headers
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1') // Bold/italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // Images
    .replace(/^\s*[-*+]\s/gm, '') // Unordered lists
    .replace(/^\s*\d+\.\s/gm, '') // Ordered lists
    .replace(/^\s*>\s/gm, '') // Blockquotes
    .replace(/\|/g, ' '); // Tables

  // Split by whitespace and count non-empty words
  const words = text.split(/\s+/).filter((word) => word.length > 0);

  return words.length;
}

/**
 * Validate markdown structure
 *
 * Checks if the markdown has required structural elements:
 * - At least one H1 or H2 header
 * - Introduction content
 * - At least one content section
 * - Reasonable word count
 *
 * @param markdown - Raw markdown content
 * @returns Validation result with issues list
 *
 * @example
 * ```typescript
 * const result = validateMarkdownStructure(markdown);
 * if (!result.valid) {
 *   console.log('Issues:', result.issues);
 * }
 * ```
 */
export function validateMarkdownStructure(markdown: string): MarkdownValidationResult {
  const issues: string[] = [];

  if (!markdown || markdown.trim().length === 0) {
    return {
      valid: false,
      issues: ['Markdown content is empty'],
    };
  }

  // Check for title (H1)
  const hasTitle = PATTERNS.h1.test(markdown);
  if (!hasTitle) {
    issues.push('Missing lesson title (H1 header)');
  }

  // Check for H2 sections
  const h2Matches = markdown.match(PATTERNS.h2);
  if (!h2Matches || h2Matches.length === 0) {
    issues.push('No sections found (H2 headers)');
  } else if (h2Matches.length < 2) {
    issues.push('Insufficient sections (expected at least 2)');
  }

  // Check for introduction
  const hasIntro =
    PATTERNS.introSection.test(markdown) ||
    markdown.toLowerCase().includes('## introduction');
  if (!hasIntro) {
    issues.push('Missing introduction section');
  }

  // Check word count
  const wordCount = countWords(markdown);
  if (wordCount < 100) {
    issues.push(`Content too short (${wordCount} words, minimum 100)`);
  }

  // Check for exercises (warning, not error)
  const hasExercises =
    PATTERNS.exerciseSection.test(markdown) ||
    markdown.toLowerCase().includes('## exercise');
  if (!hasExercises) {
    issues.push('Missing exercises section (warning)');
  }

  // Check for summary (warning, not error)
  const hasSummary =
    PATTERNS.summarySection.test(markdown) ||
    markdown.toLowerCase().includes('## summary') ||
    markdown.toLowerCase().includes('## conclusion');
  if (!hasSummary) {
    issues.push('Missing summary/conclusion section (warning)');
  }

  const valid = issues.filter((i) => !i.includes('(warning)')).length === 0;

  logger.debug(
    {
      valid,
      issuesCount: issues.length,
      hasTitle,
      h2Count: h2Matches?.length || 0,
      hasIntro,
      hasExercises,
      hasSummary,
      wordCount,
    },
    'validateMarkdownStructure: Validation complete'
  );

  return { valid, issues };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract title from markdown (first H1 header)
 */
function extractTitle(markdown: string): string {
  const match = markdown.match(PATTERNS.h1);
  return match ? match[1].trim() : '';
}

/**
 * Extract heading structure from markdown
 */
function extractHeadingStructure(markdown: string): string[] {
  const headings: string[] = [];

  // Extract H1
  const h1Match = markdown.match(PATTERNS.h1);
  if (h1Match) {
    headings.push(`# ${h1Match[1].trim()}`);
  }

  // Extract H2
  const h2Pattern = /^##\s+(.+)$/gm;
  let match;
  while ((match = h2Pattern.exec(markdown)) !== null) {
    headings.push(`## ${match[1].trim()}`);
  }

  // Extract H3
  const h3Pattern = /^###\s+(.+)$/gm;
  while ((match = h3Pattern.exec(markdown)) !== null) {
    headings.push(`### ${match[1].trim()}`);
  }

  return headings;
}

/**
 * Extract introduction content
 */
function extractIntroduction(markdown: string): string {
  // Try to find explicit Introduction section
  const introMatch = markdown.match(PATTERNS.introSection);
  if (introMatch) {
    return introMatch[1].trim();
  }

  // Fallback: content between H1 and first H2
  const h1Match = markdown.match(PATTERNS.h1);
  if (!h1Match) {
    return '';
  }

  const h1Index = h1Match.index || 0;
  const h1EndIndex = h1Index + h1Match[0].length;

  const firstH2Match = markdown.slice(h1EndIndex).match(/^##\s+/m);
  if (!firstH2Match || firstH2Match.index === undefined) {
    return '';
  }

  const introContent = markdown
    .slice(h1EndIndex, h1EndIndex + firstH2Match.index)
    .trim();

  return introContent;
}

/**
 * Extract exercises from markdown
 */
function extractExercises(markdown: string): string[] {
  const exercises: string[] = [];

  // Reset regex state
  PATTERNS.exerciseSection.lastIndex = 0;

  const match = PATTERNS.exerciseSection.exec(markdown);
  if (match && match[1]) {
    const exerciseContent = match[1].trim();

    // Split by numbered items or bullet points
    const items = exerciseContent
      .split(/(?:^|\n)(?:\d+\.|[-*])\s+/)
      .filter((item) => item.trim().length > 0)
      .map((item) => item.trim());

    exercises.push(...items);
  }

  return exercises;
}

/**
 * Extract summary/conclusion content
 */
function extractSummary(markdown: string): string {
  // Reset regex state
  PATTERNS.summarySection.lastIndex = 0;

  const match = PATTERNS.summarySection.exec(markdown);
  if (match && match[1]) {
    return match[1].trim();
  }

  return '';
}

/**
 * Clean markdown content
 *
 * Removes excessive whitespace, empty lines, and normalizes formatting.
 *
 * @param markdown - Raw markdown content
 * @returns Cleaned markdown
 */
export function cleanMarkdown(markdown: string): string {
  if (!markdown) {
    return '';
  }

  return markdown
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple blank lines
    .replace(/[ \t]+$/gm, '') // Remove trailing whitespace
    .replace(/^\s+/gm, (match) => {
      // Preserve code block indentation, normalize others
      if (match.includes('\t')) {
        return match;
      }
      return match.length > 4 ? '    ' : match;
    })
    .trim();
}

/**
 * Extract code blocks from markdown
 *
 * Returns all code blocks with their language identifiers.
 *
 * @param markdown - Raw markdown content
 * @returns Array of code blocks with language info
 */
export function extractCodeBlocks(
  markdown: string
): Array<{ language: string; code: string }> {
  const codeBlocks: Array<{ language: string; code: string }> = [];

  const pattern = /```(\w*)\n([\s\S]*?)```/g;
  let match;

  while ((match = pattern.exec(markdown)) !== null) {
    codeBlocks.push({
      language: match[1] || 'text',
      code: match[2].trim(),
    });
  }

  return codeBlocks;
}
