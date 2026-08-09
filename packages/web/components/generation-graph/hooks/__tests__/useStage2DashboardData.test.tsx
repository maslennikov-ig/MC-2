import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGenerationStore } from '@/stores/useGenerationStore'
import { useStage2DashboardData } from '../useStage2DashboardData'

const { fileCatalogQuery, generationTraceQuery, supabase } = vi.hoisted(() => {
  const createQuery = () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {}
    query.select = vi.fn(() => query)
    query.eq = vi.fn(() => query)
    query.order = vi.fn(() => query)
    query.abortSignal = vi.fn()
    return query
  }

  const fileCatalogQuery = createQuery()
  const generationTraceQuery = createQuery()
  const supabase = {
    from: vi.fn((table: string) =>
      table === 'file_catalog' ? fileCatalogQuery : generationTraceQuery
    ),
  }

  return { fileCatalogQuery, generationTraceQuery, supabase }
})

vi.mock('@/lib/supabase/browser-client', () => ({
  getSupabaseClient: () => supabase,
}))

vi.mock('@/lib/client-logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    devLog: vi.fn(),
  },
}))

vi.mock('@/lib/hooks/use-debounce', () => ({
  useDebouncedCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

describe('useStage2DashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useGenerationStore.getState().reset()

    fileCatalogQuery.abortSignal.mockResolvedValue({
      data: [
        {
          id: 'file-1',
          filename: 'diagram.pdf',
          generated_title: null,
          original_name: 'diagram.pdf',
          file_size: 4096,
          priority: 'CORE',
          vector_status: 'failed',
          chunk_count: 0,
          error_message:
            'Conversion produced no usable text for /tmp/private/diagram.pdf: 12 characters. It carries no extractable text layer.',
          created_at: '2026-08-08T00:00:00.000Z',
        },
      ],
      error: null,
    })
    generationTraceQuery.abortSignal.mockResolvedValue({ data: [], error: null })
  })

  it('keeps the persisted failure reason when the client store already marks the document failed', async () => {
    useGenerationStore.getState().initializeDocumentsWithStatus([
      {
        id: 'file-1',
        name: 'diagram.pdf',
        status: 'error',
        priority: 'CORE',
      },
    ])

    const { result, unmount } = renderHook(() =>
      useStage2DashboardData({
        courseId: 'course-1',
        enableRealtime: false,
      })
    )

    await waitFor(() => expect(result.current.data?.documents).toHaveLength(1))

    expect(result.current.data?.documents[0]).toMatchObject({
      documentId: 'file-1',
      status: 'error',
      errorMessage:
        'Conversion produced no usable text for /tmp/private/diagram.pdf: 12 characters. It carries no extractable text layer.',
    })

    unmount()
  })
})
