'use client'

import React, { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Hash, FileText, BarChart3, BookOpen, Info } from 'lucide-react'
import {
  estimateTokens,
  formatTokens,
  type TokenEstimate,
  type CourseSize,
  COURSE_SIZE_PRESETS,
} from '@megacampus/shared-types'

interface TokenEstimateCardProps {
  documentCount: number
  estimatedLessons: number | undefined
  courseSize: CourseSize | undefined
  hasDocuments: boolean
  isVisible: boolean
}

// Default lessons for 'auto' mode when no preset is selected
const AUTO_MODE_DEFAULT_LESSONS = 15

/**
 * Get the effective number of lessons for token estimation
 * - If estimatedLessons is set, use it
 * - If courseSize is a preset, use that preset's targetLessons
 * - If courseSize is 'auto' or undefined, use default (15)
 */
function getEffectiveLessons(
  estimatedLessons: number | undefined,
  courseSize: CourseSize | undefined
): number {
  // If we have an explicit value, use it
  if (estimatedLessons !== undefined && estimatedLessons > 0) {
    return estimatedLessons
  }

  // If courseSize is a preset (not 'auto'), use that preset's targetLessons
  if (courseSize && courseSize !== 'auto' && COURSE_SIZE_PRESETS[courseSize]) {
    return COURSE_SIZE_PRESETS[courseSize].targetLessons
  }

  // Default for 'auto' or undefined
  return AUTO_MODE_DEFAULT_LESSONS
}

export function TokenEstimateCard({
  documentCount,
  estimatedLessons,
  courseSize,
  hasDocuments,
  isVisible,
}: TokenEstimateCardProps) {
  // Calculate effective lessons with proper fallback logic
  const effectiveLessons = useMemo(
    () => getEffectiveLessons(estimatedLessons, courseSize),
    [estimatedLessons, courseSize]
  )

  // Use the shared token estimation service
  const estimate: TokenEstimate = useMemo(
    () =>
      estimateTokens({
        documentCount,
        estimatedLessons: effectiveLessons,
        hasDocuments,
      }),
    [documentCount, effectiveLessons, hasDocuments]
  )

  const { breakdown, minTokens, maxTokens } = estimate
  const stage2Tokens = breakdown.stage2_tokens
  const stage4Tokens = breakdown.stage4_tokens
  const stage5Tokens = breakdown.stage5_tokens
  const stage6Tokens = breakdown.stage6_tokens

  // Determine if we're showing estimate for 'auto' mode
  const isAutoMode = courseSize === 'auto' || courseSize === undefined

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden"
        >
          <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-900/50 dark:bg-purple-950/20">
            {/* Header */}
            <div className="mb-4 flex items-center gap-2">
              <Hash className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <span className="font-medium text-slate-900 dark:text-white">
                Ориентировочное количество токенов
              </span>
            </div>

            {/* Total Tokens */}
            <div className="mb-4 rounded-lg bg-white/50 py-3 text-center dark:bg-white/5">
              <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {formatTokens(minTokens)} - {formatTokens(maxTokens)}
              </span>
            </div>

            {/* Breakdown */}
            <div className="space-y-2 text-sm">
              {hasDocuments && (
                <div className="flex items-center justify-between text-slate-600 dark:text-white/60">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Обработка {documentCount} документов
                  </span>
                  <span>{formatTokens(stage2Tokens)}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-slate-600 dark:text-white/60">
                <span className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Анализ и структура
                </span>
                <span>{formatTokens(stage4Tokens + stage5Tokens)}</span>
              </div>

              <div className="flex items-center justify-between text-slate-600 dark:text-white/60">
                <span className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Генерация {isAutoMode ? `~${effectiveLessons}` : effectiveLessons} уроков
                </span>
                <span>{formatTokens(stage6Tokens)}</span>
              </div>
            </div>

            {/* Info */}
            <div className="mt-4 flex items-start gap-2 border-t border-purple-200/50 pt-3 dark:border-purple-800/50">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <p className="text-xs text-slate-500 dark:text-white/40">
                {isAutoMode
                  ? 'Оценка для среднего курса. Точное количество зависит от темы и материалов.'
                  : 'Точное количество токенов зависит от сложности темы и объёма материалов.'}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
