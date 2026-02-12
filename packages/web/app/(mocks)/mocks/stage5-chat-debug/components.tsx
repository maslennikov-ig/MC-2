'use client'

import React, { useState } from 'react'
import dynamic from 'next/dynamic'

// Load ReactDiffViewer only on client side
const ReactDiffViewer = dynamic(() => import('react-diff-viewer-continued'), {
  ssr: false,
  loading: () => <div className="p-4 text-center text-gray-500">Loading diff viewer...</div>,
})
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

// ============================================================================
// DiagnosticLog
// ============================================================================

export interface LogEntry {
  timestamp: string
  type: 'request' | 'response' | 'apply' | 'error' | 'info'
  label: string
  data?: unknown
}

interface DiagnosticLogProps {
  entries: LogEntry[]
  onClear?: () => void
}

const LOG_TYPE_COLORS: Record<LogEntry['type'], string> = {
  request: 'bg-blue-100 text-blue-800 border-blue-200',
  response: 'bg-green-100 text-green-800 border-green-200',
  apply: 'bg-purple-100 text-purple-800 border-purple-200',
  error: 'bg-red-100 text-red-800 border-red-200',
  info: 'bg-gray-100 text-gray-800 border-gray-200',
}

export function DiagnosticLog({ entries, onClear }: DiagnosticLogProps) {
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set())

  const toggleExpand = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b bg-gray-50 p-2">
        <h3 className="text-sm font-semibold">Diagnostic Log</h3>
        {onClear && (
          <Button size="sm" variant="outline" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      <ScrollArea className="h-[400px]">
        <div className="space-y-1 p-2">
          {entries.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">No entries yet</div>
          ) : (
            entries.map((entry, index) => {
              const isExpanded = expandedIndices.has(index)
              const hasData = entry.data !== undefined

              return (
                <div key={index} className="border-b pb-1 last:border-b-0">
                  <div
                    className={cn(
                      'flex cursor-pointer items-start gap-2 rounded p-1 text-xs hover:bg-gray-50',
                      hasData && 'cursor-pointer'
                    )}
                    onClick={hasData ? () => toggleExpand(index) : undefined}
                  >
                    {hasData && (
                      <div className="pt-0.5">
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-gray-400" />
                        )}
                      </div>
                    )}
                    <span className="font-mono whitespace-nowrap text-gray-500">
                      {entry.timestamp}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn('px-1.5 py-0 text-xs', LOG_TYPE_COLORS[entry.type])}
                    >
                      {entry.type}
                    </Badge>
                    <span className="flex-1">{entry.label}</span>
                  </div>
                  {hasData && isExpanded && (
                    <pre className="mt-1 ml-6 overflow-x-auto rounded border bg-gray-50 p-2 font-mono text-xs">
                      {JSON.stringify(entry.data, null, 2)}
                    </pre>
                  )}
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ============================================================================
// BeforeAfterDiff
// ============================================================================

interface BeforeAfterDiffProps {
  before: unknown
  after: unknown
  isLoading?: boolean
  onRefresh?: () => void
}

export function BeforeAfterDiff({ before, after, isLoading, onRefresh }: BeforeAfterDiffProps) {
  const beforeJSON = before ? JSON.stringify(before, null, 2) : ''
  const afterJSON = after ? JSON.stringify(after, null, 2) : ''

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b bg-gray-50 p-2">
        <h3 className="text-sm font-semibold">Before / After Diff</h3>
        {onRefresh && (
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Loading...
              </>
            ) : (
              'Refresh After'
            )}
          </Button>
        )}
      </div>
      <div className="max-h-[500px] overflow-auto">
        {!before && !after ? (
          <div className="p-4 text-center text-sm text-gray-500">No data available</div>
        ) : (
          <ReactDiffViewer
            oldValue={beforeJSON}
            newValue={afterJSON}
            splitView={true}
            useDarkTheme={false}
            leftTitle="Before"
            rightTitle="After"
            showDiffOnly={false}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// RawResponseViewer
// ============================================================================

interface RawResponseViewerProps {
  response: {
    conversationId?: string
    assistantMessage?: string
    intent?: string
    proposal?: unknown
    modelUsed?: string
    inputTokens?: number
    outputTokens?: number
  } | null
}

// Helper to detect JSON content (raw or markdown-wrapped)
function isJSONContent(content: string): boolean {
  const trimmed = content.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('```json') || trimmed.startsWith('```\n{')
}

export function RawResponseViewer({ response }: RawResponseViewerProps) {
  const [isProposalExpanded, setIsProposalExpanded] = useState(false)

  if (!response) {
    return (
      <div className="rounded-lg border p-4">
        <h3 className="mb-2 text-sm font-semibold">Raw Response</h3>
        <div className="text-sm text-gray-500">No response yet</div>
      </div>
    )
  }

  const {
    conversationId,
    assistantMessage,
    intent,
    proposal,
    modelUsed,
    inputTokens,
    outputTokens,
  } = response

  const trimmedMessage = assistantMessage?.trim() || ''
  const isJSON = assistantMessage ? isJSONContent(assistantMessage) : false

  return (
    <div className="rounded-lg border">
      <div className="border-b bg-gray-50 p-2">
        <h3 className="text-sm font-semibold">Raw Response</h3>
      </div>
      <div className="space-y-3 p-4">
        {/* Model & Tokens */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Model:</span>{' '}
            {modelUsed ? (
              <Badge variant="outline" className="ml-1">
                {modelUsed}
              </Badge>
            ) : (
              <span className="text-gray-400">N/A</span>
            )}
          </div>
          <div>
            <span className="text-gray-600">Tokens:</span>{' '}
            <span className="font-mono text-xs">
              {inputTokens ?? '?'} in / {outputTokens ?? '?'} out
            </span>
          </div>
        </div>

        {/* Intent */}
        <div className="text-sm">
          <span className="text-gray-600">Intent:</span>{' '}
          {intent ? (
            <Badge variant="outline" className="ml-1">
              {intent}
            </Badge>
          ) : (
            <span className="text-gray-400">N/A</span>
          )}
        </div>

        {/* Conversation ID */}
        {conversationId && typeof conversationId === 'string' ? (
          <div className="text-sm">
            <span className="text-gray-600">Conversation ID:</span>{' '}
            <span className="font-mono text-xs">{conversationId}</span>
          </div>
        ) : null}

        {/* Assistant Message */}
        <div className="text-sm">
          <div className="mb-1 text-gray-600">Assistant Message:</div>
          <div className="max-h-[200px] overflow-auto rounded border bg-gray-50 p-2">
            <pre className="font-mono text-xs whitespace-pre-wrap">
              {assistantMessage || '(empty)'}
            </pre>
          </div>
          <div className="mt-1 space-x-3 text-xs text-gray-500">
            <span>
              Trimmed length: <code className="font-mono">{trimmedMessage.length}</code>
            </span>
            <span>
              isJSONContent(): <code className="font-mono">{String(isJSON)}</code>
            </span>
          </div>
        </div>

        {/* Proposal */}
        {proposal ? (
          <div className="text-sm">
            <Collapsible open={isProposalExpanded} onOpenChange={setIsProposalExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  <span>Proposal (click to expand)</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform',
                      isProposalExpanded && 'rotate-180'
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="max-h-[300px] overflow-auto rounded border bg-gray-50 p-2">
                  <pre className="font-mono text-xs">{JSON.stringify(proposal, null, 2)}</pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ============================================================================
// TestScenarioButtons
// ============================================================================

interface TestScenarioButtonsProps {
  onSend: (message: string, intent: 'refine' | 'regenerate') => void
  disabled?: boolean
}

interface TestScenario {
  message: string
  intent: 'refine' | 'regenerate'
  description: string
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    message: 'Измени название курса на "Тестовый курс"',
    intent: 'refine',
    description: 'Simple top-level field change',
  },
  {
    message: 'Измени название первого урока в первом модуле на "Тестовый урок"',
    intent: 'refine',
    description: 'Array path: modules[0].lessons[0].title',
  },
  {
    message: 'Добавь ключевую тему "AI" в первый урок',
    intent: 'refine',
    description: 'Nested array value addition',
  },
  {
    message: 'Сколько уроков в курсе?',
    intent: 'refine',
    description: 'Info query — no proposal expected',
  },
  {
    message: 'Перегенерируй структуру курса',
    intent: 'regenerate',
    description: 'Regenerate intent',
  },
]

export function TestScenarioButtons({ onSend, disabled }: TestScenarioButtonsProps) {
  return (
    <div className="rounded-lg border">
      <div className="border-b bg-gray-50 p-2">
        <h3 className="text-sm font-semibold">Test Scenarios</h3>
      </div>
      <div className="space-y-2 p-4">
        {TEST_SCENARIOS.map((scenario, index) => (
          <div key={index} className="rounded border p-2 hover:bg-gray-50">
            <Button
              variant="outline"
              size="sm"
              className="mb-1 w-full justify-start text-left"
              onClick={() => onSend(scenario.message, scenario.intent)}
              disabled={disabled}
            >
              <Badge variant="outline" className="mr-2 shrink-0">
                {scenario.intent}
              </Badge>
              <span className="flex-1 truncate">{scenario.message}</span>
            </Button>
            <div className="ml-1 text-xs text-gray-500">{scenario.description}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
