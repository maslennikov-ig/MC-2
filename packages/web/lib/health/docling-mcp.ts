import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const REQUIRED_TOOLS = new Set([
  'convert_document_into_docling_document',
  'export_docling_document_to_markdown',
  'save_docling_document',
])

export interface DoclingMcpProbeResult {
  serverName: string
  serverVersion?: string
  protocolVersion?: string
  protocolEra?: string
  responseTime: number
}

export async function probeDoclingMcp(
  serverUrl: string,
  timeoutMs: number
): Promise<DoclingMcpProbeResult> {
  const startedAt = Date.now()
  const client = new Client(
    { name: 'megacampus-admin-health', version: '2.0.0' },
    { versionNegotiation: { mode: 'auto', probe: { maxRetries: 0 } } }
  )
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: { headers: { Accept: 'application/json, text/event-stream' } },
  })

  try {
    await client.connect(transport, { timeout: timeoutMs, maxTotalTimeout: timeoutMs })
    const { tools } = await client.listTools(undefined, {
      timeout: timeoutMs,
      maxTotalTimeout: timeoutMs,
    })
    const available = new Set(tools.map((tool) => tool.name))
    const missing = [...REQUIRED_TOOLS].filter((tool) => !available.has(tool))
    if (missing.length > 0) {
      throw new Error(`Docling MCP is missing required tools: ${missing.join(', ')}`)
    }

    const server = client.getServerVersion()
    return {
      serverName: server?.name ?? 'unknown',
      serverVersion: server?.version,
      protocolVersion: client.getNegotiatedProtocolVersion(),
      protocolEra: client.getProtocolEra(),
      responseTime: Date.now() - startedAt,
    }
  } finally {
    try {
      await transport.terminateSession()
    } catch {
      // Session termination is optional for MCP servers.
    }
    await client.close().catch(() => undefined)
  }
}
