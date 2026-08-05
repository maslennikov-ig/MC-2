import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DoclingClient } from '@/stages/stage2-document-processing/docling/client';
import { DoclingError, DoclingErrorCode } from '@/stages/stage2-document-processing/docling/types';

const sdk = vi.hoisted(() => {
  const connect = vi.fn();
  const close = vi.fn();
  const listTools = vi.fn();
  const callTool = vi.fn();
  const terminateSession = vi.fn();
  const transportClose = vi.fn();
  const clientOptions: unknown[] = [];

  enum SdkErrorCode {
    NotConnected = 'NOT_CONNECTED',
    RequestTimeout = 'REQUEST_TIMEOUT',
    ConnectionClosed = 'CONNECTION_CLOSED',
    SendFailed = 'SEND_FAILED',
  }

  class SdkError extends Error {
    constructor(
      public code: SdkErrorCode,
      message: string
    ) {
      super(message);
    }
  }

  return {
    connect,
    close,
    listTools,
    callTool,
    terminateSession,
    transportClose,
    clientOptions,
    SdkError,
    SdkErrorCode,
  };
});

vi.mock('@modelcontextprotocol/client', () => ({
  Client: class Client {
    onerror?: (error: Error) => void;
    onclose?: () => void;
    connect = sdk.connect;
    close = sdk.close;
    listTools = sdk.listTools;
    callTool = sdk.callTool;

    constructor(_identity: unknown, options: unknown) {
      sdk.clientOptions.push(options);
    }

    getServerVersion() {
      return { name: 'docling-mcp', version: '3.0.0' };
    }

    getNegotiatedProtocolVersion() {
      return '2026-07-28';
    }

    getProtocolEra() {
      return 'modern';
    }
  },
  StreamableHTTPClientTransport: class StreamableHTTPClientTransport {
    close = sdk.transportClose;
    terminateSession = sdk.terminateSession;
  },
  SdkError: sdk.SdkError,
  SdkErrorCode: sdk.SdkErrorCode,
  ProtocolError: class ProtocolError extends Error {},
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const REQUIRED_TOOLS = [
  'convert_document_into_docling_document',
  'export_docling_document_to_markdown',
  'save_docling_document',
];

const temporaryDirectories: string[] = [];

async function createClient() {
  const cachePath = await fs.mkdtemp(path.join(os.tmpdir(), 'docling-client-'));
  temporaryDirectories.push(cachePath);
  return {
    cachePath,
    client: new DoclingClient({
      serverUrl: 'http://localhost:8000/mcp',
      cachePath,
      timeout: 1200,
      maxRetries: 1,
      retryDelay: 0,
    }),
  };
}

async function writeRawDocument(cachePath: string, key: string) {
  await fs.writeFile(
    path.join(cachePath, `${key}.json`),
    JSON.stringify({
      schema_name: 'DoclingDocument',
      version: '1.9.0',
      name: 'fixture',
      pages: { '1': { page_no: 1, size: { width: 100, height: 200 } } },
      texts: [{ self_ref: '#/texts/0', label: 'text', text: 'Hello', prov: [] }],
      pictures: [],
      tables: [],
    })
  );
}

function queueSuccessfulBundle(key: string, structured = true) {
  const values = [
    { document_key: key, from_cache: false },
    { document_key: key, markdown: '# Hello' },
    {
      json_file: `/app/docling-json-cache/${key}.json`,
      md_file: `/app/docling-json-cache/${key}.md`,
    },
  ];
  for (const value of values) {
    sdk.callTool.mockResolvedValueOnce(
      structured
        ? { structuredContent: value, content: [] }
        : { content: [{ type: 'text', text: JSON.stringify(value) }] }
    );
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  sdk.clientOptions.length = 0;
  sdk.connect.mockResolvedValue(undefined);
  sdk.close.mockResolvedValue(undefined);
  sdk.terminateSession.mockResolvedValue(undefined);
  sdk.transportClose.mockResolvedValue(undefined);
  sdk.listTools.mockResolvedValue({ tools: REQUIRED_TOOLS.map(name => ({ name })) });
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('DoclingClient MCP SDK 2 contract', () => {
  it('negotiates automatically and validates required tools once per connection', async () => {
    const { client } = await createClient();

    await client.connect();
    await client.connect();

    expect(sdk.clientOptions).toEqual([
      expect.objectContaining({ versionNegotiation: { mode: 'auto', probe: { maxRetries: 0 } } }),
    ]);
    expect(sdk.connect).toHaveBeenCalledTimes(1);
    expect(sdk.listTools).toHaveBeenCalledTimes(1);
  });

  it('returns one normalized bundle from MCP 2 structured output with real request timeouts', async () => {
    const { client, cachePath } = await createClient();
    await writeRawDocument(cachePath, 'doc-1');
    queueSuccessfulBundle('doc-1');

    const result = await client.convertDocumentBundle('/app/uploads/example.pdf');

    expect(result).toMatchObject({
      markdown: '# Hello',
      documentKey: 'doc-1',
      fromCache: false,
      document: {
        name: 'fixture',
        texts: [expect.objectContaining({ id: '#/texts/0', text: 'Hello' })],
      },
    });
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(sdk.callTool.mock.calls.map(call => call[0].name)).toEqual([
      'convert_document_into_docling_document',
      'export_docling_document_to_markdown',
      'save_docling_document',
    ]);
    expect(sdk.callTool.mock.calls.every(call => call[1].timeout === 1200)).toBe(true);
    expect(sdk.callTool.mock.calls.every(call => call[1].maxTotalTimeout === 1200)).toBe(true);
  });

  it('accepts MCP 1 text JSON during the client-first rollout', async () => {
    const { client, cachePath } = await createClient();
    await writeRawDocument(cachePath, 'legacy-doc');
    queueSuccessfulBundle('legacy-doc', false);

    await expect(client.convertDocumentBundle('/app/uploads/legacy.pdf')).resolves.toMatchObject({
      markdown: '# Hello',
      documentKey: 'legacy-doc',
    });
  });

  it('surfaces tool isError without retrying the conversion', async () => {
    const { client } = await createClient();
    sdk.callTool.mockResolvedValueOnce({
      isError: true,
      content: [{ type: 'text', text: 'conversion rejected' }],
    });

    await expect(client.convertDocumentBundle('/app/uploads/broken.pdf')).rejects.toMatchObject({
      code: DoclingErrorCode.PROCESSING_ERROR,
    } satisfies Partial<DoclingError>);
    expect(sdk.callTool).toHaveBeenCalledTimes(1);
  });

  it('rejects a saved JSON artifact that does not match the bundle document key', async () => {
    const { client } = await createClient();
    sdk.callTool
      .mockResolvedValueOnce({
        structuredContent: { document_key: 'expected-key', from_cache: false },
        content: [],
      })
      .mockResolvedValueOnce({
        structuredContent: { document_key: 'expected-key', markdown: '# Expected' },
        content: [],
      })
      .mockResolvedValueOnce({
        structuredContent: { json_file: '/app/docling-json-cache/other-key.json' },
        content: [],
      });

    await expect(client.convertDocumentBundle('/app/uploads/mismatch.pdf')).rejects.toThrow(
      'inconsistent saved JSON key'
    );
  });

  it('does not retry SDK timeouts', async () => {
    const { client } = await createClient();
    sdk.callTool.mockRejectedValueOnce(
      new sdk.SdkError(sdk.SdkErrorCode.RequestTimeout, 'request timed out')
    );

    await expect(client.convertDocumentBundle('/app/uploads/slow.pdf')).rejects.toMatchObject({
      code: DoclingErrorCode.TIMEOUT,
    } satisfies Partial<DoclingError>);
    expect(sdk.callTool).toHaveBeenCalledTimes(1);
  });

  it('reconnects and retries the whole bundle once after a typed connection loss', async () => {
    const { client, cachePath } = await createClient();
    await writeRawDocument(cachePath, 'retry-doc');
    sdk.callTool.mockRejectedValueOnce(
      new sdk.SdkError(sdk.SdkErrorCode.ConnectionClosed, 'connection closed')
    );
    queueSuccessfulBundle('retry-doc');

    await expect(client.convertDocumentBundle('/app/uploads/retry.pdf')).resolves.toMatchObject({
      documentKey: 'retry-doc',
    });
    expect(sdk.connect).toHaveBeenCalledTimes(2);
    expect(sdk.callTool).toHaveBeenCalledTimes(4);
  });

  it('fails connection when a required Docling tool is missing', async () => {
    const { client } = await createClient();
    sdk.listTools.mockResolvedValueOnce({ tools: [{ name: REQUIRED_TOOLS[0] }] });

    await expect(client.connect()).rejects.toThrow('missing required tools');
    expect(client.isConnectedToServer()).toBe(false);
  });

  it('recreates the SDK client after a failed initial connection', async () => {
    const { client } = await createClient();
    sdk.connect
      .mockRejectedValueOnce(new sdk.SdkError(sdk.SdkErrorCode.NotConnected, 'server unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(client.connect()).rejects.toMatchObject({
      code: DoclingErrorCode.NETWORK_ERROR,
    } satisfies Partial<DoclingError>);
    await expect(client.connect()).resolves.toBeUndefined();

    expect(sdk.clientOptions).toHaveLength(2);
    expect(sdk.connect).toHaveBeenCalledTimes(2);
    expect(sdk.listTools).toHaveBeenCalledTimes(1);
  });

  it('terminates the HTTP session before closing the client', async () => {
    const { client } = await createClient();
    await client.connect();

    await client.disconnect();

    expect(sdk.terminateSession).toHaveBeenCalledTimes(1);
    expect(sdk.close).toHaveBeenCalledTimes(1);
    expect(client.isConnectedToServer()).toBe(false);
  });
});
