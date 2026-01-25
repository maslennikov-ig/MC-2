import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  Wand2,
  RefreshCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/generation-graph/useTranslation'
import { QuickActions, type ChatIntent } from './QuickActions'
import { MarkdownRendererClient } from '@/components/markdown'
import { toast } from '@/lib/toast'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  pending?: boolean
}

interface RefinementChatProps {
  courseId: string
  stageId: string
  nodeId?: string
  attemptNumber: number
  onRefine: (message: string, intent: 'refine' | 'regenerate') => void
  history?: ChatMessage[]
  isProcessing?: boolean
}

export const RefinementChat: React.FC<RefinementChatProps> = ({
  onRefine,
  history = [],
  isProcessing = false,
}) => {
  const { t } = useTranslation()
  // Expanded by default (FR-022), with localStorage persistence
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem('refinementChat.isOpen')
    return saved !== null ? JSON.parse(saved) : true
  })
  const [message, setMessage] = useState('')
  const [selectedIntent, setSelectedIntent] = useState<ChatIntent | null>(null)
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Combine history with pending messages for display
  const displayHistory = useMemo(() => {
    return [...(history || []), ...pendingMessages]
  }, [history, pendingMessages])

  // Clear pending messages when history updates (message was processed)
  useEffect(() => {
    if (history && history.length > 0 && pendingMessages.length > 0) {
      // Check if the last history message matches our pending user message
      const lastHistoryMsg = history[history.length - 1]
      const lastPendingMsg = pendingMessages[pendingMessages.length - 1]

      if (
        lastHistoryMsg &&
        lastPendingMsg &&
        lastHistoryMsg.role === 'user' &&
        lastPendingMsg.role === 'user'
      ) {
        // Clear pending messages as they've been confirmed
        setPendingMessages([])
      }
    }
  }, [history, pendingMessages])

  // Scroll to bottom on new messages (only within chat container, not page scroll)
  useEffect(() => {
    if (scrollRef.current && displayHistory.length > 0) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [displayHistory])

  // Persist isOpen preference in localStorage
  useEffect(() => {
    localStorage.setItem('refinementChat.isOpen', JSON.stringify(isOpen))
  }, [isOpen])

  // Auto-focus textarea when chat opens (FR-022)
  useEffect(() => {
    if (!isOpen || !textareaRef.current) return

    // Small delay to ensure DOM is rendered after animation
    const timer = setTimeout(() => {
      textareaRef.current?.focus()
    }, 300)

    return () => clearTimeout(timer)
  }, [isOpen])

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!message.trim() || isProcessing) return

    // Validate intent is selected
    if (!selectedIntent) {
      toast.warning(t('refinementChat.modes.selectModeRequired'))
      return
    }

    // Add to pending immediately for optimistic update
    setPendingMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
        pending: true,
      },
    ])

    onRefine(message, selectedIntent)
    setMessage('')
  }

  const handleQuickAction = useCallback(
    (actionText: string, intent: ChatIntent) => {
      setSelectedIntent(intent)
      setMessage(actionText)

      // Send immediately (consistent with GlobalCourseChat behavior)
      // Add to pending for optimistic update
      setPendingMessages((prev) => [
        ...prev,
        {
          role: 'user',
          content: actionText,
          timestamp: new Date().toISOString(),
          pending: true,
        },
      ])
      onRefine(actionText, intent)
    },
    [onRefine]
  )

  return (
    <div className="bg-card mt-6 rounded-md border" data-testid="refinement-chat">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="hover:bg-accent/50 flex w-full items-center justify-between p-4 text-sm font-medium transition-colors"
        data-testid="refinement-chat-toggle"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="text-primary h-4 w-4" />
          <span>{t('refinementChat.panelTitle')}</span>
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {isOpen && (
        <div className="border-t p-4 pt-0">
          {displayHistory.length > 0 && (
            <ScrollArea className="bg-muted/20 mb-4 h-[250px] rounded-md border p-2 pr-4">
              <div className="space-y-4">
                {displayHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex w-full flex-col gap-1 text-sm',
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[90%] rounded-lg px-3 py-2',
                        msg.role === 'user'
                          ? 'bg-blue-500 text-white'
                          : 'border-border border bg-gray-100 dark:bg-gray-800',
                        msg.pending && 'opacity-60'
                      )}
                    >
                      {msg.role === 'assistant' ? (
                        <MarkdownRendererClient
                          content={msg.content}
                          preset="chat"
                          isStreaming={msg.pending || false}
                        />
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                    </div>
                    <span className="text-muted-foreground text-[10px]">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}

                {/* Thinking indicator when processing */}
                {isProcessing && (
                  <div className="flex w-full flex-col items-start gap-1 text-sm">
                    <div className="border-border rounded-lg border bg-gray-100 px-3 py-2 dark:bg-gray-800">
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="text-xs italic">{t('refinementChat.thinking')}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Invisible element to scroll to */}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>
          )}

          <div className="space-y-3">
            <div className="mb-3 flex items-center gap-2">
              <ToggleGroup
                type="single"
                value={selectedIntent ?? ''}
                onValueChange={(value) => {
                  if (value === 'refine' || value === 'regenerate') {
                    setSelectedIntent(value)
                  }
                }}
                aria-label={t('refinementChat.modes.modeSelectionLabel')}
                className="justify-start"
                disabled={isProcessing}
              >
                <ToggleGroupItem
                  value="refine"
                  aria-label={t('refinementChat.modes.refineAriaLabel')}
                  className="h-8 text-xs"
                >
                  <Wand2 className="mr-1 h-3 w-3" />
                  {t('refinementChat.modes.refine')} (~2K)
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="regenerate"
                  aria-label={t('refinementChat.modes.regenerateAriaLabel')}
                  className="h-8 text-xs"
                >
                  <RefreshCcw className="mr-1 h-3 w-3" />
                  {t('refinementChat.modes.regenerate')} (~20K)
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <QuickActions onSelect={handleQuickAction} disabled={isProcessing} />

            <form onSubmit={handleSubmit} className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('refinementChat.placeholder')}
                className="min-h-[80px] resize-none"
                disabled={isProcessing}
                data-testid="refinement-input"
              />
              <Button
                type="submit"
                size="icon"
                className="h-[80px] w-[50px]"
                disabled={!message.trim() || isProcessing || !selectedIntent}
                data-testid="refinement-submit"
                title={t('refinementChat.send')}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
