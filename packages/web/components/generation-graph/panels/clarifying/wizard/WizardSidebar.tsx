'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuestionPriority } from '@megacampus/shared-types'

interface WizardSidebarProps {
  questions: Array<{
    id: string
    text: string
    priority: QuestionPriority
    isAnswered: boolean
  }>
  currentIndex: number
  onSelect: (index: number) => void
}

const priorityDotColors: Record<QuestionPriority, string> = {
  critical: 'bg-red-500 border-red-500 dark:bg-red-400 dark:border-red-400',
  important: 'bg-amber-400 border-amber-400 dark:bg-amber-300 dark:border-amber-300',
  nice_to_have: 'bg-slate-300 border-slate-300 dark:bg-slate-500 dark:border-slate-500',
}

export function WizardSidebar({ questions, currentIndex, onSelect }: WizardSidebarProps) {
  return (
    <div className="hidden w-[200px] flex-shrink-0 md:block">
      <div className="space-y-1">
        {questions.map((question, idx) => (
          <button
            key={question.id}
            onClick={() => onSelect(idx)}
            className={cn(
              'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
              'flex items-center gap-2',
              idx === currentIndex
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            )}
          >
            {/* Status indicator */}
            {question.isAnswered ? (
              <Check className="h-4 w-4 flex-shrink-0 text-emerald-500 dark:text-emerald-400" />
            ) : (
              <div
                className={cn(
                  'h-4 w-4 flex-shrink-0 rounded-full border-2',
                  priorityDotColors[question.priority]
                )}
              />
            )}

            {/* Question number and truncated text */}
            <span className="truncate">
              {idx + 1}. {question.text.slice(0, 20)}
              {question.text.length > 20 && '...'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
