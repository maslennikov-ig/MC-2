import { useState, useCallback, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { ChatRequest, ChatResponse } from '@megacampus/shared-types/chat-types'
import { sendChatMessage } from '@/app/actions/refinement'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export const useRefinement = (courseId: string) => {
  const [isRefining, setIsRefining] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)

  // Cleanup: abort pending requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
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
  }, [])

  const refine = useCallback(
    async (
      stageId: string,
      nodeId: string | undefined,
      _attemptNumber: number,
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

        // Only update state if request wasn't aborted
        if (!controller.signal.aborted) {
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
        // Only reset state if this is still the current controller
        if (abortControllerRef.current === controller) {
          setIsRefining(false)
          abortControllerRef.current = null
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
  }
}
