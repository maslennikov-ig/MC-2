/**
 * Docling MCP Client
 * Wrapper for communicating with Docling MCP server via Streamable HTTP transport
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  DoclingClientConfig,
  ConvertDocumentRequest,
  ConvertDocumentResponse,
  DoclingDocument,
  DoclingError,
  DoclingErrorCode,
  isSupportedFormat,
  getFileExtension,
} from './types.js';
import { logger } from '../logger/index.js';

/**
 * Custom HTTP transport for MCP
 * Based on the Streamable HTTP transport pattern
 */
class StreamableHTTPTransport implements Transport {
  private serverUrl: URL;
  private timeout: number;

  constructor(serverUrl: URL, timeout: number = 300000) {
    this.serverUrl = serverUrl;
    this.timeout = timeout;
  }

  async start(): Promise<void> {
    // Test connection
    try {
      const response = await fetch(this.serverUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'ping',
          id: 1,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Failed to connect to Docling MCP server', { error });
      throw new DoclingError(
        DoclingErrorCode.NETWORK_ERROR,
        'Failed to connect to Docling MCP server',
        error
      );
    }
  }

  async send(message: unknown): Promise<void> {
    try {
      const response = await fetch(this.serverUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle response through onmessage callback
      const data = await response.json();
      if (this.onmessage) {
        this.onmessage(data);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DoclingError(
          DoclingErrorCode.TIMEOUT,
          'Request timed out',
          error
        );
      }
      if (this.onerror) {
        this.onerror(error);
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    // No persistent connection to close for HTTP transport
  }

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: unknown) => void;
}

/**
 * Docling MCP Client
 * High-level interface for document processing operations
 */
export class DoclingClient {
  private client: Client;
  private transport: StreamableHTTPTransport;
  private config: Required<DoclingClientConfig>;
  private isConnected: boolean = false;

  constructor(config: DoclingClientConfig) {
    this.config = {
      serverUrl: config.serverUrl,
      timeout: config.timeout ?? 300000, // 5 minutes default
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      debug: config.debug ?? false,
    };

    this.client = new Client({
      name: 'megacampus-docling-client',
      version: '1.0.0',
    });

    this.transport = new StreamableHTTPTransport(
      new URL(this.config.serverUrl),
      this.config.timeout
    );
  }

  /**
   * Connect to the Docling MCP server
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      logger.warn('DoclingClient is already connected');
      return;
    }

    try {
      await this.client.connect(this.transport);
      this.isConnected = true;
      logger.info('Connected to Docling MCP server', {
        serverUrl: this.config.serverUrl,
      });
    } catch (error) {
      logger.error('Failed to connect to Docling MCP server', { error });
      throw new DoclingError(
        DoclingErrorCode.NETWORK_ERROR,
        'Failed to connect to Docling MCP server',
        error
      );
    }
  }

  /**
   * Disconnect from the Docling MCP server
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.client.close();
      this.isConnected = false;
      logger.info('Disconnected from Docling MCP server');
    } catch (error) {
      logger.error('Error disconnecting from Docling MCP server', { error });
    }
  }

  /**
   * Convert a document to structured format
   *
   * @param request - Document conversion request
   * @returns Conversion response with DoclingDocument or content string
   */
  async convertDocument(
    request: ConvertDocumentRequest
  ): Promise<ConvertDocumentResponse> {
    if (!this.isConnected) {
      await this.connect();
    }

    // Validate file format
    const extension = getFileExtension(request.file_path);
    if (!isSupportedFormat(extension)) {
      throw new DoclingError(
        DoclingErrorCode.UNSUPPORTED_FORMAT,
        `Unsupported file format: ${extension}`,
        { file_path: request.file_path, extension }
      );
    }

    const startTime = Date.now();

    try {
      logger.info('Converting document', {
        file_path: request.file_path,
        output_format: request.output_format,
      });

      // Call the MCP tool with retry logic
      const result = await this.callWithRetry(async () => {
        return await this.client.callTool({
          name: 'convert_document',
          arguments: {
            file_path: request.file_path,
            output_format: request.output_format,
            enable_ocr: request.enable_ocr,
            extract_images: request.extract_images,
            extract_tables: request.extract_tables,
            force_refresh: request.force_refresh,
          },
        });
      });

      const processingTime = Date.now() - startTime;

      // Parse response based on output format
      if (request.output_format === 'docling_document') {
        // Parse JSON from text content
        const textContent = result.content.find((c: any) => c.type === 'text');
        if (!textContent) {
          throw new DoclingError(
            DoclingErrorCode.PROCESSING_ERROR,
            'No text content in response'
          );
        }

        const document = JSON.parse(textContent.text) as DoclingDocument;

        return {
          success: true,
          document,
          metadata: {
            processing_time_ms: processingTime,
            from_cache: false, // TODO: Detect from response
            pages_processed: document.metadata.page_count,
          },
        };
      } else {
        // For markdown, json, html - return as string
        const textContent = result.content.find((c: any) => c.type === 'text');
        if (!textContent) {
          throw new DoclingError(
            DoclingErrorCode.PROCESSING_ERROR,
            'No text content in response'
          );
        }

        return {
          success: true,
          content: textContent.text,
          metadata: {
            processing_time_ms: processingTime,
            from_cache: false,
            pages_processed: 0, // Unknown for non-DoclingDocument formats
          },
        };
      }
    } catch (error) {
      logger.error('Document conversion failed', { error, request });

      if (error instanceof DoclingError) {
        throw error;
      }

      // Map common errors to DoclingErrorCode
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
        throw new DoclingError(
          DoclingErrorCode.FILE_NOT_FOUND,
          'Document file not found',
          error
        );
      }

      if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        throw new DoclingError(
          DoclingErrorCode.TIMEOUT,
          'Document processing timed out',
          error
        );
      }

      if (errorMessage.includes('memory') || errorMessage.includes('OOM')) {
        throw new DoclingError(
          DoclingErrorCode.OUT_OF_MEMORY,
          'Out of memory during processing',
          error
        );
      }

      // Generic processing error
      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        'Document conversion failed',
        error
      );
    }
  }

  /**
   * Convert document to DoclingDocument JSON
   * Convenience method for the most common use case
   */
  async convertToDoclingDocument(
    filePath: string
  ): Promise<DoclingDocument> {
    const response = await this.convertDocument({
      file_path: filePath,
      output_format: 'docling_document',
      extract_images: true,
      extract_tables: true,
    });

    if (!response.document) {
      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        'No document in response'
      );
    }

    return response.document;
  }

  /**
   * Convert document to Markdown
   * Convenience method for markdown export
   */
  async convertToMarkdown(filePath: string): Promise<string> {
    const response = await this.convertDocument({
      file_path: filePath,
      output_format: 'markdown',
    });

    if (!response.content) {
      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        'No content in response'
      );
    }

    return response.content;
  }

  /**
   * List available tools on the MCP server
   * Useful for debugging and verification
   */
  async listTools(): Promise<any[]> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const result = await this.client.listTools();
      return result.tools;
    } catch (error) {
      logger.error('Failed to list tools', { error });
      throw new DoclingError(
        DoclingErrorCode.NETWORK_ERROR,
        'Failed to list tools',
        error
      );
    }
  }

  /**
   * Execute function with retry logic
   */
  private async callWithRetry<T>(
    fn: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= this.config.maxRetries) {
        throw error;
      }

      // Don't retry on certain errors
      if (error instanceof DoclingError) {
        const nonRetryableErrors = [
          DoclingErrorCode.FILE_NOT_FOUND,
          DoclingErrorCode.UNSUPPORTED_FORMAT,
          DoclingErrorCode.CORRUPTED_FILE,
        ];

        if (nonRetryableErrors.includes(error.code)) {
          throw error;
        }
      }

      // Exponential backoff
      const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
      logger.warn(`Retrying after ${delay}ms (attempt ${attempt}/${this.config.maxRetries})`, {
        error,
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.callWithRetry(fn, attempt + 1);
    }
  }

  /**
   * Check if client is connected
   */
  isConnectedToServer(): boolean {
    return this.isConnected;
  }
}

/**
 * Factory function to create a DoclingClient instance
 * Uses environment variables for configuration
 */
export function createDoclingClient(): DoclingClient {
  const serverUrl = process.env.DOCLING_MCP_URL || 'http://docling-mcp:8000/mcp';
  const timeout = parseInt(process.env.DOCLING_MCP_TIMEOUT || '300000', 10);

  return new DoclingClient({
    serverUrl,
    timeout,
    debug: process.env.NODE_ENV === 'development',
  });
}

/**
 * Singleton instance for reuse across the application
 */
let clientInstance: DoclingClient | null = null;

/**
 * Get or create the singleton DoclingClient instance
 */
export function getDoclingClient(): DoclingClient {
  if (!clientInstance) {
    clientInstance = createDoclingClient();
  }
  return clientInstance;
}

/**
 * Close and reset the singleton instance
 * Useful for testing and cleanup
 */
export async function resetDoclingClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.disconnect();
    clientInstance = null;
  }
}
