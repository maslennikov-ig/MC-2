'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { logger } from '@/lib/logger'
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
  Copy
} from 'lucide-react'
import type { 
  GenerationProgress as GenerationProgressType, 
  GenerationStep,
  CourseStatus 
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
  1: Rocket,     // Initialization
  2: Brain,      // Task analysis
  3: BookOpen,   // Structure generation
  4: Sparkles,   // Content creation
  5: CheckCircle // Finalization
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
  cancelled: 'Создание курса отменено'
}

export function GenerationProgress({ 
  courseId, 
  slug,
  initialProgress,
  initialStatus = 'initializing'
}: GenerationProgressProps) {
  const router = useRouter()
  const [progress, setProgress] = useState<GenerationProgressType>(initialProgress || {
    current_step: 1,
    total_steps: 5,
    percentage: 0,
    message: statusMessages[initialStatus] || 'Initializing...',
    steps: [],
    has_documents: false,
    lessons_total: 0,
    lessons_completed: 0,
    started_at: new Date()
  })
  const [status, setStatus] = useState<CourseStatus>(initialStatus)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [generationCode, setGenerationCode] = useState<string | null>(null)

  // Calculate estimated time remaining
  const estimatedMinutesRemaining = Math.ceil(
    ((progress.total_steps || 5 - progress.current_step) * 1.5) + 
    (progress.lessons_total ? (progress.lessons_total - (progress.lessons_completed || 0)) * 0.5 : 0)
  )

  // Setup realtime subscription with improved reliability
  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let pollingInterval: NodeJS.Timeout | null = null
    let reconnectAttempts = 0
    let reconnectTimeout: NodeJS.Timeout | null = null
    const maxReconnectAttempts = 5
    const baseReconnectDelay = 1000 // 1 second

    const handleCourseUpdate = (payload: { new: Course }) => {
      logger.info('Realtime update received', { courseId, payload })
      const updatedCourse = payload.new as Course

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
          // Use replace to remove generation page from history
          setTimeout(() => {
            router.replace(`/courses/${slug}`)
          }, 2000)
        }

        // Handle failure
        if (newStatus === 'failed') {
          const errorMessage = updatedCourse.error_message || 'Произошла ошибка при создании курса'
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
              presence: { key: courseId }
            }
          })
          .on(
            'postgres_changes' as const,
            {
              event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
              schema: 'public',
              table: 'courses',
              filter: `id=eq.${courseId}`
            } as const,
            handleCourseUpdate as (payload: unknown) => void
          )
          .subscribe((status, err) => {
            logger.info('Subscription status changed', { status, courseId })

            if (status === 'SUBSCRIBED') {
              setIsConnected(true)
              reconnectAttempts = 0 // Reset reconnect counter on success
              logger.info('Realtime subscription established', { courseId, channelName })
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
      const delay = Math.min(baseReconnectDelay * Math.pow(2, reconnectAttempts - 1), 30000) // Max 30 seconds

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

    // Fallback to polling if realtime fails
    const setupPollingFallback = () => {
      if (pollingInterval) return // Already polling
      
      logger.info('Falling back to polling', { courseId })
      
      pollingInterval = setInterval(async () => {
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
                  clearInterval(pollingInterval)
                  pollingInterval = null
                }

                if (data.generation_status === 'completed') {
                  toast.success('Курс успешно создан!')
                  setTimeout(() => {
                    router.push(`/courses/${slug}`)
                  }, 2000)
                } else if (data.generation_status === 'failed') {
                  setError(data.error_message || 'Произошла ошибка')
                  toast.error(data.error_message || 'Произошла ошибка при создании курса')
                }
              }
            }
          }
        } catch (err) {
          logger.error('Polling error', { error: err, courseId })
        }
      }, 3000) // Poll every 3 seconds
    }

    // Initial setup
    setupSubscription()

    // Also start a health check timer to verify status
    const healthCheckInterval = setInterval(async () => {
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
              dbStatus: data.generation_status
            })
            handleCourseUpdate({ new: data as Course })
          }
        }
      } catch (err) {
        logger.error('Health check failed', { error: err, courseId })
      }
    }, 30000) // Check every 30 seconds

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
        clearInterval(pollingInterval)
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
        method: 'POST'
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
    if (step.status === 'skipped' || (step.optional && !progress.has_documents && (step.id === 2 || step.id === 3))) {
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
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              <CheckCircle className="h-5 w-5 text-green-500" />
            </motion.div>
          ) : step.status === 'in_progress' ? (
            <div className="relative">
              <Icon className="h-5 w-5 text-primary animate-pulse" />
              <div className="absolute inset-0">
                <Loader2 className="h-5 w-5 text-primary/50 animate-spin" />
              </div>
            </div>
          ) : step.status === 'failed' ? (
            <XCircle className="h-5 w-5 text-destructive" />
          ) : (
            <Icon className="h-5 w-5 text-muted-foreground/50" />
          )}
        </div>
        
        <div className="flex-1 space-y-1">
          <div className={`text-sm leading-none ${
            step.status === 'completed' ? 'text-green-600 dark:text-green-400' :
            step.status === 'in_progress' ? 'text-primary font-medium' :
            step.status === 'failed' ? 'text-destructive' :
            'text-muted-foreground'
          }`}>
            {step.name}
            {step.optional && (
              <Badge variant="outline" className="ml-2 text-xs">
                Опционально
              </Badge>
            )}
          </div>
          
          {step.status === 'completed' && step.completed_at && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Завершено в {formatTime(step.completed_at)}
            </div>
          )}

          {step.status === 'in_progress' && step.started_at && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Начато в {formatTime(step.started_at)}
            </div>
          )}
          
          {/* Show lesson progress for content generation step */}
          {step.id === 5 && step.status === 'in_progress' && (progress.lessons_total || 0) > 0 && (
            <div className="mt-2">
              <div className="text-xs text-muted-foreground mb-1">
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
              <Sparkles className="h-5 w-5 text-primary" />
              Прогресс генерации
            </div>
            {!isConnected && (status === 'initializing' || status === 'processing_documents' || status === 'analyzing_task' || status === 'generating_structure' || status === 'generating_content' || status === 'finalizing') && (
              <Badge variant="outline" className="text-xs">
                <RefreshCw className="h-3 w-3 mr-1" />
                Обновление каждые 3 сек
              </Badge>
            )}
          </CardTitle>

          {/* Generation code display */}
          {generationCode && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-muted-foreground">Код генерации:</span>
              <Badge
                variant="secondary"
                className="font-mono text-sm px-3 py-1 cursor-pointer hover:bg-secondary/80"
                onClick={handleCopyCode}
              >
                {generationCode}
                <Copy className="h-3 w-3 ml-2" />
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
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">
                {progress.message || statusMessages[status] || 'Обработка...'}
              </span>
              <span className="text-sm text-muted-foreground">
                {progress.percentage}%
              </span>
            </div>
            <Progress value={progress.percentage} className="h-3" />
            
            {(status === 'initializing' || status === 'processing_documents' || status === 'analyzing_task' || status === 'generating_structure' || status === 'generating_content' || status === 'finalizing') && progress.current_step > 0 && estimatedMinutesRemaining > 0 && (
              <div className="text-sm text-muted-foreground text-center">
                Примерное время: ~{estimatedMinutesRemaining} мин
              </div>
            )}
          </div>
          
          <Separator />
          
          {/* Step-by-step progress */}
          <div className="space-y-4">
            <AnimatePresence mode="sync">
              {progress.steps.map(step => renderStep(step))}
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
          
          {/* Action buttons */}
          <div className="flex justify-between items-center pt-4">
            {(status === 'initializing' || status === 'processing_documents' || status === 'analyzing_task' || status === 'generating_structure') && progress.current_step <= 3 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
              >
                Отменить генерацию
              </Button>
            )}
            
            {status === 'failed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Попробовать снова
              </Button>
            )}
            
            {isCourseReady && (
              <Button
                className="ml-auto"
                onClick={() => router.push(`/courses/${slug}`)}
              >
                Перейти к курсу
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Connection status (debug info in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-muted-foreground text-center">
          {isConnected ? (
            <span className="flex items-center justify-center gap-1">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              Realtime подключен
            </span>
          ) : (status === 'initializing' || status === 'processing_documents' || status === 'analyzing_task' || status === 'generating_structure' || status === 'generating_content' || status === 'finalizing') ? (
            <span className="flex items-center justify-center gap-1">
              <div className="h-2 w-2 bg-yellow-500 rounded-full animate-pulse" />
              Используется polling (резервный режим)
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}