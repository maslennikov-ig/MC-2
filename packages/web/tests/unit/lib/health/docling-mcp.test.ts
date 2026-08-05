import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  listTools: vi.fn(),
  terminateSession: vi.fn(),
  clientOptions: [] as unknown[],
}))

vi.mock('@modelcontextprotocol/client', () => ({
  Client: class Client {
    connect = sdk.connect
    close = sdk.close
    listTools = sdk.listTools

    constructor(_identity: unknown, options: unknown) {
      sdk.clientOptions.push(options)
    }

    getServerVersion() {
      return { name: 'docling-mcp', version: '3.0.0' }
    }

    getNegotiatedProtocolVersion() {
      return '2026-07-28'
    }

    getProtocolEra() {
      return 'modern'
    }
  },
  StreamableHTTPClientTransport: class StreamableHTTPClientTransport {
    terminateSession = sdk.terminateSession
  },
}))

import { probeDoclingMcp } from '@/lib/health/docling-mcp'

const requiredTools = [
  'convert_document_into_docling_document',
  'export_docling_document_to_markdown',
  'save_docling_document',
]

beforeEach(() => {
  vi.clearAllMocks()
  sdk.clientOptions.length = 0
  sdk.connect.mockResolvedValue(undefined)
  sdk.close.mockResolvedValue(undefined)
  sdk.terminateSession.mockResolvedValue(undefined)
  sdk.listTools.mockResolvedValue({ tools: requiredTools.map((name) => ({ name })) })
})

describe('probeDoclingMcp', () => {
  it('performs a real SDK 2 tool probe and closes the ephemeral session', async () => {
    const result = await probeDoclingMcp('http://docling-mcp:8000/mcp', 5000)

    expect(result).toMatchObject({
      serverName: 'docling-mcp',
      serverVersion: '3.0.0',
      protocolVersion: '2026-07-28',
      protocolEra: 'modern',
      responseTime: expect.any(Number),
    })
    expect(sdk.clientOptions).toEqual([
      expect.objectContaining({ versionNegotiation: { mode: 'auto', probe: { maxRetries: 0 } } }),
    ])
    expect(sdk.listTools).toHaveBeenCalledOnce()
    expect(sdk.terminateSession).toHaveBeenCalledOnce()
    expect(sdk.close).toHaveBeenCalledOnce()
  })

  it('fails when the server does not expose the conversion contract', async () => {
    sdk.listTools.mockResolvedValueOnce({ tools: [{ name: requiredTools[0] }] })

    await expect(probeDoclingMcp('http://docling-mcp:8000/mcp', 5000)).rejects.toThrow(
      'missing required tools'
    )
    expect(sdk.close).toHaveBeenCalledOnce()
  })
})
