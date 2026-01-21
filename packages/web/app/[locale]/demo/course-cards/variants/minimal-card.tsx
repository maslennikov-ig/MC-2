'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { BookOpen, Clock, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DemoCourse } from '../page'

interface MinimalCardProps {
  course: DemoCourse
  onClick: () => void
}

export function MinimalCard({ course, onClick }: MinimalCardProps) {
  const duration = Math.round(course.estimated_completion_minutes / 60)
  const hasCover = !!course.coverUrl

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      onClick={onClick}
      className={cn(
        'group cursor-pointer overflow-hidden rounded-2xl',
        'bg-white shadow-lg dark:bg-slate-900',
        'border border-gray-100 dark:border-slate-800',
        'transition-shadow duration-300 hover:shadow-2xl',
        'flex min-h-[480px] flex-col'
      )}
    >
      {/* Cover Image */}
      <div className="relative min-h-[280px] flex-1 overflow-hidden">
        {hasCover ? (
          <Image
            src={course.coverUrl!}
            alt={course.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
            <BookOpen className="h-16 w-16 text-slate-700" />
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>

      {/* Content */}
      <div className="p-5">
        {/* Title */}
        <h3 className="line-clamp-2 text-lg font-semibold text-gray-900 transition-colors group-hover:text-cyan-600 dark:text-white dark:group-hover:text-cyan-400">
          {course.title}
        </h3>

        {/* Stats */}
        <div className="mt-4 flex items-center gap-4 text-sm text-gray-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" />
            {course.total_sections_count} модулей
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {duration}ч
          </span>
        </div>

        {/* CTA Button */}
        <motion.button
          whileHover={{ x: 4 }}
          className={cn(
            'mt-5 flex w-full items-center justify-center gap-2 rounded-full py-3',
            'bg-cyan-500 font-medium text-white',
            'transition-colors hover:bg-cyan-600',
            'focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:outline-none'
          )}
        >
          Начать
          <ChevronRight className="h-4 w-4" />
        </motion.button>
      </div>
    </motion.div>
  )
}
