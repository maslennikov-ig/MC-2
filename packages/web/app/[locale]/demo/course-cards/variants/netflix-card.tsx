'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Play, Plus, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DemoCourse } from '../page'

interface NetflixCardProps {
  course: DemoCourse
  onClick: () => void
}

const difficultyConfig: Record<string, { label: string }> = {
  beginner: { label: 'Начальный' },
  intermediate: { label: 'Средний' },
  advanced: { label: 'Продвинутый' },
}

export function NetflixCard({ course, onClick }: NetflixCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const duration = Math.round(course.estimated_completion_minutes / 60)
  const hasCover = !!course.coverUrl
  const difficultyInfo = difficultyConfig[course.difficulty] || difficultyConfig.intermediate

  return (
    <div
      className={cn(
        'relative',
        // При hover поднимаем z-index чтобы expanded карточка была поверх соседей
        isHovered && 'z-50'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Base Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          'cursor-pointer overflow-hidden rounded-lg',
          'bg-slate-900 shadow-lg',
          'transition-all duration-300',
          'flex min-h-[480px] flex-col',
          isHovered && 'invisible'
        )}
        onClick={onClick}
      >
        {/* Cover Image */}
        <div className="relative min-h-[320px] flex-1 overflow-hidden">
          {hasCover ? (
            <Image src={course.coverUrl!} alt={course.title} fill className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
              <BookOpen className="h-16 w-16 text-slate-700" />
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
        </div>

        {/* Minimal info */}
        <div className="p-4">
          <h3 className="line-clamp-1 font-semibold text-white">{course.title}</h3>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
            <span>{difficultyInfo.label}</span>
            <span className="text-slate-600">•</span>
            <span>{duration}ч</span>
          </div>
        </div>
      </motion.div>

      {/* Expanded Card on Hover */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1.08 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className={cn(
              'absolute inset-0 cursor-pointer overflow-hidden rounded-xl',
              'bg-slate-900 shadow-2xl',
              'border border-slate-700',
              'flex flex-col'
            )}
            style={{
              transformOrigin: 'center top',
            }}
            onClick={onClick}
          >
            {/* Cover Image - растягивается на доступное пространство */}
            <div className="relative min-h-[200px] flex-1 overflow-hidden">
              {hasCover ? (
                <Image src={course.coverUrl!} alt={course.title} fill className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                  <BookOpen className="h-12 w-12 text-slate-700" />
                </div>
              )}
              {/* Play button overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 backdrop-blur-sm"
                >
                  <Play className="ml-1 h-6 w-6 text-slate-900" fill="currentColor" />
                </motion.div>
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              {/* Action buttons */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex items-center gap-2"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onClick()
                  }}
                  className={cn(
                    'flex h-9 flex-1 items-center justify-center gap-2 rounded-md',
                    'bg-white text-sm font-medium text-slate-900',
                    'transition-colors hover:bg-slate-200'
                  )}
                >
                  <Play className="h-4 w-4" fill="currentColor" />
                  Открыть
                </button>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full',
                    'border-2 border-slate-500 text-white',
                    'transition-colors hover:border-white'
                  )}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full',
                    'border-2 border-slate-500 text-white',
                    'transition-colors hover:border-white'
                  )}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </motion.div>

              {/* Meta info */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mt-3 flex items-center gap-2 text-sm"
              >
                <Badge className="border-0 bg-green-600 text-xs text-white">
                  {difficultyInfo.label}
                </Badge>
                <span className="text-slate-400">{course.total_sections_count} модулей</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400">{duration}ч</span>
              </motion.div>

              {/* Title */}
              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-2 line-clamp-2 font-semibold text-white"
              >
                {course.title}
              </motion.h3>

              {/* Description */}
              {course.course_description && (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="mt-2 line-clamp-2 text-sm text-slate-400"
                >
                  {course.course_description}
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
