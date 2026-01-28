import { useState, useCallback, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { ChatRequest, ChatResponse, Proposal } from '@megacampus/shared-types/chat-types'
import { sendChatMessage, applyProposal as applyProposalAction } from '@/app/actions/refinement'

interface ChatMessage {
  role: 'user' | 'assistant'
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
      toast.success('Изменения применены')

      // Emit event for data refetch
      window.dispatchEvent(
        new CustomEvent('course-data-updated', {
          detail: { courseId, proposalType: previousProposal.type },
        })
      )
    } catch (error) {
      // Rollback on error
      setLatestProposal(previousProposal)
      const errorMsg = error instanceof Error ? error.message : 'Ошибка применения изменений'
      setProposalError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setIsApplying(false)
    }
  }, [courseId, conversationId, latestProposal])

  const retryProposal = useCallback(async () => {
    setProposalError(null)
    await acceptProposal()
  }, [acceptProposal])

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

        const response = await sendChatMessage(request, controller.signal)

        // Check if aborted after response or component unmounted - ignore result
        if (controller.signal.aborted || !isMountedRef.current) return

        // Only update state if request wasn't aborted and component is mounted
        if (!controller.signal.aborted && isMountedRef.current) {
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
          }

          // Show appropriate toast based on intent
          if (response.intent === 'regenerate') {
            toast.success('Regeneration Started', {
              description: 'AI is regenerating the content. A new version will appear shortly.',
            })
          } else {
            toast.success('Refinement Applied', {
              description: response.assistantMessage,
            })
          }
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
  }
}
