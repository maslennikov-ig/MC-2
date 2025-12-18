/**
 * Docling MCP Client
 * Wrapper for communicating with Docling MCP server via Streamable HTTP transport
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
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
import { logger } from '../../../shared/logger/index.js';

/**
 * Docling MCP Client
 * High-level interface for document processing operations
 */
export class DoclingClient {
  private client: Client;
  private transport: Transport | null = null;
  private config: Required<DoclingClientConfig>;
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private useSSE: boolean;

  constructor(config: DoclingClientConfig) {
    this.config = {
      serverUrl: config.serverUrl,
      timeout: config.timeout ?? 1200000, // 20 minutes default (for large file processing)
      maxRetries: config.maxRetries ?? 5, // Increased from 3 for better connection recovery
      retryDelay: config.retryDelay ?? 2000, // Increased from 1000 for better backoff
      debug: config.debug ?? false,
    };

    // Detect SSE transport from URL path (e.g., /sse vs /mcp)
    this.useSSE = config.serverUrl.includes('/sse');

    this.client = new Client({
      name: 'megacampus-docling-client',
      version: '1.0.0',
    });
  }

  /**
   * Connect to the Docling MCP server
   * Prevents race conditions when multiple calls happen simultaneously
   */
  async connect(): Promise<void> {
    // If already connected, return immediately
    if (this.isConnected && this.transport) {
      return;
    }

    // If connection is in progress, wait for it
    if (this.connectionPromise) {
      logger.info('Connection already in progress, waiting...');
      return this.connectionPromise;
    }

    // Start new connection
    this.connectionPromise = (async () => {
      try {
        // Create transport based on URL path
        // SSE transport is simpler and avoids DNS rebinding/session issues in Docker
        if (this.useSSE) {
          this.transport = new SSEClientTransport(
            new URL(this.config.serverUrl)
          );
          logger.info({ serverUrl: this.config.serverUrl }, 'Using SSE transport');
        } else {
          this.transport = new StreamableHTTPClientTransport(
            new URL(this.config.serverUrl),
            {
              requestInit: {
                headers: {
                  'Accept': 'application/json, text/event-stream',
                },
              },
            }
          );
          logger.info({ serverUrl: this.config.serverUrl }, 'Using Streamable HTTP transport');
        }

        await this.client.connect(this.transport);
        this.isConnected = true;
        logger.info({
          serverUrl: this.config.serverUrl,
          transport: this.useSSE ? 'SSE' : 'StreamableHTTP',
        }, 'Connected to Docling MCP server');
      } catch (error) {
        this.connectionPromise = null; // Reset so retry is possible
        this.transport = null;
        logger.error({ err: error }, 'Failed to connect to Docling MCP server');
        throw new DoclingError(
          DoclingErrorCode.NETWORK_ERROR,
          'Failed to connect to Docling MCP server',
          error
        );
      } finally {
        this.connectionPromise = null;
      }
    })();

    return this.connectionPromise;
  }

  /**
   * Ensures connection is alive, reconnects if needed
   * Forces fresh connection to avoid stale session issues
   * @private
   */
  private async ensureConnected(): Promise<void> {
    // Check if transport is alive
    if (!this.isConnected || !this.transport) {
      logger.warn({ serverUrl: this.config.serverUrl }, 'Docling connection lost, reconnecting...');
      await this.reconnect();
      return;
    }

    // Verify with lightweight health check
    try {
      await this.client.listTools();
      logger.debug({ serverUrl: this.config.serverUrl }, 'Docling health check passed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(
        { serverUrl: this.config.serverUrl, err: errorMessage },
        'Docling health check failed, forcing fresh connection...'
      );
      // Force fresh connection by resetting state
      this.isConnected = false;
      this.transport = null;
      await this.reconnect();
    }
  }

  /**
   * Reconnect to MCP server
   * Creates a fresh Client instance to avoid stale state after close()
   * @private
   */
  private async reconnect(): Promise<void> {
    this.isConnected = false;
    this.connectionPromise = null;

    try {
      await this.disconnect();
    } catch (error) {
      // Ignore disconnect errors
      logger.debug({ err: error }, 'Error during disconnect (expected if connection dead)');
    }

    // CRITICAL: Create a new Client instance after close()
    // The MCP SDK Client becomes unusable after close() - arguments are not sent correctly
    this.client = new Client({
      name: 'megacampus-docling-client',
      version: '1.0.0',
    });

    // Reset transport so connect() creates a new one
    this.transport = null;
    await this.connect();
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
      this.transport = null;
      logger.info('Disconnected from Docling MCP server');
    } catch (error) {
      logger.error({ err: error }, 'Error disconnecting from Docling MCP server');
    }
  }

  /**
   * Parse MCP tool response with error handling
   *
   * Handles cases where Docling MCP returns plain text errors instead of JSON
   *
   * @param text - Response text from MCP tool
   * @param toolName - Name of the tool that was called (for error messages)
   * @returns Parsed JSON object
   * @throws DoclingError if response is not valid JSON or is an error message
   */
  private parseToolResponse<T>(text: string, toolName: string): T {
    // Check if response is a plain text error (starts with "Error")
    if (text.trim().startsWith('Error')) {
      const errorText = text.trim();

      // Detect file not found errors specifically (ENOENT, Errno 2)
      if (
        errorText.includes('No such file or directory') ||
        errorText.includes('[Errno 2]') ||
        errorText.includes('ENOENT')
      ) {
        throw new DoclingError(
          DoclingErrorCode.FILE_NOT_FOUND,
          `File not found: ${errorText}`,
          { tool: toolName, responseText: text }
        );
      }

      // Generic processing error
      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        `Docling MCP tool '${toolName}' failed: ${errorText}`,
        { tool: toolName, responseText: text }
      );
    }

    // Try to parse as JSON
    try {
      return JSON.parse(text) as T;
    } catch (parseError) {
      // If parsing fails, provide detailed error
      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        `Invalid JSON response from Docling MCP tool '${toolName}': ${text.substring(0, 100)}...`,
        { tool: toolName, responseText: text, parseError }
      );
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
    // Validate file format FIRST - before connecting to server
    const extension = getFileExtension(request.file_path);
    if (!isSupportedFormat(extension)) {
      throw new DoclingError(
        DoclingErrorCode.UNSUPPORTED_FORMAT,
        `Unsupported file format: ${extension}`,
        { file_path: request.file_path, extension }
      );
    }

    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
      try {
        await this.ensureConnected();

        const startTime = Date.now();

        logger.info({
          file_path: request.file_path,
          output_format: request.output_format,
        }, 'Converting document');

        // Call the MCP tool with retry logic
        // Docling MCP server provides tool: convert_document_into_docling_document
        const result = await this.callWithRetry(async () => {
          return await this.client.callTool({
            name: 'convert_document_into_docling_document',
            arguments: {
              source: request.file_path,
            },
          });
        });

        const processingTime = Date.now() - startTime;

        // Parse convert_document_into_docling_document response
        // Response format: {from_cache: boolean, document_key: string}
        const content = result.content as Array<{ type: string; text?: string }>;
        const textContent = content.find((c) => c.type === 'text');
        if (!textContent || !textContent.text) {
          throw new DoclingError(
            DoclingErrorCode.PROCESSING_ERROR,
            'No text content in conversion response'
          );
        }

        const conversionResult = this.parseToolResponse<{
          from_cache: boolean;
          document_key: string;
        }>(textContent.text, 'convert_document_into_docling_document');

        logger.info({
          document_key: conversionResult.document_key,
          from_cache: conversionResult.from_cache,
        }, 'Document converted to Docling format');

        // Export to requested format
        if (request.output_format === 'docling_document') {
          // For DoclingDocument format, we need to fetch the full JSON document
          // This requires calling a separate tool or reading from cache
          // For now, we'll return a minimal structure
          // TODO: Implement proper DoclingDocument retrieval
          throw new DoclingError(
            DoclingErrorCode.PROCESSING_ERROR,
            'DoclingDocument format not yet implemented - use markdown instead'
          );
        } else {
          // For markdown, export using export_docling_document_to_markdown tool
          const exportResult = await this.callWithRetry(async () => {
            return await this.client.callTool({
              name: 'export_docling_document_to_markdown',
              arguments: {
                document_key: conversionResult.document_key,
                max_size: 100000000, // 100MB limit (was null)
              },
            });
          });

          const exportContent = exportResult.content as Array<{ type: string; text?: string }>;
          const exportTextContent = exportContent.find((c) => c.type === 'text');
          if (!exportTextContent || !exportTextContent.text) {
            throw new DoclingError(
              DoclingErrorCode.PROCESSING_ERROR,
              'No text content in markdown export'
            );
          }

          logger.info({
            raw_export_text_length: exportTextContent.text.length,
            raw_export_preview: exportTextContent.text.substring(0, 500),
          }, 'Raw export response from Docling MCP');

          const markdownResult = this.parseToolResponse<{
            document_key: string;
            markdown: string;
          }>(exportTextContent.text, 'export_docling_document_to_markdown');

          logger.info({
            has_markdown: !!markdownResult.markdown,
            markdown_length: markdownResult.markdown?.length || 0,
            result_keys: Object.keys(markdownResult),
          }, 'Markdown export result parsed');

          return {
            success: true,
            content: markdownResult.markdown,
            metadata: {
              processing_time_ms: processingTime,
              from_cache: conversionResult.from_cache,
              pages_processed: 0, // Unknown without full DoclingDocument
            },
          };
        }
      } catch (error) {
        // Handle terminated error with retry
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('terminated') && retries < maxRetries) {
          retries++;
          logger.warn(
            { file_path: request.file_path, err: error, retries, maxRetries },
            `Docling connection terminated, retry ${retries}/${maxRetries}`
          );
          await this.reconnect();
          continue;
        }

        logger.error({ err: errorMessage, request }, 'Document conversion failed');

        if (error instanceof DoclingError) {
          throw error;
        }

        // Map common errors to DoclingErrorCode
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

    throw new Error(`Docling conversion failed after ${maxRetries} retries`);
  }

  /**
   * Convert document to DoclingDocument JSON
   * Convenience method for the most common use case
   *
   * @param filePath - Path to the document file
   * @param options - Optional conversion parameters
   * @param options.enableOCR - Enable OCR for scanned documents (default: true)
   * @param options.extractImages - Extract images from document (default: true)
   * @param options.extractTables - Extract tables with structure (default: true)
   */
  async convertToDoclingDocument(
    filePath: string,
    options: {
      enableOCR?: boolean;
      extractImages?: boolean;
      extractTables?: boolean;
    } = {}
  ): Promise<DoclingDocument> {
    const response = await this.convertDocument({
      file_path: filePath,
      output_format: 'docling_document',
      enable_ocr: options.enableOCR ?? true,
      extract_images: options.extractImages ?? true,
      extract_tables: options.extractTables ?? true,
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
    await this.ensureConnected();

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
   * Get full DoclingDocument JSON from cache
   *
   * This method retrieves the complete DoclingDocument structure including
   * texts[], pictures[], tables[], pages{} etc.
   *
   * Workflow:
   * 1. Convert document → get document_key
   * 2. Save document to JSON file via save_docling_document tool
   * 3. Read JSON file from Docker container filesystem
   *
   * @param filePath - Path to the document file
   * @returns Full DoclingDocument structure
   */
  async getDoclingDocumentJSON(filePath: string): Promise<DoclingDocument> {
    await this.ensureConnected();

    try {
      // Step 1: Convert document to get document_key
      const convertResult = await this.callWithRetry(async () => {
        return await this.client.callTool({
          name: 'convert_document_into_docling_document',
          arguments: {
            source: filePath,
          },
        });
      });

      const content = convertResult.content as Array<{ type: string; text?: string }>;
      const textContent = content.find((c) => c.type === 'text');
      if (!textContent || !textContent.text) {
        throw new DoclingError(
          DoclingErrorCode.PROCESSING_ERROR,
          'No text content in conversion response'
        );
      }

      const conversionResult = this.parseToolResponse<{
        from_cache: boolean;
        document_key: string;
      }>(textContent.text, 'convert_document_into_docling_document');

      logger.info({
        document_key: conversionResult.document_key,
        from_cache: conversionResult.from_cache,
      }, 'Document converted, fetching JSON');

      // Step 2: Save document to JSON file
      const saveResult = await this.callWithRetry(async () => {
        return await this.client.callTool({
          name: 'save_docling_document',
          arguments: {
            document_key: conversionResult.document_key,
          },
        });
      });

      const saveContent = saveResult.content as Array<{ type: string; text?: string }>;
      const saveTextContent = saveContent.find((c) => c.type === 'text');
      if (!saveTextContent || !saveTextContent.text) {
        throw new DoclingError(
          DoclingErrorCode.PROCESSING_ERROR,
          'No text content in save response'
        );
      }

      const saveResponse = this.parseToolResponse<{
        json_file: string;
        md_file: string;
      }>(saveTextContent.text, 'save_docling_document');

      logger.info({
        json_file: saveResponse.json_file,
      }, 'Document saved to JSON file');

      // Step 3: Read JSON file from volume mount
      // The cache directory is mounted to .tmp/docling-cache via docker-compose.yml
      // Extract filename from container path: /usr/local/lib/python3.12/site-packages/_cache/{filename}
      const filename = saveResponse.json_file.split('/').pop();
      if (!filename) {
        throw new DoclingError(
          DoclingErrorCode.PROCESSING_ERROR,
          'Invalid JSON file path returned: ' + saveResponse.json_file
        );
      }

      // Read from mounted volume (configurable via DOCLING_CACHE_PATH env)
      const cacheDir = process.env.DOCLING_CACHE_PATH || '/app/docling-cache';
      const localPath = `${cacheDir}/${filename}`;

      // Dynamic import of fs/promises for Node.js 18+ compatibility
      const fs = await import('fs/promises');

      try {
        const jsonContent = await fs.readFile(localPath, 'utf-8');
        const doclingDocument = JSON.parse(jsonContent) as DoclingDocument;

        logger.info({
          texts_count: doclingDocument.texts?.length || 0,
          tables_count: doclingDocument.tables?.length || 0,
          pictures_count: doclingDocument.pictures?.length || 0,
          pages_count: Object.keys(doclingDocument.pages || {}).length,
        }, 'DoclingDocument JSON loaded successfully');

        return doclingDocument;
      } catch (readError) {
        throw new DoclingError(
          DoclingErrorCode.PROCESSING_ERROR,
          `Failed to read JSON file from mounted volume: ${localPath}`,
          readError
        );
      }
    } catch (error) {
      logger.error({ err: error, filePath }, 'Failed to get DoclingDocument JSON');

      if (error instanceof DoclingError) {
        throw error;
      }

      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        'Failed to retrieve DoclingDocument JSON',
        error
      );
    }
  }

  /**
   * List available tools on the MCP server
   * Useful for debugging and verification
   */
  async listTools(): Promise<Array<Record<string, unknown>>> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const result = await this.client.listTools();
      return result.tools;
    } catch (error) {
      logger.error({ err: error }, 'Failed to list tools');
      throw new DoclingError(
        DoclingErrorCode.NETWORK_ERROR,
        'Failed to list tools',
        error
      );
    }
  }

  /**
   * Execute function with retry logic
   * Handles reconnection for "Not connected" and "terminated" errors
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

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Handle connection issues - reconnect before retry
      if (
        errorMessage.includes('Not connected') ||
        errorMessage.includes('terminated') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('socket hang up')
      ) {
        logger.warn(
          { err: errorMessage, attempt, maxRetries: this.config.maxRetries },
          'MCP connection lost, reconnecting before retry...'
        );
        await this.reconnect();
      }

      // Exponential backoff
      const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
      logger.warn({
        err: errorMessage,
      }, `Retrying after ${delay}ms (attempt ${attempt}/${this.config.maxRetries})`);

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
  const timeout = parseInt(process.env.DOCLING_MCP_TIMEOUT || '1200000', 10); // 20 minutes default

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
