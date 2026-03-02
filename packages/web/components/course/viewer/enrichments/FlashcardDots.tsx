'use client'

import React from 'react'
import type { FlashcardItem } from '@megacampus/shared-types'
import { cn } from '@/lib/utils'

interface FlashcardDotsProps {
  cards: FlashcardItem[]
  currentIndex: number
  knownIds: Set<string>
  unknownIds: Set<string>
  onNavigate: (index: number) => void
  cardOfLabel: (current: number, total: number) => string
}

/** Progress dot indicators — one per card, color-coded by status, clickable for navigation. */
export function FlashcardDots({
  cards,
  currentIndex,
  knownIds,
  unknownIds,
  onNavigate,
  cardOfLabel,
}: FlashcardDotsProps) {
  if (cards.length > 30) return null

  return (
    <div className="relative z-20 mx-auto flex max-w-lg flex-wrap justify-center gap-1.5">
      {cards.map((card, index) => {
        const color = knownIds.has(card.id)
          ? 'bg-emerald-500'
          : unknownIds.has(card.id)
            ? 'bg-amber-500'
            : 'bg-slate-300 dark:bg-slate-600'

        return (
          <button
            key={card.id}
            className={cn(
              'h-2 w-2 rounded-full transition-colors',
              color,
              index === currentIndex &&
                'ring-primary ring-2 ring-offset-1 dark:ring-offset-slate-900'
            )}
            onClick={(e) => {
              e.stopPropagation()
              onNavigate(index)
            }}
            aria-label={cardOfLabel(index + 1, cards.length)}
            aria-current={index === currentIndex ? 'true' : undefined}
          />
        )
      })}
    </div>
  )
}
