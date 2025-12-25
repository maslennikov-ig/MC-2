/**
 * Markdown Section Parser
 * @module stages/stage6-lesson-content/utils/markdown-section-parser
 *
 * Parses raw markdown lesson content into structured sections for
 * section-level regeneration. Supports merging regenerated sections
 * back into the full content.
 *
 * Expected markdown structure:
 * # Lesson Title
 *
 * ## Introduction
 * ...
 *
 * ## Section 1 Title
 * ...
 *
 * ## Section N Title
 * ...
 *
 * ## Summary
 * ...
 */

/**
 * Parsed section from markdown content
 */
export interface ParsedSection {
  /** Section identifier (introduction, section_1, section_2, summary) */
  id: string;
  /** Section title (text after ##) */
  title: string;
  /** Section content (including header) */
  content: string;
  /** Start line index in original content (0-based) */
  startLine: number;
  /** End line index in original content (exclusive) */
  endLine: number;
}

/**
 * Result of parsing markdown content
 */
export interface ParsedMarkdown {
  /** Lesson title (from # header) */
  lessonTitle: string;
  /** All parsed sections */
  sections: ParsedSection[];
  /** Original lines for reconstruction */
  lines: string[];
}

/**
 * Parse markdown content into sections
 *
 * Identifies sections by ## headers and extracts their boundaries.
 *
 * @param markdown - Raw markdown content
 * @returns Parsed markdown structure with sections
 */
export function parseMarkdownSections(markdown: string): ParsedMarkdown {
  const lines = markdown.split('\n');
  const sections: ParsedSection[] = [];
  let lessonTitle = '';

  // Find lesson title (# header)
  const titleLineIndex = lines.findIndex((line) => /^#\s+/.test(line));
  if (titleLineIndex >= 0) {
    lessonTitle = lines[titleLineIndex].replace(/^#\s+/, '').trim();
  }

  // Find all ## headers and their positions
  const sectionHeaders: { index: number; title: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line)) {
      const title = line.replace(/^##\s+/, '').trim();
      sectionHeaders.push({ index: i, title });
    }
  }

  // Build sections from headers
  for (let i = 0; i < sectionHeaders.length; i++) {
    const current = sectionHeaders[i];
    const nextIndex = i + 1 < sectionHeaders.length
      ? sectionHeaders[i + 1].index
      : lines.length;

    // Generate section ID from title
    const id = generateSectionId(current.title, i);

    // Extract content (from header to next header or end)
    const sectionLines = lines.slice(current.index, nextIndex);
    const content = sectionLines.join('\n');

    sections.push({
      id,
      title: current.title,
      content,
      startLine: current.index,
      endLine: nextIndex,
    });
  }

  return {
    lessonTitle,
    sections,
    lines,
  };
}

/**
 * Generate section ID from title
 *
 * Special handling for Introduction and Summary sections.
 *
 * @param title - Section title
 * @param index - Section index (0-based)
 * @returns Section ID
 */
function generateSectionId(title: string, index: number): string {
  const lowerTitle = title.toLowerCase();

  // Handle common section names
  if (lowerTitle.includes('introduction') || lowerTitle.includes('введение')) {
    return 'introduction';
  }
  if (lowerTitle.includes('summary') || lowerTitle.includes('итог') || lowerTitle.includes('заключение')) {
    return 'summary';
  }

  // Regular sections: section_1, section_2, etc.
  // Subtract 1 from index since Introduction is usually first
  const sectionNum = index > 0 ? index : 1;
  return `section_${sectionNum}`;
}

/**
 * Merge regenerated section back into full content
 *
 * Replaces the specified section with new content while preserving
 * the rest of the document structure.
 *
 * @param parsed - Original parsed markdown
 * @param sectionId - Section ID to replace
 * @param newContent - New section content (must include ## header)
 * @returns Merged markdown content
 */
export function mergeSectionIntoMarkdown(
  parsed: ParsedMarkdown,
  sectionId: string,
  newContent: string
): string {
  const section = parsed.sections.find((s) => s.id === sectionId);
  if (!section) {
    // Section not found, return original
    return parsed.lines.join('\n');
  }

  // Build new content by replacing lines
  const newLines = [...parsed.lines];

  // Calculate how many lines to remove (from startLine to endLine-1)
  const removeCount = section.endLine - section.startLine;

  // Split new content into lines
  const newContentLines = newContent.split('\n');

  // Replace the section
  newLines.splice(section.startLine, removeCount, ...newContentLines);

  return newLines.join('\n');
}

/**
 * Get context window for section regeneration
 *
 * Returns the last N characters of content before the section
 * for context-aware regeneration.
 *
 * @param parsed - Parsed markdown
 * @param sectionId - Section ID to get context for
 * @param maxChars - Maximum characters to include (default: 3000)
 * @returns Previous context string
 */
export function getSectionContext(
  parsed: ParsedMarkdown,
  sectionId: string,
  maxChars: number = 3000
): string {
  const section = parsed.sections.find((s) => s.id === sectionId);
  if (!section || section.startLine === 0) {
    return '';
  }

  // Get all content before this section
  const previousContent = parsed.lines.slice(0, section.startLine).join('\n');

  if (previousContent.length <= maxChars) {
    return previousContent;
  }

  // Truncate from the beginning, try to start at paragraph boundary
  const truncated = previousContent.slice(-maxChars);
  const paragraphBreak = truncated.indexOf('\n\n');

  if (paragraphBreak > 0 && paragraphBreak < 500) {
    return '...\n\n' + truncated.slice(paragraphBreak + 2);
  }

  return '...' + truncated;
}

/**
 * Map self-review location to section ID
 *
 * Self-reviewer uses locations like "intro", "sec_N", "global".
 * This maps them to our section IDs.
 *
 * @param location - Location from SelfReviewIssue
 * @returns Section ID or null if not mappable
 */
export function locationToSectionId(location: string): string | null {
  const lower = location.toLowerCase();

  if (lower === 'intro' || lower === 'introduction') {
    return 'introduction';
  }

  if (lower === 'summary' || lower === 'conclusion') {
    return 'summary';
  }

  // Match sec_N or section_N patterns
  const secMatch = lower.match(/sec(?:tion)?[_\s]?(\d+)/);
  if (secMatch) {
    return `section_${secMatch[1]}`;
  }

  // Global issues don't map to a specific section
  if (lower === 'global' || lower === 'examples' || lower === 'exercises') {
    return null;
  }

  return null;
}
