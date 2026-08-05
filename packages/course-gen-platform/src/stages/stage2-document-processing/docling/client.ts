/**
 * Docling MCP client built on the split TypeScript MCP SDK 2 packages.
 *
 * The client opts into automatic protocol negotiation so the application can
 * be shipped before the Docling MCP 3 server during the client-first rollout.
 */

import fs from 'fs/promises';
import path from 'path';
import {
  Client,
  ProtocolError,
  SdkError,
  SdkErrorCode,
  StreamableHTTPClientTransport,
  type CallToolResult,
} from '@modelcontextprotocol/client';

import { logger } from '../../../shared/logger/index.js';
import { normalizeDoclingDocument } from './raw-adapter.js';
import {
  type ConvertDocumentRequest,
  type ConvertDocumentResponse,
  type DoclingClientConfig,
  type DoclingConversionBundle,
  DoclingError,
  DoclingErrorCode,
  getFileExtension,
  isSupportedFormat,
} from './types.js';

const REQUIRED_TOOLS = new Set([
  'convert_document_into_docling_document',
  'export_docling_document_to_markdown',
  'save_docling_document',
]);

const MARKDOWN_EXPORT_MAX_SIZE_BYTES = 100 * 1024 * 1024;
const CONNECTION_LOSS_CODES = new Set<SdkErrorCode>([
  SdkErrorCode.NotConnected,
  SdkErrorCode.ConnectionClosed,
  SdkErrorCode.SendFailed,
]);

type ToolPayload = Record<string, unknown>;

function isRecord(value: unknown): value is ToolPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function transformPathForDocling(localPath: string): string {
  const uploadsBasePath = process.env.DOCLING_UPLOADS_BASE_PATH;
  const containerUploadsPath = process.env.DOCLING_CONTAINER_UPLOADS_PATH || '/app/uploads';

  if (!uploadsBasePath || !localPath.startsWith(uploadsBasePath)) return localPath;

  const marker = '/uploads/';
  const uploadsIndex = localPath.indexOf(marker, uploadsBasePath.length);
  if (uploadsIndex === -1) return localPath;

  return `${containerUploadsPath}/${localPath.slice(uploadsIndex + marker.length)}`;
}

function extractToolError(result: CallToolResult): string {
  const messages = result.content
    .filter(content => content.type === 'text')
    .map(content => content.text.trim())
    .filter(Boolean);
  return messages.join('\n') || 'Docling MCP tool returned an error';
}

function classifyToolError(message: string, details?: unknown): DoclingError {
  if (/ENOENT|file (?:does not exist|not found)|no such file/i.test(message)) {
    return new DoclingError(DoclingErrorCode.FILE_NOT_FOUND, message, details);
  }
  if (/out of memory|\bOOM\b|killed process/i.test(message)) {
    return new DoclingError(DoclingErrorCode.OUT_OF_MEMORY, message, details);
  }
  if (/corrupt|malformed document/i.test(message)) {
    return new DoclingError(DoclingErrorCode.CORRUPTED_FILE, message, details);
  }
  return new DoclingError(DoclingErrorCode.PROCESSING_ERROR, message, details);
}

export class DoclingClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport | null = null;
  private readonly config: Required<DoclingClientConfig>;
  private connected = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: DoclingClientConfig) {
    this.config = {
      serverUrl: config.serverUrl,
      timeout: config.timeout ?? 1_200_000,
      maxRetries: config.maxRetries ?? 1,
      retryDelay: config.retryDelay ?? 250,
      debug: config.debug ?? false,
      cachePath: config.cachePath ?? process.env.DOCLING_CACHE_PATH ?? '/app/docling-json-cache',
    };
    this.client = this.createSdkClient();
  }

  private createSdkClient(): Client {
    const client = new Client(
      { name: 'megacampus-docling-client', version: '2.0.0' },
      {
        versionNegotiation: { mode: 'auto', probe: { maxRetries: 0 } },
      }
    );
    client.onerror = error => {
      this.connected = false;
      logger.error({ err: error }, 'Docling MCP client transport error');
    };
    client.onclose = () => {
      this.connected = false;
      logger.warn('Docling MCP client connection closed');
    };
    return client;
  }

  async connect(): Promise<void> {
    if (this.connected && this.transport) return;
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = this.openConnection();
    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async openConnection(): Promise<void> {
    this.transport = new StreamableHTTPClientTransport(new URL(this.config.serverUrl), {
      requestInit: { headers: { Accept: 'application/json, text/event-stream' } },
    });

    try {
      await this.client.connect(this.transport);
      const { tools } = await this.client.listTools();
      const availableTools = new Set(tools.map(tool => tool.name));
      const missingTools = [...REQUIRED_TOOLS].filter(tool => !availableTools.has(tool));
      if (missingTools.length > 0) {
        throw new DoclingError(
          DoclingErrorCode.PROCESSING_ERROR,
          `Docling MCP is missing required tools: ${missingTools.join(', ')}`
        );
      }

      this.connected = true;
      logger.info(
        {
          serverUrl: this.config.serverUrl,
          server: this.client.getServerVersion(),
          protocolVersion: this.client.getNegotiatedProtocolVersion(),
          protocolEra: this.client.getProtocolEra(),
        },
        'Connected to Docling MCP server'
      );
    } catch (error) {
      this.connected = false;
      await this.closeAfterFailedConnection();
      // SDK clients are terminal after close(); keep the singleton reusable
      // for a later BullMQ attempt even when the initial connection failed.
      this.client = this.createSdkClient();
      if (error instanceof DoclingError) throw error;
      throw new DoclingError(
        DoclingErrorCode.NETWORK_ERROR,
        `Failed to connect to Docling MCP server: ${this.errorMessage(error)}`,
        error
      );
    }
  }

  private async closeAfterFailedConnection(): Promise<void> {
    try {
      await this.client.close();
    } catch {
      try {
        await this.transport?.close();
      } catch {
        // The failed transport is already closed.
      }
    }
    this.transport = null;
  }

  async disconnect(): Promise<void> {
    if (!this.transport && !this.connected) return;
    const transport = this.transport;
    this.connected = false;
    this.transport = null;

    if (transport) {
      try {
        await transport.terminateSession();
      } catch (error) {
        logger.debug({ err: error }, 'Docling MCP session termination was not accepted');
      }
    }

    try {
      await this.client.close();
    } catch (error) {
      logger.debug({ err: error }, 'Docling MCP client was already closed');
      try {
        await transport?.close();
      } catch {
        // Nothing else to release.
      }
    }
  }

  private async reconnect(): Promise<void> {
    await this.disconnect();
    this.client = this.createSdkClient();
    await this.connect();
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected || !this.transport) await this.connect();
  }

  async convertDocumentBundle(filePath: string): Promise<DoclingConversionBundle> {
    const extension = getFileExtension(filePath);
    if (!isSupportedFormat(extension)) {
      throw new DoclingError(
        DoclingErrorCode.UNSUPPORTED_FORMAT,
        `Unsupported document format: ${extension || '(none)'}`
      );
    }

    for (let attempt = 0; ; attempt += 1) {
      const startedAt = Date.now();
      try {
        await this.ensureConnected();
        return await this.convertBundleOnce(filePath, startedAt);
      } catch (error) {
        const normalized = this.normalizeError(error, 'Docling conversion failed');
        if (attempt >= this.config.maxRetries || !this.isConnectionLoss(error)) {
          throw normalized;
        }

        logger.warn(
          { err: normalized, attempt: attempt + 1 },
          'Docling MCP connection was lost; retrying the complete conversion bundle once'
        );
        if (this.config.retryDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        }
        await this.reconnect();
      }
    }
  }

  private async convertBundleOnce(
    filePath: string,
    startedAt: number
  ): Promise<DoclingConversionBundle> {
    const source = transformPathForDocling(filePath);
    const conversion = await this.callTool('convert_document_into_docling_document', { source });
    const documentKey = this.requiredString(
      conversion,
      'document_key',
      'convert_document_into_docling_document'
    );
    const fromCache = conversion.from_cache === true;

    const markdownResult = await this.callTool('export_docling_document_to_markdown', {
      document_key: documentKey,
      max_size: MARKDOWN_EXPORT_MAX_SIZE_BYTES,
    });
    const markdownKey = this.requiredString(
      markdownResult,
      'document_key',
      'export_docling_document_to_markdown'
    );
    if (markdownKey !== documentKey) {
      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        `Docling MCP returned inconsistent document keys: ${documentKey} and ${markdownKey}`
      );
    }
    const markdown = this.requiredString(
      markdownResult,
      'markdown',
      'export_docling_document_to_markdown',
      true
    );

    const saveResult = await this.callTool('save_docling_document', {
      document_key: documentKey,
    });
    const jsonFile = this.requiredString(saveResult, 'json_file', 'save_docling_document');
    const jsonBasename = path.basename(jsonFile);
    if (jsonBasename !== `${documentKey}.json`) {
      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        `Docling MCP returned an inconsistent saved JSON key: ${documentKey} and ${jsonBasename}`
      );
    }
    const cacheFile = path.join(this.config.cachePath, jsonBasename);

    let rawDocument: unknown;
    try {
      rawDocument = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    } catch (error) {
      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        `Failed to read saved Docling JSON: ${cacheFile}`,
        error
      );
    }

    const document = normalizeDoclingDocument(rawDocument);
    return {
      markdown,
      document,
      documentKey,
      fromCache,
      processingTimeMs: Date.now() - startedAt,
      rawJsonPath: cacheFile,
    };
  }

  private async callTool(name: string, args: ToolPayload): Promise<ToolPayload> {
    const result: CallToolResult = await this.client.callTool(
      { name, arguments: args },
      { timeout: this.config.timeout, maxTotalTimeout: this.config.timeout }
    );

    if (result.isError) throw classifyToolError(extractToolError(result), result);
    if (isRecord(result.structuredContent)) return result.structuredContent;

    const text = result.content.find(content => content.type === 'text')?.text;
    if (!text) {
      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        `${name} returned neither structuredContent nor text JSON`
      );
    }

    try {
      const parsed: unknown = JSON.parse(text);
      if (!isRecord(parsed)) throw new Error('response is not an object');
      return parsed;
    } catch (error) {
      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        `${name} returned invalid text JSON`,
        error
      );
    }
  }

  private requiredString(
    value: ToolPayload,
    field: string,
    tool: string,
    allowEmpty = false
  ): string {
    const candidate = value[field];
    if (typeof candidate === 'string' && (allowEmpty || candidate.length > 0)) return candidate;
    throw new DoclingError(
      DoclingErrorCode.PROCESSING_ERROR,
      `${tool} response is missing ${field}`
    );
  }

  private isConnectionLoss(error: unknown): boolean {
    return error instanceof SdkError && CONNECTION_LOSS_CODES.has(error.code);
  }

  private normalizeError(error: unknown, context = 'Docling operation failed'): Error {
    if (error instanceof DoclingError) return error;
    if (error instanceof SdkError) {
      if (error.code === SdkErrorCode.RequestTimeout) {
        return new DoclingError(DoclingErrorCode.TIMEOUT, error.message, error);
      }
      if (CONNECTION_LOSS_CODES.has(error.code)) {
        return new DoclingError(DoclingErrorCode.NETWORK_ERROR, error.message, error);
      }
      return new DoclingError(DoclingErrorCode.PROCESSING_ERROR, error.message, error);
    }
    if (error instanceof ProtocolError) {
      return new DoclingError(DoclingErrorCode.PROCESSING_ERROR, error.message, error);
    }
    if (error instanceof Error && error.message.trim() && error.message !== 'Error') return error;

    const detail = this.errorMessage(error);
    const suffix = detail && detail !== 'Error' ? `: ${detail}` : '';
    return new DoclingError(DoclingErrorCode.PROCESSING_ERROR, `${context}${suffix}`, error);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string') return error;
    try {
      const serialized = JSON.stringify(error);
      return typeof serialized === 'string' ? serialized : String(error);
    } catch {
      return String(error);
    }
  }

  async listTools(): Promise<Array<Record<string, unknown>>> {
    await this.ensureConnected();
    const result = await this.client.listTools();
    return result.tools as Array<Record<string, unknown>>;
  }

  isConnectedToServer(): boolean {
    return this.connected;
  }

  /** @deprecated Prefer convertDocumentBundle to keep JSON and Markdown consistent. */
  async convertToMarkdown(filePath: string): Promise<string> {
    return (await this.convertDocumentBundle(filePath)).markdown;
  }

  /** @deprecated Prefer convertDocumentBundle to keep JSON and Markdown consistent. */
  async getDoclingDocumentJSON(filePath: string) {
    return (await this.convertDocumentBundle(filePath)).document;
  }

  /** @deprecated Prefer convertDocumentBundle to keep JSON and Markdown consistent. */
  async convertToDoclingDocument(filePath: string) {
    return (await this.convertDocumentBundle(filePath)).document;
  }

  /** Compatibility wrapper for callers that still use the v1 client facade. */
  async convertDocument(request: ConvertDocumentRequest): Promise<ConvertDocumentResponse> {
    const bundle = await this.convertDocumentBundle(request.file_path);
    return request.output_format === 'docling_document' || request.output_format === 'json'
      ? {
          success: true,
          document: bundle.document,
          metadata: {
            processing_time_ms: bundle.processingTimeMs,
            from_cache: bundle.fromCache,
            pages_processed: bundle.document.metadata.page_count,
          },
        }
      : {
          success: true,
          content: bundle.markdown,
          metadata: {
            processing_time_ms: bundle.processingTimeMs,
            from_cache: bundle.fromCache,
            pages_processed: bundle.document.metadata.page_count,
          },
        };
  }
}

export function createDoclingClient(): DoclingClient {
  return new DoclingClient({
    serverUrl: process.env.DOCLING_MCP_URL || 'http://docling-mcp:8000/mcp',
    timeout: Number.parseInt(process.env.DOCLING_MCP_TIMEOUT || '1200000', 10),
    maxRetries: Number.parseInt(process.env.DOCLING_MCP_MAX_RETRIES || '1', 10),
    cachePath: process.env.DOCLING_CACHE_PATH || '/app/docling-json-cache',
    debug: process.env.NODE_ENV === 'development',
  });
}

let clientInstance: DoclingClient | null = null;

export function getDoclingClient(): DoclingClient {
  clientInstance ??= createDoclingClient();
  return clientInstance;
}

export async function resetDoclingClient(): Promise<void> {
  if (!clientInstance) return;
  await clientInstance.disconnect();
  clientInstance = null;
}
