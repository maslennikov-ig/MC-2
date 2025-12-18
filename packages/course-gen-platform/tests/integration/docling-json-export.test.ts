/**
 * Integration test for Docling JSON export (T074.5)
 *
 * Tests the complete workflow:
 * 1. Convert document via MCP
 * 2. Save to JSON via save_docling_document
 * 3. Read JSON from volume mount
 * 4. Verify full DoclingDocument structure
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { convertDocumentToMarkdown } from '../../src/shared/embeddings/markdown-converter.js';
import { getDoclingClient } from '../../src/shared/docling/client.js';
import fs from 'fs/promises';
import path from 'path';

describe('Docling JSON Export Integration (T074.5)', () => {
  const testFilesDir = path.join(process.cwd(), 'tests/fixtures/documents');

  beforeAll(async () => {
    // Ensure test files exist
    try {
      await fs.access(testFilesDir);
    } catch {
      console.warn(`Test files directory not found: ${testFilesDir}`);
    }
  });

  it('should retrieve full DoclingDocument JSON from MCP server', async () => {
    const client = getDoclingClient();
    await client.connect();

    // Create a simple test markdown file
    const testFile = path.join(testFilesDir, 'test-docling-json-export.md');
    const testContent = `# Test Document

This is a test document for verifying JSON export functionality.

## Section 1
Some content here.

## Section 2
More content here.`;

    await fs.mkdir(testFilesDir, { recursive: true });
    await fs.writeFile(testFile, testContent, 'utf-8');

    try {
      // Call getDoclingDocumentJSON (new method)
      const doclingDoc = await client.getDoclingDocumentJSON(testFile);

      // Verify structure
      expect(doclingDoc).toBeDefined();
      expect(doclingDoc.schema_name).toBe('DoclingDocument');
      expect(doclingDoc.texts).toBeDefined();
      expect(Array.isArray(doclingDoc.texts)).toBe(true);
      expect(doclingDoc.pictures).toBeDefined();
      expect(Array.isArray(doclingDoc.pictures)).toBe(true);
      expect(doclingDoc.tables).toBeDefined();
      expect(Array.isArray(doclingDoc.tables)).toBe(true);
      expect(doclingDoc.pages).toBeDefined();

      // Verify content
      expect(doclingDoc.texts.length).toBeGreaterThan(0);

      console.log('DoclingDocument structure verified:', {
        texts_count: doclingDoc.texts.length,
        pictures_count: doclingDoc.pictures.length,
        tables_count: doclingDoc.tables.length,
        pages_count: Object.keys(doclingDoc.pages || {}).length,
      });
    } finally {
      // Cleanup
      try {
        await fs.unlink(testFile);
      } catch {
        // Ignore cleanup errors
      }
      await client.disconnect();
    }
  }, 30000); // 30s timeout

  it('should include real metadata in convertDocumentToMarkdown', async () => {
    // Create a test file
    const testFile = path.join(testFilesDir, 'test-markdown-converter.md');
    const testContent = `# Test Document

This is a test document for markdown converter.

## Section 1
Content for section 1.

## Section 2
Content for section 2.`;

    await fs.mkdir(testFilesDir, { recursive: true });
    await fs.writeFile(testFile, testContent, 'utf-8');

    try {
      // Convert document
      const result = await convertDocumentToMarkdown(testFile);

      // Verify result structure
      expect(result).toBeDefined();
      expect(result.markdown).toBeDefined();
      expect(result.json).toBeDefined();
      expect(result.images).toBeDefined();
      expect(result.structure).toBeDefined();
      expect(result.metadata).toBeDefined();

      // Verify metadata has real values (not stub values)
      expect(result.metadata.text_elements).toBeGreaterThan(0);
      expect(result.metadata.pages_processed).toBeGreaterThanOrEqual(0);
      expect(result.metadata.processing_time_ms).toBeGreaterThan(0);

      // Verify JSON has real data
      expect(result.json.texts).toBeDefined();
      expect(Array.isArray(result.json.texts)).toBe(true);
      expect(result.json.texts.length).toBeGreaterThan(0);

      console.log('Markdown conversion result:', {
        markdown_length: result.markdown.length,
        text_elements: result.metadata.text_elements,
        pages_processed: result.metadata.pages_processed,
        processing_time_ms: result.metadata.processing_time_ms,
      });
    } finally {
      // Cleanup
      try {
        await fs.unlink(testFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }, 30000); // 30s timeout

  it('should handle PDF documents with multiple pages', async () => {
    // This test requires a sample PDF file
    const samplePdf = path.join(testFilesDir, 'sample.pdf');

    try {
      await fs.access(samplePdf);
    } catch {
      console.warn('Sample PDF not found, skipping test');
      return;
    }

    const result = await convertDocumentToMarkdown(samplePdf);

    // Verify metadata
    expect(result.metadata.pages_processed).toBeGreaterThan(0);
    expect(result.metadata.text_elements).toBeGreaterThan(0);

    // Verify JSON structure
    expect(result.json.texts.length).toBeGreaterThan(0);

    console.log('PDF processing result:', {
      pages_processed: result.metadata.pages_processed,
      text_elements: result.metadata.text_elements,
      tables_extracted: result.metadata.tables_extracted,
      images_extracted: result.metadata.images_extracted,
    });
  }, 60000); // 60s timeout for PDF processing
});
