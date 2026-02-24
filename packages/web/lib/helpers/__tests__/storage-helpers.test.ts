import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEnrichmentPlaybackUrl } from '@/lib/helpers/storage-helpers'

const { mockGetPlaybackUrlQuery } = vi.hoisted(() => ({
  mockGetPlaybackUrlQuery: vi.fn(),
}))

vi.mock('@/lib/trpc/browser-client', () => ({
  getBrowserTrpcClient: vi.fn(() => ({
    enrichment: {
      getPlaybackUrl: {
        query: mockGetPlaybackUrlQuery,
      },
    },
  })),
}))

describe('getEnrichmentPlaybackUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for non-completed enrichments', async () => {
    const result = await getEnrichmentPlaybackUrl({
      id: '33333333-3333-4333-8333-333333333333',
      status: 'generating',
    })

    expect(result).toBeNull()
    expect(mockGetPlaybackUrlQuery).not.toHaveBeenCalled()
  })

  it('uses tRPC playback URL endpoint for completed enrichments', async () => {
    mockGetPlaybackUrlQuery.mockResolvedValueOnce({
      url: 'https://playback.example.com/audio.mp3',
      expiresAt: '2026-02-21T12:00:00.000Z',
    })

    const result = await getEnrichmentPlaybackUrl({
      id: '33333333-3333-4333-8333-333333333333',
      status: 'completed',
    })

    expect(mockGetPlaybackUrlQuery).toHaveBeenCalledWith({
      enrichmentId: '33333333-3333-4333-8333-333333333333',
    })
    expect(result).toBe('https://playback.example.com/audio.mp3')
  })

  it('returns null when backend returns no URL', async () => {
    mockGetPlaybackUrlQuery.mockResolvedValueOnce({
      url: null,
      expiresAt: null,
    })

    const result = await getEnrichmentPlaybackUrl({
      id: '33333333-3333-4333-8333-333333333333',
      status: 'completed',
    })

    expect(result).toBeNull()
  })
})
