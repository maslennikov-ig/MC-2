'use client'

import { useTranslations } from 'next-intl'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface WizardProgressProps {
  currentIndex: number
  totalQuestions: number
  answeredCount: number
  priorityCounts: {
    critical: { total: number; answered: number }
    important: { total: number; answered: number }
    nice_to_have: { total: number; answered: number }
  }
  conflictCounts?: { total: number; answered: number }
}

const priorityDots = {
  critical: {
    color: 'text-red-500 dark:text-red-400',
  },
  important: {
    color: 'text-amber-400 dark:text-amber-300',
  },
  nice_to_have: {
    color: 'text-slate-400 dark:text-slate-500',
  },
} as const

export function WizardProgress({
  currentIndex,
  totalQuestions,
  answeredCount,
  priorityCounts,
  conflictCounts,
}: WizardProgressProps) {
  const t = useTranslations('generation.clarifying')
  const progress = (answeredCount / totalQuestions) * 100

  return (
    <div className="mb-4">
      {/* Main progress line with counters */}
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-400">
          {t('questionOf', { current: currentIndex + 1, total: totalQuestions })}
        </span>
        <span className="text-slate-600 dark:text-slate-400">
          {t('answered', { count: answeredCount })}
        </span>
      </div>

      {/* Progress bar */}
      <Progress value={progress} className="mb-2 h-2" />

      {/* Priority counters with dots */}
      <div className="flex items-center gap-3 text-xs">
        {conflictCounts && conflictCounts.total > 0 && (
          <div
            className="flex items-center gap-1.5 border-r border-slate-200 pr-3 dark:border-slate-700"
            aria-label={t('documentEvidence.sectionTitle')}
          >
            <div className="h-2 w-2 rounded-full bg-orange-500" />
            <span className="font-semibold text-orange-700 tabular-nums dark:text-orange-300">
              {conflictCounts.answered}/{conflictCounts.total}
            </span>
          </div>
        )}
        {(Object.keys(priorityCounts) as Array<keyof typeof priorityCounts>).map((priority) => {
          const { total, answered } = priorityCounts[priority]
          const { color } = priorityDots[priority]

          return (
            <div
              key={priority}
              className="flex items-center gap-1.5"
              title={t('priorityTooltip', { label: t(`priority.${priority}`), answered, total })}
            >
              <div className={cn('h-2 w-2 rounded-full', color.replace('text-', 'bg-'))} />
              <span className={cn('font-medium tabular-nums', color)}>
                {answered}/{total}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
