/* eslint-disable max-lines-per-function */
/**
 * Tests for Markdown Conversion Pipeline
 *
 * Tests the conversion of DoclingDocument JSON to Markdown format,
 * including structure extraction, image processing, and metadata enrichment.
 *
 * @module shared/embeddings/__tests__/markdown-converter.test
 */

import { describe, it, expect } from 'vitest';
import {
  convertDoclingDocumentToMarkdown,
  type DocumentStructure,
} from '../markdown-converter';
import { DoclingDocument } from '../../docling/types';

// Helper function to extract document structure from markdown
function extractDocumentStructure(_document: DoclingDocument, markdown: string): DocumentStructure {
  // This is a simplified version for testing
  const lines = markdown.split('\n');
  const sections: any[] = [];
  const heading_counts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  let max_depth = 0;
  let title: string | undefined;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const heading = headingMatch[2];
      heading_counts[`h${level}` as keyof typeof heading_counts]++;
      max_depth = Math.max(max_depth, level);
      if (level === 1 && !title) title = heading;
    }
  }

  return { title, sections, heading_counts, max_depth };
}

describe('Markdown Converter', () => {
  describe('convertDoclingDocumentToMarkdown', () => {
    it('should convert a simple document with text elements', () => {
      const document: DoclingDocument = {
        schema_version: '2.0',
        name: 'test-document',
        pages: [
          {
            page_no: 1,
            size: { width: 612, height: 792 },
            cells: [],
          },
        ],
        texts: [
          {
            id: 'text-1',
            text: 'Document Title',
            type: 'title',
            page_no: 1,
            order: 0,
          },
          {
            id: 'text-2',
            text: 'This is a paragraph of text.',
            type: 'paragraph',
            page_no: 1,
            order: 1,
          },
          {
            id: 'text-3',
            text: 'Section Heading',
            type: 'heading',
            page_no: 1,
            order: 2,
            font: { size: 16 },
          },
          {
            id: 'text-4',
            text: 'Another paragraph.',
            type: 'paragraph',
            page_no: 1,
            order: 3,
          },
        ],
        pictures: [],
        tables: [],
        metadata: {
          page_count: 1,
          format: 'pdf',
        },
      };

      const markdown = convertDoclingDocumentToMarkdown(document);

      expect(markdown).toContain('# Document Title');
      expect(markdown).toContain('This is a paragraph of text.');
      expect(markdown).toContain('### Section Heading');
      expect(markdown).toContain('Another paragraph.');
    });

    it('should handle list items', () => {
      const document: DoclingDocument = {
        schema_version: '2.0',
        name: 'test-list',
        pages: [{ page_no: 1, size: { width: 612, height: 792 }, cells: [] }],
        texts: [
          { id: 't1', text: 'First item', type: 'list-item', page_no: 1, order: 0 },
          { id: 't2', text: 'Second item', type: 'list-item', page_no: 1, order: 1 },
          { id: 't3', text: 'Third item', type: 'list-item', page_no: 1, order: 2 },
        ],
        pictures: [],
        tables: [],
        metadata: { page_count: 1 },
      };

      const markdown = convertDoclingDocumentToMarkdown(document);

      expect(markdown).toContain('- First item');
      expect(markdown).toContain('- Second item');
      expect(markdown).toContain('- Third item');
    });

    it('should convert tables to markdown format', () => {
      const document: DoclingDocument = {
        schema_version: '2.0',
        name: 'test-table',
        pages: [{ page_no: 1, size: { width: 612, height: 792 }, cells: [] }],
        texts: [],
        pictures: [],
        tables: [
          {
            id: 'table-1',
            bbox: [100, 100, 400, 200],
            page_no: 1,
            num_rows: 3,
            num_cols: 2,
            caption: 'Sample Table',
            cells: [
              [{ text: 'Header 1' }, { text: 'Header 2' }],
              [{ text: 'Row 1 Col 1' }, { text: 'Row 1 Col 2' }],
              [{ text: 'Row 2 Col 1' }, { text: 'Row 2 Col 2' }],
            ],
          },
        ],
        metadata: { page_count: 1 },
      };

      const markdown = convertDoclingDocumentToMarkdown(document, {
        include_tables: true,
      });

      expect(markdown).toContain('**Table: Sample Table**');
      expect(markdown).toContain('| Header 1 | Header 2 |');
      expect(markdown).toContain('| --- | --- |');
      expect(markdown).toContain('| Row 1 Col 1 | Row 1 Col 2 |');
      expect(markdown).toContain('| Row 2 Col 1 | Row 2 Col 2 |');
    });

    it('should handle images with captions', () => {
      const document: DoclingDocument = {
        schema_version: '2.0',
        name: 'test-images',
        pages: [{ page_no: 1, size: { width: 612, height: 792 }, cells: [] }],
        texts: [],
        pictures: [
          {
            id: 'img-1',
            bbox: [100, 100, 300, 200],
            page_no: 1,
            caption: 'Figure 1: Sample Image',
            format: 'png',
          },
          {
            id: 'img-2',
            bbox: [100, 300, 300, 400],
            page_no: 1,
            caption: 'Figure 2: Another Image',
            ocr_text: 'This is text from the image',
            format: 'jpeg',
          },
        ],
        tables: [],
        metadata: { page_count: 1 },
      };

      const markdown = convertDoclingDocumentToMarkdown(document, {
        include_images: true,
      });

      expect(markdown).toContain('![Figure 1: Sample Image]');
      expect(markdown).toContain('![Figure 2: Another Image]');
      expect(markdown).toContain('**OCR Text:** This is text from the image');
    });

    it('should handle formulas', () => {
      const document: DoclingDocument = {
        schema_version: '2.0',
        name: 'test-formulas',
        pages: [{ page_no: 1, size: { width: 612, height: 792 }, cells: [] }],
        texts: [
          {
            id: 'f1',
            text: 'E = mc^2',
            type: 'formula',
            page_no: 1,
            order: 0,
          },
          {
            id: 'f2',
            text: 'a^2 + b^2 = c^2',
            type: 'formula',
            page_no: 1,
            order: 1,
          },
        ],
        pictures: [],
        tables: [],
        metadata: { page_count: 1 },
      };

      const markdown = convertDoclingDocumentToMarkdown(document, {
        include_formulas: true,
      });

      expect(markdown).toContain('$E = mc^2$');
      expect(markdown).toContain('$a^2 + b^2 = c^2$');
    });

    it('should respect max_heading_level option', () => {
      const document: DoclingDocument = {
        schema_version: '2.0',
        name: 'test-headings',
        pages: [{ page_no: 1, size: { width: 612, height: 792 }, cells: [] }],
        texts: [
          {
            id: 'h1',
            text: 'H1 Heading',
            type: 'heading',
            page_no: 1,
            order: 0,
            font: { size: 24 },
          },
          {
            id: 'h2',
            text: 'H6 Heading',
            type: 'heading',
            page_no: 1,
            order: 1,
            font: { size: 10 },
          },
        ],
        pictures: [],
        tables: [],
        metadata: { page_count: 1 },
      };

      const markdown = convertDoclingDocumentToMarkdown(document, {
        max_heading_level: 3,
      });

      expect(markdown).toContain('# H1 Heading');
      expect(markdown).toContain('### H6 Heading'); // Capped at H3
    });

    it('should add page markers when requested', () => {
      const document: DoclingDocument = {
        schema_version: '2.0',
        name: 'test-pages',
        pages: [
          { page_no: 1, size: { width: 612, height: 792 }, cells: [] },
          { page_no: 2, size: { width: 612, height: 792 }, cells: [] },
        ],
        texts: [
          { id: 't1', text: 'Page 1 content', type: 'paragraph', page_no: 1, order: 0 },
          { id: 't2', text: 'Page 2 content', type: 'paragraph', page_no: 2, order: 1 },
        ],
        pictures: [],
        tables: [],
        metadata: { page_count: 2 },
      };

      const markdown = convertDoclingDocumentToMarkdown(document, {
        include_page_markers: true,
      });

      expect(markdown).toContain('<!-- Page 1 -->');
      expect(markdown).toContain('<!-- Page 2 -->');
    });
  });

  describe('extractDocumentStructure', () => {
    it('should extract heading hierarchy from markdown', () => {
      const markdown = `
# Main Title

This is intro text.

## Section 1

Section 1 content.

### Subsection 1.1

Subsection content.

## Section 2

Section 2 content.

### Subsection 2.1

More content.

#### Subsection 2.1.1

Deep content.
      `.trim();

      const document: DoclingDocument = {
        schema_version: '2.0',
        name: 'test',
        pages: [{ page_no: 1, size: { width: 612, height: 792 }, cells: [] }],
        texts: [
          { id: 't1', text: 'Main Title', type: 'heading', page_no: 1, order: 0 },
          { id: 't2', text: 'Section 1', type: 'heading', page_no: 1, order: 1 },
          { id: 't3', text: 'Subsection 1.1', type: 'heading', page_no: 1, order: 2 },
          { id: 't4', text: 'Section 2', type: 'heading', page_no: 2, order: 3 },
          { id: 't5', text: 'Subsection 2.1', type: 'heading', page_no: 2, order: 4 },
          { id: 't6', text: 'Subsection 2.1.1', type: 'heading', page_no: 2, order: 5 },
        ],
        pictures: [],
        tables: [],
        metadata: { page_count: 2 },
      };

      const structure = extractDocumentStructure(document, markdown);

      expect(structure.title).toBe('Main Title');
      expect(structure.sections).toHaveLength(2); // Section 1 and Section 2
      expect(structure.heading_counts.h1).toBe(1);
      expect(structure.heading_counts.h2).toBe(2);
      expect(structure.heading_counts.h3).toBe(2);
      expect(structure.heading_counts.h4).toBe(1);
      expect(structure.max_depth).toBe(4);

      // Check nested structure
      expect(structure.sections[0].heading).toBe('Section 1');
      expect(structure.sections[0].subsections).toHaveLength(1);
      expect(structure.sections[0].subsections[0].heading).toBe('Subsection 1.1');

      expect(structure.sections[1].heading).toBe('Section 2');
      expect(structure.sections[1].subsections).toHaveLength(1);
      expect(structure.sections[1].subsections[0].heading).toBe('Subsection 2.1');
      expect(structure.sections[1].subsections[0].subsections).toHaveLength(1);
      expect(structure.sections[1].subsections[0].subsections[0].heading).toBe('Subsection 2.1.1');
    });

    it('should handle documents with no headings', () => {
      const markdown = 'Just plain text with no headings.';
      const document: DoclingDocument = {
        schema_version: '2.0',
        name: 'test',
        pages: [{ page_no: 1, size: { width: 612, height: 792 }, cells: [] }],
        texts: [{ id: 't1', text: 'Just plain text', type: 'paragraph', page_no: 1, order: 0 }],
        pictures: [],
        tables: [],
        metadata: { page_count: 1 },
      };

      const structure = extractDocumentStructure(document, markdown);

      expect(structure.sections).toHaveLength(0);
      expect(structure.heading_counts.h1).toBe(0);
      expect(structure.max_depth).toBe(0);
    });

    it('should calculate character offsets correctly', () => {
      const markdown = `# Heading 1

Content 1.

## Heading 2

Content 2.`;

      const document: DoclingDocument = {
        schema_version: '2.0',
        name: 'test',
        pages: [{ page_no: 1, size: { width: 612, height: 792 }, cells: [] }],
        texts: [
          { id: 't1', text: 'Heading 1', type: 'heading', page_no: 1, order: 0 },
          { id: 't2', text: 'Heading 2', type: 'heading', page_no: 1, order: 1 },
        ],
        pictures: [],
        tables: [],
        metadata: { page_count: 1 },
      };

      const structure = extractDocumentStructure(document, markdown);

      expect(structure.sections[0].offset).toBe(0);
      expect(structure.sections[0].subsections[0].offset).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty document gracefully', () => {
      const document: DoclingDocument = {
        schema_version: '2.0',
        name: 'empty',
        pages: [],
        texts: [],
        pictures: [],
        tables: [],
        metadata: { page_count: 0 },
      };

      const markdown = convertDoclingDocumentToMarkdown(document);
      expect(markdown).toBe('');
    });

    it('should handle documents with only whitespace text', () => {
      const document: DoclingDocument = {
        schema_version: '2.0',
        name: 'whitespace',
        pages: [{ page_no: 1, size: { width: 612, height: 792 }, cells: [] }],
        texts: [
          { id: 't1', text: '   ', type: 'paragraph', page_no: 1, order: 0 },
          { id: 't2', text: '\n\n', type: 'paragraph', page_no: 1, order: 1 },
        ],
        pictures: [],
        tables: [],
        metadata: { page_count: 1 },
      };

      const markdown = convertDoclingDocumentToMarkdown(document);
      expect(markdown.trim()).toBe('');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle a complex multi-page document', () => {
      const document: DoclingDocument = {
        schema_version: '2.0',
        name: 'complex-doc',
        pages: [
          { page_no: 1, size: { width: 612, height: 792 }, cells: [] },
          { page_no: 2, size: { width: 612, height: 792 }, cells: [] },
        ],
        texts: [
          { id: 't1', text: 'Document Title', type: 'title', page_no: 1, order: 0 },
          { id: 't2', text: 'Introduction', type: 'heading', page_no: 1, order: 1, font: { size: 16 } },
          { id: 't3', text: 'This is the intro.', type: 'paragraph', page_no: 1, order: 2 },
          { id: 't4', text: 'Item 1', type: 'list-item', page_no: 1, order: 3 },
          { id: 't5', text: 'Item 2', type: 'list-item', page_no: 1, order: 4 },
          { id: 't6', text: 'Chapter 1', type: 'heading', page_no: 2, order: 5, font: { size: 16 } },
          { id: 't7', text: 'Chapter content.', type: 'paragraph', page_no: 2, order: 6 },
          { id: 't8', text: 'E = mc^2', type: 'formula', page_no: 2, order: 7 },
        ],
        pictures: [
          {
            id: 'img1',
            bbox: [100, 100, 200, 200],
            page_no: 2,
            caption: 'Figure 1',
            ocr_text: 'Image text',
            format: 'png',
          },
        ],
        tables: [
          {
            id: 'tbl1',
            bbox: [100, 300, 400, 400],
            page_no: 2,
            num_rows: 2,
            num_cols: 2,
            caption: 'Table 1',
            cells: [
              [{ text: 'A' }, { text: 'B' }],
              [{ text: '1' }, { text: '2' }],
            ],
          },
        ],
        metadata: { page_count: 2 },
      };

      const markdown = convertDoclingDocumentToMarkdown(document, {
        include_images: true,
        include_tables: true,
        include_formulas: true,
      });

      // Verify all elements are present
      expect(markdown).toContain('# Document Title');
      expect(markdown).toContain('### Introduction');
      expect(markdown).toContain('This is the intro.');
      expect(markdown).toContain('- Item 1');
      expect(markdown).toContain('- Item 2');
      expect(markdown).toContain('### Chapter 1');
      expect(markdown).toContain('Chapter content.');
      expect(markdown).toContain('$E = mc^2$');
      expect(markdown).toContain('![Figure 1]');
      expect(markdown).toContain('**OCR Text:** Image text');
      expect(markdown).toContain('**Table: Table 1**');
      expect(markdown).toContain('| A | B |');
      expect(markdown).toContain('| 1 | 2 |');

      // Verify structure extraction
      const structure = extractDocumentStructure(document, markdown);
      expect(structure.title).toBe('Document Title');
      expect(structure.sections).toHaveLength(2);
      expect(structure.max_depth).toBe(3);
    });
  });
});
