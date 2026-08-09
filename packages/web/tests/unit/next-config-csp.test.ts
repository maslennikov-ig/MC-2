import { describe, expect, it } from 'vitest'

import { getDevelopmentConnectSources } from '../../lib/security/content-security-policy'

describe('Next.js Content-Security-Policy headers', () => {
  it('does not emit partial-IP wildcard sources in development connect-src', () => {
    const policy = getDevelopmentConnectSources({}).join(' ')

    expect(policy).not.toMatch(
      /\b(?:http|ws):\/\/(?:10\.\*|192\.168\.\*|172\.(?:1[6-9]|2\d|3[01])\.\*)/
    )
  })

  it('normalizes configured private-network endpoints to exact HTTP and WebSocket origins', () => {
    const sources = getDevelopmentConnectSources({
      COURSEGEN_BACKEND_URL: 'http://192.168.1.42:3456/trpc',
      NEXT_PUBLIC_COURSEGEN_BACKEND_URL: 'http://192.168.1.42:3456',
      NEXT_PUBLIC_SUPABASE_URL: 'http://10.0.0.8:54321/auth/v1',
      SUPABASE_URL: 'file:///tmp/not-a-connect-origin',
    })

    expect(sources).toContain('http://192.168.1.42:3456')
    expect(sources).toContain('ws://192.168.1.42:3456')
    expect(sources).toContain('http://10.0.0.8:54321')
    expect(sources).toContain('ws://10.0.0.8:54321')
    expect(sources).not.toContain('http://192.168.1.42:3456/trpc')
    expect(sources.filter((source) => source === 'http://192.168.1.42:3456')).toHaveLength(1)
    expect(sources.every((source) => !source.startsWith('file:'))).toBe(true)
  })
})
