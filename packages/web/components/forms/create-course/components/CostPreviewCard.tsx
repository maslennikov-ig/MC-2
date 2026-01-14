'use client'

import React, { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DollarSign, FileText, BarChart3, BookOpen, Info } from 'lucide-react'
import { estimateCost, type CostEstimate } from '@megacampus/shared-types'

interface CostPreviewCardProps {
  documentCount: number
  estimatedLessons: number
  hasDocuments: boolean
  isVisible: boolean
}

export function CostPreviewCard({
  documentCount,
  estimatedLessons,
  hasDocuments,
  isVisible,
}: CostPreviewCardProps) {
  // Use the shared cost estimation service
  const estimate: CostEstimate = useMemo(
    () => estimateCost({ documentCount, estimatedLessons, hasDocuments }),
    [documentCount, estimatedLessons, hasDocuments]
  )

  const { breakdown, minUsd: minTotal, maxUsd: maxTotal } = estimate
  const stage2Cost = breakdown.stage2_embeddings
  const stage4Cost = breakdown.stage4_analysis
  const stage5Cost = breakdown.stage5_structure
  const stage6Cost = breakdown.stage6_lessons

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
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            {/* Header */}
            <div className="mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium text-slate-900 dark:text-white">
                Ориентировочная стоимость
              </span>
            </div>

            {/* Total Cost */}
            <div className="mb-4 rounded-lg bg-white/50 py-3 text-center dark:bg-white/5">
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                ~${minTotal.toFixed(2)} - ${maxTotal.toFixed(2)}
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
                  <span>~${stage2Cost.toFixed(2)}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-slate-600 dark:text-white/60">
                <span className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Анализ и структура
                </span>
                <span>~${(stage4Cost + stage5Cost).toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between text-slate-600 dark:text-white/60">
                <span className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Генерация {estimatedLessons} уроков
                </span>
                <span>~${stage6Cost.toFixed(2)}</span>
              </div>
            </div>

            {/* Info */}
            <div className="mt-4 flex items-start gap-2 border-t border-emerald-200/50 pt-3 dark:border-emerald-800/50">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <p className="text-xs text-slate-500 dark:text-white/40">
                Точная стоимость зависит от сложности темы и объёма материалов. Оплата списывается с
                баланса организации.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
