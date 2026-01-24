'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { MarkdownRendererClient } from '@/components/markdown/MarkdownRendererClient'
import { toast } from '@/lib/toast'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

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
}

interface TokenEstimates {
  refine: {
    tokens: number
    formatted: string
  }
  regenerate: {
    tokens: number
    formatted: string
  }
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

export function GlobalCourseChat({
  courseId,
  isGenerating = false,
  onRegenerationRequest,
}: GlobalCourseChatProps) {
  const t = useTranslations('generation.globalChat')

  // Quick action buttons with i18n
  const quickActions = [
    {
      id: 'add-practice',
      label: t('quickActions.addPractice.label'),
      icon: Plus,
      prompt: t('quickActions.addPractice.prompt'),
    },
    {
      id: 'simplify',
      label: t('quickActions.simplify.label'),
      icon: Scissors,
      prompt: t('quickActions.simplify.prompt'),
    },
  ]

  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [selectedIntent, setSelectedIntent] = useState<'refine' | 'regenerate'>('refine')
  const [tokenEstimates, setTokenEstimates] = useState<TokenEstimates | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  // Fetch token estimates on mount
  useEffect(() => {
    if (!courseId) return

    const fetchTokenEstimates = async () => {
      try {
        const response = await fetch(
          `/api/trpc/generation.getChatTokenEstimates?input=${encodeURIComponent(JSON.stringify({ json: { courseId } }))}`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }
        )

        if (!response.ok) {
          throw new Error('Failed to fetch token estimates')
        }

        const data = await response.json()
        const result = data?.result?.data

        if (result) {
          setTokenEstimates(result)
        }
      } catch (error) {
        // Silent fail - will use fallback values in UI
        console.warn('Failed to fetch token estimates:', error)
      }
    }

    void fetchTokenEstimates()
  }, [courseId])

  const sendMessage = useCallback(
    async (messageText: string, intent: 'refine' | 'regenerate' = selectedIntent) => {
      if (!messageText.trim() || isProcessing) return

      setIsProcessing(true)

      // Create unique ID for tracking
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      const userMessage: ChatMessage = {
        id: tempId, // Add ID
        role: 'user',
        content: messageText,
        timestamp: new Date().toISOString(),
      }
      setChatHistory((prev) => [...prev, userMessage])
      setMessage('')

      try {
        const response = await fetch('/api/trpc/generation.chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            json: {
              courseId,
              chatType: 'global',
              userMessage: messageText,
              conversationId,
              intent,
            },
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to send message')
        }

        const data = await response.json()
        const result = data?.result?.data

        if (result) {
          setConversationId(result.conversationId)

          const assistantMessage: ChatMessage = {
            id: `msg-${Date.now()}`, // Add ID
            role: 'assistant',
            content: result.assistantMessage,
            timestamp: new Date().toISOString(),
            intent: result.intent,
          }
          setChatHistory((prev) => [...prev, assistantMessage])

          // If regeneration intent detected, trigger callback
          if (result.intent === 'regenerate' && onRegenerationRequest) {
            toast.info(t('regenerationTriggered'), {
              description: t('preparingRegeneration'),
            })
            onRegenerationRequest()
          }
        }
      } catch {
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
        setIsProcessing(false)
      }
    },
    [courseId, conversationId, isProcessing, onRegenerationRequest, selectedIntent, t]
  )

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    void sendMessage(message, selectedIntent)
  }

  const handleQuickAction = (actionPrompt: string) => {
    void sendMessage(actionPrompt, selectedIntent)
  }

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
        <div className="flex max-h-[400px] flex-col border-t">
          {/* Chat history */}
          <ScrollArea className="min-h-[200px] flex-1 p-4">
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
              value={selectedIntent}
              onValueChange={(value) =>
                value && setSelectedIntent(value as 'refine' | 'regenerate')
              }
              className="justify-start"
              disabled={isProcessing}
            >
              <ToggleGroupItem value="refine" aria-label="Refine mode" className="text-xs">
                <Wand2 className="mr-1 h-3 w-3" />
                {t('modes.refine')} ({tokenEstimates?.refine?.formatted ?? '~2K'})
              </ToggleGroupItem>
              <ToggleGroupItem value="regenerate" aria-label="Regenerate mode" className="text-xs">
                <RefreshCcw className="mr-1 h-3 w-3" />
                {t('modes.regenerate')} ({tokenEstimates?.regenerate?.formatted ?? '~20K+'})
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
                onClick={() => handleQuickAction(action.prompt)}
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
              className="min-h-[60px] flex-1 resize-none"
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
              className="h-[60px] w-[60px]"
              disabled={!message.trim() || isProcessing || isGenerating}
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
    </div>
  )
}
