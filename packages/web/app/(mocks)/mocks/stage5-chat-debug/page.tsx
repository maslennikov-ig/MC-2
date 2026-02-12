'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { useTheme } from 'next-themes'
import { RefinementChat } from '@/components/generation-graph/panels/RefinementChat'
import { useRefinement } from '@/components/generation-graph/hooks/useRefinement'
import { fetchCourseStructureAdmin, fetchRecentCourses } from '@/app/actions/refinement'
import type { ChatResponse } from '@megacampus/shared-types/chat-types'
import {
  DiagnosticLog,
  BeforeAfterDiff,
  RawResponseViewer,
  TestScenarioButtons,
  type LogEntry,
} from './components'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Info } from 'lucide-react'
import { toast } from 'sonner'

// Minimal messages for next-intl context (hardcoded to avoid SSR issues)
const messages = {
  generation: {
    refinementChat: {
      panelTitle: 'Refinement Chat',
      placeholder: 'Enter your message...',
      send: 'Send',
      thinking: 'Thinking...',
      modes: {
        refine: 'Refine',
        regenerate: 'Regenerate',
        selectModeRequired: 'Select a mode',
        modeSelectionLabel: 'Select mode',
        refineAriaLabel: 'Refine mode',
        regenerateAriaLabel: 'Regenerate mode',
        refineTooltip: 'Small edits',
        regenerateTooltip: 'Full regeneration',
      },
      quickActions: {
        shorter: 'Shorter',
        moreExamples: 'More examples',
        moreDetail: 'More detail',
        simplify: 'Simplify',
      },
      proposal: {
        suggestedChanges: 'Suggested Changes',
        showDetails: 'Show details ({count})',
        retry: 'Retry',
        applying: 'Applying...',
        accept: 'Accept',
        supplement: 'Add more',
        reject: 'Reject',
        changesApplied: 'Changes applied',
        appliedMessage: '✅ Applied ({count})',
        applyError: 'Error applying',
        errorMessage: '❌ Error: {error}',
        rejectedMessage: '❌ Rejected',
        regenerationStarted: 'Regeneration started',
        regenerationStartedDesc: 'Processing...',
        chatFailed: 'Chat failed',
        chatFailedDesc: 'Try again',
        emptyResponseFallback: 'See proposal below',
      },
    },
  },
}

interface RecentCourse {
  id: string
  title: string
  generationCode: string
  generationStatus: string
  sectionsCount: number
  lessonsCount: number
  createdAt: string
}

interface CourseInfo {
  title: string
  sectionsCount: number
  lessonsCount: number
}

/**
 * Outer wrapper: provides NextIntlClientProvider context,
 * then renders ChatDebugContent inside it so useTranslations works.
 */
export default function Stage5ChatDebugPage() {
  const [isMounted, setIsMounted] = useState(false)
  const { theme, setTheme } = useTheme()
  const prevThemeRef = useRef<string | undefined>(undefined)

  // Force light theme for this debug page via next-themes API
  useEffect(() => {
    setIsMounted(true)
    prevThemeRef.current = theme
    setTheme('light')
    return () => {
      if (prevThemeRef.current) {
        setTheme(prevThemeRef.current)
      }
    }
  }, [])

  if (!isMounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <NextIntlClientProvider locale="ru" messages={messages}>
      <ChatDebugContent />
    </NextIntlClientProvider>
  )
}

/**
 * Inner component: all hooks (including useRefinement which calls useTranslations)
 * are called inside NextIntlClientProvider context.
 */
// eslint-disable-next-line max-lines-per-function -- debug page, refactoring not warranted
function ChatDebugContent() {
  const [recentCourses, setRecentCourses] = useState<RecentCourse[]>([])
  const [isLoadingList, setIsLoadingList] = useState(false)
  const [courseId, setCourseId] = useState('')
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null)
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null)
  const [isLoadingCourse, setIsLoadingCourse] = useState(false)
  const [structureBefore, setStructureBefore] = useState<unknown>(null)
  const [structureAfter, setStructureAfter] = useState<unknown>(null)
  const [isLoadingAfter, setIsLoadingAfter] = useState(false)
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const [lastResponse, setLastResponse] = useState<ChatResponse | null>(null)

  // useRefinement calls useTranslations — safe here inside NextIntlClientProvider
  const {
    refine,
    isRefining,
    chatHistory,
    latestProposal,
    isApplying,
    acceptProposal: acceptProposalHook,
    proposalError,
    retryProposal,
    rejectProposal,
    acceptedProposal,
  } = useRefinement(activeCourseId || '')

  const addLog = useCallback((entry: LogEntry) => {
    setLogEntries((prev) => [...prev, entry])
  }, [])

  // Load course structure
  const loadCourse = useCallback(async () => {
    if (!courseId.trim()) {
      toast.error('Please enter a course ID')
      return
    }

    setIsLoadingCourse(true)
    addLog({
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      label: `Loading course ${courseId}...`,
    })

    try {
      const result = await fetchCourseStructureAdmin(courseId.trim())

      if (!result) {
        toast.error('Course not found or access denied')
        addLog({
          timestamp: new Date().toLocaleTimeString(),
          type: 'error',
          label: 'Failed to load course: not found or access denied',
        })
        return
      }

      setCourseInfo({
        title: result.title,
        sectionsCount: result.sectionsCount,
        lessonsCount: result.lessonsCount,
      })
      setStructureBefore(result.courseStructure)
      setActiveCourseId(courseId.trim())

      addLog({
        timestamp: new Date().toLocaleTimeString(),
        type: 'info',
        label: `Course loaded: ${result.title}`,
        data: {
          sectionsCount: result.sectionsCount,
          lessonsCount: result.lessonsCount,
        },
      })

      toast.success(`Course loaded: ${result.title}`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to load course: ${errorMsg}`)
      addLog({
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        label: `Failed to load course: ${errorMsg}`,
        data: error,
      })
    } finally {
      setIsLoadingCourse(false)
    }
  }, [courseId, addLog])

  // Refresh "After" state
  const refreshAfter = useCallback(async () => {
    if (!activeCourseId) return

    setIsLoadingAfter(true)
    addLog({
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      label: 'Refreshing After state...',
    })

    try {
      const result = await fetchCourseStructureAdmin(activeCourseId)

      if (result) {
        setStructureAfter(result.courseStructure)
        addLog({
          timestamp: new Date().toLocaleTimeString(),
          type: 'info',
          label: 'After state refreshed',
        })
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      addLog({
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        label: `Failed to refresh After state: ${errorMsg}`,
      })
    } finally {
      setIsLoadingAfter(false)
    }
  }, [activeCourseId, addLog])

  // Handle refine wrapper — logs and captures response
  const handleRefine = useCallback(
    async (message: string, intent: 'refine' | 'regenerate') => {
      const now = new Date().toLocaleTimeString()
      addLog({
        timestamp: now,
        type: 'request',
        label: `Sending: "${message}" [${intent}]`,
        data: { message, intent, courseId: activeCourseId },
      })

      try {
        const response = await refine(
          'stage_5',
          'stage_5',
          message,
          JSON.stringify(structureBefore || {}),
          intent
        )

        if (response) {
          addLog({
            timestamp: new Date().toLocaleTimeString(),
            type: 'response',
            label: `Response from ${response.modelUsed || 'unknown model'}`,
            data: response,
          })
          setLastResponse(response)
        }
      } catch (error) {
        addLog({
          timestamp: new Date().toLocaleTimeString(),
          type: 'error',
          label: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
          data: error,
        })
      }
    },
    [activeCourseId, refine, structureBefore, addLog]
  )

  // Accept proposal wrapper — refreshes after state
  const handleAcceptProposal = useCallback(async () => {
    addLog({
      timestamp: new Date().toLocaleTimeString(),
      type: 'apply',
      label: 'Applying proposal...',
      data: latestProposal,
    })

    await acceptProposalHook()

    addLog({
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      label: 'Proposal applied, refreshing After state...',
    })
    await refreshAfter()
  }, [acceptProposalHook, latestProposal, addLog, refreshAfter])

  const handleTestScenarioSend = useCallback(
    (message: string, intent: 'refine' | 'regenerate') => {
      void handleRefine(message, intent)
    },
    [handleRefine]
  )

  const clearLog = useCallback(() => {
    setLogEntries([])
  }, [])

  // Load recent courses on mount
  useEffect(() => {
    setIsLoadingList(true)
    fetchRecentCourses()
      .then((courses) => {
        setRecentCourses(courses)
        if (courses.length > 0) {
          setCourseId(courses[0].id)
        }
      })
      .catch(() => {
        // silently fail — user can still enter ID manually
      })
      .finally(() => setIsLoadingList(false))
  }, [])

  // Listen for CourseDataUpdatedEvent to auto-refresh After state
  useEffect(() => {
    const handleCourseUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ courseId: string }>
      if (customEvent.detail?.courseId === activeCourseId) {
        addLog({
          timestamp: new Date().toLocaleTimeString(),
          type: 'info',
          label: 'CourseDataUpdatedEvent received, auto-refreshing After state...',
        })
        void refreshAfter()
      }
    }

    window.addEventListener('CourseDataUpdated', handleCourseUpdate)
    return () => window.removeEventListener('CourseDataUpdated', handleCourseUpdate)
  }, [activeCourseId, refreshAfter, addLog])

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-[1800px] space-y-6">
        {/* Header */}
        <div className="rounded-lg border bg-white p-4">
          <h1 className="mb-4 text-2xl font-bold">Stage 5 Chat Debug</h1>

          {/* Course Loader */}
          <div className="flex flex-col gap-3">
            {/* Row 1: Recent courses selector */}
            <div className="flex items-center gap-2">
              <Select
                value={courseId}
                onValueChange={(value) => setCourseId(value)}
                disabled={isLoadingList}
              >
                <SelectTrigger className="max-w-lg">
                  <SelectValue
                    placeholder={isLoadingList ? 'Loading courses...' : 'Select a recent course'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {recentCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="text-muted-foreground mr-2 font-mono text-xs">
                        {c.generationCode}
                      </span>
                      <span className="truncate">{c.title}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        ({c.sectionsCount}s / {c.lessonsCount}l)
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => void loadCourse()} disabled={isLoadingCourse || !courseId}>
                {isLoadingCourse ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load'
                )}
              </Button>
            </div>

            {/* Row 2: Manual UUID input */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Or enter Course ID (UUID) manually"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="max-w-lg font-mono text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void loadCourse()
                  }
                }}
              />
              {courseInfo && (
                <div className="ml-2 flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">{courseInfo.title}</span>
                  <Badge variant="outline">
                    {courseInfo.sectionsCount} sections, {courseInfo.lessonsCount} lessons
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>

        {!activeCourseId ? (
          <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
            Load a course first to start testing the chat
          </div>
        ) : (
          <>
            {/* Main Content: Chat + Right Sidebar */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[60%_40%]">
              {/* Left: RefinementChat */}
              <div className="rounded-lg border bg-white p-4">
                <RefinementChat
                  courseId={activeCourseId}
                  stageId="stage_5"
                  nodeId="stage_5"
                  attemptNumber={1}
                  onRefine={handleRefine}
                  history={chatHistory}
                  isProcessing={isRefining}
                  latestProposal={latestProposal}
                  isApplying={isApplying}
                  onAcceptProposal={() => void handleAcceptProposal()}
                  proposalError={proposalError}
                  onRetryProposal={() => void retryProposal()}
                  onRejectProposal={rejectProposal}
                  acceptedProposal={acceptedProposal}
                />
              </div>

              {/* Right: Test Scenarios + Raw Response */}
              <div className="space-y-4">
                <TestScenarioButtons onSend={handleTestScenarioSend} disabled={isRefining} />
                <RawResponseViewer response={lastResponse} />
              </div>
            </div>

            {/* Bottom: Diagnostic Log */}
            <DiagnosticLog entries={logEntries} onClear={clearLog} />

            {/* Bottom: Before/After Diff */}
            <BeforeAfterDiff
              before={structureBefore}
              after={structureAfter}
              isLoading={isLoadingAfter}
              onRefresh={() => void refreshAfter()}
            />
          </>
        )}
      </div>
    </div>
  )
}
