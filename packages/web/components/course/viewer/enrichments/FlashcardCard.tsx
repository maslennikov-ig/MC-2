'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { HelpCircle, Lightbulb } from 'lucide-react'
import type { FlashcardItem } from '@megacampus/shared-types'
import { cn } from '@/lib/utils'

interface FlashcardCardProps {
  card: FlashcardItem | undefined
  isFlipped: boolean
  isFullscreen: boolean
  onFlip: () => void
  tapToFlipLabel: string
  flipCardLabel: string
}

/**
 * FlashcardCard — the visual flip card with front (question) and back (answer) faces.
 * Uses Framer Motion spring animation for a satisfying 3D flip effect.
 */
export const FlashcardCard = React.memo(function FlashcardCard({
  card,
  isFlipped,
  isFullscreen,
  onFlip,
  tapToFlipLabel,
  flipCardLabel,
}: FlashcardCardProps) {
  return (
    <div
      className={cn(
        'relative mx-auto w-full cursor-pointer',
        isFullscreen ? 'max-w-xl' : 'max-w-lg'
      )}
      style={{ perspective: '1200px' }}
      onClick={onFlip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onFlip()
        }
      }}
      aria-label={flipCardLabel}
    >
      <motion.div
        style={{
          transformStyle: 'preserve-3d',
          position: 'relative',
          width: '100%',
          minHeight: '220px',
        }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* Front face */}
        <div
          style={{ backfaceVisibility: 'hidden' }}
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center rounded-2xl p-6 text-center',
            'bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-900',
            'border border-slate-200/60 shadow-lg shadow-slate-200/50',
            'dark:border-slate-700/40 dark:shadow-slate-900/50',
            'min-h-[220px]'
          )}
        >
          <HelpCircle className="mb-3 h-5 w-5 text-slate-400 dark:text-slate-500" />
          <p className="text-lg leading-relaxed font-medium text-slate-900 dark:text-white">
            {card?.front}
          </p>
          <p className="text-muted-foreground mt-4 text-xs">{tapToFlipLabel}</p>
        </div>

        {/* Back face */}
        <div
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center rounded-2xl p-6 text-center',
            'bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-slate-900',
            'border border-emerald-200/60 shadow-lg shadow-emerald-200/30',
            'dark:border-emerald-800/30 dark:shadow-emerald-900/30',
            'min-h-[220px]'
          )}
        >
          <Lightbulb className="mb-3 h-5 w-5 text-emerald-400 dark:text-emerald-500" />
          <p className="text-lg leading-relaxed font-medium text-slate-900 dark:text-white">
            {card?.back}
          </p>
        </div>
      </motion.div>
    </div>
  )
})
