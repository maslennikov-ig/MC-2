const configuredConnectOriginKeys = [
  'COURSEGEN_BACKEND_URL',
  'NEXT_PUBLIC_COURSEGEN_BACKEND_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
] as const

const supportedConnectProtocols = new Set(['http:', 'https:', 'ws:', 'wss:'])

function configuredConnectOrigins(rawValue: string | undefined): string[] {
  const value = rawValue?.trim()
  if (!value) return []

  try {
    const url = new URL(value)
    if (!supportedConnectProtocols.has(url.protocol)) return []

    const origins = [url.origin]
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const websocketProtocol = url.protocol === 'http:' ? 'ws:' : 'wss:'
      origins.push(`${websocketProtocol}//${url.host}`)
    }
    return origins
  } catch {
    return []
  }
}

export function getDevelopmentConnectSources(env: NodeJS.ProcessEnv = process.env): string[] {
  const sources = new Set([
    'ws://localhost:*',
    'http://localhost:*',
    'ws://127.0.0.1:*',
    'http://127.0.0.1:*',
    'ws://*.local:*',
    'http://*.local:*',
  ])

  for (const key of configuredConnectOriginKeys) {
    for (const origin of configuredConnectOrigins(env[key])) {
      sources.add(origin)
    }
  }

  return [...sources]
}
