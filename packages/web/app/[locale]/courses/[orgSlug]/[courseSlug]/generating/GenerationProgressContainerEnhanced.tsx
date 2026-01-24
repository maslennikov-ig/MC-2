'use client'

import { useEffect, useReducer, useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link } from '@/src/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { buildCourseUrl } from '@/lib/helpers/course-urls'
import {
  GenerationProgress,
  GenerationStep,
  CourseStatus,
  ProgressState,
  ProgressAction,
} from '@/types/course-generation'
import { GraphViewWrapper } from '@/components/generation-graph'
import {
  cancelGeneration,
  pauseGeneration,
  resumeGeneration,
  switchToManualMode,
  startGeneration,
} from '@/app/actions/admin-generation'
import type { Stage1CourseData } from '@/components/generation-graph'
import { GlobalCourseChat, ChatErrorBoundary } from '@/components/generation'

/** Default fallback when lessons count is unknown (before Stage 4 analysis completes) */
const DEFAULT_LESSONS_COUNT = 5

interface GenerationProgressContainerProps {
  courseId: string
  orgSlug: string
  courseSlug: string
  initialProgress: GenerationProgress
  initialStatus: CourseStatus
  courseTitle: string
  onComplete?: (courseId: string) => void
  onError?: (error: Error) => void
  showDebugInfo?: boolean
  autoRedirect?: boolean
  redirectDelay?: number
  userRole?: string | null
  failedAtStage?: number | null
  generationCode?: string | null
  stage1CourseData?: Stage1CourseData
  generationMode?: 'automatic' | 'semi_automatic' | null
  generationPausedAt?: string | null
}

const STORAGE_KEY_PREFIX = 'course-generation-'
const STORAGE_KEY_STATE = (courseId: string) => `${STORAGE_KEY_PREFIX}${courseId}-state`
const STORAGE_KEY_TIMESTAMP = (courseId: string) => `${STORAGE_KEY_PREFIX}${courseId}-timestamp`

type EnhancedProgressAction =
  | ProgressAction
  | { type: 'RESTORE_STATE'; payload: ProgressState }
  | { type: 'INCREMENT_RETRY'; payload: { stepIndex: number } }

interface EnhancedProgressState extends ProgressState {
  stepRetryCount: Map<number, number>
}

function enhancedProgressReducer(
  state: EnhancedProgressState,
  action: EnhancedProgressAction
): EnhancedProgressState {
  switch (action.type) {
    case 'UPDATE_PROGRESS':
      return {
        ...state,
        progress: action.payload,
        activityLog: [
          ...state.activityLog,
          {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            type: 'info',
            message: action.payload.message,
          },
        ],
      }
    case 'SET_STATUS':
      return { ...state, status: action.payload }
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        activityLog: action.payload
          ? [
              ...state.activityLog,
              {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                type: 'error',
                message: action.payload.message,
              },
            ]
          : state.activityLog,
      }
    case 'SET_CONNECTED':
      return { ...state, isConnected: action.payload }
    case 'ADD_ACTIVITY':
      return { ...state, activityLog: [...state.activityLog, action.payload] }
    case 'RETRY_STEP':
      return { ...state, retryAttempts: state.retryAttempts + 1 }
    case 'UPDATE_ESTIMATE':
      return { ...state, estimatedTime: action.payload }
    case 'CHANGE_TAB':
      return { ...state, activeTab: action.payload }
    case 'RESTORE_STATE':
      return action.payload as EnhancedProgressState
    case 'INCREMENT_RETRY':
      const newRetryCount = new Map(state.stepRetryCount)
      const currentCount = newRetryCount.get(action.payload.stepIndex) || 0
      newRetryCount.set(action.payload.stepIndex, currentCount + 1)
      return { ...state, stepRetryCount: newRetryCount }
    default:
      return state
  }
}

export default function GenerationProgressContainerEnhanced({
  courseId,
  orgSlug,
  courseSlug,
  initialProgress,
  initialStatus,
  courseTitle,
  onComplete,
  onError,
  showDebugInfo: _showDebugInfo = false,
  autoRedirect = false,
  redirectDelay = 3000,
  userRole: _userRole = null,
  failedAtStage,
  generationCode,
  stage1CourseData,
  generationMode = null,
  generationPausedAt = null,
}: GenerationProgressContainerProps) {
  const router = useRouter()
  const t = useTranslations('generation.success')
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null)
  const pollingInterval = useRef<NodeJS.Timeout | null>(null)
  const redirectTimeout = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5

  const statusRef = useRef<CourseStatus>(initialStatus)
  const isPausedRef = useRef(!!generationPausedAt)

  const lastSaveTime = useRef(0)
  const pendingSave = useRef<NodeJS.Timeout | null>(null)
  const SAVE_THROTTLE_MS = 2000

  const stateRef = useRef<EnhancedProgressState | null>(null)

  const lastKnownModulesTotal = useRef<number | undefined>(initialProgress.modules_total)
  const lastKnownLessonsTotal = useRef<number>(
    initialProgress.lessons_total || DEFAULT_LESSONS_COUNT
  )

  const getInitialState = (): EnhancedProgressState => {
    if (typeof window !== 'undefined') {
      const storedState = sessionStorage.getItem(STORAGE_KEY_STATE(courseId))
      const storedTimestamp = sessionStorage.getItem(STORAGE_KEY_TIMESTAMP(courseId))

      if (storedState && storedTimestamp) {
        const timestamp = new Date(storedTimestamp)
        const now = new Date()
        const ageMinutes = (now.getTime() - timestamp.getTime()) / (1000 * 60)

        if (ageMinutes < 30) {
          try {
            const parsed = JSON.parse(storedState)
            parsed.stepRetryCount = new Map(parsed.stepRetryCount || [])
            const mergedProgress = {
              ...parsed.progress,
              modules_total: initialProgress.modules_total ?? parsed.progress?.modules_total,
              lessons_total:
                initialProgress.lessons_total ??
                parsed.progress?.lessons_total ??
                DEFAULT_LESSONS_COUNT,
            }
            return { ...parsed, progress: mergedProgress, status: initialStatus }
          } catch {
            // Use fresh state
          }
        }
      }
    }

    return {
      progress: initialProgress,
      status: initialStatus,
      error: null,
      isConnected: false,
      activeTab: 'overview',
      activityLog: [
        { id: '1', timestamp: new Date(), type: 'info', message: 'Course generation started' },
      ],
      retryAttempts: 0,
      estimatedTime: 180,
      stepRetryCount: new Map(),
    }
  }

  const [state, dispatch] = useReducer(enhancedProgressReducer, null, getInitialState)
  const [showSuccess, setShowSuccess] = useState(false)
  const hasTriggeredConfetti = useRef(false)
  const [isPausedLocal, setIsPausedLocal] = useState(!!generationPausedAt)

  useEffect(() => {
    statusRef.current = state.status
  }, [state.status])
  useEffect(() => {
    isPausedRef.current = isPausedLocal
  }, [isPausedLocal])
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const pauseRequestRef = useRef(0)
  const resumeRequestRef = useRef(0)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSupabase(createClient())
    }
  }, [])

  const autoStartTriggered = useRef(false)
  useEffect(() => {
    if (autoStartTriggered.current) return
    const shouldAutoStart =
      generationMode === 'automatic' && initialStatus === 'pending' && !generationPausedAt
    if (shouldAutoStart) {
      autoStartTriggered.current = true
      startGeneration(courseId).catch((error) => {
        console.error('[AutoStart] Failed:', error)
        autoStartTriggered.current = false
      })
    }
  }, [courseId, generationMode, initialStatus, generationPausedAt])

  const saveStateToStorage = useCallback(() => {
    if (typeof window === 'undefined') return
    const now = Date.now()
    if (pendingSave.current) clearTimeout(pendingSave.current)
    const doSave = () => {
      const stateToSave = { ...state, stepRetryCount: Array.from(state.stepRetryCount.entries()) }
      sessionStorage.setItem(STORAGE_KEY_STATE(courseId), JSON.stringify(stateToSave))
      sessionStorage.setItem(STORAGE_KEY_TIMESTAMP(courseId), new Date().toISOString())
      lastSaveTime.current = Date.now()
    }
    if (now - lastSaveTime.current >= SAVE_THROTTLE_MS) doSave()
    else pendingSave.current = setTimeout(doSave, SAVE_THROTTLE_MS)
  }, [state, courseId])

  useEffect(() => {
    saveStateToStorage()
  }, [state.progress, state.status, state.error, saveStateToStorage])

  useEffect(() => {
    return () => {
      if (pendingSave.current && stateRef.current) {
        clearTimeout(pendingSave.current)
        const stateToSave = {
          ...stateRef.current,
          stepRetryCount: Array.from(stateRef.current.stepRetryCount.entries()),
        }
        sessionStorage.setItem(STORAGE_KEY_STATE(courseId), JSON.stringify(stateToSave))
        sessionStorage.setItem(STORAGE_KEY_TIMESTAMP(courseId), new Date().toISOString())
      }
    }
  }, [courseId])

  const handlePause = useCallback(async () => {
    if (isPausedLocal) {
      toast.warning('Генерация уже приостановлена')
      return
    }
    const terminalStatuses = ['completed', 'failed', 'cancelled']
    if (terminalStatuses.includes(state.status as string)) {
      toast.warning('Генерация уже завершена')
      return
    }
    const requestId = ++pauseRequestRef.current
    setIsPausedLocal(true)
    try {
      await pauseGeneration(courseId)
      toast.info('Генерация приостановлена.')
    } catch (error) {
      if (requestId === pauseRequestRef.current) setIsPausedLocal(false)
      toast.error('Не удалось приостановить генерацию')
      console.error(error)
    }
  }, [courseId, isPausedLocal, state.status])

  const handleResume = useCallback(async () => {
    if (!isPausedLocal) {
      toast.warning('Генерация не приостановлена')
      return
    }
    const requestId = ++resumeRequestRef.current
    setIsPausedLocal(false)
    try {
      await resumeGeneration(courseId)
      toast.success('Генерация продолжена')
    } catch (error) {
      if (requestId === resumeRequestRef.current) setIsPausedLocal(true)
      toast.error('Не удалось продолжить генерацию')
      console.error(error)
    }
  }, [courseId, isPausedLocal])

  const handleCancel = useCallback(async () => {
    if (!confirm('Вы уверены, что хотите отменить генерацию?')) return
    try {
      await cancelGeneration(courseId)
      toast.info('Генерация отменена')
    } catch (error) {
      toast.error('Не удалось отменить генерацию')
      console.error(error)
    }
  }, [courseId])

  const handleSwitchToManual = useCallback(async () => {
    try {
      const data = await switchToManualMode(courseId)
      toast.success(data?.message || 'Переключено в ручной режим')
    } catch (error) {
      toast.error('Не удалось переключить в ручной режим')
      console.error(error)
    }
  }, [courseId])

  const calculateEstimatedTime = useCallback((progress: GenerationProgress) => {
    const avgStepTime = 30
    const remainingSteps = progress.total_steps - progress.current_step
    return Math.max(10, remainingSteps * avgStepTime)
  }, [])

  const handleProgressUpdate = useCallback(
    (course: {
      generation_progress?: unknown
      status?: string | null
      generation_status?: string | null
      error_message?: string | null
      analysis_result?: unknown
      generation_paused_at?: string | null
    }) => {
      if ('generation_paused_at' in course) {
        const newIsPaused = course.generation_paused_at !== null
        if (newIsPaused !== isPausedRef.current) setIsPausedLocal(newIsPaused)
      }
      if (course.generation_progress && typeof course.generation_progress === 'object') {
        const progress = course.generation_progress as Record<string, unknown>
        let modulesTotal: number | undefined = (progress.modules_total as number) || undefined
        let lessonsTotal: number =
          (progress.lessons_total as number) || lastKnownLessonsTotal.current
        if (course.analysis_result && typeof course.analysis_result === 'object') {
          const ar = course.analysis_result as {
            recommended_structure?: { total_sections?: number; total_lessons?: number }
          }
          if (ar.recommended_structure) {
            if (ar.recommended_structure.total_sections)
              modulesTotal = ar.recommended_structure.total_sections
            if (ar.recommended_structure.total_lessons)
              lessonsTotal = ar.recommended_structure.total_lessons
          }
        }
        if (modulesTotal === undefined && lastKnownModulesTotal.current !== undefined)
          modulesTotal = lastKnownModulesTotal.current
        if (
          lessonsTotal === DEFAULT_LESSONS_COUNT &&
          lastKnownLessonsTotal.current > DEFAULT_LESSONS_COUNT
        )
          lessonsTotal = lastKnownLessonsTotal.current
        if (modulesTotal !== undefined) lastKnownModulesTotal.current = modulesTotal
        if (lessonsTotal > DEFAULT_LESSONS_COUNT) lastKnownLessonsTotal.current = lessonsTotal

        const generationProgress: GenerationProgress = {
          steps: (progress.steps as GenerationStep[]) || [],
          message: (progress.message as string) || 'Processing...',
          percentage: (progress.percentage as number) || 0,
          current_step: (progress.current_step as number) || 0,
          total_steps: (progress.total_steps as number) || 6,
          has_documents:
            progress.has_documents !== undefined ? (progress.has_documents as boolean) : false,
          lessons_completed: (progress.lessons_completed as number) || 0,
          lessons_total: lessonsTotal,
          modules_total: modulesTotal,
          started_at: progress.started_at
            ? new Date(progress.started_at as string | number)
            : new Date(),
          current_stage: (progress.current_stage as string) || null,
          document_size: (progress.document_size as number) || null,
          estimated_completion: progress.estimated_completion
            ? new Date(progress.estimated_completion as string | number)
            : undefined,
        }
        dispatch({ type: 'UPDATE_PROGRESS', payload: generationProgress })
        dispatch({ type: 'UPDATE_ESTIMATE', payload: calculateEstimatedTime(generationProgress) })
        const failedStep = generationProgress.steps.find((s) => s.status === 'failed')
        if (failedStep) toast.error(`Step failed: ${failedStep.name}. You can retry it.`)
      }
      if (course.generation_status && course.generation_status !== statusRef.current) {
        dispatch({ type: 'SET_STATUS', payload: course.generation_status as CourseStatus })
        if (course.generation_status === 'completed') {
          dispatch({
            type: 'ADD_ACTIVITY',
            payload: {
              id: crypto.randomUUID(),
              timestamp: new Date(),
              type: 'success',
              message: 'Course generation completed!',
            },
          })
          if (pendingSave.current) {
            clearTimeout(pendingSave.current)
            pendingSave.current = null
          }
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem(STORAGE_KEY_STATE(courseId))
            sessionStorage.removeItem(STORAGE_KEY_TIMESTAMP(courseId))
          }
          if (!hasTriggeredConfetti.current) {
            hasTriggeredConfetti.current = true
            setShowSuccess(true)
            triggerConfetti()
            toast.success('Course generated successfully!')
          }
          onComplete?.(courseId)
          if (autoRedirect)
            redirectTimeout.current = setTimeout(
              () => router.push(buildCourseUrl(orgSlug, courseSlug)),
              redirectDelay
            )
        }
        if (course.generation_status === 'failed') {
          const error = new Error(course.error_message || 'Course generation failed')
          dispatch({ type: 'SET_ERROR', payload: error })
          toast.error('Course generation failed.')
          onError?.(error)
        }
      }
    },
    [
      courseId,
      orgSlug,
      courseSlug,
      router,
      autoRedirect,
      redirectDelay,
      onComplete,
      onError,
      calculateEstimatedTime,
    ]
  )

  const handleProgressUpdateRef = useRef(handleProgressUpdate)
  useEffect(() => {
    handleProgressUpdateRef.current = handleProgressUpdate
  }, [handleProgressUpdate])

  const startPolling = useCallback(() => {
    const poll = async () => {
      if (!supabase) return
      try {
        const { data, error } = await supabase
          .from('courses')
          .select('*')
          .eq('id', courseId)
          .single()
        if (!error && data) {
          handleProgressUpdateRef.current(data)
          reconnectAttempts.current = 0
        } else if (error) {
          reconnectAttempts.current++
          if (reconnectAttempts.current >= maxReconnectAttempts)
            toast.warning('Connection issues. Retrying...')
        }
      } catch {
        reconnectAttempts.current++
      }
    }
    const baseInterval = 3000
    const interval = Math.min(baseInterval * Math.pow(2, reconnectAttempts.current), 30000)
    pollingInterval.current = setInterval(() => void poll(), interval)
  }, [courseId, supabase])

  const stopPolling = useCallback(() => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current)
      pollingInterval.current = null
    }
  }, [])

  useEffect(() => {
    if (!supabase) return
    let channel: ReturnType<typeof supabase.channel> | null = null
    let reconnectTimeout: NodeJS.Timeout | undefined
    const setupSubscription = async () => {
      try {
        channel = supabase
          .channel(`course-progress-${courseId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'courses', filter: `id=eq.${courseId}` },
            (payload) => {
              if (payload.new) handleProgressUpdateRef.current(payload.new)
            }
          )
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              dispatch({ type: 'SET_CONNECTED', payload: true })
              stopPolling()
              reconnectAttempts.current = 0
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              dispatch({ type: 'SET_CONNECTED', payload: false })
              startPolling()
              reconnectTimeout = setTimeout(() => {
                if (channel && supabase) supabase.removeChannel(channel)
                void setupSubscription()
              }, 5000)
            }
          })
      } catch {
        dispatch({ type: 'SET_CONNECTED', payload: false })
        startPolling()
      }
    }
    void setupSubscription()
    return () => {
      if (channel && supabase) {
        channel.unsubscribe()
        supabase.removeChannel(channel)
      }
      stopPolling()
      if (redirectTimeout.current) clearTimeout(redirectTimeout.current)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
    }
  }, [courseId, supabase, startPolling, stopPolling])

  useEffect(() => {
    if (!supabase) return
    let isMounted = true
    const handleVisibilityChange = () => {
      if (!isMounted) return
      if (document.visibilityState === 'visible') {
        void (async () => {
          try {
            const { data, error } = await supabase
              .from('courses')
              .select('*')
              .eq('id', courseId)
              .single()
            if (!error && data && isMounted) handleProgressUpdateRef.current(data)
          } catch {
            /* polling handles it */
          }
        })()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      isMounted = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [courseId, supabase])

  const confettiInterval = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    return () => {
      if (confettiInterval.current) clearInterval(confettiInterval.current)
    }
  }, [])

  const triggerConfetti = () => {
    const duration = 3000
    const animationEnd = Date.now() + duration
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 }
    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min
    if (confettiInterval.current) clearInterval(confettiInterval.current)
    confettiInterval.current = setInterval(() => {
      const timeLeft = animationEnd - Date.now()
      if (timeLeft <= 0) {
        clearInterval(confettiInterval.current!)
        confettiInterval.current = null
        return
      }
      const particleCount = 25 * (timeLeft / duration)
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981'],
      })
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981'],
      })
    }, 500)
  }

  const courseUrl = buildCourseUrl(orgSlug, courseSlug)

  return (
    <div className="relative h-screen w-full">
      <GraphViewWrapper
        courseId={courseId}
        courseTitle={courseTitle}
        hasDocuments={state.progress?.has_documents}
        failedAtStage={failedAtStage}
        progressPercentage={state.progress?.percentage}
        generationCode={generationCode}
        stage1CourseData={stage1CourseData}
        generationProgress={state.progress}
        generationStatus={state.status}
        isRealtimeConnected={state.isConnected}
        readOnly={generationMode === 'automatic'}
        isPaused={isPausedLocal}
        onPause={handlePause}
        onResume={handleResume}
        onCancelGeneration={handleCancel}
        onSwitchToManual={handleSwitchToManual}
      />
      <ChatErrorBoundary>
        <GlobalCourseChat
          courseId={courseId}
          isGenerating={
            state.status !== 'completed' &&
            state.status !== 'failed' &&
            state.status !== 'cancelled' &&
            state.status !== 'pending' &&
            !state.status?.includes('awaiting_approval') &&
            !state.status?.includes('_complete')
          }
        />
      </ChatErrorBoundary>
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 10 }}
              className="relative rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-gray-800"
            >
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8"
                onClick={() => setShowSuccess(false)}
              >
                <X className="h-4 w-4" />
              </Button>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 }}
                className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30"
              >
                <svg
                  className="checkmark-animation h-12 w-12 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </motion.div>
              <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {t('title')}
              </h3>
              <p className="mb-6 text-gray-600 dark:text-gray-400">{t('message')}</p>
              <Button asChild>
                <Link href={courseUrl} target="_blank" rel="noopener noreferrer">
                  {t('viewCourse')}
                </Link>
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
