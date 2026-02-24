import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEnrichment } from '@/app/actions/enrichment-actions'

const {
  mockGetCurrentUser,
  mockGetUserClient,
  mockGetServerTrpcClient,
  mockCreateSignedUrl,
  mockPlaybackUrlQuery,
  mockSupabaseFrom,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockGetUserClient: vi.fn(),
  mockGetServerTrpcClient: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
  mockPlaybackUrlQuery: vi.fn(),
  mockSupabaseFrom: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/auth-helpers', () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock('@/lib/supabase/client-factory', () => ({
  getUserClient: mockGetUserClient,
  getAdminClient: vi.fn(),
}))

vi.mock('@/lib/trpc/server-caller', () => ({
  getServerTrpcClient: mockGetServerTrpcClient,
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}))

const COURSE_ID = '55555555-5555-4555-8555-555555555555'
const ENRICHMENT_ID = '33333333-3333-4333-8333-333333333333'
const ASSET_ID = '66666666-6666-4666-8666-666666666666'

function createSupabaseMock(enrichmentType: string) {
  const mockCourseSingle = vi.fn().mockResolvedValue({
    data: { user_id: '11111111-1111-4111-8111-111111111111' },
    error: null,
  })
  const mockCourseEq = vi.fn().mockReturnValue({ single: mockCourseSingle })
  const mockCourseSelect = vi.fn().mockReturnValue({ eq: mockCourseEq })

  const mockEnrichmentSingle = vi.fn().mockResolvedValue({
    data: {
      id: ENRICHMENT_ID,
      enrichment_type: enrichmentType,
      status: 'completed',
      content: null,
      metadata: null,
      error_message: null,
      asset_id: ASSET_ID,
    },
    error: null,
  })
  const mockEnrichmentEqSecond = vi.fn().mockReturnValue({ single: mockEnrichmentSingle })
  const mockEnrichmentEqFirst = vi.fn().mockReturnValue({ eq: mockEnrichmentEqSecond })
  const mockEnrichmentSelect = vi.fn().mockReturnValue({ eq: mockEnrichmentEqFirst })

  const mockAssetSingle = vi.fn().mockResolvedValue({
    data: { file_path: 'custom/course/path/file.webp' },
    error: null,
  })
  const mockAssetEq = vi.fn().mockReturnValue({ single: mockAssetSingle })
  const mockAssetSelect = vi.fn().mockReturnValue({ eq: mockAssetEq })

  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === 'courses') {
      return { select: mockCourseSelect }
    }
    if (table === 'lesson_enrichments') {
      return { select: mockEnrichmentSelect }
    }
    if (table === 'assets') {
      return { select: mockAssetSelect }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    from: mockSupabaseFrom,
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  }
}

describe('getEnrichment playback URL handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockGetCurrentUser.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    })

    mockPlaybackUrlQuery.mockResolvedValue({
      url: 'https://playback.example.com/audio.mp3',
      expiresAt: '2026-02-21T12:00:00.000Z',
    })
    mockGetServerTrpcClient.mockResolvedValue({
      enrichment: {
        getPlaybackUrl: {
          query: mockPlaybackUrlQuery,
        },
      },
    })

    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/file.webp' },
    })
  })

  it('uses server playback endpoint for audio instead of direct storage signed URLs', async () => {
    mockGetUserClient.mockResolvedValue(createSupabaseMock('audio'))

    const result = await getEnrichment({
      enrichmentId: ENRICHMENT_ID,
      courseId: COURSE_ID,
    })

    expect(result.success).toBe(true)
    expect(mockPlaybackUrlQuery).toHaveBeenCalledWith({ enrichmentId: ENRICHMENT_ID })
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
    expect(result.enrichment?.asset_url).toBe('https://playback.example.com/audio.mp3')
  })

  it('keeps direct signed URLs for non-playback enrichments', async () => {
    mockGetUserClient.mockResolvedValue(createSupabaseMock('cover'))

    const result = await getEnrichment({
      enrichmentId: ENRICHMENT_ID,
      courseId: COURSE_ID,
    })

    expect(result.success).toBe(true)
    expect(mockPlaybackUrlQuery).not.toHaveBeenCalled()
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('custom/course/path/file.webp', 3600)
    expect(result.enrichment?.asset_url).toBe('https://signed.example.com/file.webp')
  })
})
