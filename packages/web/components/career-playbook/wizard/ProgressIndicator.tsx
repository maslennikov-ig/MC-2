'use client'

import { CheckCircle2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

interface ProgressIndicatorCopy {
  questionLabel?: string
  answeredLabel?: string
  ofLabel?: string
}

interface ProgressIndicatorProps {
  answeredCount: number
  currentIndex: number
  totalCount: number
  copy?: ProgressIndicatorCopy
}

const defaultCopy: Required<ProgressIndicatorCopy> = {
  questionLabel: 'Вопрос',
  answeredLabel: 'Отвечено',
  ofLabel: 'из',
}

export function ProgressIndicator({
  answeredCount,
  currentIndex,
  totalCount,
  copy,
}: ProgressIndicatorProps) {
  const labels = { ...defaultCopy, ...copy }
  const safeTotal = Math.max(totalCount, 0)
  const boundedAnswered = Math.min(Math.max(answeredCount, 0), safeTotal)
  const percent = safeTotal > 0 ? Math.round((boundedAnswered / safeTotal) * 100) : 0
  const displayIndex = safeTotal > 0 ? Math.min(currentIndex + 1, safeTotal) : 0

  return (
    <section aria-label="Wizard progress" className="min-h-[72px] space-y-3">
      <div className="flex min-h-6 items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
        <span className="whitespace-nowrap">
          {labels.questionLabel} {displayIndex} {labels.ofLabel} {safeTotal}
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap font-medium text-slate-800 dark:text-slate-100">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          {labels.answeredLabel}: {boundedAnswered}
        </span>
      </div>
      <div className="grid min-h-7 grid-cols-[1fr_auto] items-center gap-3">
        <Progress value={percent} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} />
        <span className="w-10 text-right text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
          {percent}%
        </span>
      </div>
    </section>
  )
}
