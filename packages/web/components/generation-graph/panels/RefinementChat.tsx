import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { usePrevious } from '@/lib/hooks/use-previous'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  Wand2,
  RefreshCcw,
  Check,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { QuickActions, type ChatIntent } from './QuickActions'
import { MarkdownRendererClient } from '@/components/markdown'
import { toast } from '@/lib/toast'
import { Proposal } from '@megacampus/shared-types/chat-types'
import { type ChatMessage } from '../hooks/useRefinement'

interface RefinementChatProps {
  courseId: string
  stageId: string
  nodeId?: string
  attemptNumber: number
  onRefine: (message: string, intent: 'refine' | 'regenerate') => Promise<void> | void
  history?: ChatMessage[]
  isProcessing?: boolean
  latestProposal?: Proposal | null
  isApplying?: boolean
  onAcceptProposal?: () => void
  proposalError?: string | null
  onRetryProposal?: () => void
  onRejectProposal?: () => void
  acceptedProposal?: Proposal | null
  selectedIntent?: ChatIntent | null
  /** Whether course generation is currently active (blocks chat interaction) */
  isGenerating?: boolean
  /** Message to display when chat is blocked due to generation */
  blockedMessage?: string
}

// Helper to safely format timestamp
const formatTime = (timestamp: string): string => {
  const date = new Date(timestamp)
  return isNaN(date.getTime()) ? '' : date.toLocaleTimeString()
}

// Helper to detect JSON content (raw or markdown-wrapped)
function isJSONContent(content: string): boolean {
  const trimmed = content.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('```json') || trimmed.startsWith('```\n{')
}

export const RefinementChat: React.FC<RefinementChatProps> = ({
  onRefine,
  history = [],
  isProcessing = false,
  latestProposal,
  isApplying = false,
  onAcceptProposal,
  proposalError,
  onRetryProposal,
  onRejectProposal,
  acceptedProposal,
  selectedIntent: externalSelectedIntent,
  isGenerating = false,
  blockedMessage,
}) => {
  const t = useTranslations('generation')
  // Expanded by default (FR-022), with localStorage persistence
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      const saved = localStorage.getItem('refinementChat.isOpen')
      return saved !== null ? JSON.parse(saved) : true
    } catch {
      // Corrupted localStorage value, use default
      return true
    }
  })
  const [message, setMessage] = useState('')
  const [selectedIntent, setSelectedIntent] = useState<ChatIntent | null>('refine')
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prevHistoryLen = usePrevious(history.length)

  // Combine history with pending messages for display
  const displayHistory = useMemo(() => {
    return [...(history || []), ...pendingMessages]
  }, [history, pendingMessages])

  // Clear pending messages when history grows (server confirmed messages)
  useEffect(() => {
    if (
      prevHistoryLen !== undefined &&
      history.length > prevHistoryLen &&
      pendingMessages.length > 0
    ) {
      setPendingMessages([])
    }
  }, [history.length, prevHistoryLen, pendingMessages.length])

  // Scroll to bottom on new messages (only within chat container, not page scroll)
  useEffect(() => {
    if (scrollRef.current && displayHistory.length > 0) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [displayHistory])

  // Persist isOpen preference in localStorage
  useEffect(() => {
    try {
      localStorage.setItem('refinementChat.isOpen', JSON.stringify(isOpen))
    } catch {
      // Ignore localStorage errors (quota exceeded, private mode, etc.)
    }
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

  // Combined blocking state: blocked when either processing a message OR generation is active
  const isBlocked = isProcessing || isGenerating

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      if (!message.trim() || isBlocked) return

      // Validate intent is selected
      if (!selectedIntent) {
        toast.warning(t('refinementChat.modes.selectModeRequired'))
        return
      }

      const pendingMsg: ChatMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
        pending: true,
      }

      // Add to pending immediately for optimistic update
      setPendingMessages((prev) => [...prev, pendingMsg])
      const messageToSend = message
      setMessage('')

      try {
        await onRefine(messageToSend, selectedIntent)
      } catch {
        // Remove pending message on error
        setPendingMessages((prev) => prev.filter((m) => m !== pendingMsg))
        // Error toast is shown by useRefinement hook
      }
    },
    [message, isBlocked, selectedIntent, onRefine, t]
  )

  const handleQuickAction = useCallback(
    async (actionText: string, intent: ChatIntent) => {
      setSelectedIntent(intent)
      setMessage(actionText)

      const pendingMsg: ChatMessage = {
        role: 'user',
        content: actionText,
        timestamp: new Date().toISOString(),
        pending: true,
      }

      // Send immediately
      // Add to pending for optimistic update
      setPendingMessages((prev) => [...prev, pendingMsg])

      try {
        await onRefine(actionText, intent)
      } catch {
        // Remove pending message on error
        setPendingMessages((prev) => prev.filter((m) => m !== pendingMsg))
        // Error toast is shown by useRefinement hook
      }
    },
    [onRefine]
  )

  // Wrap onAcceptProposal to prevent double-toast
  const handleAcceptProposal = useCallback(() => {
    try {
      onAcceptProposal?.()
    } catch {
      // Error toast already shown by useRefinement hook, don't show again
      console.error('Failed to accept proposal')
    }
  }, [onAcceptProposal])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when chat is open
      if (!isOpen) return

      // Ctrl/Cmd + Enter to submit
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === 'Enter' &&
        !isBlocked &&
        message.trim() &&
        selectedIntent
      ) {
        e.preventDefault()
        void handleSubmit()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isBlocked, message, selectedIntent, handleSubmit])

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
                    {msg.role === 'system' ? (
                      <div
                        className={cn(
                          'max-w-[90%] rounded-lg px-3 py-2 text-sm',
                          msg.content.startsWith('✅')
                            ? 'border border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200'
                            : 'border border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
                        )}
                      >
                        {msg.content}
                      </div>
                    ) : (
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
                            content={
                              msg.content?.trim() && !isJSONContent(msg.content)
                                ? msg.content
                                : t('refinementChat.proposal.emptyResponseFallback')
                            }
                            preset="chat"
                            isStreaming={msg.pending || false}
                          />
                        ) : (
                          <span className="whitespace-pre-wrap">{msg.content}</span>
                        )}
                      </div>
                    )}
                    <span className="text-muted-foreground text-[10px]">
                      {formatTime(msg.timestamp)}
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
              <TooltipProvider delayDuration={300}>
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
                  disabled={isBlocked}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem
                        value="refine"
                        aria-label={t('refinementChat.modes.refineAriaLabel')}
                        className="h-8 text-xs"
                      >
                        <Wand2 className="mr-1 h-3 w-3" />
                        {t('refinementChat.modes.refine')} (~2K)
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="max-w-[200px] text-xs">
                        {t('refinementChat.modes.refineTooltip')}
                      </p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem
                        value="regenerate"
                        aria-label={t('refinementChat.modes.regenerateAriaLabel')}
                        className="h-8 text-xs"
                      >
                        <RefreshCcw className="mr-1 h-3 w-3" />
                        {t('refinementChat.modes.regenerate')} (~20K)
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="max-w-[200px] text-xs">
                        {t('refinementChat.modes.regenerateTooltip')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </ToggleGroup>
              </TooltipProvider>
            </div>
            <QuickActions
              onSelect={(text, intent) => void handleQuickAction(text, intent)}
              disabled={isBlocked}
            />

            {/* Loading skeleton while waiting for proposal */}
            {isProcessing &&
              (selectedIntent === 'refine' || externalSelectedIntent === 'refine') && (
                <div className="mt-4 animate-pulse rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                  <div className="h-4 w-48 rounded bg-gray-300 dark:bg-gray-600" />
                  <div className="mt-3 space-y-2">
                    <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <div className="h-9 w-24 rounded bg-gray-300 dark:bg-gray-600" />
                    <div className="h-9 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-9 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
              )}

            {latestProposal && (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                <h4 className="mb-2 font-medium text-blue-900 dark:text-blue-100">
                  {t('refinementChat.proposal.suggestedChanges')}
                </h4>

                {latestProposal.type === 'field_updates' && (
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="mb-2 -ml-2">
                        <ChevronDown className="mr-2 h-4 w-4" />
                        {t('refinementChat.proposal.showDetails', {
                          count: latestProposal.updates.length,
                        })}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="mb-3 space-y-2 text-sm">
                        {latestProposal.updates.map((u, i) => (
                          <li
                            key={i}
                            className="rounded border border-blue-200 bg-white p-2 dark:border-blue-700 dark:bg-blue-900/30"
                          >
                            <code className="block text-xs font-medium text-blue-800 dark:text-blue-200">
                              {u.path}
                            </code>
                            {u.oldValue !== undefined && (
                              <pre className="mt-1 max-h-20 overflow-auto text-xs text-red-600 line-through dark:text-red-400">
                                {JSON.stringify(u.oldValue, null, 2).slice(0, 200)}
                              </pre>
                            )}
                            <pre className="mt-1 max-h-20 overflow-auto text-xs text-green-600 dark:text-green-400">
                              {JSON.stringify(u.newValue, null, 2).slice(0, 200)}
                            </pre>
                            {u.description && (
                              <p className="mt-1 text-xs text-gray-500">{u.description}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {latestProposal.type === 'lesson_patch' && (
                  <pre className="mb-3 max-h-32 overflow-auto rounded bg-blue-100 p-2 text-xs dark:bg-blue-800">
                    {latestProposal.diffSummary}
                  </pre>
                )}

                {/* Error with retry button */}
                {proposalError && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <span>{proposalError}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void onRetryProposal?.()}
                      className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300"
                    >
                      <RefreshCcw className="mr-1 h-3 w-3" />
                      {t('refinementChat.proposal.retry')}
                    </Button>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={handleAcceptProposal}
                    disabled={isApplying}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isApplying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('refinementChat.proposal.applying')}
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        {t('refinementChat.proposal.accept')}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => textareaRef.current?.focus()}
                    disabled={isApplying}
                  >
                    {t('refinementChat.proposal.supplement')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={onRejectProposal}
                    disabled={isApplying}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="mr-2 h-4 w-4" />
                    {t('refinementChat.proposal.reject')}
                  </Button>
                </div>
              </div>
            )}

            {/* Accepted proposal confirmation (read-only, shown after proposal was applied) */}
            {/* Show accepted proposal (green box) only when no new proposal pending (blue box) */}
            {!latestProposal && acceptedProposal && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50/50 p-4 opacity-80 dark:border-green-800 dark:bg-green-900/10">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-green-800 dark:text-green-200">
                  <Check className="h-4 w-4" />
                  {t('refinementChat.proposal.changesApplied')}
                </h4>

                {acceptedProposal.type === 'field_updates' && (
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="mb-2 -ml-2">
                        <ChevronDown className="mr-2 h-4 w-4" />
                        {t('refinementChat.proposal.showDetails', {
                          count: acceptedProposal.updates.length,
                        })}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="mb-3 space-y-2 text-sm">
                        {acceptedProposal.updates.map((u, i) => (
                          <li
                            key={i}
                            className="rounded border border-green-200 bg-white p-2 dark:border-green-700 dark:bg-green-900/30"
                          >
                            <code className="block text-xs font-medium text-green-800 dark:text-green-200">
                              {u.path}
                            </code>
                            {u.oldValue !== undefined && (
                              <pre className="mt-1 max-h-20 overflow-auto text-xs text-red-600 line-through dark:text-red-400">
                                {JSON.stringify(u.oldValue, null, 2).slice(0, 200)}
                              </pre>
                            )}
                            <pre className="mt-1 max-h-20 overflow-auto text-xs text-green-600 dark:text-green-400">
                              {JSON.stringify(u.newValue, null, 2).slice(0, 200)}
                            </pre>
                            {u.description && (
                              <p className="mt-1 text-xs text-gray-500">{u.description}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {acceptedProposal.type === 'lesson_patch' && (
                  <pre className="max-h-32 overflow-auto rounded bg-green-100 p-2 text-xs dark:bg-green-800">
                    {acceptedProposal.diffSummary}
                  </pre>
                )}
              </div>
            )}

            {/* Blocked message when generation is active */}
            {isGenerating && blockedMessage && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                {blockedMessage}
              </div>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={`${t('refinementChat.placeholder')} (Ctrl+Enter)`}
                className="min-h-[80px] resize-none"
                disabled={isBlocked}
                data-testid="refinement-input"
              />
              <Button
                type="submit"
                size="icon"
                className="h-[80px] w-[50px]"
                disabled={!message.trim() || isBlocked || !selectedIntent}
                data-testid="refinement-submit"
                title={t('refinementChat.send')}
              >
                {isBlocked ? (
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
