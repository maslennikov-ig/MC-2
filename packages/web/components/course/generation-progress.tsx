'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from '@/src/i18n/navigation'
import { useTranslations } from 'next-intl'
import { logger } from '@/lib/client-logger'
import { motion, AnimatePresence } from 'framer-motion'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  CheckCircle,
  Circle,
  Loader2,
  XCircle,
  Sparkles,
  Brain,
  BookOpen,
  Rocket,
  Clock,
  RefreshCw,
  ArrowRight,
  Copy,
  Pause,
  Play,
  Square,
} from 'lucide-react'
import type {
  GenerationProgress as GenerationProgressType,
  GenerationStep,
  CourseStatus,
} from '@/types/course-generation'
import type { Course } from '@/types/database'

interface GenerationProgressProps {
  courseId: string
  slug: string
  initialProgress?: GenerationProgressType
  initialStatus?: CourseStatus
}

// Icon mapping for each step
const stepIcons = {
  1: Rocket, // Initialization
  2: Brain, // Task analysis
  3: BookOpen, // Structure generation
  4: Sparkles, // Content creation
  5: CheckCircle, // Finalization
}

// Format time consistently to avoid hydration mismatch
const formatTime = (dateString: string) => {
  const date = new Date(dateString)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

// Status messages
const statusMessages: Partial<Record<CourseStatus, string>> = {
  initializing: 'Инициализация создания курса...',
  processing_documents: 'Обработка загруженных документов...',
  analyzing_task: 'Анализ задания и требований...',
  generating_structure: 'Создание структуры курса...',
  generating_content: 'Генерация контента уроков...',
  finalizing: 'Финализация и проверка качества...',
  completed: 'Курс успешно создан!',
  failed: 'Произошла ошибка при создании курса',
  cancelled: 'Создание курса отменено',
}

export function GenerationProgress({
  courseId,
  slug,
  initialProgress,
  initialStatus = 'initializing',
}: GenerationProgressProps) {
  const router = useRouter()
  const t = useTranslations('generation')
  const [progress, setProgress] = useState<GenerationProgressType>(
    initialProgress || {
      current_step: 1,
      total_steps: 5,
      percentage: 0,
      message: statusMessages[initialStatus] || 'Initializing...',
      steps: [],
      has_documents: false,
      lessons_total: 0,
      lessons_completed: 0,
      started_at: new Date(),
    }
  )
  const [status, setStatus] = useState<CourseStatus>(initialStatus)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [generationCode, setGenerationCode] = useState<string | null>(null)
  // Initialize isPaused from database state (Issue #5 from code review)
  const [isPaused, setIsPaused] = useState(
    () =>
      initialProgress?.generation_paused_at !== null &&
      initialProgress?.generation_paused_at !== undefined
  )
  const [pauseLoading, setPauseLoading] = useState(false)
  const [pauseResumeOperation, setPauseResumeOperation] = useState<'pausing' | 'resuming' | null>(
    null
  )

  // Calculate estimated time remaining
  const estimatedMinutesRemaining = Math.ceil(
    ((progress.total_steps || 5) - progress.current_step) * 1.5 +
      (progress.lessons_total
        ? (progress.lessons_total - (progress.lessons_completed || 0)) * 0.5
        : 0)
  )

  // Setup realtime subscription with improved reliability
  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let pollingInterval: NodeJS.Timeout | null = null
    let healthCheckInterval: NodeJS.Timeout | null = null
    let reconnectAttempts = 0
    let reconnectTimeout: NodeJS.Timeout | null = null
    // Constants for timing (mc2-1w3: refactored magic numbers)
    const maxReconnectAttempts = 5
    const baseReconnectDelay = 1000 // 1 second
    const maxReconnectDelay = 30000 // Max 30 seconds for reconnect backoff
    const healthCheckIntervalMs = 30000 // 30 seconds
    // Exponential backoff state for polling (Issue #4 mc2-o5k)
    let lastStatus: CourseStatus | null = null
    let pollDelay = 3000 // Start at 3 seconds
    const minPollDelay = 3000
    const maxPollDelay = 30000
    const backoffMultiplier = 1.5

    const handleCourseUpdate = (payload: { new: Course }) => {
      logger.info('Realtime update received', { courseId, payload })
      const updatedCourse = payload.new

      // Sync pause state from database (Issue #5 from code review)
      if ('generation_paused_at' in updatedCourse) {
        const newIsPaused = updatedCourse.generation_paused_at !== null
        setIsPaused(newIsPaused)
        logger.info('Pause state synced', { courseId, isPaused: newIsPaused })
      }

      // Update generation code if present
      if (updatedCourse.generation_code) {
        setGenerationCode(updatedCourse.generation_code)
      }

      // Update progress
      if (updatedCourse.generation_progress) {
        const newProgress = updatedCourse.generation_progress as unknown as GenerationProgressType
        setProgress(newProgress)
        logger.info('Progress updated', { courseId, percentage: newProgress.percentage })
      }

      // Update status
      if (updatedCourse.generation_status) {
        const newStatus = updatedCourse.generation_status as CourseStatus
        setStatus(newStatus)
        logger.info('Status updated', { courseId, generation_status: newStatus })

        // Handle completion
        if (newStatus === 'completed') {
          toast.success('Курс успешно создан!')
          // Navigate immediately - no delay needed
          router.replace(`/courses/${slug}`)
        }

        // Handle failure
        if (newStatus === 'failed') {
          const rawError = updatedCourse.error_message || 'errors.analysis_generic'
          // Check if error is an i18n key or raw Russian text (backward compatibility)
          const errorMessage =
            rawError.startsWith('errors.') || rawError.startsWith('progress.')
              ? t(rawError as any)
              : rawError
          setError(errorMessage)
          toast.error(errorMessage)
        }
      }
    }

    const setupSubscription = async () => {
      try {
        logger.info('Setting up realtime subscription', { courseId })

        // Create channel with unique name and better configuration
        const channelName = `courses:${courseId}:updates`
        channel = supabase
          .channel(channelName, {
            config: {
              broadcast: { self: true },
              presence: { key: courseId },
            },
          })
          .on(
            'postgres_changes' as const,
            {
              event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
              schema: 'public',
              table: 'courses',
              filter: `id=eq.${courseId}`,
            } as const,
            handleCourseUpdate as (payload: unknown) => void
          )

          .subscribe((status, err) => {
            logger.info('Subscription status changed', { status, courseId })
            // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
            if (status === 'SUBSCRIBED') {
              setIsConnected(true)
              reconnectAttempts = 0 // Reset reconnect counter on success

              // Stop polling fallback when realtime is connected (prevents double load)
              if (pollingInterval) {
                clearTimeout(pollingInterval) // Changed from clearInterval to clearTimeout
                pollingInterval = null
                logger.info('Polling stopped - realtime connected', { courseId })
              }

              // Stop health check when realtime is connected (realtime will provide updates)
              if (healthCheckInterval) {
                clearInterval(healthCheckInterval)
                healthCheckInterval = null
                logger.info('Health check stopped - realtime connected', { courseId })
              }

              logger.info('Realtime subscription established', { courseId, channelName })
              // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
              logger.warn('Realtime connection lost', { status, error: err, courseId })
              setIsConnected(false)
              handleReconnect()
            } else if (err) {
              logger.error('Realtime subscription error', { error: err, courseId })
              setIsConnected(false)
              handleReconnect()
            }
          })
      } catch (err) {
        logger.error('Failed to setup realtime subscription', { error: err, courseId })
        handleReconnect()
      }
    }

    // Exponential backoff reconnection
    const handleReconnect = () => {
      if (reconnectAttempts >= maxReconnectAttempts) {
        logger.warn('Max reconnect attempts reached, falling back to polling', { courseId })
        setupPollingFallback()
        return
      }

      reconnectAttempts++
      const delay = Math.min(
        baseReconnectDelay * Math.pow(2, reconnectAttempts - 1),
        maxReconnectDelay
      )

      logger.info(`Attempting to reconnect in ${delay}ms`, { courseId, attempt: reconnectAttempts })

      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      reconnectTimeout = setTimeout(() => {
        // Clean up old channel before reconnecting
        if (channel) {
          try {
            supabase.removeChannel(channel)
          } catch (err) {
            logger.error('Error removing old channel', { error: err })
          }
          channel = null
        }
        setupSubscription()
      }, delay)
    }

    // Fallback to polling if realtime fails (with exponential backoff)
    const setupPollingFallback = () => {
      if (pollingInterval) return // Already polling

      logger.info('Falling back to polling', { courseId })

      const poll = async () => {
        try {
          const supabase = createClient()
          const { data, error } = await supabase
            .from('courses')
            .select('generation_status, generation_progress, error_message, generation_code')
            .eq('id', courseId)
            .single()

          if (error) {
            logger.error('Polling fetch error', { error, courseId })
            return
          }

          if (data) {
            const currentStatus = data.generation_status as CourseStatus

            // Exponential backoff logic (Issue #4 mc2-o5k)
            if (lastStatus === currentStatus) {
              // Status unchanged - increase delay
              pollDelay = Math.min(pollDelay * backoffMultiplier, maxPollDelay)
              logger.debug('Status unchanged, increasing poll delay', { pollDelay, courseId })
            } else {
              // Status changed - reset to minimum delay
              pollDelay = minPollDelay
              logger.debug('Status changed, resetting poll delay', {
                lastStatus,
                currentStatus,
                courseId,
              })
            }
            lastStatus = currentStatus

            if (data.generation_code) {
              setGenerationCode(data.generation_code)
            }
            if (data.generation_progress) {
              setProgress(data.generation_progress as unknown as GenerationProgressType)
            }
            if (data.generation_status) {
              setStatus(data.generation_status as CourseStatus)

              // Stop polling if completed or failed
              if (['completed', 'failed', 'cancelled'].includes(data.generation_status || '')) {
                if (pollingInterval) {
                  clearTimeout(pollingInterval) // Changed from clearInterval to clearTimeout
                  pollingInterval = null
                }

                if (data.generation_status === 'completed') {
                  toast.success('Курс успешно создан!')
                  // Navigate immediately - no delay needed
                  router.push(`/courses/${slug}`)
                } else if (data.generation_status === 'failed') {
                  const rawError = data.error_message || 'errors.analysis_generic'
                  const errorMessage =
                    rawError.startsWith('errors.') || rawError.startsWith('progress.')
                      ? t(rawError as any)
                      : rawError
                  setError(errorMessage)
                  toast.error(errorMessage)
                }
                return // Exit without scheduling next poll
              }
            }
          }
        } catch (err) {
          logger.error('Polling error', { error: err, courseId })
        }

        // Schedule next poll with current delay
        pollingInterval = setTimeout(() => {
          void poll()
        }, pollDelay)
      }

      // Start polling immediately
      poll()
    }

    // Initial setup
    setupSubscription()

    // Also start a health check timer to verify status
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    healthCheckInterval = setInterval(async () => {
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        return // No need to check if already finished
      }

      try {
        const { data, error } = await supabase
          .from('courses')
          .select('generation_status, generation_progress, generation_code')
          .eq('id', courseId)
          .single()

        if (data && !error) {
          // If generation_status changed but we didn't get the update, force update
          if (data.generation_status !== status) {
            logger.warn('Status mismatch detected, forcing update', {
              courseId,
              localStatus: status,
              dbStatus: data.generation_status,
            })
            handleCourseUpdate({ new: data as Course })
          }
        }
      } catch (err) {
        logger.error('Health check failed', { error: err, courseId })
      }
    }, healthCheckIntervalMs)

    // Cleanup
    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel)
        } catch (err) {
          logger.error('Error removing channel', { error: err })
        }
      }
      if (pollingInterval) {
        clearTimeout(pollingInterval) // Changed from clearInterval to clearTimeout
      }
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval)
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
    }
  }, [courseId, slug, router, status])

  // Retry connection
  const handleRetry = useCallback(() => {
    window.location.reload()
  }, [])

  // Cancel generation
  const handleCancel = useCallback(async () => {
    try {
      const response = await fetch(`/api/courses/${courseId}/cancel`, {
        method: 'POST',
      })

      if (response.ok) {
        toast.success('Генерация курса отменена')
        router.push('/courses')
      } else {
        toast.error('Не удалось отменить генерацию')
      }
    } catch (err) {
      logger.error('Failed to cancel generation', { error: err })
      toast.error('Произошла ошибка при отмене')
    }
  }, [courseId, router])

  // Pause generation
  const handlePause = useCallback(async () => {
    setPauseLoading(true)
    setPauseResumeOperation('pausing')
    try {
      const response = await fetch(`/api/courses/${slug}/pause`, {
        method: 'POST',
      })

      if (response.ok) {
        setIsPaused(true)
        toast.success('Генерация приостановлена')
      } else {
        const data = await response.json()
        toast.error(data.error || 'Не удалось приостановить генерацию')
      }
    } catch (err) {
      logger.error('Failed to pause generation', { error: err })
      toast.error('Произошла ошибка при приостановке')
    } finally {
      setPauseLoading(false)
      setPauseResumeOperation(null)
    }
  }, [slug])

  // Resume generation
  const handleResume = useCallback(async () => {
    setPauseLoading(true)
    setPauseResumeOperation('resuming')
    try {
      const response = await fetch(`/api/courses/${slug}/resume`, {
        method: 'POST',
      })

      if (response.ok) {
        setIsPaused(false)
        toast.success('Генерация возобновлена')
      } else {
        const data = await response.json()
        toast.error(data.error || 'Не удалось возобновить генерацию')
      }
    } catch (err) {
      logger.error('Failed to resume generation', { error: err })
      toast.error('Произошла ошибка при возобновлении')
    } finally {
      setPauseLoading(false)
      setPauseResumeOperation(null)
    }
  }, [slug])

  // Copy generation code to clipboard
  const handleCopyCode = useCallback(() => {
    if (generationCode) {
      navigator.clipboard.writeText(generationCode)
      toast.success('Код скопирован!')
    }
  }, [generationCode])

  // Render step item
  const renderStep = (step: GenerationStep) => {
    const Icon = stepIcons[step.id as keyof typeof stepIcons] || Circle

    // Skip hidden steps for courses without documents
    // Stage 2 (Document Processing) and Stage 3 (Classification) are skipped when no documents
    if (
      step.status === 'skipped' ||
      (step.optional && !progress.has_documents && (step.id === 2 || step.id === 3))
    ) {
      return null
    }

    return (
      <motion.div
        key={step.id}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: step.id * 0.1 }}
        className="flex items-start gap-3"
      >
        <div className="mt-0.5">
          {step.status === 'completed' ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <CheckCircle className="h-5 w-5 text-green-500" />
            </motion.div>
          ) : step.status === 'in_progress' ? (
            <div className="relative">
              <Icon className="text-primary h-5 w-5 animate-pulse" />
              <div className="absolute inset-0">
                <Loader2 className="text-primary/50 h-5 w-5 animate-spin" />
              </div>
            </div>
          ) : step.status === 'failed' ? (
            <XCircle className="text-destructive h-5 w-5" />
          ) : (
            <Icon className="text-muted-foreground/50 h-5 w-5" />
          )}
        </div>

        <div className="flex-1 space-y-1">
          <div
            className={`text-sm leading-none ${
              step.status === 'completed'
                ? 'text-green-600 dark:text-green-400'
                : step.status === 'in_progress'
                  ? 'text-primary font-medium'
                  : step.status === 'failed'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
            }`}
          >
            {step.name}
            {step.optional && (
              <Badge variant="outline" className="ml-2 text-xs">
                Опционально
              </Badge>
            )}
          </div>

          {step.status === 'completed' && step.completed_at && (
            <div className="text-muted-foreground flex items-center gap-1 text-xs">
              <CheckCircle className="h-3 w-3" />
              Завершено в {formatTime(step.completed_at)}
            </div>
          )}

          {step.status === 'in_progress' && step.started_at && (
            <div className="text-muted-foreground flex items-center gap-1 text-xs">
              <Clock className="h-3 w-3" />
              Начато в {formatTime(step.started_at)}
            </div>
          )}

          {/* Show lesson progress for content generation step */}
          {step.id === 5 && step.status === 'in_progress' && (progress.lessons_total || 0) > 0 && (
            <div className="mt-2">
              <div className="text-muted-foreground mb-1 text-xs">
                Уроки: {progress.lessons_completed || 0} из {progress.lessons_total || 0}
              </div>
              <Progress
                value={((progress.lessons_completed || 0) / (progress.lessons_total || 1)) * 100}
                className="h-1"
              />
            </div>
          )}
        </div>
      </motion.div>
    )
  }

  // Check if course is ready
  const isCourseReady = status === 'completed' && progress.percentage === 100

  return (
    <div className="space-y-6">
      {/* Main progress card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="text-primary h-5 w-5" />
              Прогресс генерации
            </div>
            {!isConnected &&
              (status === 'initializing' ||
                status === 'processing_documents' ||
                status === 'analyzing_task' ||
                status === 'generating_structure' ||
                status === 'generating_content' ||
                status === 'finalizing') && (
                <Badge variant="outline" className="text-xs">
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Обновление каждые 3 сек
                </Badge>
              )}
          </CardTitle>

          {/* Generation code display */}
          {generationCode && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-muted-foreground text-sm">Код генерации:</span>
              <Badge
                variant="secondary"
                className="hover:bg-secondary/80 cursor-pointer px-3 py-1 font-mono text-sm"
                onClick={handleCopyCode}
              >
                {generationCode}
                <Copy className="ml-2 h-3 w-3" />
              </Badge>
            </div>
          )}

          <CardDescription>
            {status === 'failed'
              ? 'Произошла ошибка при создании курса'
              : status === 'completed'
                ? 'Курс успешно создан!'
                : status === 'cancelled'
                  ? 'Создание курса отменено'
                  : 'Это займет около 5-10 минут. Можете закрыть страницу и вернуться позже.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Overall progress */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {(progress.message
                  ? progress.message.startsWith('progress.') ||
                    progress.message.startsWith('errors.')
                    ? t(progress.message as any)
                    : progress.message
                  : null) ||
                  statusMessages[status] ||
                  t('progress.processing')}
              </span>
              <span className="text-muted-foreground text-sm">{progress.percentage}%</span>
            </div>
            <Progress value={progress.percentage} className="h-3" />

            {(status === 'initializing' ||
              status === 'processing_documents' ||
              status === 'analyzing_task' ||
              status === 'generating_structure' ||
              status === 'generating_content' ||
              status === 'finalizing') &&
              progress.current_step > 0 &&
              estimatedMinutesRemaining > 0 && (
                <div className="text-muted-foreground text-center text-sm">
                  Примерное время: ~{estimatedMinutesRemaining} мин
                </div>
              )}
          </div>

          <Separator />

          {/* Step-by-step progress */}
          <div className="space-y-4">
            <AnimatePresence mode="sync">
              {progress.steps.map((step) => renderStep(step))}
            </AnimatePresence>
          </div>

          {/* Error message */}
          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success message */}
          {isCourseReady && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  Курс успешно создан! Перенаправляем вас...
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Loading indicator during pause/resume operations */}
          {pauseResumeOperation && (
            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <AlertDescription className="text-blue-800 dark:text-blue-200">
                {pauseResumeOperation === 'pausing'
                  ? 'Приостановка генерации...'
                  : 'Возобновление генерации...'}
              </AlertDescription>
            </Alert>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-2 pt-4">
            {/* Pause/Resume buttons - shown during active content generation */}
            {(status === 'generating_content' || status?.startsWith('stage_6_')) && !isPaused && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePause} // eslint-disable-line @typescript-eslint/no-misused-promises
                disabled={pauseLoading}
              >
                {pauseLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Pause className="mr-2 h-4 w-4" />
                )}
                Приостановить
              </Button>
            )}

            {isPaused && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResume} // eslint-disable-line @typescript-eslint/no-misused-promises
                disabled={pauseLoading}
                className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
              >
                {pauseLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Продолжить
              </Button>
            )}

            {/* Cancel/Stop button - expanded to work during all active stages including Stage 6 */}
            {(status === 'initializing' ||
              status === 'processing_documents' ||
              status === 'analyzing_task' ||
              status === 'generating_structure' ||
              status === 'generating_content' ||
              status === 'finalizing' ||
              status?.startsWith('stage_')) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel} // eslint-disable-line @typescript-eslint/no-misused-promises
                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
              >
                <Square className="mr-2 h-4 w-4" />
                Остановить
              </Button>
            )}

            {status === 'failed' && (
              <Button variant="outline" size="sm" onClick={handleRetry}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Попробовать снова
              </Button>
            )}

            {isCourseReady && (
              <Button
                className="ml-auto"
                onClick={() => window.open(`/courses/${slug}`, '_blank', 'noopener,noreferrer')}
              >
                Перейти к курсу
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Paused indicator */}
          {isPaused && (
            <Alert className="mt-4 border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
              <Pause className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                Генерация приостановлена. Текущие задачи будут завершены, новые не начнутся.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Connection status (debug info in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-muted-foreground text-center text-xs">
          {isConnected ? (
            <span className="flex items-center justify-center gap-1">
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              Realtime подключен
            </span>
          ) : status === 'initializing' ||
            status === 'processing_documents' ||
            status === 'analyzing_task' ||
            status === 'generating_structure' ||
            status === 'generating_content' ||
            status === 'finalizing' ? (
            <span className="flex items-center justify-center gap-1">
              <div className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
              Используется polling (резервный режим)
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}
