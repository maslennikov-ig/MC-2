'use client'

import { useEffect, useReducer, useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link } from '@/src/i18n/navigation'
// import { useTheme } from 'next-themes'; // DISABLED: MissionControlBanner moved to GraphView
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import {
  GenerationProgress,
  GenerationStep,
  CourseStatus,
  ProgressState,
  ProgressAction,
} from '@/types/course-generation'
// DISABLED: MissionControlBanner handlers moved to GraphView
// import { approveStage, cancelGeneration, startGeneration } from '@/app/actions/admin-generation';
import { GraphViewWrapper } from '@/components/generation-graph'
import {
  cancelGeneration,
  switchToManualMode,
  startGeneration,
} from '@/app/actions/admin-generation'

// Celestial Design Imports - SpaceBackground REMOVED: GraphView takes full screen now
// MissionControlBanner - DISABLED: Now rendered inside GraphView
// StageResultsDrawer - DISABLED: Replaced by NodeDetailsDrawer in GraphView
// GenerationProgressBar - REMOVED: Integrated into GraphHeader for unified UI
import type { Stage1CourseData } from '@/components/generation-graph'

/** Default fallback when lessons count is unknown (before Stage 4 analysis completes) */
const DEFAULT_LESSONS_COUNT = 5

interface GenerationProgressContainerProps {
  courseId: string
  slug: string
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
  /** Human-readable generation code (e.g., "ABC-1234") for debugging */
  generationCode?: string | null
  /** Pre-loaded Stage 1 course data for immediate display */
  stage1CourseData?: Stage1CourseData
  /** Generation mode (automatic, semi_automatic, or null) */
  generationMode?: 'automatic' | 'semi_automatic' | null
  /** Timestamp when generation was paused (null if not paused) */
  generationPausedAt?: string | null
}

// Session storage keys
const STORAGE_KEY_PREFIX = 'course-generation-'
const STORAGE_KEY_STATE = (courseId: string) => `${STORAGE_KEY_PREFIX}${courseId}-state`
const STORAGE_KEY_TIMESTAMP = (courseId: string) => `${STORAGE_KEY_PREFIX}${courseId}-timestamp`

// Enhanced action types
type EnhancedProgressAction =
  | ProgressAction
  | { type: 'RESTORE_STATE'; payload: ProgressState }
  | { type: 'INCREMENT_RETRY'; payload: { stepIndex: number } }

// Enhanced state interface
interface EnhancedProgressState extends ProgressState {
  stepRetryCount: Map<number, number>
}

// Enhanced progress reducer
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
      return {
        ...state,
        status: action.payload,
      }

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
      return {
        ...state,
        isConnected: action.payload,
      }

    case 'ADD_ACTIVITY':
      return {
        ...state,
        activityLog: [...state.activityLog, action.payload],
      }

    case 'RETRY_STEP':
      return {
        ...state,
        retryAttempts: state.retryAttempts + 1,
      }

    case 'UPDATE_ESTIMATE':
      return {
        ...state,
        estimatedTime: action.payload,
      }

    case 'CHANGE_TAB':
      return {
        ...state,
        activeTab: action.payload,
      }

    case 'RESTORE_STATE':
      return action.payload as EnhancedProgressState

    case 'INCREMENT_RETRY':
      const newRetryCount = new Map(state.stepRetryCount)
      const currentCount = newRetryCount.get(action.payload.stepIndex) || 0
      newRetryCount.set(action.payload.stepIndex, currentCount + 1)
      return {
        ...state,
        stepRetryCount: newRetryCount,
      }

    default:
      return state
  }
}

export default function GenerationProgressContainerEnhanced({
  courseId,
  slug,
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
  // isDark - DISABLED: MissionControlBanner moved to GraphView
  // const { resolvedTheme } = useTheme();
  // const isDark = resolvedTheme === 'dark';
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null)
  const pollingInterval = useRef<NodeJS.Timeout | null>(null)
  const redirectTimeout = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5

  // Refs to preserve last known values for modules/lessons counts (survives realtime updates that don't include analysis_result)
  const lastKnownModulesTotal = useRef<number | undefined>(initialProgress.modules_total)
  const lastKnownLessonsTotal = useRef<number>(
    initialProgress.lessons_total || DEFAULT_LESSONS_COUNT
  )

  // Initial enhanced state
  const getInitialState = (): EnhancedProgressState => {
    // Try to restore from session storage
    if (typeof window !== 'undefined') {
      const storedState = sessionStorage.getItem(STORAGE_KEY_STATE(courseId))
      const storedTimestamp = sessionStorage.getItem(STORAGE_KEY_TIMESTAMP(courseId))

      if (storedState && storedTimestamp) {
        const timestamp = new Date(storedTimestamp)
        const now = new Date()
        const ageMinutes = (now.getTime() - timestamp.getTime()) / (1000 * 60)

        // Only restore if less than 30 minutes old
        if (ageMinutes < 30) {
          try {
            const parsed = JSON.parse(storedState)
            // Convert Map from JSON
            parsed.stepRetryCount = new Map(parsed.stepRetryCount || [])
            // Merge with initialProgress - server data (modules_total, lessons_total) takes priority
            // because analysis_result may have been updated after session storage was saved
            const mergedProgress = {
              ...parsed.progress,
              modules_total: initialProgress.modules_total ?? parsed.progress?.modules_total,
              lessons_total:
                initialProgress.lessons_total ??
                parsed.progress?.lessons_total ??
                DEFAULT_LESSONS_COUNT,
            }
            return {
              ...parsed,
              progress: mergedProgress,
              status: initialStatus, // Always use server status
            }
          } catch {
            // Failed to parse stored state - will use fresh state
          }
        }
      }
    }

    // Return fresh state
    return {
      progress: initialProgress,
      status: initialStatus,
      error: null,
      isConnected: false,
      activeTab: 'overview',
      activityLog: [
        {
          id: '1',
          timestamp: new Date(),
          type: 'info',
          message: 'Course generation started',
        },
      ],
      retryAttempts: 0,
      estimatedTime: 180,
      stepRetryCount: new Map(),
    }
  }

  const [state, dispatch] = useReducer(enhancedProgressReducer, null, getInitialState)
  const [showSuccess, setShowSuccess] = useState(false)
  const hasTriggeredConfetti = useRef(false)

  // Local state for pause/resume - initialized from prop, updated via realtime and optimistic updates
  const [isPausedLocal, setIsPausedLocal] = useState(!!generationPausedAt)

  // DISABLED: All below moved to GraphView - MissionControlBanner and StageResultsDrawer
  // const [detailsStageId, setDetailsStageId] = useState<string | null>(null);
  // const [isProcessingApproval, setIsProcessingApproval] = useState(false);

  // DISABLED: getAwaitingStage and awaitingStage moved to GraphView
  /*
  const getAwaitingStage = (status: string): number | null => {
    if (status === 'pending') return 0;
    const match = status.match(/stage_(\d+)_awaiting_approval/);
    return match ? parseInt(match[1], 10) : null;
  };
  const awaitingStage = state.status ? getAwaitingStage(state.status as string) : null;
  */

  // DISABLED: All handlers below moved to GraphView MissionControlBanner
  /*
  const handleApproveStage = async () => {
    if (awaitingStage === null) return;
    setIsProcessingApproval(true);
    try {
      if (awaitingStage === 0) {
        await startGeneration(courseId);
        showToast('success', 'Генерация запущена!');
      } else {
        await approveStage(courseId, awaitingStage);
        showToast('success', `Stage ${awaitingStage} approved. Launching next phase...`);
      }
    } catch (error) {
      showToast('error', awaitingStage === 0 ? 'Failed to start generation' : 'Failed to approve stage');
      console.error(error);
    } finally {
      setIsProcessingApproval(false);
    }
  };

  const handleCancelGeneration = async () => {
    if (!confirm('Are you sure you want to abort the mission? This cannot be undone.')) return;
    setIsProcessingApproval(true);
    try {
      await cancelGeneration(courseId);
      showToast('info', 'Mission aborted.');
    } catch (_error) {
      showToast('error', 'Failed to cancel generation');
    } finally {
      setIsProcessingApproval(false);
    }
  };
  */

  // Initialize Supabase client on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSupabase(createClient())
    }
  }, [])

  // Auto-start generation in automatic mode
  // When course is in automatic mode and status is 'pending', start generation automatically
  const autoStartTriggered = useRef(false)
  useEffect(() => {
    // Only auto-start once
    if (autoStartTriggered.current) return

    // Check conditions for auto-start
    const shouldAutoStart =
      generationMode === 'automatic' && initialStatus === 'pending' && !generationPausedAt

    if (shouldAutoStart) {
      autoStartTriggered.current = true
      // Start generation automatically
      startGeneration(courseId)
        .then(() => {
          console.log('[AutoStart] Generation started automatically in automatic mode')
        })
        .catch((error) => {
          console.error('[AutoStart] Failed to auto-start generation:', error)
          // Reset flag to allow retry on error
          autoStartTriggered.current = false
        })
    }
  }, [courseId, generationMode, initialStatus, generationPausedAt])

  // Save state to session storage
  const saveStateToStorage = useCallback(() => {
    if (typeof window !== 'undefined') {
      const stateToSave = {
        ...state,
        stepRetryCount: Array.from(state.stepRetryCount.entries()),
      }
      sessionStorage.setItem(STORAGE_KEY_STATE(courseId), JSON.stringify(stateToSave))
      sessionStorage.setItem(STORAGE_KEY_TIMESTAMP(courseId), new Date().toISOString())
    }
  }, [state, courseId])

  // Save state on changes
  useEffect(() => {
    saveStateToStorage()
  }, [state.progress, state.status, state.error, saveStateToStorage])

  // Automatic Mode Control Handlers
  const handlePause = useCallback(async () => {
    if (!supabase) return
    // Don't pause if already paused or generation is terminal
    if (isPausedLocal) {
      toast.warning('Генерация уже приостановлена')
      return
    }
    const terminalStatuses = ['completed', 'failed', 'cancelled']
    if (terminalStatuses.includes(state.status as string)) {
      toast.warning('Генерация уже завершена')
      return
    }
    // Optimistic update - set paused state immediately before API call
    setIsPausedLocal(true)
    try {
      const { error } = await supabase
        .from('courses')
        .update({ generation_paused_at: new Date().toISOString() })
        .eq('id', courseId)

      if (error) {
        // Revert optimistic update on error
        setIsPausedLocal(false)
        throw error
      }
      toast.info('Генерация приостановлена')
    } catch (error) {
      toast.error('Не удалось приостановить генерацию')
      console.error(error)
    }
  }, [courseId, supabase, isPausedLocal, state.status])

  const handleResume = useCallback(async () => {
    if (!supabase) return
    // Only resume if paused
    if (!isPausedLocal) {
      toast.warning('Генерация не приостановлена')
      return
    }
    // Optimistic update - set resumed state immediately before API call
    setIsPausedLocal(false)
    try {
      const { error } = await supabase
        .from('courses')
        .update({ generation_paused_at: null })
        .eq('id', courseId)

      if (error) {
        // Revert optimistic update on error
        setIsPausedLocal(true)
        throw error
      }
      toast.success('Генерация продолжена')
    } catch (error) {
      toast.error('Не удалось продолжить генерацию')
      console.error(error)
    }
  }, [courseId, supabase, isPausedLocal])

  const handleCancel = useCallback(async () => {
    if (!confirm('Вы уверены, что хотите отменить генерацию? Это действие нельзя отменить.')) return

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

  // Calculate estimated time based on progress
  const calculateEstimatedTime = useCallback((progress: GenerationProgress) => {
    const avgStepTime = 30
    const remainingSteps = progress.total_steps - progress.current_step
    return Math.max(10, remainingSteps * avgStepTime)
  }, [])

  // Handle progress update from database
  const handleProgressUpdate = useCallback(
    (course: {
      generation_progress?: unknown
      status?: string | null
      generation_status?: string | null
      error_message?: string | null
      analysis_result?: unknown
      generation_paused_at?: string | null
    }) => {
      // Update pause state from realtime data
      if ('generation_paused_at' in course) {
        const newIsPaused = course.generation_paused_at !== null
        setIsPausedLocal(newIsPaused)
      }
      if (course.generation_progress && typeof course.generation_progress === 'object') {
        const progress = course.generation_progress as {
          steps?: unknown
          message?: unknown
          percentage?: unknown
          current_step?: unknown
          total_steps?: unknown
          has_documents?: unknown
          lessons_completed?: unknown
          lessons_total?: unknown
          modules_total?: unknown
          started_at?: unknown
          current_stage?: unknown
          document_size?: unknown
          estimated_completion?: unknown
        }

        // Extract modules_total and lessons_total from analysis_result if available (Stage 4+)
        // Priority: 1) analysis_result (most accurate), 2) generation_progress, 3) last known values from ref
        let modulesTotal: number | undefined = (progress.modules_total as number) || undefined
        let lessonsTotal: number =
          (progress.lessons_total as number) || lastKnownLessonsTotal.current

        if (course.analysis_result && typeof course.analysis_result === 'object') {
          const analysisResult = course.analysis_result as {
            recommended_structure?: {
              total_sections?: number
              total_lessons?: number
            }
          }
          if (analysisResult.recommended_structure) {
            if (analysisResult.recommended_structure.total_sections) {
              modulesTotal = analysisResult.recommended_structure.total_sections
            }
            if (analysisResult.recommended_structure.total_lessons) {
              lessonsTotal = analysisResult.recommended_structure.total_lessons
            }
          }
        }

        // Fallback to last known values if not found in update (realtime may not include analysis_result)
        if (modulesTotal === undefined && lastKnownModulesTotal.current !== undefined) {
          modulesTotal = lastKnownModulesTotal.current
        }
        if (
          lessonsTotal === DEFAULT_LESSONS_COUNT &&
          lastKnownLessonsTotal.current > DEFAULT_LESSONS_COUNT
        ) {
          // Only use last known if current is default and we have a better value
          lessonsTotal = lastKnownLessonsTotal.current
        }

        // Update refs with new values for future updates
        if (modulesTotal !== undefined) {
          lastKnownModulesTotal.current = modulesTotal
        }
        if (lessonsTotal > DEFAULT_LESSONS_COUNT) {
          lastKnownLessonsTotal.current = lessonsTotal
        }

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
        const estimatedTime = calculateEstimatedTime(generationProgress)
        dispatch({ type: 'UPDATE_ESTIMATE', payload: estimatedTime })

        // Check for failed steps
        const failedStep = generationProgress.steps.find((s) => s.status === 'failed')
        if (failedStep) {
          toast.error(`Step failed: ${failedStep.name}. You can retry it.`)
        }
      }

      if (course.generation_status && course.generation_status !== state.status) {
        dispatch({ type: 'SET_STATUS', payload: course.generation_status as CourseStatus })

        // Handle completion
        if (course.generation_status === 'completed') {
          dispatch({
            type: 'ADD_ACTIVITY',
            payload: {
              id: crypto.randomUUID(),
              timestamp: new Date(),
              type: 'success',
              message: 'Course generation completed successfully!',
            },
          })

          // Clear session storage
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem(STORAGE_KEY_STATE(courseId))
            sessionStorage.removeItem(STORAGE_KEY_TIMESTAMP(courseId))
          }

          // Trigger confetti celebration
          if (!hasTriggeredConfetti.current) {
            hasTriggeredConfetti.current = true
            setShowSuccess(true)
            triggerConfetti()
            toast.success('Course generated successfully!')
          }

          if (onComplete) {
            onComplete(courseId)
          }

          if (autoRedirect) {
            redirectTimeout.current = setTimeout(() => {
              router.push(`/courses/${slug}`)
            }, redirectDelay)
          }
        }

        // Handle failure
        if (course.generation_status === 'failed') {
          const error = new Error(course.error_message || 'Course generation failed')
          dispatch({ type: 'SET_ERROR', payload: error })
          toast.error('Course generation failed. Please check the error details.')

          if (onError) {
            onError(error)
          }
        }
      }
    },
    [
      state.status,
      courseId,
      slug,
      router,
      autoRedirect,
      redirectDelay,
      onComplete,
      onError,
      calculateEstimatedTime,
    ]
  )

  // Enhanced polling with exponential backoff
  const startPolling = useCallback(() => {
    const poll = async () => {
      if (!supabase) return // Wait for supabase to be initialized

      try {
        const { data, error } = await supabase
          .from('courses')
          .select('*')
          .eq('id', courseId)
          .single()

        if (!error && data) {
          handleProgressUpdate(data)
          reconnectAttempts.current = 0 // Reset on success
        } else if (error) {
          // Polling error - will be handled by error state
          reconnectAttempts.current++

          if (reconnectAttempts.current >= maxReconnectAttempts) {
            toast.warning('Connection issues detected. Retrying...')
          }
        }
      } catch {
        // Polling error - will be handled by error state
        reconnectAttempts.current++
      }
    }

    // Use exponential backoff for polling interval
    const baseInterval = 3000
    const interval = Math.min(baseInterval * Math.pow(2, reconnectAttempts.current), 30000)
    pollingInterval.current = setInterval(() => void poll(), interval)
  }, [courseId, supabase, handleProgressUpdate])

  const stopPolling = useCallback(() => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current)
      pollingInterval.current = null
    }
  }, [])

  // Set up real-time subscription with reconnection logic
  useEffect(() => {
    if (!supabase) return // Wait for supabase to be initialized

    let channel: ReturnType<typeof supabase.channel> | null = null
    let reconnectTimeout: NodeJS.Timeout | undefined

    const setupSubscription = async () => {
      try {
        channel = supabase
          .channel(`course-progress-${courseId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'courses',
              filter: `id=eq.${courseId}`,
            },
            (payload) => {
              if (payload.new) {
                handleProgressUpdate(payload.new)
              }
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

              // Try to reconnect after delay
              reconnectTimeout = setTimeout(() => {
                if (channel && supabase) {
                  supabase.removeChannel(channel)
                }
                void setupSubscription()
              }, 5000)
            }
          })
      } catch {
        // Subscription error - will be handled by error state
        dispatch({ type: 'SET_CONNECTED', payload: false })
        startPolling()
      }
    }

    void setupSubscription()
    // Polling starts only on CHANNEL_ERROR/TIMED_OUT (not initially)

    return () => {
      if (channel && supabase) {
        channel.unsubscribe() // Unsubscribe before removing channel (Supabase best practice)
        supabase.removeChannel(channel)
      }
      stopPolling()
      if (redirectTimeout.current) {
        clearTimeout(redirectTimeout.current)
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
    }
  }, [courseId, supabase, handleProgressUpdate, startPolling, stopPolling])

  // Refetch state when tab becomes visible (handles browser throttling WebSocket)
  useEffect(() => {
    if (!supabase) return

    let isMounted = true

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isMounted) {
        // Tab became visible - refetch current state to ensure UI is up-to-date
        void (async () => {
          try {
            const { data, error } = await supabase
              .from('courses')
              .select('*')
              .eq('id', courseId)
              .single()

            // Check isMounted again after async operation
            if (!error && data && isMounted) {
              handleProgressUpdate(data)
            }
          } catch {
            // Silently fail - polling will handle it
          }
        })()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isMounted = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [courseId, supabase, handleProgressUpdate])

  // Track confetti interval
  const confettiInterval = useRef<NodeJS.Timeout | null>(null)

  // Cleanup confetti on unmount
  useEffect(() => {
    return () => {
      if (confettiInterval.current) {
        clearInterval(confettiInterval.current)
      }
    }
  }, [])

  // Confetti celebration animation
  const triggerConfetti = () => {
    const duration = 3000
    const animationEnd = Date.now() + duration
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 }

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min
    }

    // Clear any existing interval first
    if (confettiInterval.current) {
      clearInterval(confettiInterval.current)
    }

    confettiInterval.current = setInterval(function () {
      const timeLeft = animationEnd - Date.now()

      if (timeLeft <= 0) {
        if (confettiInterval.current) {
          clearInterval(confettiInterval.current)
          confettiInterval.current = null
        }
        return
      }

      const particleCount = 25 * (timeLeft / duration) // Reduced from 50 for better performance

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
    }, 500) // Reduced frequency from 250ms for better performance
  }

  return (
    <div className="relative h-screen w-full">
      {/* GraphView - Full screen */}
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

      {/* Success Overlay Animation */}
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
              {/* Close button */}
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
                <Link href={`/courses/${slug}`}>{t('viewCourse')}</Link>
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
