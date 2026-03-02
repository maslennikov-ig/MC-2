'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Trophy, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface FlashcardSummaryProps {
  totalCards: number
  knownCount: number
  unknownCount: number
  labels: {
    summary: string
    greatJob: string
    keepPracticing: string
    score: string
    total: string
    known: string
    unknown: string
    restart: string
  }
  onReset: () => void
}

/**
 * FlashcardSummary — displayed after completing a flashcard session.
 * Shows animated trophy, score circle, stats grid, and restart button.
 */
export function FlashcardSummary({
  totalCards,
  knownCount,
  unknownCount,
  labels,
  onReset,
}: FlashcardSummaryProps) {
  const scorePercent = totalCards > 0 ? Math.round((knownCount / totalCards) * 100) : 0
  const isGreatScore = scorePercent >= 80

  return (
    <div className="mx-auto max-w-lg space-y-5 rounded-2xl border bg-gradient-to-br from-slate-50 to-white p-6 shadow-lg dark:border-slate-700 dark:from-slate-800 dark:to-slate-900">
      {/* Animated trophy */}
      <div className="flex flex-col items-center gap-3 text-center">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className={cn(
            'rounded-full p-4',
            isGreatScore ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-slate-100 dark:bg-slate-700/50'
          )}
        >
          <Trophy
            className={cn(
              'h-8 w-8',
              isGreatScore ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'
            )}
          />
        </motion.div>

        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">{labels.summary}</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            {isGreatScore ? labels.greatJob : labels.keepPracticing}
          </p>
        </div>
      </div>

      {/* Score circle */}
      <div className="flex justify-center">
        <div className="border-primary flex h-24 w-24 flex-col items-center justify-center rounded-full border-4">
          <span className="text-primary text-3xl font-bold">{scorePercent}%</span>
          <span className="text-muted-foreground text-xs">{labels.score}</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-lg bg-white p-2 shadow-sm dark:bg-slate-800">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalCards}</p>
          <p className="text-muted-foreground text-xs">{labels.total}</p>
        </div>
        <div className="rounded-lg bg-green-50 p-2 dark:bg-green-900/30">
          <p className="text-2xl font-bold text-green-700 dark:text-green-300">{knownCount}</p>
          <p className="text-xs text-green-600 dark:text-green-400">{labels.known}</p>
        </div>
        <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-900/30">
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{unknownCount}</p>
          <p className="text-xs text-amber-600 dark:text-amber-400">{labels.unknown}</p>
        </div>
      </div>

      {/* Score progress bar */}
      <div className="space-y-1">
        <Progress value={scorePercent} className="h-2" />
      </div>

      <Button variant="outline" className="w-full" onClick={onReset}>
        <RotateCcw className="mr-2 h-4 w-4" />
        {labels.restart}
      </Button>
    </div>
  )
}
