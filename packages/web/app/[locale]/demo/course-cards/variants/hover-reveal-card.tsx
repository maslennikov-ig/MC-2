'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Clock, Users, Award, ChevronRight, CheckCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DemoCourse } from '../page'

interface HoverRevealCardProps {
  course: DemoCourse
  onClick: () => void
  isDark?: boolean
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

export function HoverRevealCard({ course, onClick, isDark = true }: HoverRevealCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const duration = Math.round(course.estimated_completion_minutes / 60)
  const hasCover = !!course.coverUrl
  const statusInfo = statusConfig[course.generation_status || 'draft'] || statusConfig.draft
  const difficultyInfo = difficultyConfig[course.difficulty] || difficultyConfig.intermediate

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-2xl',
        'flex min-h-[480px] flex-col transition-shadow duration-300',
        isDark
          ? 'border border-slate-800 bg-slate-900 shadow-lg hover:shadow-2xl'
          : 'border border-gray-200 bg-white shadow-md hover:shadow-xl'
      )}
    >
      {/* Cover Image - занимает основную часть карточки */}
      <div className="relative min-h-[280px] flex-1 overflow-hidden">
        {hasCover ? (
          <Image
            src={course.coverUrl!}
            alt={course.title}
            fill
            className={cn(
              'object-cover transition-all duration-500',
              isHovered && (isDark ? 'scale-110 brightness-75' : 'scale-105 brightness-90')
            )}
          />
        ) : (
          <div
            className={cn(
              'flex h-full items-center justify-center transition-all duration-500',
              isDark
                ? 'bg-gradient-to-br from-slate-800 to-slate-900'
                : 'bg-gradient-to-br from-gray-100 to-gray-200',
              isHovered && (isDark ? 'brightness-75' : 'brightness-95')
            )}
          >
            <BookOpen className={cn('h-16 w-16', isDark ? 'text-slate-700' : 'text-gray-400')} />
          </div>
        )}

        {/* Градиент внизу изображения (только для тёмной темы) */}
        {isDark && (
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
        )}

        {/* Бейджи поверх изображения */}
        <div className="absolute top-4 left-4 flex flex-wrap gap-2">
          <Badge className={cn('border backdrop-blur-sm', statusInfo.color)}>
            {statusInfo.label}
          </Badge>
          <Badge className={cn('border backdrop-blur-sm', difficultyInfo.color)}>
            {difficultyInfo.label}
          </Badge>
        </div>
      </div>

      {/* Base Content - компактный */}
      <div className="p-4">
        {/* Title */}
        <h3
          className={cn(
            'line-clamp-2 text-base font-semibold transition-colors',
            isDark
              ? 'text-white group-hover:text-cyan-400'
              : 'text-gray-900 group-hover:text-cyan-600'
          )}
        >
          {course.title}
        </h3>

        {/* Stats */}
        <div
          className={cn(
            'mt-2 flex items-center gap-4 text-sm',
            isDark ? 'text-slate-400' : 'text-gray-500'
          )}
        >
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" />
            {course.total_sections_count} модулей
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {duration}ч
          </span>
        </div>
      </div>

      {/* Hover Reveal Panel - выезжает снизу поверх контента */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className={cn(
              'absolute inset-x-0 bottom-0 flex flex-col',
              'rounded-t-2xl border-t p-4 pt-5 backdrop-blur-md',
              isDark
                ? 'border-slate-700/50 bg-gradient-to-t from-slate-900 via-slate-900 to-slate-900/95 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.3)]'
                : 'border-gray-200 bg-gradient-to-t from-white via-white to-white/95 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.1)]'
            )}
          >
            {/* Title */}
            <motion.h3
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className={cn(
                'line-clamp-2 text-base font-semibold',
                isDark ? 'text-white' : 'text-gray-900'
              )}
            >
              {course.title}
            </motion.h3>

            {/* Description */}
            {course.course_description && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={cn(
                  'mt-2 line-clamp-2 text-sm',
                  isDark ? 'text-slate-300' : 'text-gray-600'
                )}
              >
                {course.course_description}
              </motion.p>
            )}

            {/* Target audience */}
            {course.target_audience && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mt-3 flex items-start gap-2"
              >
                <Users
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    isDark ? 'text-cyan-400' : 'text-cyan-600'
                  )}
                />
                <p
                  className={cn(
                    'line-clamp-1 text-sm',
                    isDark ? 'text-slate-300' : 'text-gray-700'
                  )}
                >
                  {course.target_audience}
                </p>
              </motion.div>
            )}

            {/* Learning outcomes */}
            {course.learning_outcomes && course.learning_outcomes.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-2 flex items-start gap-2"
              >
                <Award
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    isDark ? 'text-amber-400' : 'text-amber-500'
                  )}
                />
                <div
                  className={cn('space-y-0.5 text-sm', isDark ? 'text-slate-300' : 'text-gray-700')}
                >
                  {course.learning_outcomes.slice(0, 2).map((outcome, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <CheckCircle
                        className={cn(
                          'mt-0.5 h-3 w-3 shrink-0',
                          isDark ? 'text-green-400' : 'text-green-500'
                        )}
                      />
                      <span className="line-clamp-1">{outcome}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* CTA Button */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              whileHover={{ scale: 1.02 }}
              onClick={(e) => {
                e.stopPropagation()
                onClick()
              }}
              className={cn(
                'mt-4 flex w-full items-center justify-center gap-2 rounded-full py-2.5',
                'bg-cyan-500 font-medium text-white',
                'transition-colors hover:bg-cyan-600',
                'focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:outline-none'
              )}
            >
              Открыть курс
              <ChevronRight className="h-4 w-4" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
