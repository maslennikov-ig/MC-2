'use client'

import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface WizardNavigationProps {
  currentIndex: number
  totalQuestions: number
  questionsStatus: Array<{
    isAnswered: boolean
    priority?: 'critical' | 'important' | 'nice_to_have'
  }>
  onPrev: () => void
  onNext: () => void
  onContinue: () => void
  isProcessing: boolean
  /** Hide the continue button (used in read-only mode) */
  hideContinueButton?: boolean
  /** Can skip current question (only for nice_to_have) */
  canSkipCurrent?: boolean
  /** Handler for skipping current question */
  onSkip?: () => void
  /** All questions answered */
  isComplete?: boolean
}

export function WizardNavigation({
  currentIndex,
  totalQuestions,
  questionsStatus,
  onPrev,
  onNext,
  onContinue,
  isProcessing,
  hideContinueButton = false,
  canSkipCurrent = false,
  onSkip,
  isComplete = false,
}: WizardNavigationProps) {
  const isFirstQuestion = currentIndex === 0
  const isLastQuestion = currentIndex === totalQuestions - 1

  return (
    <div className="mt-4">
      {isComplete ? (
        // All questions answered - show only "Continue generation" button
        !hideContinueButton && (
          <Button
            onClick={onContinue}
            disabled={isProcessing}
            className="min-h-[44px] w-full bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Обработка...
              </>
            ) : (
              'Продолжить генерацию'
            )}
          </Button>
        )
      ) : (
        // Not all questions answered - show navigation with optional skip
        <div className="flex items-center justify-between border-t border-slate-200 bg-white p-4 md:border-0 md:bg-transparent md:p-0 dark:border-slate-800 dark:bg-transparent">
          <Button
            variant="outline"
            onClick={onPrev}
            disabled={isFirstQuestion}
            className="min-h-[44px] min-w-[44px]"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">Назад</span>
          </Button>

          {/* Mobile dots indicator */}
          <div className="flex items-center gap-1 md:hidden">
            {questionsStatus.map((status, idx) => (
              <div
                key={idx}
                className={cn(
                  'h-2 w-2 rounded-full transition-colors',
                  idx === currentIndex
                    ? 'bg-purple-500 dark:bg-purple-400'
                    : status.isAnswered
                      ? 'bg-emerald-400 dark:bg-emerald-500'
                      : 'bg-slate-300 dark:bg-slate-600'
                )}
              />
            ))}
          </div>

          {/* Right side: Skip + Next */}
          <div className="flex items-center gap-2">
            {canSkipCurrent && onSkip && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSkip}
                disabled={isProcessing}
                aria-label="Пропустить текущий вопрос"
                className="min-h-[44px] px-4 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Пропустить
              </Button>
            )}
            <Button
              variant="outline"
              onClick={onNext}
              disabled={isLastQuestion}
              className="min-h-[44px] min-w-[44px]"
            >
              <span className="hidden sm:inline">Далее</span>
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
