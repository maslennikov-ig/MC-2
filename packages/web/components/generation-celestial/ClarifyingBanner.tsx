'use client'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { MessageCircleQuestion, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'

interface ClarifyingBannerProps {
  courseId: string
  onContinue: () => void
  isDark?: boolean
  isProcessing?: boolean
}

/**
 * Banner shown during stage_4_clarifying phase
 * Displays progress and allows user to proceed once all critical questions answered
 */
export function ClarifyingBanner({
  courseId,
  onContinue,
  isDark = false,
  isProcessing = false,
}: ClarifyingBannerProps) {
  const { data: progress, isLoading } = trpc.clarifying.getProgress.useQuery(
    { courseId },
    {
      staleTime: 5000,
      refetchOnWindowFocus: false,
    }
  )

  if (isLoading || !progress) {
    return null
  }

  const progressPercent =
    progress.total > 0 ? Math.round((progress.answered / progress.total) * 100) : 0

  const criticalRemaining = progress.criticalTotal - progress.criticalAnswered

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={cn('absolute bottom-4 left-1/2 z-50 -translate-x-1/2', 'w-full max-w-md px-4')}
    >
      <div
        className={cn(
          'rounded-xl border shadow-lg backdrop-blur-sm',
          isDark ? 'border-purple-800 bg-slate-900/95' : 'border-purple-200 bg-white/95'
        )}
      >
        <div className="p-4">
          {/* Header */}
          <div className="mb-3 flex items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg',
                isDark ? 'bg-purple-900/50' : 'bg-purple-100'
              )}
            >
              <MessageCircleQuestion
                className={cn('h-4 w-4', isDark ? 'text-purple-400' : 'text-purple-600')}
              />
            </div>
            <div>
              <h3 className={cn('text-sm font-semibold', isDark ? 'text-white' : 'text-slate-900')}>
                Уточняющие вопросы
              </h3>
              <p className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>
                Ответьте на вопросы для продолжения
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="mb-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                Прогресс: {progress.answered} / {progress.total}
              </span>
              <span className={cn('font-medium', isDark ? 'text-purple-400' : 'text-purple-600')}>
                {progressPercent}%
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />

            {criticalRemaining > 0 && (
              <p className={cn('text-xs', isDark ? 'text-red-400' : 'text-red-600')}>
                Обязательных: осталось {criticalRemaining}
              </p>
            )}
          </div>

          {/* Action Button */}
          <Button
            size="sm"
            className={cn(
              'w-full',
              isDark ? 'bg-purple-600 hover:bg-purple-700' : 'bg-purple-600 hover:bg-purple-700'
            )}
            disabled={!progress.canProceed || isProcessing}
            onClick={onContinue}
          >
            {isProcessing ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                Обработка...
              </>
            ) : (
              <>
                Продолжить генерацию
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          {/* Helper text */}
          {!progress.canProceed && (
            <p
              className={cn(
                'mt-2 text-center text-xs',
                isDark ? 'text-slate-500' : 'text-slate-400'
              )}
            >
              Ответьте на все обязательные вопросы
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}
