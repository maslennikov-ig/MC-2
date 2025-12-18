/* eslint-disable max-lines-per-function */
/**
 * Tests for Document Structure Extractor
 *
 * Tests section boundary extraction, hierarchical structure analysis,
 * and chunk metadata enrichment for RAG chunking.
 *
 * @module shared/embeddings/__tests__/structure-extractor.test
 */

import { describe, it, expect } from 'vitest';
import {
  extractSectionBoundaries,
  findSectionAtOffset,
  getMostSpecificSection,
  extractSectionContent,
  enrichChunkWithContext,
  splitBySections,
  calculateSectionStatistics,
  buildTableOfContents,
  validateSectionBoundaries,
} from '../structure-extractor';

describe('Structure Extractor', () => {
  const sampleMarkdown = `# Main Title

Introduction text.

## Section 1

Section 1 content.

### Subsection 1.1

Subsection 1.1 content.

## Section 2

Section 2 content.

### Subsection 2.1

Subsection 2.1 content.

#### Subsection 2.1.1

Deep subsection content.`;

  describe('extractSectionBoundaries', () => {
    it('should extract all section boundaries', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);

      expect(boundaries).toHaveLength(6); // All headings
      expect(boundaries[0].heading).toBe('Main Title');
      expect(boundaries[0].level).toBe(1);
      expect(boundaries[1].heading).toBe('Section 1');
      expect(boundaries[1].level).toBe(2);
      expect(boundaries[2].heading).toBe('Subsection 1.1');
      expect(boundaries[2].level).toBe(3);
    });

    it('should calculate correct offsets', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);

      // First boundary starts at 0
      expect(boundaries[0].start_offset).toBe(0);

      // Each boundary's start should be before its end
      boundaries.forEach(boundary => {
        expect(boundary.start_offset).toBeLessThan(boundary.end_offset);
        expect(boundary.length).toBe(boundary.end_offset - boundary.start_offset);
      });

      // Last boundary should end at the document end
      const lastBoundary = boundaries[boundaries.length - 1];
      expect(lastBoundary.end_offset).toBe(sampleMarkdown.length);
    });

    it('should build correct section paths', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);

      expect(boundaries[0].path).toEqual(['Main Title']);
      expect(boundaries[1].path).toEqual(['Main Title', 'Section 1']);
      expect(boundaries[2].path).toEqual(['Main Title', 'Section 1', 'Subsection 1.1']);
      expect(boundaries[5].path).toEqual([
        'Main Title',
        'Section 2',
        'Subsection 2.1',
        'Subsection 2.1.1',
      ]);
    });

    it('should identify parent sections', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);

      expect(boundaries[0].parent_heading).toBeUndefined(); // H1 has no parent
      expect(boundaries[1].parent_heading).toBe('Main Title');
      expect(boundaries[2].parent_heading).toBe('Section 1');
      expect(boundaries[5].parent_heading).toBe('Subsection 2.1');
    });

    it('should handle documents with no headings', () => {
      const markdown = 'Just plain text with no headings.';
      const boundaries = extractSectionBoundaries(markdown);

      expect(boundaries).toHaveLength(0);
    });

    it('should handle single heading', () => {
      const markdown = '# Single Heading\n\nContent.';
      const boundaries = extractSectionBoundaries(markdown);

      expect(boundaries).toHaveLength(1);
      expect(boundaries[0].heading).toBe('Single Heading');
      expect(boundaries[0].start_offset).toBe(0);
      expect(boundaries[0].end_offset).toBe(markdown.length);
    });
  });

  describe('findSectionAtOffset', () => {
    it('should find the correct section for a given offset', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);
      const introOffset = sampleMarkdown.indexOf('Introduction text');

      const section = findSectionAtOffset(boundaries, introOffset);

      expect(section).toBeDefined();
      expect(section?.heading).toBe('Main Title');
    });

    it('should return undefined for offset outside all sections', () => {
      const markdown = '# Heading\n\nContent.';
      const boundaries = extractSectionBoundaries(markdown);

      const section = findSectionAtOffset(boundaries, markdown.length + 100);

      expect(section).toBeUndefined();
    });
  });

  describe('getMostSpecificSection', () => {
    it('should return the deepest section containing the offset', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);
      const subsectionOffset = sampleMarkdown.indexOf('Subsection 1.1 content');

      const section = getMostSpecificSection(boundaries, subsectionOffset);

      expect(section).toBeDefined();
      expect(section?.heading).toBe('Subsection 1.1');
      expect(section?.level).toBe(3);
    });

    it('should handle offset in top-level section', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);
      const introOffset = sampleMarkdown.indexOf('Introduction text');

      const section = getMostSpecificSection(boundaries, introOffset);

      expect(section?.heading).toBe('Main Title');
      expect(section?.level).toBe(1);
    });
  });

  describe('extractSectionContent', () => {
    it('should extract the correct content for a section', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);
      const section1 = boundaries.find(b => b.heading === 'Section 1')!;

      const content = extractSectionContent(sampleMarkdown, section1);

      expect(content).toContain('## Section 1');
      expect(content).toContain('Section 1 content');
      expect(content).toContain('### Subsection 1.1');
      expect(content).not.toContain('Section 2'); // Should not include next section
    });

    it('should handle last section correctly', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);
      const lastSection = boundaries[boundaries.length - 1];

      const content = extractSectionContent(sampleMarkdown, lastSection);

      expect(content).toContain('#### Subsection 2.1.1');
      expect(content).toContain('Deep subsection content.');
    });
  });

  describe('enrichChunkWithContext', () => {
    it('should enrich a chunk with section context', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);
      const chunkOffset = sampleMarkdown.indexOf('Section 1 content');
      const chunk = 'Section 1 content.';

      const metadata = enrichChunkWithContext(chunk, chunkOffset, boundaries);

      expect(metadata.content).toBe(chunk);
      expect(metadata.section_heading).toBe('Section 1');
      expect(metadata.section_level).toBe(2);
      expect(metadata.section_path).toEqual(['Main Title', 'Section 1']);
    });

    it('should include previous and next sections', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);
      const chunkOffset = sampleMarkdown.indexOf('Section 1 content');
      const chunk = 'Section 1 content.';

      const metadata = enrichChunkWithContext(chunk, chunkOffset, boundaries);

      expect(metadata.previous_section).toBe('Main Title');
      expect(metadata.next_section).toBe('Subsection 1.1');
    });

    it('should handle chunk outside sections', () => {
      const markdown = 'Preamble text.\n\n# Heading\n\nContent.';
      const boundaries = extractSectionBoundaries(markdown);
      const chunk = 'Preamble text.';

      const metadata = enrichChunkWithContext(chunk, 0, boundaries);

      expect(metadata.section_heading).toBe('Document');
      expect(metadata.section_level).toBe(0);
      expect(metadata.section_path).toEqual([]);
    });
  });

  describe('splitBySections', () => {
    it('should split markdown by section boundaries', () => {
      const sections = splitBySections(sampleMarkdown, 2);

      // Should only include H1 and H2 sections (maxLevel=2)
      expect(sections.length).toBeGreaterThan(0);
      expect(sections[0].boundary.heading).toBe('Main Title');
      expect(sections[0].boundary.level).toBe(1);
      expect(sections[1].boundary.heading).toBe('Section 1');
      expect(sections[1].boundary.level).toBe(2);
    });

    it('should include section content', () => {
      const sections = splitBySections(sampleMarkdown, 2);
      const section1 = sections.find(s => s.boundary.heading === 'Section 1')!;

      expect(section1.content).toContain('Section 1 content');
      expect(section1.content).toContain('Subsection 1.1'); // Includes subsections
    });

    it('should respect maxLevel parameter', () => {
      const sections = splitBySections(sampleMarkdown, 2);

      // Should not include H3 or H4 sections as top-level
      const hasH3 = sections.some(s => s.boundary.level === 3);
      const hasH4 = sections.some(s => s.boundary.level === 4);

      expect(hasH3).toBe(false);
      expect(hasH4).toBe(false);
    });
  });

  describe('calculateSectionStatistics', () => {
    it('should calculate correct statistics', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);
      const stats = calculateSectionStatistics(boundaries);

      expect(stats.total_sections).toBe(6);
      expect(stats.sections_by_level[1]).toBe(1); // 1 H1
      expect(stats.sections_by_level[2]).toBe(2); // 2 H2s
      expect(stats.sections_by_level[3]).toBe(2); // 2 H3s
      expect(stats.sections_by_level[4]).toBe(1); // 1 H4
      expect(stats.total_depth).toBe(4);
      expect(stats.avg_section_length).toBeGreaterThan(0);
      expect(stats.min_section_length).toBeLessThanOrEqual(stats.avg_section_length);
      expect(stats.max_section_length).toBeGreaterThanOrEqual(stats.avg_section_length);
    });

    it('should handle empty boundaries', () => {
      const stats = calculateSectionStatistics([]);

      expect(stats.total_sections).toBe(0);
      expect(stats.sections_by_level).toEqual({});
      expect(stats.avg_section_length).toBe(0);
      expect(stats.min_section_length).toBe(0);
      expect(stats.max_section_length).toBe(0);
      expect(stats.total_depth).toBe(0);
    });
  });

  describe('buildTableOfContents', () => {
    it('should build a markdown table of contents', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);
      const toc = buildTableOfContents(boundaries, 3);

      expect(toc).toContain('## Table of Contents');
      expect(toc).toContain('- [Main Title](#main-title)');
      expect(toc).toContain('  - [Section 1](#section-1)');
      expect(toc).toContain('    - [Subsection 1.1](#subsection-11)');
      expect(toc).not.toContain('Subsection 2.1.1'); // H4 excluded (maxLevel=3)
    });

    it('should respect maxLevel parameter', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);
      const toc = buildTableOfContents(boundaries, 2);

      expect(toc).toContain('Section 1');
      expect(toc).toContain('Section 2');
      expect(toc).not.toContain('Subsection'); // H3+ excluded
    });
  });

  describe('validateSectionBoundaries', () => {
    it('should validate correct boundaries', () => {
      const boundaries = extractSectionBoundaries(sampleMarkdown);
      const validation = validateSectionBoundaries(boundaries);

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should detect overlapping boundaries', () => {
      const invalidBoundaries = [
        {
          heading: 'Section 1',
          level: 1,
          start_offset: 0,
          end_offset: 100,
          length: 100,
          path: ['Section 1'],
        },
        {
          heading: 'Section 2',
          level: 1,
          start_offset: 50, // Overlaps with Section 1
          end_offset: 150,
          length: 100,
          path: ['Section 2'],
        },
      ];

      const validation = validateSectionBoundaries(invalidBoundaries);

      expect(validation.valid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
      expect(validation.issues[0]).toContain('Overlapping');
    });

    it('should detect invalid offsets', () => {
      const invalidBoundaries = [
        {
          heading: 'Section',
          level: 1,
          start_offset: -10, // Invalid negative offset
          end_offset: 100,
          length: 110,
          path: ['Section'],
        },
      ];

      const validation = validateSectionBoundaries(invalidBoundaries);

      expect(validation.valid).toBe(false);
      expect(validation.issues[0]).toContain('Invalid start offset');
    });

    it('should detect heading level jumps', () => {
      const invalidBoundaries = [
        {
          heading: 'H1',
          level: 1,
          start_offset: 0,
          end_offset: 50,
          length: 50,
          path: ['H1'],
        },
        {
          heading: 'H4', // Jumps from H1 to H4
          level: 4,
          start_offset: 50,
          end_offset: 100,
          length: 50,
          path: ['H1', 'H4'],
        },
      ];

      const validation = validateSectionBoundaries(invalidBoundaries);

      expect(validation.valid).toBe(false);
      expect(validation.issues.some(issue => issue.includes('level jump'))).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle markdown with special characters in headings', () => {
      const markdown = '# Heading with `code` and **bold**\n\nContent.';
      const boundaries = extractSectionBoundaries(markdown);

      expect(boundaries).toHaveLength(1);
      expect(boundaries[0].heading).toBe('Heading with `code` and **bold**');
    });

    it('should handle consecutive headings without content', () => {
      const markdown = '# H1\n## H2\n### H3\n\nContent.';
      const boundaries = extractSectionBoundaries(markdown);

      expect(boundaries).toHaveLength(3);
      expect(boundaries[0].length).toBeGreaterThan(0);
      expect(boundaries[1].length).toBeGreaterThan(0);
      expect(boundaries[2].length).toBeGreaterThan(0);
    });

    it('should handle very long sections', () => {
      const longContent = 'Lorem ipsum '.repeat(1000);
      const markdown = `# Heading\n\n${longContent}`;
      const boundaries = extractSectionBoundaries(markdown);

      expect(boundaries).toHaveLength(1);
      expect(boundaries[0].length).toBeGreaterThan(10000);
    });
  });
});
