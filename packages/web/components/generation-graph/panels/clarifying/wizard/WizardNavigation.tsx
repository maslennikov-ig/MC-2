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
  canContinue: boolean // все critical отвечены
  onContinue: () => void
  isProcessing: boolean
}

export function WizardNavigation({
  currentIndex,
  totalQuestions,
  questionsStatus,
  onPrev,
  onNext,
  canContinue,
  onContinue,
  isProcessing,
}: WizardNavigationProps) {
  const isFirstQuestion = currentIndex === 0
  const isLastQuestion = currentIndex === totalQuestions - 1

  return (
    <div className="mt-4">
      {/* Continue button (when ready) */}
      {canContinue && (
        <div className="mb-3">
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
        </div>
      )}

      {/* Navigation controls */}
      <div className="-mx-4 flex items-center justify-between border-t border-slate-200 bg-white p-4 md:mx-0 md:border-0 md:bg-transparent md:p-0 dark:border-slate-800 dark:bg-slate-950">
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
  )
}
