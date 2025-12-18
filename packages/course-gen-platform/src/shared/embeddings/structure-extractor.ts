/**
 * Document Structure Extractor
 *
 * Extracts hierarchical structure from markdown documents for intelligent chunking.
 * Analyzes heading levels, section boundaries, and document organization.
 *
 * This module supports T075 hierarchical chunking by providing section boundaries
 * and metadata for context-aware text splitting.
 *
 * @module shared/embeddings/structure-extractor
 */

import { DocumentStructure, DocumentSection } from './markdown-converter.js';
import { logger } from '../logger/index.js';

/**
 * Section boundary marker with metadata
 */
export interface SectionBoundary {
  /** Section heading text */
  heading: string;

  /** Heading level (1-6) */
  level: number;

  /** Character offset where section starts */
  start_offset: number;

  /** Character offset where section ends (exclusive) */
  end_offset: number;

  /** Section content length in characters */
  length: number;

  /** Parent section heading (if nested) */
  parent_heading?: string;

  /** Full section path (e.g., "Chapter 1 > Section 1.1 > Subsection 1.1.1") */
  path: string[];

  /** Page number where section starts (if available) */
  page_no?: number;
}

/**
 * Chunk metadata with section context
 */
export interface ChunkMetadata {
  /** Chunk content */
  content: string;

  /** Character offset in original document */
  offset: number;

  /** Chunk length in characters */
  length: number;

  /** Current section heading */
  section_heading: string;

  /** Heading level */
  section_level: number;

  /** Full section path */
  section_path: string[];

  /** Page number (if available) */
  page_no?: number;

  /** Previous section heading (for context) */
  previous_section?: string;

  /** Next section heading (for context) */
  next_section?: string;
}

/**
 * Extract all section boundaries from markdown text
 *
 * This function parses markdown to identify all heading boundaries,
 * which can be used for hierarchical chunking strategies.
 *
 * @param markdown - Markdown text
 * @param structure - Pre-extracted document structure (optional)
 * @returns Array of section boundaries
 */
export function extractSectionBoundaries(
  markdown: string,
  structure?: DocumentStructure
): SectionBoundary[] {
  const boundaries: SectionBoundary[] = [];
  const lines = markdown.split('\n');

  let offset = 0;
  const headingStack: Array<{ heading: string; level: number; path: string[] }> = [];
  let lastBoundary: SectionBoundary | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const heading = headingMatch[2];

      // Close previous boundary
      if (lastBoundary) {
        lastBoundary.end_offset = offset;
        lastBoundary.length = lastBoundary.end_offset - lastBoundary.start_offset;
      }

      // Update heading stack
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }

      const path = headingStack.map(h => h.heading).concat(heading);
      const parent_heading = headingStack.length > 0
        ? headingStack[headingStack.length - 1].heading
        : undefined;

      const page_no = structure
        ? findPageNumberForSection(structure, heading)
        : undefined;

      const boundary: SectionBoundary = {
        heading,
        level,
        start_offset: offset,
        end_offset: markdown.length, // Will be updated by next heading
        length: 0, // Will be calculated
        parent_heading,
        path,
        page_no,
      };

      boundaries.push(boundary);
      headingStack.push({ heading, level, path });
      lastBoundary = boundary;
    }

    offset += line.length + 1; // +1 for newline
  }

  // Close last boundary
  if (lastBoundary) {
    lastBoundary.end_offset = markdown.length;
    lastBoundary.length = lastBoundary.end_offset - lastBoundary.start_offset;
  }

  logger.debug({
    total_sections: boundaries.length,
    max_depth: Math.max(...boundaries.map(b => b.level)),
  }, 'Extracted section boundaries');

  return boundaries;
}

/**
 * Find the section boundary that contains a given character offset
 *
 * @param boundaries - Array of section boundaries
 * @param offset - Character offset in document
 * @returns Section boundary or undefined if not found
 */
export function findSectionAtOffset(
  boundaries: SectionBoundary[],
  offset: number
): SectionBoundary | undefined {
  return boundaries.find(
    boundary => offset >= boundary.start_offset && offset < boundary.end_offset
  );
}

/**
 * Get the most specific (deepest) section at a given offset
 *
 * @param boundaries - Array of section boundaries
 * @param offset - Character offset in document
 * @returns Most specific section boundary
 */
export function getMostSpecificSection(
  boundaries: SectionBoundary[],
  offset: number
): SectionBoundary | undefined {
  const matchingSections = boundaries.filter(
    boundary => offset >= boundary.start_offset && offset < boundary.end_offset
  );

  if (matchingSections.length === 0) {
    return undefined;
  }

  // Return the section with the highest (deepest) level
  return matchingSections.reduce((deepest, current) =>
    current.level > deepest.level ? current : deepest
  );
}

/**
 * Extract section content by boundary
 *
 * @param markdown - Full markdown text
 * @param boundary - Section boundary
 * @returns Section content
 */
export function extractSectionContent(
  markdown: string,
  boundary: SectionBoundary
): string {
  return markdown.substring(boundary.start_offset, boundary.end_offset);
}

/**
 * Enrich chunk metadata with section context
 *
 * This function takes a text chunk and enriches it with information
 * about the section it belongs to, useful for RAG retrieval.
 *
 * @param chunk - Text chunk content
 * @param offset - Chunk offset in original document
 * @param boundaries - Section boundaries
 * @returns Enriched chunk metadata
 */
export function enrichChunkWithContext(
  chunk: string,
  offset: number,
  boundaries: SectionBoundary[]
): ChunkMetadata {
  const section = getMostSpecificSection(boundaries, offset);

  if (!section) {
    // Fallback for chunks outside sections
    return {
      content: chunk,
      offset,
      length: chunk.length,
      section_heading: 'Document',
      section_level: 0,
      section_path: [],
    };
  }

  // Find previous and next sections
  const sectionIndex = boundaries.indexOf(section);
  const previousSection = sectionIndex > 0
    ? boundaries[sectionIndex - 1]
    : undefined;
  const nextSection = sectionIndex < boundaries.length - 1
    ? boundaries[sectionIndex + 1]
    : undefined;

  return {
    content: chunk,
    offset,
    length: chunk.length,
    section_heading: section.heading,
    section_level: section.level,
    section_path: section.path,
    page_no: section.page_no,
    previous_section: previousSection?.heading,
    next_section: nextSection?.heading,
  };
}

/**
 * Split markdown by section boundaries
 *
 * Returns an array of section contents with their metadata.
 * Useful for section-based chunking strategies.
 *
 * @param markdown - Full markdown text
 * @param maxLevel - Maximum heading level to split on (default: 3)
 * @returns Array of sections with content and metadata
 */
export function splitBySections(
  markdown: string,
  maxLevel: number = 3
): Array<{ boundary: SectionBoundary; content: string }> {
  const boundaries = extractSectionBoundaries(markdown);
  const filteredBoundaries = boundaries.filter(b => b.level <= maxLevel);

  return filteredBoundaries.map(boundary => ({
    boundary,
    content: extractSectionContent(markdown, boundary),
  }));
}

/**
 * Calculate section statistics
 *
 * Useful for understanding document structure and planning chunking strategies.
 *
 * @param boundaries - Section boundaries
 * @returns Statistics about sections
 */
export function calculateSectionStatistics(boundaries: SectionBoundary[]): {
  total_sections: number;
  sections_by_level: Record<number, number>;
  avg_section_length: number;
  min_section_length: number;
  max_section_length: number;
  total_depth: number;
} {
  if (boundaries.length === 0) {
    return {
      total_sections: 0,
      sections_by_level: {},
      avg_section_length: 0,
      min_section_length: 0,
      max_section_length: 0,
      total_depth: 0,
    };
  }

  const sections_by_level: Record<number, number> = {};
  let total_length = 0;
  let min_length = Infinity;
  let max_length = 0;

  for (const boundary of boundaries) {
    sections_by_level[boundary.level] = (sections_by_level[boundary.level] || 0) + 1;
    total_length += boundary.length;
    min_length = Math.min(min_length, boundary.length);
    max_length = Math.max(max_length, boundary.length);
  }

  return {
    total_sections: boundaries.length,
    sections_by_level,
    avg_section_length: Math.round(total_length / boundaries.length),
    min_section_length: min_length === Infinity ? 0 : min_length,
    max_section_length: max_length,
    total_depth: Math.max(...boundaries.map(b => b.level)),
  };
}

/**
 * Build a table of contents from section boundaries
 *
 * @param boundaries - Section boundaries
 * @param maxLevel - Maximum heading level to include (default: 3)
 * @returns Markdown table of contents
 */
export function buildTableOfContents(
  boundaries: SectionBoundary[],
  maxLevel: number = 3
): string {
  const lines: string[] = ['## Table of Contents\n'];

  for (const boundary of boundaries) {
    if (boundary.level <= maxLevel) {
      const indent = '  '.repeat(boundary.level - 1);
      const link = `#${boundary.heading.toLowerCase().replace(/\s+/g, '-')}`;
      lines.push(`${indent}- [${boundary.heading}](${link})`);
    }
  }

  return lines.join('\n');
}

/**
 * Find page number for a section in the document structure
 */
function findPageNumberForSection(
  structure: DocumentStructure,
  heading: string
): number | undefined {
  const findInSections = (sections: DocumentSection[]): number | undefined => {
    for (const section of sections) {
      if (section.heading === heading) {
        return section.page_no;
      }
      const found = findInSections(section.subsections);
      if (found) {
        return found;
      }
    }
    return undefined;
  };

  return findInSections(structure.sections);
}

/**
 * Validate section boundaries for consistency
 *
 * Checks for overlapping boundaries, gaps, and other structural issues.
 *
 * @param boundaries - Section boundaries to validate
 * @returns Validation result with any issues found
 */
export function validateSectionBoundaries(boundaries: SectionBoundary[]): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check for overlapping boundaries
  for (let i = 0; i < boundaries.length - 1; i++) {
    const current = boundaries[i];
    const next = boundaries[i + 1];

    if (current.end_offset > next.start_offset) {
      issues.push(
        `Overlapping sections: "${current.heading}" (${current.start_offset}-${current.end_offset}) and "${next.heading}" (${next.start_offset}-${next.end_offset})`
      );
    }
  }

  // Check for invalid offsets
  for (const boundary of boundaries) {
    if (boundary.start_offset < 0) {
      issues.push(`Invalid start offset for section "${boundary.heading}": ${boundary.start_offset}`);
    }
    if (boundary.end_offset < boundary.start_offset) {
      issues.push(
        `Invalid end offset for section "${boundary.heading}": ${boundary.end_offset} < ${boundary.start_offset}`
      );
    }
    if (boundary.length !== boundary.end_offset - boundary.start_offset) {
      issues.push(
        `Inconsistent length for section "${boundary.heading}": length=${boundary.length}, calculated=${boundary.end_offset - boundary.start_offset}`
      );
    }
  }

  // Check for heading level jumps
  for (let i = 0; i < boundaries.length - 1; i++) {
    const current = boundaries[i];
    const next = boundaries[i + 1];

    if (next.level > current.level + 1) {
      issues.push(
        `Heading level jump from ${current.level} to ${next.level} between "${current.heading}" and "${next.heading}"`
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
