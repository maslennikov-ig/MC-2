import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DoclingClient } from '@/stages/stage2-document-processing/docling/client';
import { DoclingErrorCode, DoclingError } from '@/stages/stage2-document-processing/docling/types';

// Strategy requirements
vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

// Mock MCP SDK
const mockConnect = vi.fn();
const mockClose = vi.fn();
const mockListTools = vi.fn();
const mockCallTool = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: class Client {
      connect = mockConnect;
      close = mockClose;
      listTools = mockListTools;
      callTool = mockCallTool;
    },
  };
});

const mockTransportClose = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class StreamableHTTPClientTransport {
    close = mockTransportClose;
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: class SSEClientTransport {
    close = mockTransportClose;
  },
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('DoclingClient', () => {
  let client: DoclingClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new DoclingClient({
      serverUrl: 'http://localhost:8080/mcp',
      timeout: 1000,
      maxRetries: 2,
      retryDelay: 1,
    });
  });

  afterEach(() => {});

  describe('connect()', () => {
    it('should connect using StreamableHTTPClientTransport when URL does not contain /sse', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      await client.connect();
      expect(mockConnect).toHaveBeenCalled();
      expect(client.isConnectedToServer()).toBe(true);
    });

    it('should connect using SSEClientTransport when URL contains /sse', async () => {
      const sseClient = new DoclingClient({
        serverUrl: 'http://localhost:8080/sse',
      });
      mockConnect.mockResolvedValueOnce(undefined);
      await sseClient.connect();
      expect(mockConnect).toHaveBeenCalled();
      expect(sseClient.isConnectedToServer()).toBe(true);
    });

    it('should not connect again if already connected', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      await client.connect();
      expect(mockConnect).toHaveBeenCalledTimes(1);

      await client.connect();
      expect(mockConnect).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should throw DoclingError on connection failure', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Network error'));
      await expect(client.connect()).rejects.toThrow(DoclingError);
      expect(client.isConnectedToServer()).toBe(false);
    });
  });

  describe('disconnect()', () => {
    it('should disconnect successfully if connected', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      await client.connect();

      mockClose.mockResolvedValueOnce(undefined);
      await client.disconnect();

      expect(mockTransportClose).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalled();
      expect(client.isConnectedToServer()).toBe(false);
    });

    it('should handle disconnect if transport close throws', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      await client.connect();

      mockTransportClose.mockRejectedValueOnce(new Error('Already closed'));
      mockClose.mockResolvedValueOnce(undefined);

      await client.disconnect();
      expect(client.isConnectedToServer()).toBe(false);
    });

    it('should do nothing if disconnected', async () => {
      await client.disconnect();
      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  describe('listTools()', () => {
    it('should return tools', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockListTools.mockResolvedValueOnce({ tools: [{ name: 'test_tool' }] });

      const tools = await client.listTools();
      expect(tools).toEqual([{ name: 'test_tool' }]);
    });

    it('should throw DoclingError if listTools fails', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockListTools.mockRejectedValueOnce(new Error('Failed list'));

      await expect(client.listTools()).rejects.toThrow(DoclingError);
    });
  });

  describe('convertDocument()', () => {
    const file_path = '/home/user/code/course/test.pdf';

    beforeEach(() => {
      mockConnect.mockResolvedValue(undefined);
      mockListTools.mockResolvedValue({ tools: [] }); // For health check
    });

    it('should throw unsupported format error for bad extension', async () => {
      await expect(
        client.convertDocument({ file_path: 'test.exe', output_format: 'markdown' })
      ).rejects.toThrow(DoclingError);
    });

    it('should convert document to markdown successfully', async () => {
      mockCallTool
        .mockResolvedValueOnce({
          content: [
            { type: 'text', text: JSON.stringify({ document_key: 'doc_123', from_cache: false }) },
          ],
        })
        .mockResolvedValueOnce({
          content: [
            {
              type: 'text',
              text: JSON.stringify({ document_key: 'doc_123', markdown: '# Hello' }),
            },
          ],
        });

      const response = await client.convertDocument({
        file_path,
        output_format: 'markdown',
      });

      expect(response.content).toBe('# Hello');
      expect(response.success).toBe(true);
      expect(response.metadata?.from_cache).toBe(false);
    });

    it('should fallback to markdown if docling_document is requested', async () => {
      mockCallTool
        .mockResolvedValueOnce({
          content: [
            { type: 'text', text: JSON.stringify({ document_key: 'doc_123', from_cache: true }) },
          ],
        })
        .mockResolvedValueOnce({
          content: [
            { type: 'text', text: JSON.stringify({ document_key: 'doc_123', from_cache: true }) },
          ],
        })
        .mockResolvedValueOnce({
          content: [
            {
              type: 'text',
              text: JSON.stringify({ document_key: 'doc_123', markdown: '# Fallback' }),
            },
          ],
        });

      const response = await client.convertDocument({
        file_path,
        output_format: 'docling_document',
      });

      expect(mockCallTool).toHaveBeenCalledTimes(3);
      expect(response.success).toBe(true);
      expect(response.content).toBe('# Fallback');
    });

    it('should handle retries on transient errors', async () => {
      // First call fails with session error
      mockCallTool.mockRejectedValueOnce(new Error('session expired'));

      // Health check fails, forcing reconnect
      mockListTools.mockRejectedValueOnce(new Error('health failed'));

      // Second call succeeds
      mockCallTool
        .mockResolvedValueOnce({
          content: [
            { type: 'text', text: JSON.stringify({ document_key: 'doc_retry', from_cache: true }) },
          ],
        })
        .mockResolvedValueOnce({
          content: [
            {
              type: 'text',
              text: JSON.stringify({ document_key: 'doc_retry', markdown: '# Retry' }),
            },
          ],
        });

      // We need to advance timers so sleep finishes
      const response = await client.convertDocument({ file_path, output_format: 'markdown' });
      expect(response.content).toBe('# Retry');
    });

    it('should throw FILE_NOT_FOUND error', async () => {
      mockCallTool.mockRejectedValue(new Error('ENOENT file missing'));
      await expect(
        client.convertDocument({ file_path, output_format: 'markdown' })
      ).rejects.toThrowError('file not found');
    });

    it('should throw out of memory error', async () => {
      mockCallTool.mockRejectedValue(new Error('OOM kill'));
      await expect(
        client.convertDocument({ file_path, output_format: 'markdown' })
      ).rejects.toThrowError('Out of memory');
    });

    it('should handle terminated connection properly with retries', async () => {
      mockCallTool.mockRejectedValue(new Error('connection terminated'));

      await expect(
        client.convertDocument({ file_path, output_format: 'markdown' })
      ).rejects.toThrow('Document conversion failed');
    });
  });

  describe('convertToDoclingDocument()', () => {
    it('should convert and return document', async () => {
      // Mocking convertDocument internally
      vi.spyOn(client, 'convertDocument').mockResolvedValueOnce({
        success: true,
        document: { type: 'docling_document', pages: {} } as any,
      });

      const doc = await client.convertToDoclingDocument('test.pdf');
      expect(doc.type).toBe('docling_document');
    });

    it('should throw if no document is returned', async () => {
      vi.spyOn(client, 'convertDocument').mockResolvedValueOnce({
        success: true,
      });
      await expect(client.convertToDoclingDocument('test.pdf')).rejects.toThrow();
    });
  });

  describe('convertToMarkdown()', () => {
    it('should return markdown string', async () => {
      vi.spyOn(client, 'convertDocument').mockResolvedValueOnce({
        success: true,
        content: '# Test',
      });
      const md = await client.convertToMarkdown('test.pdf');
      expect(md).toBe('# Test');
    });

    it('should throw if no content is returned', async () => {
      vi.spyOn(client, 'convertDocument').mockResolvedValueOnce({
        success: true,
      });
      await expect(client.convertToMarkdown('test.pdf')).rejects.toThrow();
    });
  });
});
