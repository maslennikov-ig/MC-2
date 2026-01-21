'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { BookOpen, Clock, Globe, Users, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DemoCourse } from '../page'

interface GlassCardProps {
  course: DemoCourse
  onClick: () => void
}

const statusConfig: Record<string, { color: string; label: string }> = {
  completed: { color: 'bg-green-500/30 text-green-300 border-green-500/40', label: 'Готов' },
  generating: { color: 'bg-blue-500/30 text-blue-300 border-blue-500/40', label: 'Генерируется' },
  draft: { color: 'bg-gray-500/30 text-gray-300 border-gray-500/40', label: 'Черновик' },
}

const difficultyConfig: Record<string, { color: string; label: string }> = {
  beginner: { color: 'bg-green-500/30 text-green-300 border-green-500/40', label: 'Начальный' },
  intermediate: {
    color: 'bg-yellow-500/30 text-yellow-300 border-yellow-500/40',
    label: 'Средний',
  },
  advanced: {
    color: 'bg-orange-500/30 text-orange-300 border-orange-500/40',
    label: 'Продвинутый',
  },
}

export function GlassCard({ course, onClick }: GlassCardProps) {
  const duration = Math.round(course.estimated_completion_minutes / 60)
  const hasCover = !!course.coverUrl
  const statusInfo = statusConfig[course.generation_status || 'draft'] || statusConfig.draft
  const difficultyInfo = difficultyConfig[course.difficulty] || difficultyConfig.intermediate

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-2xl',
        'h-[480px]',
        'shadow-2xl transition-shadow duration-300 hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)]'
      )}
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        {hasCover ? (
          <Image
            src={course.coverUrl!}
            alt={course.title}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950" />
        )}
        {/* Radial gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
      </div>

      {/* Glass Panel */}
      <div className="absolute inset-x-4 top-auto bottom-4">
        <motion.div
          initial={{ opacity: 0.9 }}
          whileHover={{ opacity: 1 }}
          className={cn(
            'rounded-xl p-5',
            'bg-white/10 backdrop-blur-xl',
            'border border-white/20',
            'shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]'
          )}
        >
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge className={cn('border backdrop-blur-sm', statusInfo.color)}>
              {statusInfo.label}
            </Badge>
            <Badge className={cn('border backdrop-blur-sm', difficultyInfo.color)}>
              {difficultyInfo.label}
            </Badge>
          </div>

          {/* Title */}
          <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-white [text-shadow:_0_1px_3px_rgb(0_0_0_/_40%)]">
            {course.title}
          </h3>

          {/* Description */}
          {course.course_description && (
            <p className="mt-2 line-clamp-2 text-sm text-white/80">{course.course_description}</p>
          )}

          {/* Target audience */}
          {course.target_audience && (
            <div className="mt-3 flex items-start gap-2">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
              <p className="line-clamp-1 text-sm text-white/70">{course.target_audience}</p>
            </div>
          )}

          {/* Stats row */}
          <div className="mt-4 flex items-center gap-4 text-sm text-white/70">
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-cyan-400" />
              {course.total_sections_count}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-amber-400" />
              {duration}ч
            </span>
            <span className="flex items-center gap-1.5">
              <Globe className="h-4 w-4 text-green-400" />
              {course.language.toUpperCase()}
            </span>
          </div>

          {/* CTA Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={(e) => {
              e.stopPropagation()
              onClick()
            }}
            className={cn(
              'mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3',
              'bg-white/20 font-medium text-white backdrop-blur-sm',
              'border border-white/30',
              'transition-all hover:bg-white/30',
              'focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none'
            )}
          >
            Открыть курс
            <ChevronRight className="h-4 w-4" />
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  )
}
