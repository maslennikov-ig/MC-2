import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCascadeStageDelete } from '../useCascadeStageDelete'

const { deleteAction, checkDownstream, invalidate, toast } = vi.hoisted(() => ({
  deleteAction: vi.fn(),
  checkDownstream: vi.fn(),
  invalidate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/app/actions/admin-generation', () => ({ deleteDownstreamStagesAction: deleteAction }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    useUtils: () => ({
      generation: { checkDownstreamStages: { fetch: checkDownstream } },
      invalidate,
    }),
  },
}))

describe('useCascadeStageDelete: one logical edit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkDownstream.mockResolvedValue({ hasStage5: true, hasStage6: true, stage6LessonsCount: 3 })
    invalidate.mockResolvedValue(undefined)
    deleteAction.mockResolvedValue({
      success: true,
      deletedLessonsCount: 3,
      deletedSectionsCount: 2,
      deletedStructure: true,
      fieldApplied: true,
    })
  })

  it('passes the pending edit with cascade confirmation and does not save it a second time', async () => {
    const performSave = vi.fn()
    const { result } = renderHook(() => useCascadeStageDelete('course-1', 4, performSave, 'ru'))
    await act(async () => {
      result.current.handleFieldSave('topic_analysis.determined_topic', 'New topic')
    })
    expect(result.current.cascadeModalOpen).toBe(true)
    await act(async () => {
      result.current.handleCascadeConfirm()
    })

    expect(deleteAction).toHaveBeenCalledExactlyOnceWith('course-1', 4, {
      fieldPath: 'topic_analysis.determined_topic',
      value: 'New topic',
    })
    expect(performSave).not.toHaveBeenCalled()
    expect(result.current.cascadeModalOpen).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('Удалено: 3 уроков, 2 модулей')
    expect(invalidate).toHaveBeenCalledOnce()
  })

  it('performs the original save once when the backend uses the flag-off path', async () => {
    deleteAction.mockResolvedValueOnce({
      success: true,
      deletedLessonsCount: 3,
      deletedSectionsCount: 0,
      deletedStructure: false,
    })
    const performSave = vi.fn()
    const { result } = renderHook(() => useCascadeStageDelete('course-1', 5, performSave, 'en'))
    await act(async () => {
      result.current.handleFieldSave('course_title', 'New title')
    })
    await act(async () => {
      result.current.handleCascadeConfirm()
    })

    expect(performSave).toHaveBeenCalledExactlyOnceWith('course_title', 'New title')
    expect(toast.success).toHaveBeenCalledWith('Deleted: 3 lessons')
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('ignores repeated confirmation while the same logical edit is in progress', async () => {
    const performSave = vi.fn()
    const { result } = renderHook(() => useCascadeStageDelete('course-1', 4, performSave))
    await act(async () => {
      result.current.handleFieldSave('topic_analysis.determined_topic', 'New topic')
    })
    await act(async () => {
      result.current.handleCascadeConfirm()
      result.current.handleCascadeConfirm()
    })

    expect(deleteAction).toHaveBeenCalledOnce()
    expect(performSave).not.toHaveBeenCalled()
  })

  it('keeps confirmation open and does not save after the transaction fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    deleteAction.mockRejectedValueOnce(new Error('Course state changed'))
    const performSave = vi.fn()
    const { result } = renderHook(() => useCascadeStageDelete('course-1', 4, performSave))
    await act(async () => {
      result.current.handleFieldSave('topic_analysis.determined_topic', 'New topic')
    })
    await act(async () => {
      result.current.handleCascadeConfirm()
    })

    expect(result.current.cascadeModalOpen).toBe(true)
    expect(result.current.isDeleting).toBe(false)
    expect(performSave).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledOnce()
  })
})
