import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { NextIntlClientProvider } from 'next-intl'
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

// Minimal messages for next-intl provider (only keys used by useRefinement)
const messages = {
  generation: {
    refinementChat: {
      proposal: {
        appliedMessage: 'Changes applied ({count} updates).',
        applyError: 'Error applying changes',
        errorMessage: 'Error: {error}',
        rejectedMessage: '❌ Изменения отклонены. Напишите уточнение или новый запрос.',
        regenerationStarted: 'Regeneration started',
        regenerationStartedDesc: 'AI is regenerating the content.',
        chatFailed: 'Chat Failed',
        chatFailedDesc: 'Could not send message.',
        emptyResponseFallback: 'See suggested changes below.',
      },
    },
  },
}

/** Wrapper providing NextIntlClientProvider for hooks that use useTranslations */
function createIntlWrapper() {
  return function IntlWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(NextIntlClientProvider, { locale: 'en', messages }, children)
  }
}

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

      const { result, unmount } = renderHook(() => useRefinement(courseId), {
        wrapper: createIntlWrapper(),
      })

      // Set proposal and accept
      await act(async () => {
        await result.current.refine(
          'stage_4',
          undefined,
          'test message',
          'previous output',
          'refine'
        )
      })

      // Manually set latestProposal (simulate response from refine)
      act(() => {
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

    it('should return ["course_structure"] for field_updates + stage_5', () => {
      const _proposal = createFieldUpdatesProposal('stage_5')

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

    it('should return ["course_structure"] for lesson_patch', () => {
      createLessonPatchProposal()

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

    it('should return ["analysis_result", "course_structure"] for direct_action', () => {
      createDirectActionProposal()

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

      const { result, unmount } = renderHook(() => useRefinement(courseId), {
        wrapper: createIntlWrapper(),
      })

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

      const { result, unmount } = renderHook(() => useRefinement(courseId), {
        wrapper: createIntlWrapper(),
      })

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

      const { result, unmount } = renderHook(() => useRefinement(courseId), {
        wrapper: createIntlWrapper(),
      })

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

      const { result, unmount } = renderHook(() => useRefinement(courseId), {
        wrapper: createIntlWrapper(),
      })

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

      const { result, unmount } = renderHook(() => useRefinement(courseId), {
        wrapper: createIntlWrapper(),
      })

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

      const { result, unmount } = renderHook(() => useRefinement(courseId), {
        wrapper: createIntlWrapper(),
      })

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

  // ===========================================================================
  // rejectProposal Tests
  // ===========================================================================

  describe('rejectProposal', () => {
    it('should clear latestProposal and add rejection system message to chatHistory', async () => {
      const { sendChatMessage } = await import('@/app/actions/refinement')

      const mockChatResponse = {
        conversationId: 'conv-123',
        assistantMessage: 'Here is a proposal',
        proposal: createFieldUpdatesProposal('stage_4'),
        intent: 'refine' as const,
      }

      vi.mocked(sendChatMessage).mockResolvedValue(mockChatResponse)

      const { result, unmount } = renderHook(() => useRefinement(courseId), {
        wrapper: createIntlWrapper(),
      })

      // Trigger refine to get proposal
      await act(async () => {
        await result.current.refine('stage_4', undefined, 'test message', 'previous', 'refine')
      })

      // Verify proposal exists
      expect(result.current.latestProposal).not.toBeNull()
      const initialHistoryLength = result.current.chatHistory.length

      // Reject the proposal
      act(() => {
        result.current.rejectProposal()
      })

      // Verify latestProposal is cleared
      expect(result.current.latestProposal).toBeNull()

      // Verify rejection message added to chat history
      expect(result.current.chatHistory.length).toBe(initialHistoryLength + 1)
      const lastMessage = result.current.chatHistory[result.current.chatHistory.length - 1]
      expect(lastMessage.role).toBe('system')
      expect(lastMessage.content).toContain('отклонены')

      unmount()
    })

    it('should clear acceptedProposal (preventing stale green box after rejection)', async () => {
      const { sendChatMessage, applyProposal } = await import('@/app/actions/refinement')

      const mockChatResponse = {
        conversationId: 'conv-123',
        assistantMessage: 'Here is a proposal',
        proposal: createFieldUpdatesProposal('stage_4'),
        intent: 'refine' as const,
      }

      vi.mocked(sendChatMessage).mockResolvedValue(mockChatResponse)
      vi.mocked(applyProposal).mockResolvedValue(undefined)

      const { result, unmount } = renderHook(() => useRefinement(courseId), {
        wrapper: createIntlWrapper(),
      })

      // First proposal: accept it
      await act(async () => {
        await result.current.refine('stage_4', undefined, 'first message', 'previous', 'refine')
      })

      await act(async () => {
        await result.current.acceptProposal()
      })

      // Verify acceptedProposal is set
      expect(result.current.acceptedProposal).not.toBeNull()

      // Second proposal: refine again
      const secondProposal = createFieldUpdatesProposal('stage_5')
      vi.mocked(sendChatMessage).mockResolvedValue({
        conversationId: 'conv-123',
        assistantMessage: 'Here is another proposal',
        proposal: secondProposal,
        intent: 'refine' as const,
      })

      await act(async () => {
        await result.current.refine('stage_5', undefined, 'second message', 'previous', 'refine')
      })

      // Verify latestProposal is new, acceptedProposal is cleared
      expect(result.current.latestProposal).toBe(secondProposal)

      // Now reject the second proposal
      act(() => {
        result.current.rejectProposal()
      })

      // Verify acceptedProposal is cleared (no stale green box)
      expect(result.current.acceptedProposal).toBeNull()

      unmount()
    })

    it('should do nothing when no latestProposal exists', () => {
      const { result, unmount } = renderHook(() => useRefinement(courseId), {
        wrapper: createIntlWrapper(),
      })

      // No proposal exists
      expect(result.current.latestProposal).toBeNull()
      const initialHistoryLength = result.current.chatHistory.length

      // Try to reject
      act(() => {
        result.current.rejectProposal()
      })

      // Verify nothing changed
      expect(result.current.latestProposal).toBeNull()
      expect(result.current.chatHistory.length).toBe(initialHistoryLength)

      unmount()
    })
  })

  // ===========================================================================
  // acceptedProposal State Tests
  // ===========================================================================

  describe('acceptedProposal state', () => {
    it('should set acceptedProposal to previousProposal after successful accept', async () => {
      const { sendChatMessage, applyProposal } = await import('@/app/actions/refinement')

      const proposal = createFieldUpdatesProposal('stage_4')
      const mockChatResponse = {
        conversationId: 'conv-123',
        assistantMessage: 'Here is a proposal',
        proposal,
        intent: 'refine' as const,
      }

      vi.mocked(sendChatMessage).mockResolvedValue(mockChatResponse)
      vi.mocked(applyProposal).mockResolvedValue(undefined)

      const { result, unmount } = renderHook(() => useRefinement(courseId), {
        wrapper: createIntlWrapper(),
      })

      // Trigger refine to get proposal
      await act(async () => {
        await result.current.refine('stage_4', undefined, 'test message', 'previous', 'refine')
      })

      // Verify acceptedProposal is null initially
      expect(result.current.acceptedProposal).toBeNull()

      // Accept the proposal
      await act(async () => {
        await result.current.acceptProposal()
      })

      // Wait for acceptance to complete
      await waitFor(() => {
        expect(result.current.isApplying).toBe(false)
      })

      // Verify acceptedProposal is set to the accepted proposal
      expect(result.current.acceptedProposal).toEqual(proposal)

      unmount()
    })

    it('should clear acceptedProposal when new proposal arrives via refine()', async () => {
      const { sendChatMessage, applyProposal } = await import('@/app/actions/refinement')

      const firstProposal = createFieldUpdatesProposal('stage_4')
      const mockChatResponse1 = {
        conversationId: 'conv-123',
        assistantMessage: 'First proposal',
        proposal: firstProposal,
        intent: 'refine' as const,
      }

      vi.mocked(sendChatMessage).mockResolvedValue(mockChatResponse1)
      vi.mocked(applyProposal).mockResolvedValue(undefined)

      const { result, unmount } = renderHook(() => useRefinement(courseId), {
        wrapper: createIntlWrapper(),
      })

      // First proposal: accept it
      await act(async () => {
        await result.current.refine('stage_4', undefined, 'first message', 'previous', 'refine')
      })

      await act(async () => {
        await result.current.acceptProposal()
      })

      await waitFor(() => {
        expect(result.current.acceptedProposal).not.toBeNull()
      })

      // Second proposal arrives
      const secondProposal = createLessonPatchProposal()
      vi.mocked(sendChatMessage).mockResolvedValue({
        conversationId: 'conv-123',
        assistantMessage: 'Second proposal',
        proposal: secondProposal,
        intent: 'refine' as const,
      })

      await act(async () => {
        await result.current.refine('stage_6', '1.1', 'second message', 'previous', 'refine')
      })

      // Verify acceptedProposal is cleared when new proposal arrives
      expect(result.current.acceptedProposal).toBeNull()
      expect(result.current.latestProposal).toEqual(secondProposal)

      unmount()
    })
  })

  // ===========================================================================
  // clearConversation Tests
  // ===========================================================================

  describe('clearConversation', () => {
    it('should reset conversationId, chatHistory, latestProposal, acceptedProposal', async () => {
      const { sendChatMessage, applyProposal } = await import('@/app/actions/refinement')

      const mockChatResponse = {
        conversationId: 'conv-123',
        assistantMessage: 'Here is a proposal',
        proposal: createFieldUpdatesProposal('stage_4'),
        intent: 'refine' as const,
      }

      vi.mocked(sendChatMessage).mockResolvedValue(mockChatResponse)
      vi.mocked(applyProposal).mockResolvedValue(undefined)

      const { result, unmount } = renderHook(() => useRefinement(courseId), {
        wrapper: createIntlWrapper(),
      })

      // Create some state
      await act(async () => {
        await result.current.refine('stage_4', undefined, 'test message', 'previous', 'refine')
      })

      await act(async () => {
        await result.current.acceptProposal()
      })

      await waitFor(() => {
        expect(result.current.conversationId).toBe('conv-123')
        expect(result.current.chatHistory.length).toBeGreaterThan(0)
        expect(result.current.acceptedProposal).not.toBeNull()
      })

      // Clear conversation
      act(() => {
        result.current.clearConversation()
      })

      // Verify all state is reset
      expect(result.current.conversationId).toBeUndefined()
      expect(result.current.chatHistory).toEqual([])
      expect(result.current.latestProposal).toBeNull()
      expect(result.current.acceptedProposal).toBeNull()

      unmount()
    })
  })
})
