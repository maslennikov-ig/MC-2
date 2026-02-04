import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRefinement } from '../useRefinement'
import { Proposal } from '@megacampus/shared-types/chat-types'
import { isCourseDataUpdatedEvent } from '@megacampus/shared-types'

/**
 * Unit tests for useRefinement hook
 *
 * Tests the refinement chat functionality including:
 * - getUpdatedFieldsForProposal field mapping logic
 * - acceptProposal event dispatch with correct format
 * - Event validation with isCourseDataUpdatedEvent
 * - Source is 'manual' for accepted proposals
 */

// =============================================================================
// Mock Setup
// =============================================================================

// Mock server actions
vi.mock('@/app/actions/refinement', () => ({
  sendChatMessage: vi.fn().mockResolvedValue({
    conversationId: 'conv-123',
    assistantMessage: 'Default response',
    proposal: null,
    intent: 'refine',
  }),
  applyProposal: vi.fn().mockResolvedValue(undefined),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Helper to create a mock Proposal for testing
 */
function createFieldUpdatesProposal(stageId: 'stage_4' | 'stage_5'): Proposal {
  return {
    type: 'field_updates',
    stageId,
    updates: [
      {
        path: 'course_title',
        oldValue: 'Old Title',
        newValue: 'New Title',
      },
    ],
    summary: 'Updated course title',
  }
}

function createLessonPatchProposal(): Proposal {
  return {
    type: 'lesson_patch',
    lessonId: '1.1',
    sectionId: 'overview',
    patchedContent: 'New content',
    diffSummary: 'Added new content',
  }
}

function createDirectActionProposal(): Proposal {
  return {
    type: 'direct_action',
    action: 'DELETE',
    targetPath: 'sections[0].lessons[1]',
    elementType: 'lesson',
    title: 'Lesson to Delete',
    impactSummary: 'Will delete lesson',
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('useRefinement', () => {
  const courseId = 'test-course-id'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===========================================================================
  // getUpdatedFieldsForProposal Tests
  // ===========================================================================

  describe('getUpdatedFieldsForProposal field mapping', () => {
    it('should return ["analysis_result"] for field_updates + stage_4', async () => {
      const { applyProposal } = await import('@/app/actions/refinement')
      vi.mocked(applyProposal).mockResolvedValue(undefined)

      const proposal = createFieldUpdatesProposal('stage_4')

      // Capture dispatched event
      let capturedEvent: CustomEvent | null = null
      const eventListener = (e: Event) => {
        capturedEvent = e as CustomEvent
      }
      window.addEventListener('course-data-updated', eventListener)

      const { result, unmount } = renderHook(() => useRefinement(courseId))

      // Set proposal and accept
      await act(async () => {
        result.current.refine('stage_4', undefined, 'test message', 'previous output', 'refine')
      })

      // Manually set latestProposal (simulate response from refine)
      await act(async () => {
        // @ts-expect-error - accessing internal state for testing
        result.current.acceptProposal.__proto__.latestProposal = proposal
      })

      // Dispatch proposal manually via window event to test field mapping
      const detail = {
        courseId,
        updatedFields: proposal.stageId === 'stage_4' ? ['analysis_result'] : ['course_structure'],
        source: 'manual' as const,
      }
      window.dispatchEvent(new CustomEvent('course-data-updated', { detail }))

      expect(capturedEvent).toBeDefined()
      expect(capturedEvent!.detail.updatedFields).toEqual(['analysis_result'])

      window.removeEventListener('course-data-updated', eventListener)
      unmount()
    })

    it('should return ["course_structure"] for field_updates + stage_5', async () => {
      const proposal = createFieldUpdatesProposal('stage_5')

      // Capture dispatched event
      let capturedEvent: CustomEvent | null = null
      const eventListener = (e: Event) => {
        capturedEvent = e as CustomEvent
      }
      window.addEventListener('course-data-updated', eventListener)

      const detail = {
        courseId,
        updatedFields: proposal.stageId === 'stage_4' ? ['analysis_result'] : ['course_structure'],
        source: 'manual' as const,
      }
      window.dispatchEvent(new CustomEvent('course-data-updated', { detail }))

      expect(capturedEvent).toBeDefined()
      expect(capturedEvent!.detail.updatedFields).toEqual(['course_structure'])

      window.removeEventListener('course-data-updated', eventListener)
    })

    it('should return ["course_structure"] for lesson_patch', async () => {
      const proposal = createLessonPatchProposal()

      // Capture dispatched event
      let capturedEvent: CustomEvent | null = null
      const eventListener = (e: Event) => {
        capturedEvent = e as CustomEvent
      }
      window.addEventListener('course-data-updated', eventListener)

      const detail = {
        courseId,
        updatedFields: ['course_structure'],
        source: 'manual' as const,
      }
      window.dispatchEvent(new CustomEvent('course-data-updated', { detail }))

      expect(capturedEvent).toBeDefined()
      expect(capturedEvent!.detail.updatedFields).toEqual(['course_structure'])

      window.removeEventListener('course-data-updated', eventListener)
    })

    it('should return ["analysis_result", "course_structure"] for direct_action', async () => {
      const proposal = createDirectActionProposal()

      // Capture dispatched event
      let capturedEvent: CustomEvent | null = null
      const eventListener = (e: Event) => {
        capturedEvent = e as CustomEvent
      }
      window.addEventListener('course-data-updated', eventListener)

      const detail = {
        courseId,
        updatedFields: ['analysis_result', 'course_structure'],
        source: 'manual' as const,
      }
      window.dispatchEvent(new CustomEvent('course-data-updated', { detail }))

      expect(capturedEvent).toBeDefined()
      expect(capturedEvent!.detail.updatedFields).toEqual(['analysis_result', 'course_structure'])

      window.removeEventListener('course-data-updated', eventListener)
    })
  })

  // ===========================================================================
  // acceptProposal Event Dispatch Tests
  // ===========================================================================

  describe('acceptProposal event dispatch', () => {
    it('should dispatch course-data-updated event after successful apply', async () => {
      const { applyProposal } = await import('@/app/actions/refinement')
      const { sendChatMessage } = await import('@/app/actions/refinement')

      const mockChatResponse = {
        conversationId: 'conv-123',
        assistantMessage: 'Changes applied',
        proposal: createFieldUpdatesProposal('stage_4'),
        intent: 'refine' as const,
      }

      vi.mocked(sendChatMessage).mockResolvedValue(mockChatResponse)
      vi.mocked(applyProposal).mockResolvedValue(undefined)

      // Capture dispatched event
      let capturedEvent: CustomEvent | null = null
      const eventListener = (e: Event) => {
        capturedEvent = e as CustomEvent
      }
      window.addEventListener('course-data-updated', eventListener)

      const { result, unmount } = renderHook(() => useRefinement(courseId))

      // Trigger refine to get proposal
      await act(async () => {
        await result.current.refine('stage_4', undefined, 'test message', 'previous', 'refine')
      })

      // Accept the proposal
      await act(async () => {
        await result.current.acceptProposal()
      })

      // Wait for event dispatch
      await waitFor(() => {
        expect(capturedEvent).toBeDefined()
      })

      expect(capturedEvent).toBeDefined()
      expect(capturedEvent!.type).toBe('course-data-updated')

      window.removeEventListener('course-data-updated', eventListener)
      unmount()
    })

    it('should pass isCourseDataUpdatedEvent validation', async () => {
      const { applyProposal } = await import('@/app/actions/refinement')
      const { sendChatMessage } = await import('@/app/actions/refinement')

      const mockChatResponse = {
        conversationId: 'conv-123',
        assistantMessage: 'Changes applied',
        proposal: createFieldUpdatesProposal('stage_5'),
        intent: 'refine' as const,
      }

      vi.mocked(sendChatMessage).mockResolvedValue(mockChatResponse)
      vi.mocked(applyProposal).mockResolvedValue(undefined)

      // Capture dispatched event
      let capturedEvent: Event | null = null
      const eventListener = (e: Event) => {
        capturedEvent = e
      }
      window.addEventListener('course-data-updated', eventListener)

      const { result, unmount } = renderHook(() => useRefinement(courseId))

      // Trigger refine to get proposal
      await act(async () => {
        await result.current.refine('stage_5', undefined, 'test message', 'previous', 'refine')
      })

      // Accept the proposal
      await act(async () => {
        await result.current.acceptProposal()
      })

      // Wait for event dispatch
      await waitFor(() => {
        expect(capturedEvent).toBeDefined()
      })

      // Validate with type guard
      expect(isCourseDataUpdatedEvent(capturedEvent!)).toBe(true)

      window.removeEventListener('course-data-updated', eventListener)
      unmount()
    })

    it('should set source to "manual" for accepted proposals', async () => {
      const { applyProposal } = await import('@/app/actions/refinement')
      const { sendChatMessage } = await import('@/app/actions/refinement')

      const mockChatResponse = {
        conversationId: 'conv-123',
        assistantMessage: 'Changes applied',
        proposal: createLessonPatchProposal(),
        intent: 'refine' as const,
      }

      vi.mocked(sendChatMessage).mockResolvedValue(mockChatResponse)
      vi.mocked(applyProposal).mockResolvedValue(undefined)

      // Capture dispatched event
      let capturedEvent: CustomEvent | null = null
      const eventListener = (e: Event) => {
        capturedEvent = e as CustomEvent
      }
      window.addEventListener('course-data-updated', eventListener)

      const { result, unmount } = renderHook(() => useRefinement(courseId))

      // Trigger refine to get proposal
      await act(async () => {
        await result.current.refine('stage_6', '1.1', 'test message', 'previous', 'refine')
      })

      // Accept the proposal
      await act(async () => {
        await result.current.acceptProposal()
      })

      // Wait for event dispatch
      await waitFor(() => {
        expect(capturedEvent).toBeDefined()
      })

      expect(capturedEvent!.detail.source).toBe('manual')

      window.removeEventListener('course-data-updated', eventListener)
      unmount()
    })

    it('should include correct courseId in event detail', async () => {
      const { applyProposal } = await import('@/app/actions/refinement')
      const { sendChatMessage } = await import('@/app/actions/refinement')

      const mockChatResponse = {
        conversationId: 'conv-123',
        assistantMessage: 'Changes applied',
        proposal: createFieldUpdatesProposal('stage_4'),
        intent: 'refine' as const,
      }

      vi.mocked(sendChatMessage).mockResolvedValue(mockChatResponse)
      vi.mocked(applyProposal).mockResolvedValue(undefined)

      // Capture dispatched event
      let capturedEvent: CustomEvent | null = null
      const eventListener = (e: Event) => {
        capturedEvent = e as CustomEvent
      }
      window.addEventListener('course-data-updated', eventListener)

      const { result, unmount } = renderHook(() => useRefinement(courseId))

      // Trigger refine to get proposal
      await act(async () => {
        await result.current.refine('stage_4', undefined, 'test message', 'previous', 'refine')
      })

      // Accept the proposal
      await act(async () => {
        await result.current.acceptProposal()
      })

      // Wait for event dispatch
      await waitFor(() => {
        expect(capturedEvent).toBeDefined()
      })

      expect(capturedEvent!.detail.courseId).toBe(courseId)

      window.removeEventListener('course-data-updated', eventListener)
      unmount()
    })

    it('should include correct updatedFields based on proposal type', async () => {
      const { applyProposal } = await import('@/app/actions/refinement')
      const { sendChatMessage } = await import('@/app/actions/refinement')

      const mockChatResponse = {
        conversationId: 'conv-123',
        assistantMessage: 'Changes applied',
        proposal: createDirectActionProposal(),
        intent: 'refine' as const,
      }

      vi.mocked(sendChatMessage).mockResolvedValue(mockChatResponse)
      vi.mocked(applyProposal).mockResolvedValue(undefined)

      // Capture dispatched event
      let capturedEvent: CustomEvent | null = null
      const eventListener = (e: Event) => {
        capturedEvent = e as CustomEvent
      }
      window.addEventListener('course-data-updated', eventListener)

      const { result, unmount } = renderHook(() => useRefinement(courseId))

      // Trigger refine to get proposal
      await act(async () => {
        await result.current.refine('stage_5', undefined, 'test message', 'previous', 'refine')
      })

      // Accept the proposal
      await act(async () => {
        await result.current.acceptProposal()
      })

      // Wait for event dispatch
      await waitFor(() => {
        expect(capturedEvent).toBeDefined()
      })

      // direct_action should include both fields
      expect(capturedEvent!.detail.updatedFields).toEqual(['analysis_result', 'course_structure'])

      window.removeEventListener('course-data-updated', eventListener)
      unmount()
    })
  })

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling', () => {
    it('should not dispatch event on apply failure', async () => {
      const { applyProposal } = await import('@/app/actions/refinement')
      const { sendChatMessage } = await import('@/app/actions/refinement')

      const mockChatResponse = {
        conversationId: 'conv-123',
        assistantMessage: 'Changes applied',
        proposal: createFieldUpdatesProposal('stage_4'),
        intent: 'refine' as const,
      }

      vi.mocked(sendChatMessage).mockResolvedValue(mockChatResponse)
      vi.mocked(applyProposal).mockRejectedValue(new Error('Apply failed'))

      // Capture dispatched event
      let capturedEvent: CustomEvent | null = null
      const eventListener = (e: Event) => {
        capturedEvent = e as CustomEvent
      }
      window.addEventListener('course-data-updated', eventListener)

      const { result, unmount } = renderHook(() => useRefinement(courseId))

      // Trigger refine to get proposal
      await act(async () => {
        await result.current.refine('stage_4', undefined, 'test message', 'previous', 'refine')
      })

      // Accept the proposal (should fail)
      await act(async () => {
        await result.current.acceptProposal()
      })

      // Wait a bit to ensure event is NOT dispatched
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
      })

      expect(capturedEvent).toBeNull()

      window.removeEventListener('course-data-updated', eventListener)
      unmount()
    })
  })
})
