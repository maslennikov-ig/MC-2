import { beforeEach, describe, expect, it, vi } from 'vitest'
import { retryLessonGeneration, retryMultipleLessons } from '@/app/actions/lesson-actions'

const { mockGetServerTrpcClient, mockPartialGenerateMutate } = vi.hoisted(() => ({
  mockGetServerTrpcClient: vi.fn(),
  mockPartialGenerateMutate: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/trpc/server-caller', () => ({
  getServerTrpcClient: mockGetServerTrpcClient,
}))

vi.mock('@/lib/trpc/action-error', () => ({
  toActionError: vi.fn((error: unknown) => error),
}))

describe('lesson actions manual retry contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPartialGenerateMutate.mockResolvedValue({
      success: true,
      jobIds: ['job-1'],
      jobCount: 1,
    })
    mockGetServerTrpcClient.mockResolvedValue({
      lessonContent: {
        partialGenerate: {
          mutate: mockPartialGenerateMutate,
        },
      },
    })
  })

  it('sets manualTopRegeneration for single-lesson retries', async () => {
    await retryLessonGeneration('course-1', '1.1', 9)

    expect(mockPartialGenerateMutate).toHaveBeenCalledWith({
      courseId: 'course-1',
      lessonIds: ['1.1'],
      priority: 9,
      manualTopRegeneration: true,
    })
  })

  it('sets manualTopRegeneration for multi-lesson retries', async () => {
    await retryMultipleLessons('course-1', ['1.1', '1.2'], 7)

    expect(mockPartialGenerateMutate).toHaveBeenCalledWith({
      courseId: 'course-1',
      lessonIds: ['1.1', '1.2'],
      priority: 7,
      manualTopRegeneration: true,
    })
  })
})
