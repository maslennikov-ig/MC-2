import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionRecovery } from '../useSessionRecovery'

const setViewport = vi.fn()
const getViewport = vi.fn(() => ({ x: 0, y: 0, zoom: 1 }))

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    setViewport,
    getViewport,
  }),
}))

describe('useSessionRecovery', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(key, value)
        }),
        removeItem: vi.fn((key: string) => {
          storage.delete(key)
        }),
      },
      configurable: true,
    })
    vi.clearAllMocks()
  })

  it('does not restore a stale saved viewport on initial workflow load by default', () => {
    storage.set('graph_viewport_course-1', JSON.stringify({ x: -2400, y: -1800, zoom: 1 }))

    renderHook(() => useSessionRecovery('course-1'))

    expect(setViewport).not.toHaveBeenCalled()
  })
})
