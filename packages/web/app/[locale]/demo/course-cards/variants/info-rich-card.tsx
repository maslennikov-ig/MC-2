'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  BookOpen,
  Clock,
  Globe,
  Users,
  ChevronRight,
  Heart,
  Share2,
  CheckCircle,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DemoCourse } from '../page'

interface InfoRichCardProps {
  course: DemoCourse
  onClick: () => void
}

const statusConfig: Record<string, { color: string; label: string }> = {
  completed: { color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Готов' },
  generating: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Генерируется' },
  draft: { color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', label: 'Черновик' },
}

const difficultyConfig: Record<string, { color: string; label: string }> = {
  beginner: { color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Начальный' },
  intermediate: {
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    label: 'Средний',
  },
  advanced: {
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    label: 'Продвинутый',
  },
}

export function InfoRichCard({ course, onClick }: InfoRichCardProps) {
  const duration = Math.round(course.estimated_completion_minutes / 60)
  const hasCover = !!course.coverUrl
  const statusInfo = statusConfig[course.generation_status || 'draft'] || statusConfig.draft
  const difficultyInfo = difficultyConfig[course.difficulty] || difficultyConfig.intermediate
  const isNew = true // For demo purposes

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className={cn(
        'group cursor-pointer overflow-hidden rounded-2xl',
        'bg-white shadow-lg dark:bg-slate-900',
        'border border-gray-100 dark:border-slate-800',
        'transition-shadow duration-300 hover:shadow-2xl',
        'flex min-h-[480px] flex-col'
      )}
    >
      {/* Cover Image (16:9) */}
      <div className="relative aspect-video overflow-hidden">
        {hasCover ? (
          <Image
            src={course.coverUrl!}
            alt={course.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
            <BookOpen className="h-16 w-16 text-slate-700" />
          </div>
        )}
        {/* New badge */}
        {isNew && (
          <div className="absolute top-3 right-3">
            <Badge className="border-0 bg-gradient-to-r from-purple-500 to-cyan-500 text-white">
              <Sparkles className="mr-1 h-3 w-3" />
              NEW
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        {/* Badges row */}
        <div className="flex flex-wrap gap-2">
          <Badge className={cn('border', statusInfo.color)}>{statusInfo.label}</Badge>
          <Badge className={cn('border', difficultyInfo.color)}>{difficultyInfo.label}</Badge>
        </div>

        {/* Title */}
        <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-gray-900 transition-colors group-hover:text-cyan-600 dark:text-white dark:group-hover:text-cyan-400">
          {course.title}
        </h3>

        {/* Description */}
        {course.course_description && (
          <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-slate-400">
            {course.course_description}
          </p>
        )}

        {/* Target audience */}
        {course.target_audience && (
          <div className="mt-3 flex items-start gap-2">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
            <p className="line-clamp-1 text-sm text-gray-500 dark:text-slate-500">
              {course.target_audience}
            </p>
          </div>
        )}

        {/* Learning outcomes preview */}
        {course.learning_outcomes && course.learning_outcomes.length > 0 && (
          <div className="mt-3 space-y-1">
            {course.learning_outcomes.slice(0, 2).map((outcome, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 text-sm text-gray-500 dark:text-slate-500"
              >
                <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                <span className="line-clamp-1">{outcome}</span>
              </div>
            ))}
          </div>
        )}

        {/* Stats grid */}
        <div className="mt-4 grid grid-cols-4 gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="text-center">
            <BookOpen className="mx-auto h-4 w-4 text-purple-500" />
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">Модули</p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {course.total_sections_count}
            </p>
          </div>
          <div className="text-center">
            <BookOpen className="mx-auto h-4 w-4 text-blue-500" />
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">Уроки</p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {course.total_lessons_count}
            </p>
          </div>
          <div className="text-center">
            <Clock className="mx-auto h-4 w-4 text-amber-500" />
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">Время</p>
            <p className="font-semibold text-gray-900 dark:text-white">{duration}ч</p>
          </div>
          <div className="text-center">
            <Globe className="mx-auto h-4 w-4 text-green-500" />
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">Язык</p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {course.language.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-red-500"
              onClick={(e) => e.stopPropagation()}
            >
              <Heart className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-blue-500"
              onClick={(e) => e.stopPropagation()}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
          <Button
            size="sm"
            className="rounded-full bg-cyan-500 text-white hover:bg-cyan-600"
            onClick={(e) => {
              e.stopPropagation()
              onClick()
            }}
          >
            Открыть
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
