import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { usePartialGeneration } from '../usePartialGeneration'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

describe('usePartialGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetch).mockReset()
  })

  it('shows a visible message when lesson generation is already pending', async () => {
    let resolveFetch: (response: Response) => void = () => {}
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    vi.mocked(fetch).mockReturnValue(pendingResponse)

    const { result, unmount } = renderHook(() => usePartialGeneration('course-1'))

    let firstRequest: Promise<unknown> | undefined
    act(() => {
      firstRequest = result.current.generateLesson('8.5')
    })

    let skippedResult: unknown
    await act(async () => {
      skippedResult = await result.current.generateLesson('8.5')
    })

    expect(skippedResult).toBeNull()
    expect(toast.info).toHaveBeenCalledWith('Урок 8.5 уже поставлен в очередь или генерируется')

    resolveFetch(
      new Response(
        JSON.stringify({
          success: true,
          jobCount: 1,
          jobIds: ['stage6:course-1:8.5'],
          selectedLessonIds: ['8.5'],
        }),
        { status: 200 }
      )
    )

    await act(async () => {
      await firstRequest
    })
    unmount()
  })
})
