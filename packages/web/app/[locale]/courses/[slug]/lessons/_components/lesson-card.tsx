'use client'

import { motion } from 'framer-motion'
import { BookOpen, Play, CheckCircle2, Clock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { SmoothProgress } from '@/components/ui/smooth-progress'
import { cn } from '@/lib/utils'

type LessonStatus = 'not_started' | 'in_progress' | 'completed'

interface LessonCardProps {
  lesson: {
    id: string
    title: string
    duration_minutes?: number | null
    order_index?: number
  }
  /** Whether the lesson has been completed by the user */
  isCompleted?: boolean
  enrichments?: {
    has_video: boolean
    has_audio: boolean
    has_presentation: boolean
    has_quiz: boolean
  }
  onClick?: () => void
  className?: string
}

// Status configuration (color scheme matching specification)
const statusConfig: Record<
  LessonStatus,
  {
    color: string
    icon: React.ComponentType<{ className?: string }>
  }
> = {
  not_started: {
    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    icon: BookOpen,
  },
  in_progress: {
    color: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
    icon: Play,
  },
  completed: {
    color: 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400',
    icon: CheckCircle2,
  },
}

// Media badge configuration with i18n keys for accessibility
const mediaBadges = [
  {
    key: 'has_video' as const,
    labelKey: 'media.video' as const,
    emoji: '🎬',
    color: 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400',
  },
  {
    key: 'has_audio' as const,
    labelKey: 'media.audio' as const,
    emoji: '🎧',
    color: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
  },
  {
    key: 'has_presentation' as const,
    labelKey: 'media.presentation' as const,
    emoji: '📊',
    color: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400',
  },
  {
    key: 'has_quiz' as const,
    labelKey: 'media.quiz' as const,
    emoji: '❓',
    color: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400',
  },
]

export function LessonCard({
  lesson,
  isCompleted = false,
  enrichments,
  onClick,
  className,
}: LessonCardProps) {
  const t = useTranslations('course.lesson')
  // Determine status based on completion (simple binary for now)
  const status: LessonStatus = isCompleted ? 'completed' : 'not_started'
  const progressPercent = isCompleted ? 100 : 0
  const statusInfo = statusConfig[status]
  const StatusIcon = statusInfo.icon

  // Filter active media badges
  const activeMediaBadges = enrichments ? mediaBadges.filter((badge) => enrichments[badge.key]) : []

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-xl',
        'flex min-h-[280px] flex-col transition-all duration-300',
        'border border-gray-200 bg-white shadow-sm hover:shadow-md',
        'dark:border-slate-800 dark:bg-slate-900 dark:shadow-lg dark:hover:shadow-xl',
        'hover:border-purple-300/60 dark:hover:border-purple-600/40',
        'focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:outline-none',
        className
      )}
      tabIndex={0}
      role="article"
      aria-labelledby={`lesson-title-${lesson.id}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      {/* Top section: Media badges and lesson type icon */}
      <div className="relative min-h-[160px] flex-1 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-900">
        {/* Media badges (top-left) with accessibility labels */}
        {activeMediaBadges.length > 0 && (
          <div className="absolute top-2 left-2 flex gap-1">
            {activeMediaBadges.map((badge) => (
              <Badge
                key={badge.key}
                aria-label={t(badge.labelKey)}
                className={cn('border px-1.5 py-0.5 text-xs backdrop-blur-sm', badge.color)}
              >
                <span aria-hidden="true">{badge.emoji}</span>
              </Badge>
            ))}
          </div>
        )}

        {/* Lesson type icon (center) */}
        <div className="flex h-full items-center justify-center">
          <StatusIcon
            className={cn(
              'h-12 w-12 transition-all duration-300',
              status === 'not_started' && 'text-gray-400 dark:text-slate-700',
              status === 'completed' && 'text-green-500 dark:text-green-400',
              'group-hover:scale-110'
            )}
          />
        </div>
      </div>

      {/* Bottom section: Title, progress, status, duration */}
      <div className="flex flex-col gap-2 p-4">
        {/* Title */}
        <h3
          id={`lesson-title-${lesson.id}`}
          className={cn(
            'line-clamp-2 text-sm font-semibold transition-colors',
            'text-gray-900 group-hover:text-purple-600',
            'dark:text-white dark:group-hover:text-purple-400'
          )}
        >
          {lesson.title}
        </h3>

        {/* Progress bar */}
        <SmoothProgress
          value={progressPercent}
          size="sm"
          colorClass={
            status === 'completed'
              ? 'bg-green-500 dark:bg-green-400'
              : 'bg-blue-500 dark:bg-blue-400'
          }
          className="w-full"
        />

        {/* Status badge and duration */}
        <div className="flex items-center justify-between gap-2">
          <Badge className={cn('border px-2 py-0.5 text-xs', statusInfo.color)}>
            <StatusIcon className="mr-1 h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Статус урока: </span>
            {t(`status.${status}`)}
          </Badge>

          {lesson.duration_minutes && (
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {t('duration', { minutes: lesson.duration_minutes })}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
