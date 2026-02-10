import { useState, useCallback, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { ChatRequest, ChatResponse, Proposal } from '@megacampus/shared-types/chat-types'
import { createCourseDataUpdatedEvent } from '@megacampus/shared-types'
import { sendChatMessage, applyProposal as applyProposalAction } from '@/app/actions/refinement'

/** Map proposal type to affected database fields for GraphView refresh */
function getUpdatedFieldsForProposal(proposal: Proposal): string[] {
  switch (proposal.type) {
    case 'field_updates':
      return proposal.stageId === 'stage_4' ? ['analysis_result'] : ['course_structure']
    case 'lesson_patch':
      return ['course_structure']
    case 'direct_action':
      return ['analysis_result', 'course_structure']
  }
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

export const useRefinement = (courseId: string) => {
  const [isRefining, setIsRefining] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [latestProposal, setLatestProposal] = useState<Proposal | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [proposalError, setProposalError] = useState<string | null>(null)
  const [acceptedProposal, setAcceptedProposal] = useState<Proposal | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  // Cleanup: abort pending requests and track mount state
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsRefining(false)
  }, [])

  const clearConversation = useCallback(() => {
    setConversationId(undefined)
    setChatHistory([])
    setLatestProposal(null)
    setAcceptedProposal(null)
  }, [])

  const acceptProposal = useCallback(async () => {
    if (!latestProposal || !conversationId) return

    // Optimistic: save current state for potential rollback
    const previousProposal = latestProposal

    setIsApplying(true)
    setLatestProposal(null) // Hide immediately (optimistic)
    setProposalError(null)

    try {
      await applyProposalAction(courseId, conversationId, previousProposal)

      // Only update state if component is still mounted
      if (!isMountedRef.current) return

      setAcceptedProposal(previousProposal)

      // Добавить inline feedback в историю чата
      const updateCount =
        previousProposal.type === 'field_updates' ? previousProposal.updates.length : 1
      const fieldWord =
        updateCount === 1
          ? 'поле обновлено'
          : updateCount < 5
            ? 'поля обновлено'
            : 'полей обновлено'
      setChatHistory((prev) => [
        ...prev,
        {
          role: 'system',
          content: `✅ Изменения применены (${updateCount} ${fieldWord}). Проверьте обновлённые данные.`,
          timestamp: new Date().toISOString(),
        },
      ])

      // Emit event for data refetch with proper CourseDataUpdatedDetail format
      window.dispatchEvent(
        createCourseDataUpdatedEvent({
          courseId,
          updatedFields: getUpdatedFieldsForProposal(previousProposal),
          source: 'manual',
        })
      )
    } catch (error) {
      // Only update state if component is still mounted
      if (!isMountedRef.current) return

      // Rollback on error
      setLatestProposal(previousProposal)
      const errorMsg = error instanceof Error ? error.message : 'Ошибка применения изменений'
      setProposalError(errorMsg)
      toast.error(errorMsg)

      // Добавить inline error в историю чата
      setChatHistory((prev) => [
        ...prev,
        {
          role: 'system',
          content: `❌ Ошибка: ${errorMsg}`,
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      if (isMountedRef.current) {
        setIsApplying(false)
      }
    }
  }, [courseId, conversationId, latestProposal])

  const retryProposal = useCallback(async () => {
    if (!isMountedRef.current) return
    setProposalError(null)
    await acceptProposal()
  }, [acceptProposal])

  const rejectProposal = useCallback(() => {
    if (!latestProposal) return
    setLatestProposal(null)
    setProposalError(null)
    setChatHistory((prev) => [
      ...prev,
      {
        role: 'system',
        content: '❌ Изменения отклонены. Напишите уточнение или новый запрос.',
        timestamp: new Date().toISOString(),
      },
    ])
  }, [latestProposal])

  const refine = useCallback(
    async (
      stageId: string,
      nodeId: string | undefined,
      userMessage: string,
      previousOutput: string,
      intent: 'refine' | 'regenerate' = 'refine'
    ): Promise<ChatResponse | undefined> => {
      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // Create new AbortController for this request
      const controller = new AbortController()
      abortControllerRef.current = controller

      setIsRefining(true)
      try {
        const request: ChatRequest = {
          courseId,
          chatType: 'node',
          userMessage,
          conversationId,
          nodeContext: {
            stageId,
            nodeId,
            blockPath: undefined,
          },
          previousOutput,
          intent,
        }

        // NOTE: AbortSignal cannot be passed to server actions (not serializable).
        // Abort handling is done client-side by checking controller.signal.aborted after response.
        const response = await sendChatMessage(request)

        // Check if aborted after response or component unmounted - ignore result
        if (controller.signal.aborted || !isMountedRef.current) return

        // Update conversation state from response
        if (response.conversationId) {
          setConversationId(response.conversationId)
        }

        // Add messages to history
        setChatHistory((prev) => [
          ...prev,
          { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
          {
            role: 'assistant',
            content: response.assistantMessage,
            timestamp: new Date().toISOString(),
          },
        ])

        // Update proposal state if present
        if (response.proposal) {
          setLatestProposal(response.proposal)
          setProposalError(null) // Clear any previous error
          setAcceptedProposal(null)
        }

        // Show toast only for regenerate (long async operation); refine response is shown in chat
        if (response.intent === 'regenerate') {
          toast.success('Regeneration Started', {
            description: 'AI is regenerating the content. A new version will appear shortly.',
          })
        }

        return response
      } catch (error) {
        // Don't show error toast for aborted requests
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }

        toast.error('Chat Failed', {
          description:
            error instanceof Error ? error.message : 'Could not send message. Please try again.',
        })
        throw error
      } finally {
        // Always clean up the controller reference
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
        // Only reset state if component is still mounted
        if (isMountedRef.current) {
          setIsRefining(false)
        }
      }
    },
    [courseId, conversationId]
  )

  return {
    refine,
    isRefining,
    cancel,
    conversationId,
    chatHistory,
    clearConversation,
    latestProposal,
    isApplying,
    acceptProposal,
    proposalError,
    retryProposal,
    rejectProposal,
    acceptedProposal,
  }
}
