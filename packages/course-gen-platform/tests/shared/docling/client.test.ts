/**
 * Unit and Integration tests for Docling MCP Client
 *
 * Unit tests (no server required):
 * - Error handling logic
 * - Format validation
 * - Configuration handling
 * - Retry logic
 * - Timeout handling
 *
 * Integration tests (require Docling MCP server):
 * - Marked with .skipIf() - skip when server not available
 * - Real document conversion
 * - Actual server communication
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DoclingClient, DoclingError, DoclingErrorCode, isSupportedFormat, getFileExtension } from '../../../src/shared/docling/index.js';

// Helper to check if Docling server is available
async function isDoclingServerAvailable(): Promise<boolean> {
  try {
    const client = new DoclingClient({
      serverUrl: process.env.DOCLING_MCP_URL || 'http://localhost:8000/mcp',
      timeout: 5000,
      maxRetries: 1,
    });
    await client.connect();
    await client.disconnect();
    return true;
  } catch {
    return false;
  }
}

const serverAvailable = await isDoclingServerAvailable();

describe('DoclingClient Unit Tests (No Server Required)', () => {
  describe('Format Validation', () => {
    it('should validate supported formats', () => {
      expect(isSupportedFormat('pdf')).toBe(true);
      expect(isSupportedFormat('docx')).toBe(true);
      expect(isSupportedFormat('pptx')).toBe(true);
      expect(isSupportedFormat('md')).toBe(true);
      expect(isSupportedFormat('markdown')).toBe(true);
      expect(isSupportedFormat('html')).toBe(true);
      expect(isSupportedFormat('png')).toBe(true);
      expect(isSupportedFormat('jpg')).toBe(true);
      expect(isSupportedFormat('jpeg')).toBe(true);
    });

    it('should reject unsupported formats', () => {
      expect(isSupportedFormat('exe')).toBe(false);
      expect(isSupportedFormat('zip')).toBe(false);
      expect(isSupportedFormat('rar')).toBe(false);
      expect(isSupportedFormat('unknown')).toBe(false);
      expect(isSupportedFormat('')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isSupportedFormat('PDF')).toBe(true);
      expect(isSupportedFormat('DOCX')).toBe(true);
      expect(isSupportedFormat('PnG')).toBe(true);
    });
  });

  describe('File Extension Extraction', () => {
    it('should extract file extensions correctly', () => {
      expect(getFileExtension('document.pdf')).toBe('pdf');
      expect(getFileExtension('/path/to/file.docx')).toBe('docx');
      expect(getFileExtension('file.name.with.dots.pptx')).toBe('pptx');
      expect(getFileExtension('README.md')).toBe('md');
    });

    it('should handle files without extensions', () => {
      expect(getFileExtension('noextension')).toBe('');
      expect(getFileExtension('/path/to/noextension')).toBe('');
    });

    it('should be case-insensitive', () => {
      expect(getFileExtension('FILE.PDF')).toBe('pdf');
      expect(getFileExtension('Document.DOCX')).toBe('docx');
    });
  });

  describe('Client Configuration', () => {
    it('should create client with default configuration', () => {
      const client = new DoclingClient({
        serverUrl: 'http://localhost:8000/mcp',
      });

      expect(client).toBeDefined();
      expect(client.isConnectedToServer()).toBe(false);
    });

    it('should create client with custom timeout', () => {
      const client = new DoclingClient({
        serverUrl: 'http://localhost:8000/mcp',
        timeout: 10000,
        maxRetries: 5,
        retryDelay: 2000,
      });

      expect(client).toBeDefined();
    });

    it('should enable debug mode', () => {
      const client = new DoclingClient({
        serverUrl: 'http://localhost:8000/mcp',
        debug: true,
      });

      expect(client).toBeDefined();
    });
  });

  describe('Error Handling - Format Validation', () => {
    it('should reject unsupported file format before calling server', async () => {
      const client = new DoclingClient({
        serverUrl: 'http://localhost:8000/mcp',
        timeout: 1000,
      });

      // Should fail immediately without connecting to server
      await expect(
        client.convertToDoclingDocument('/path/to/file.exe')
      ).rejects.toThrow(DoclingError);

      await expect(
        client.convertToDoclingDocument('/path/to/file.exe')
      ).rejects.toMatchObject({
        code: DoclingErrorCode.UNSUPPORTED_FORMAT,
      });

      // Client should not have connected
      expect(client.isConnectedToServer()).toBe(false);
    });

    it('should validate format for all conversion methods', async () => {
      const client = new DoclingClient({
        serverUrl: 'http://localhost:8000/mcp',
      });

      await expect(
        client.convertToMarkdown('/path/to/file.xyz')
      ).rejects.toThrow(DoclingError);

      await expect(
        client.convertDocument({
          file_path: '/path/to/file.unknown',
          output_format: 'markdown',
        })
      ).rejects.toThrow(DoclingError);
    });
  });

  describe('DoclingError Class', () => {
    it('should create DoclingError with code and message', () => {
      const error = new DoclingError(
        DoclingErrorCode.FILE_NOT_FOUND,
        'File does not exist'
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DoclingError);
      expect(error.name).toBe('DoclingError');
      expect(error.code).toBe(DoclingErrorCode.FILE_NOT_FOUND);
      expect(error.message).toBe('File does not exist');
    });

    it('should include optional details', () => {
      const details = { filePath: '/path/to/file.pdf', attemptedAt: new Date() };
      const error = new DoclingError(
        DoclingErrorCode.TIMEOUT,
        'Operation timed out',
        details
      );

      expect(error.details).toEqual(details);
    });

    it('should support all error codes', () => {
      const codes = [
        DoclingErrorCode.FILE_NOT_FOUND,
        DoclingErrorCode.UNSUPPORTED_FORMAT,
        DoclingErrorCode.PROCESSING_ERROR,
        DoclingErrorCode.TIMEOUT,
        DoclingErrorCode.OCR_ERROR,
        DoclingErrorCode.CORRUPTED_FILE,
        DoclingErrorCode.OUT_OF_MEMORY,
        DoclingErrorCode.NETWORK_ERROR,
        DoclingErrorCode.UNKNOWN_ERROR,
      ];

      codes.forEach(code => {
        const error = new DoclingError(code, 'Test error');
        expect(error.code).toBe(code);
      });
    });
  });
});

describe('DoclingClient Integration Tests (Requires Server)', () => {
  let client: DoclingClient;

  beforeAll(() => {
    // Create client with test configuration
    client = new DoclingClient({
      serverUrl: process.env.DOCLING_MCP_URL || 'http://localhost:8000/mcp',
      timeout: 60000, // 1 minute for tests
      maxRetries: 2,
      debug: true,
    });
  });

  afterAll(async () => {
    await client.disconnect();
  });

  describe('Connection', () => {
    it.skipIf(!serverAvailable)('should connect to Docling MCP server', async () => {
      await expect(client.connect()).resolves.not.toThrow();
      expect(client.isConnectedToServer()).toBe(true);
    });

    it.skipIf(!serverAvailable)('should list available tools', async () => {
      const tools = await client.listTools();
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);

      // Should have convert_document tool
      const convertTool = tools.find((t: any) => t.name === 'convert_document');
      expect(convertTool).toBeDefined();
    });

    it.skipIf(serverAvailable)('should report when server is not available', () => {
      // This test only runs when server is NOT available
      console.log('ℹ️  Docling MCP Server not available - skipping integration tests');
      console.log('   Run unit tests for CI/CD validation');
      expect(serverAvailable).toBe(false);
    });
  });

  describe('Document Conversion', () => {
    it.skipIf(!serverAvailable)('should reject unsupported file formats', async () => {
      await expect(
        client.convertToDoclingDocument('/app/uploads/test/file.xyz')
      ).rejects.toThrow(DoclingError);

      await expect(
        client.convertToDoclingDocument('/app/uploads/test/file.xyz')
      ).rejects.toMatchObject({
        code: DoclingErrorCode.UNSUPPORTED_FORMAT,
      });
    });

    it.skipIf(!serverAvailable)('should handle file not found errors', async () => {
      await expect(
        client.convertToDoclingDocument('/app/uploads/test/nonexistent.pdf')
      ).rejects.toThrow(DoclingError);

      await expect(
        client.convertToDoclingDocument('/app/uploads/test/nonexistent.pdf')
      ).rejects.toMatchObject({
        code: DoclingErrorCode.FILE_NOT_FOUND,
      });
    });

    // This test requires an actual test PDF in the uploads directory
    it.skip('should convert PDF to DoclingDocument', async () => {
      const document = await client.convertToDoclingDocument(
        '/app/uploads/test/sample.pdf'
      );

      expect(document).toBeDefined();
      expect(document.schema_version).toBe('2.0');
      expect(document.name).toBe('sample');
      expect(document.metadata.page_count).toBeGreaterThan(0);
      expect(Array.isArray(document.pages)).toBe(true);
      expect(Array.isArray(document.texts)).toBe(true);
    });

    // This test requires an actual test document
    it.skip('should convert document to Markdown', async () => {
      const markdown = await client.convertToMarkdown(
        '/app/uploads/test/sample.pdf'
      );

      expect(markdown).toBeDefined();
      expect(typeof markdown).toBe('string');
      expect(markdown.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it.skipIf(!serverAvailable)('should handle connection errors gracefully', async () => {
      // Create a client with invalid server URL
      const badClient = new DoclingClient({
        serverUrl: 'http://invalid-server:9999/mcp',
        timeout: 5000,
        maxRetries: 1,
      });

      await expect(badClient.connect()).rejects.toThrow(DoclingError);
      await expect(badClient.connect()).rejects.toMatchObject({
        code: DoclingErrorCode.NETWORK_ERROR,
      });
    });

    it('should have retry mechanism configured', () => {
      // Unit test - no server required
      const clientWithRetry = new DoclingClient({
        serverUrl: 'http://localhost:8000/mcp',
        maxRetries: 5,
        retryDelay: 2000,
      });

      expect(clientWithRetry).toBeDefined();
    });
  });
});
