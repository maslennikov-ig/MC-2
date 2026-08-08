import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLessonInspectorData } from '../useLessonInspectorData'

const { authState, supabase } = vi.hoisted(() => ({
  authState: {
    session: null,
    isLoading: true,
  },
  supabase: {
    from: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

vi.mock('@/lib/supabase/browser-client', () => ({
  useSupabase: () => ({ supabase, ...authState }),
}))

vi.mock('@/lib/client-logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('useLessonInspectorData auth resolution', () => {
  beforeEach(() => {
    authState.session = null
    authState.isLoading = true
    vi.clearAllMocks()
  })

  it('stops loading without querying when auth resolves without a session', async () => {
    const { result, rerender } = renderHook(() =>
      useLessonInspectorData({
        courseId: 'course-1',
        lessonId: '1.1',
      })
    )

    expect(result.current.isLoading).toBe(true)

    authState.isLoading = false
    rerender()

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
