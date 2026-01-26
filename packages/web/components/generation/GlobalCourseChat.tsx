'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  MessageSquare,
  ChevronUp,
  ChevronDown,
  Send,
  Loader2,
  Sparkles,
  RefreshCcw,
  Scissors,
  Plus,
  Wand2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { nanoid } from 'nanoid'
import { MarkdownRendererClient } from '@/components/markdown/MarkdownRendererClient'
import { toast } from '@/lib/toast'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { sendChatMessage, getChatTokenEstimates, TokenEstimates } from '@/app/actions/refinement'

interface ChatMessage {
  id?: string // Add optional ID for tracking
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  intent?: 'refine' | 'regenerate'
}

interface GlobalCourseChatProps {
  courseId: string
  courseTitle?: string
  isGenerating?: boolean
  onRegenerationRequest?: () => void
  /** Current generation stage number. Chat is hidden on Stage 3 (document prioritization). */
  currentStage?: number | null
}

// ============================================================================
// Layout Constants
// ============================================================================

/**
 * Chat panel styling constants.
 * Extracted for maintainability and documentation.
 *
 * Note: These values are mirrored in Tailwind classes below for performance.
 * When changing values, update both the constant AND the corresponding Tailwind class:
 * - PANEL_MAX_HEIGHT: 400 → max-h-[400px]
 * - HISTORY_MIN_HEIGHT: 200 → min-h-[200px]
 * - SEND_BUTTON_SIZE: 60 → h-[60px] w-[60px]
 * - INPUT_MIN_HEIGHT: 60 → min-h-[60px]
 * - MESSAGE_MAX_WIDTH: 85 → max-w-[85%]
 */
const CHAT_LAYOUT = {
  /** Maximum height of expanded chat panel (px) - Tailwind: max-h-[400px] */
  PANEL_MAX_HEIGHT: 400,
  /** Minimum height of chat history area (px) - Tailwind: min-h-[200px] */
  HISTORY_MIN_HEIGHT: 200,
  /** Size of send button (px) - Tailwind: h-[60px] w-[60px] */
  SEND_BUTTON_SIZE: 60,
  /** Minimum height of message input (px) - Tailwind: min-h-[60px] */
  INPUT_MIN_HEIGHT: 60,
  /** Maximum width of message bubbles (%) - Tailwind: max-w-[85%] */
  MESSAGE_MAX_WIDTH: 85,
  /** Delay before focusing input after panel opens (ms) - allows for CSS transition */
  FOCUS_DELAY_MS: 300,
} as const

/**
 * Generate unique ID for chat messages.
 * Uses nanoid for better collision resistance.
 *
 * @param prefix - 'temp' for pending user messages, 'msg' for confirmed messages
 */
function generateMessageId(prefix: 'temp' | 'msg'): string {
  return `${prefix}-${nanoid(12)}`
}

export function GlobalCourseChat({
  courseId,
  isGenerating = false,
  onRegenerationRequest,
  currentStage,
}: GlobalCourseChatProps) {
  const t = useTranslations('generation.globalChat')

  // Quick action buttons with i18n
  const quickActions = [
    {
      id: 'add-practice',
      label: t('quickActions.addPractice.label'),
      icon: Plus,
      prompt: t('quickActions.addPractice.prompt'),
      intent: 'refine' as const,
    },
    {
      id: 'simplify',
      label: t('quickActions.simplify.label'),
      icon: Scissors,
      prompt: t('quickActions.simplify.prompt'),
      intent: 'refine' as const,
    },
  ]

  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [selectedIntent, setSelectedIntent] = useState<'refine' | 'regenerate' | null>(null)
  const [tokenEstimates, setTokenEstimates] = useState<TokenEstimates | null>(null)
  const [isLoadingEstimates, setIsLoadingEstimates] = useState(true)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current && chatHistory.length > 0) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [chatHistory])

  // Focus textarea when opening
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), CHAT_LAYOUT.FOCUS_DELAY_MS)
    }
  }, [isOpen])

  // Fetch token estimates on mount using server action
  useEffect(() => {
    if (!courseId) return

    const fetchEstimates = async () => {
      setIsLoadingEstimates(true)
      try {
        const result = await getChatTokenEstimates(courseId)
        if (result) {
          setTokenEstimates(result)
        }
      } finally {
        setIsLoadingEstimates(false)
      }
    }

    void fetchEstimates()
  }, [courseId])

  // Cleanup: abort any pending request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const sendMessage = useCallback(
    async (messageText: string, intent: 'refine' | 'regenerate' | null = selectedIntent) => {
      if (!messageText.trim() || isProcessing) return

      // Validate intent is selected
      if (!intent) {
        toast.warning(t('selectModeRequired'))
        return
      }

      // Abort any previous request
      abortControllerRef.current?.abort()

      // Create new controller for this request
      const controller = new AbortController()
      abortControllerRef.current = controller

      setIsProcessing(true)

      // Create unique ID for tracking
      const tempId = generateMessageId('temp')

      const userMessage: ChatMessage = {
        id: tempId,
        role: 'user',
        content: messageText,
        timestamp: new Date().toISOString(),
      }
      setChatHistory((prev) => [...prev, userMessage])
      setMessage('')

      try {
        // Use server action with proper auth headers
        const result = await sendChatMessage(
          {
            courseId,
            chatType: 'global',
            userMessage: messageText,
            conversationId,
            intent,
          },
          controller.signal
        )

        // Check if aborted before processing result
        if (controller.signal.aborted) return

        setConversationId(result.conversationId)

        const assistantMessage: ChatMessage = {
          id: generateMessageId('msg'),
          role: 'assistant',
          content: result.assistantMessage,
          timestamp: new Date().toISOString(),
          intent: result.intent,
        }
        setChatHistory((prev) => [...prev, assistantMessage])

        // If regeneration intent detected, show confirmation dialog
        if (result.intent === 'regenerate') {
          setShowRegenerateConfirm(true)
        }
      } catch (error) {
        // Ignore AbortError - request was intentionally cancelled
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        toast.error(t('error'), {
          description: t('errorDescription'),
        })
        // Remove pending message by ID with additional safety check
        setChatHistory((prev) => {
          // If the pending message is still the last one, remove it safely
          if (prev.length > 0 && prev[prev.length - 1].id === tempId) {
            return prev.slice(0, -1)
          }
          // Fallback: filter by ID if message position changed
          return prev.filter((msg) => msg.id !== tempId)
        })
      } finally {
        // Only update state if this is still the active request
        if (abortControllerRef.current === controller) {
          setIsProcessing(false)
        }
      }
    },
    [courseId, conversationId, isProcessing, onRegenerationRequest, selectedIntent, t]
  )

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    void sendMessage(message, selectedIntent)
  }

  const handleQuickAction = useCallback(
    (actionPrompt: string, intent: 'refine' | 'regenerate' = 'refine') => {
      setSelectedIntent(intent)
      void sendMessage(actionPrompt, intent)
    },
    [sendMessage]
  )

  // Show chat only on Stages 4, 5, 6 (after document prioritization) — must be after all hooks
  if (!currentStage || currentStage < 4) return null

  return (
    <div className="bg-background fixed right-0 bottom-0 left-0 z-40 border-t shadow-lg">
      {/* Collapsed header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="hover:bg-accent/50 flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary h-4 w-4" />
          <span>{t('title')}</span>
          {chatHistory.length > 0 && (
            <span className="text-muted-foreground text-xs">
              ({t('messageCount', { count: chatHistory.length })})
            </span>
          )}
        </div>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>

      {/* Expanded panel */}
      {isOpen && (
        <div className="flex flex-col border-t" style={{ maxHeight: CHAT_LAYOUT.PANEL_MAX_HEIGHT }}>
          {/* Chat history */}
          <ScrollArea className="flex-1 p-4" style={{ minHeight: CHAT_LAYOUT.HISTORY_MIN_HEIGHT }}>
            {chatHistory.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center">
                <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p>{t('emptyState')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {chatHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex w-full flex-col gap-1',
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-lg px-3 py-2',
                        msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      )}
                    >
                      {msg.role === 'assistant' ? (
                        <MarkdownRendererClient content={msg.content} preset="chat" />
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                    </div>
                    <span className="text-muted-foreground text-[10px]">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}

                {isProcessing && (
                  <div className="text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">{t('thinking')}</span>
                  </div>
                )}

                <div ref={scrollRef} />
              </div>
            )}
          </ScrollArea>

          {/* Intent mode toggle */}
          <div className="flex items-center gap-2 border-t px-4 py-2">
            <ToggleGroup
              type="single"
              value={selectedIntent ?? ''}
              onValueChange={(value) => {
                if (value === 'refine' || value === 'regenerate') {
                  setSelectedIntent(value)
                }
              }}
              className="justify-start"
              disabled={isProcessing}
              aria-label={t('modes.modeSelectionLabel')}
            >
              <ToggleGroupItem
                value="refine"
                aria-label={t('modes.refineAriaLabel')}
                className="text-xs"
              >
                <Wand2 className="mr-1 h-3 w-3" />
                {t('modes.refine')} (
                <span className="inline-block min-w-[3ch] text-center">
                  {isLoadingEstimates ? (
                    <Loader2 className="inline h-3 w-3 animate-spin" />
                  ) : (
                    (tokenEstimates?.refine?.formatted ?? '~2K')
                  )}
                </span>
                )
              </ToggleGroupItem>
              <ToggleGroupItem
                value="regenerate"
                aria-label={t('modes.regenerateAriaLabel')}
                className="text-xs"
              >
                <RefreshCcw className="mr-1 h-3 w-3" />
                {t('modes.regenerate')} (
                <span className="inline-block min-w-[4ch] text-center">
                  {isLoadingEstimates ? (
                    <Loader2 className="inline h-3 w-3 animate-spin" />
                  ) : (
                    (tokenEstimates?.regenerate?.formatted ?? '~20K+')
                  )}
                </span>
                )
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 border-t px-4 py-2">
            {quickActions.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                onClick={() => handleQuickAction(action.prompt, action.intent)}
                disabled={isProcessing || isGenerating}
                className="text-xs"
              >
                <action.icon className="mr-1 h-3 w-3" />
                {action.label}
              </Button>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex gap-2 border-t p-4 pt-2">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('placeholder')}
              className="flex-1 resize-none"
              style={{ minHeight: CHAT_LAYOUT.INPUT_MIN_HEIGHT }}
              disabled={isProcessing || isGenerating}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              style={{
                height: CHAT_LAYOUT.SEND_BUTTON_SIZE,
                width: CHAT_LAYOUT.SEND_BUTTON_SIZE,
              }}
              disabled={!message.trim() || isProcessing || isGenerating || !selectedIntent}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      )}

      <AlertDialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('regenerateConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('regenerateConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowRegenerateConfirm(false)
                onRegenerationRequest?.()
              }}
            >
              {t('startRegeneration')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
