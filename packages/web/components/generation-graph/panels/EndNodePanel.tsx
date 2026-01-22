'use client'

import React, { useMemo } from 'react'
import {
  Trophy,
  Layers,
  BookOpen,
  ExternalLink,
  Clock,
  CheckCircle2,
  Sparkles,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Link } from '@/src/i18n/navigation'
import { useTranslation } from '@/lib/generation-graph/useTranslation'
import { getModuleWord, getLessonWord } from '@/lib/generation-graph/utils/pluralization'
import { cn } from '@/lib/utils'

/**
 * Props for the EndNodePanel component.
 */
interface EndNodePanelProps {
  /** Course URL slug for navigation (optional, shows fallback if missing) */
  courseSlug?: string
  /** Display title of the course */
  courseTitle: string
  /** Total number of modules in the course */
  moduleCount: number
  /** Total number of lessons in the course */
  lessonCount: number
  /** Whether all course generation is complete */
  isCompleted: boolean
}

/**
 * Panel content for End Node in NodeDetailsDrawer.
 *
 * Displays course completion status with:
 * - Hero section with completion/pending state
 * - Course title
 * - Stats cards (modules and lessons count with proper Russian pluralization)
 * - Congratulatory or pending message
 * - CTA button to view course (with fallback when courseSlug is missing)
 *
 * Supports both light and dark themes.
 *
 * @example
 * ```tsx
 * <EndNodePanel
 *   courseSlug="my-course"
 *   courseTitle="Introduction to TypeScript"
 *   moduleCount={5}
 *   lessonCount={25}
 *   isCompleted={true}
 * />
 * ```
 */
export function EndNodePanel({
  courseSlug,
  courseTitle,
  moduleCount,
  lessonCount,
  isCompleted,
}: EndNodePanelProps) {
  const { t } = useTranslation()

  // Memoized plural forms for Russian language support
  const moduleLabel = useMemo(() => getModuleWord(moduleCount, t, 'common'), [moduleCount, t])
  const lessonLabel = useMemo(() => getLessonWord(lessonCount, t, 'common'), [lessonCount, t])

  return (
    <div className="flex h-full flex-col">
      {/* Hero Section */}
      <div
        className={cn(
          'relative mb-6 overflow-hidden rounded-xl p-6',
          isCompleted
            ? 'bg-gradient-to-br from-emerald-500 to-green-600 dark:from-emerald-600 dark:to-green-700'
            : 'bg-gradient-to-br from-slate-400 to-slate-500 dark:from-slate-600 dark:to-slate-700'
        )}
      >
        {/* Decorative sparkles for completed state */}
        {isCompleted && (
          <>
            <Sparkles className="absolute top-3 right-3 h-6 w-6 animate-pulse text-yellow-300/50" />
            <Sparkles className="absolute bottom-4 left-4 h-4 w-4 animate-pulse text-yellow-300/30 delay-75" />
          </>
        )}

        <div className="relative z-10 flex items-center gap-4">
          <div
            className={cn(
              'flex h-16 w-16 items-center justify-center rounded-full',
              isCompleted ? 'bg-white/20 text-white' : 'bg-white/10 text-white/80'
            )}
          >
            {isCompleted ? <Trophy size={32} className="drop-shadow-lg" /> : <Clock size={32} />}
          </div>
          <div className="flex-1">
            <p className="mb-1 text-sm text-white/80">{t('endNode.completionStatus')}</p>
            <h2 className="text-xl font-bold text-white">
              {isCompleted ? t('endNode.generationComplete') : t('endNode.generationPending')}
            </h2>
          </div>
        </div>
      </div>

      {/* Course Title */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{courseTitle}</h3>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div
          className={cn(
            'rounded-lg border p-4 transition-colors',
            isCompleted
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-700/50 dark:bg-emerald-900/20'
              : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            <Layers
              size={18}
              className={cn(
                isCompleted
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              )}
            />
            <span className="text-sm text-slate-600 dark:text-slate-400">{moduleLabel}</span>
          </div>
          <p
            className={cn(
              'text-2xl font-bold',
              isCompleted
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-slate-700 dark:text-slate-300'
            )}
          >
            {moduleCount}
          </p>
        </div>

        <div
          className={cn(
            'rounded-lg border p-4 transition-colors',
            isCompleted
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-700/50 dark:bg-emerald-900/20'
              : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            <BookOpen
              size={18}
              className={cn(
                isCompleted
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              )}
            />
            <span className="text-sm text-slate-600 dark:text-slate-400">{lessonLabel}</span>
          </div>
          <p
            className={cn(
              'text-2xl font-bold',
              isCompleted
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-slate-700 dark:text-slate-300'
            )}
          >
            {lessonCount}
          </p>
        </div>
      </div>

      {/* Message */}
      <div
        className={cn(
          'mb-6 flex items-start gap-3 rounded-lg p-4',
          isCompleted ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-amber-50 dark:bg-amber-900/20'
        )}
      >
        <CheckCircle2
          size={20}
          className={cn(
            'mt-0.5 shrink-0',
            isCompleted
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-amber-600 dark:text-amber-400'
          )}
        />
        <p
          className={cn(
            'text-sm',
            isCompleted
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-amber-700 dark:text-amber-300'
          )}
        >
          {isCompleted ? t('endNode.congratulations') : t('endNode.pendingMessage')}
        </p>
      </div>

      {/* CTA Button */}
      {isCompleted && (
        <div className="mt-auto">
          {courseSlug ? (
            <Button
              asChild
              className="w-full bg-emerald-500 text-white hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              size="lg"
            >
              <Link href={`/courses/${courseSlug}`} target="_blank" rel="noopener noreferrer">
                <span>{t('endNode.viewCourse')}</span>
                <ExternalLink size={16} className="ml-2" />
              </Link>
            </Button>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
              <AlertCircle size={16} />
              <span>{t('endNode.loadingLink')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
