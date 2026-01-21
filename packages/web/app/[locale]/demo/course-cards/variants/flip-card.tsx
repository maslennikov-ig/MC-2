'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { BookOpen, Clock, Users, Award, ChevronRight, CheckCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DemoCourse } from '../page'

interface FlipCardProps {
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

export function FlipCard({ course, onClick }: FlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const duration = Math.round(course.estimated_completion_minutes / 60)
  const hasCover = !!course.coverUrl
  const statusInfo = statusConfig[course.generation_status || 'draft'] || statusConfig.draft
  const difficultyInfo = difficultyConfig[course.difficulty] || difficultyConfig.intermediate

  const handleFlip = () => {
    setIsFlipped(!isFlipped)
  }

  return (
    <div
      className="perspective-1000 h-[480px] cursor-pointer"
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      onClick={handleFlip}
    >
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ transformStyle: 'preserve-3d' }}
        className="relative h-full w-full"
      >
        {/* Front Side */}
        <div
          className={cn(
            'absolute inset-0 overflow-hidden rounded-2xl',
            'bg-white shadow-xl dark:bg-slate-900',
            'border border-gray-100 dark:border-slate-800',
            'backface-hidden',
            'flex flex-col'
          )}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* Cover - растягивается */}
          <div className="relative min-h-[200px] flex-1 overflow-hidden">
            {hasCover ? (
              <Image src={course.coverUrl!} alt={course.title} fill className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                <BookOpen className="h-16 w-16 text-slate-700" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-5">
            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <Badge className={cn('border', statusInfo.color)}>{statusInfo.label}</Badge>
              <Badge className={cn('border', difficultyInfo.color)}>{difficultyInfo.label}</Badge>
            </div>

            {/* Title */}
            <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-gray-900 dark:text-white">
              {course.title}
            </h3>

            {/* Stats */}
            <div className="mt-3 flex items-center gap-4 text-sm text-gray-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-4 w-4" />
                {course.total_sections_count} модулей
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {duration}ч
              </span>
            </div>

            {/* Flip hint */}
            <div className="mt-3 text-xs text-gray-400 dark:text-slate-500">
              Наведите для деталей
            </div>
          </div>
        </div>

        {/* Back Side */}
        <div
          className={cn(
            'absolute inset-0 overflow-hidden rounded-2xl',
            'bg-slate-900 shadow-xl',
            'border border-slate-700',
            'flex flex-col backface-hidden'
          )}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="flex flex-1 flex-col p-5">
            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <Badge className={cn('border', statusInfo.color)}>{statusInfo.label}</Badge>
              <Badge className={cn('border', difficultyInfo.color)}>{difficultyInfo.label}</Badge>
            </div>

            {/* Title */}
            <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-white">{course.title}</h3>

            {/* Description */}
            {course.course_description && (
              <p className="mt-3 line-clamp-2 text-sm text-slate-400">
                {course.course_description}
              </p>
            )}

            {/* Target audience */}
            {course.target_audience && (
              <div className="mt-4 flex items-start gap-2">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                <p className="line-clamp-1 text-sm text-slate-300">{course.target_audience}</p>
              </div>
            )}

            {/* Learning outcomes */}
            {course.learning_outcomes && course.learning_outcomes.length > 0 && (
              <div className="mt-3 flex items-start gap-2">
                <Award className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div className="text-sm text-slate-300">
                  {course.learning_outcomes.slice(0, 2).map((outcome, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />
                      <span className="line-clamp-1">{outcome}</span>
                    </div>
                  ))}
                  {course.learning_outcomes.length > 2 && (
                    <span className="text-slate-500">
                      +{course.learning_outcomes.length - 2} ещё
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* CTA Button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClick()
              }}
              className={cn(
                'mt-auto flex w-full items-center justify-center gap-2 rounded-full py-3',
                'bg-cyan-500 font-medium text-white',
                'transition-colors hover:bg-cyan-600',
                'focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:outline-none'
              )}
            >
              Открыть курс
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
