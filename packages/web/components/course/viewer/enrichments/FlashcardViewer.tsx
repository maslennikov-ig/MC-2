'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  RotateCcw,
  Shuffle,
  Trophy,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { FlashcardsEnrichmentContent, FlashcardItem } from '@megacampus/shared-types'
import { cn } from '@/lib/utils'

interface FlashcardViewerProps {
  content: FlashcardsEnrichmentContent
  enrichmentId: string
}

/** localStorage key pattern for flashcard progress */
const FLASHCARD_STORAGE_KEY = (id: string) => `flashcard_progress_${id}`

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * FlashcardViewer
 *
 * Interactive flashcard viewer with:
 * - Card flip animation using Framer Motion
 * - Navigation arrows (previous/next)
 * - Progress bar + "Card N of M" counter
 * - "Know" / "Don't Know" self-assessment buttons
 * - Summary screen with statistics
 * - localStorage persistence for progress
 * - Shuffle toggle
 * - Dark mode support
 */
export function FlashcardViewer({ content, enrichmentId }: FlashcardViewerProps) {
  const t = useTranslations('enrichments')
  const [cards, setCards] = useState<FlashcardItem[]>(content.cards)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isShuffled, setIsShuffled] = useState(false)
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set())
  const [unknownIds, setUnknownIds] = useState<Set<string>>(new Set())
  const [isFinished, setIsFinished] = useState(false)

  // Load saved progress from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FLASHCARD_STORAGE_KEY(enrichmentId))
      if (saved) {
        const parsed = JSON.parse(saved) as {
          known: string[]
          unknown: string[]
          currentIndex: number
          isFinished: boolean
        }
        // Validate loaded IDs against current cards to handle regeneration
        const currentCardIds = new Set(content.cards.map((c) => c.id))
        const validKnown = (parsed.known || []).filter((id: string) => currentCardIds.has(id))
        const validUnknown = (parsed.unknown || []).filter((id: string) => currentCardIds.has(id))
        setKnownIds(new Set<string>(validKnown))
        setUnknownIds(new Set<string>(validUnknown))
        setCurrentIndex(Math.min(parsed.currentIndex, content.cards.length - 1))
        setIsFinished(parsed.isFinished)
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [enrichmentId, content.cards.length])

  // Save progress to localStorage
  const saveProgress = useCallback(
    (known: Set<string>, unknown: Set<string>, index: number, finished: boolean) => {
      try {
        const data = {
          known: Array.from(known),
          unknown: Array.from(unknown),
          currentIndex: index,
          isFinished: finished,
        }
        localStorage.setItem(FLASHCARD_STORAGE_KEY(enrichmentId), JSON.stringify(data))
      } catch {
        // Ignore localStorage errors
      }
    },
    [enrichmentId]
  )

  const currentCard = cards[currentIndex]
  const totalCards = cards.length
  const progressPercent = totalCards > 0 ? ((currentIndex + 1) / totalCards) * 100 : 0

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev)
  }, [])

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
      setIsFlipped(false)
    }
  }, [currentIndex])

  const handleNext = useCallback(() => {
    if (currentIndex < totalCards - 1) {
      setCurrentIndex((prev) => prev + 1)
      setIsFlipped(false)
    } else {
      setIsFinished(true)
      saveProgress(knownIds, unknownIds, currentIndex, true)
    }
  }, [currentIndex, totalCards, knownIds, unknownIds, saveProgress])

  const handleKnow = useCallback(() => {
    if (!currentCard) return
    const newKnown = new Set(knownIds)
    newKnown.add(currentCard.id)
    const newUnknown = new Set(unknownIds)
    newUnknown.delete(currentCard.id)
    setKnownIds(newKnown)
    setUnknownIds(newUnknown)
    saveProgress(newKnown, newUnknown, currentIndex, false)
    handleNext()
  }, [currentCard, knownIds, unknownIds, currentIndex, saveProgress, handleNext])

  const handleDontKnow = useCallback(() => {
    if (!currentCard) return
    const newUnknown = new Set(unknownIds)
    newUnknown.add(currentCard.id)
    const newKnown = new Set(knownIds)
    newKnown.delete(currentCard.id)
    setKnownIds(newKnown)
    setUnknownIds(newUnknown)
    saveProgress(newKnown, newUnknown, currentIndex, false)
    handleNext()
  }, [currentCard, unknownIds, knownIds, currentIndex, saveProgress, handleNext])

  const handleShuffle = useCallback(() => {
    setCards(isShuffled ? content.cards : shuffleArray(content.cards))
    setIsShuffled((prev) => !prev)
    setCurrentIndex(0)
    setIsFlipped(false)
  }, [isShuffled, content.cards])

  const handleReset = useCallback(() => {
    setKnownIds(new Set())
    setUnknownIds(new Set())
    setCurrentIndex(0)
    setIsFlipped(false)
    setIsFinished(false)
    setCards(isShuffled ? shuffleArray(content.cards) : content.cards)
    try {
      localStorage.removeItem(FLASHCARD_STORAGE_KEY(enrichmentId))
    } catch {
      // Ignore
    }
  }, [isShuffled, content.cards, enrichmentId])

  // Summary screen
  if (isFinished) {
    const knownCount = knownIds.size
    const unknownCount = unknownIds.size
    const scorePercent = totalCards > 0 ? Math.round((knownCount / totalCards) * 100) : 0

    return (
      <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/30 dark:bg-amber-900/20">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <h3 className="font-semibold text-amber-900 dark:text-amber-100">
            {t('viewer.flashcards.summary')}
          </h3>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg bg-white p-2 dark:bg-slate-800">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalCards}</p>
            <p className="text-muted-foreground text-xs">{t('viewer.flashcards.total')}</p>
          </div>
          <div className="rounded-lg bg-green-50 p-2 dark:bg-green-900/30">
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{knownCount}</p>
            <p className="text-xs text-green-600 dark:text-green-400">
              {t('viewer.flashcards.known')}
            </p>
          </div>
          <div className="rounded-lg bg-red-50 p-2 dark:bg-red-900/30">
            <p className="text-2xl font-bold text-red-700 dark:text-red-300">{unknownCount}</p>
            <p className="text-xs text-red-600 dark:text-red-400">
              {t('viewer.flashcards.unknown')}
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('viewer.flashcards.score')}</span>
            <span className="font-medium text-amber-700 dark:text-amber-300">{scorePercent}%</span>
          </div>
          <Progress value={scorePercent} className="h-2" />
        </div>

        <Button
          size="sm"
          variant="outline"
          className="w-full border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
          onClick={handleReset}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('viewer.flashcards.restart')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header: counter + shuffle */}
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {t('viewer.flashcards.cardOf', { current: currentIndex + 1, total: totalCards })}
        </span>
        <div className="flex items-center gap-1">
          {currentCard?.difficulty && (
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                currentCard.difficulty === 'easy' &&
                  'border-green-300 text-green-700 dark:border-green-700 dark:text-green-300',
                currentCard.difficulty === 'medium' &&
                  'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300',
                currentCard.difficulty === 'hard' &&
                  'border-red-300 text-red-700 dark:border-red-700 dark:text-red-300'
              )}
            >
              {t(`viewer.difficulty.${currentCard.difficulty}`)}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7', isShuffled && 'text-amber-500 dark:text-amber-400')}
            onClick={handleShuffle}
            title={t('viewer.flashcards.shuffle')}
          >
            <Shuffle className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <Progress value={progressPercent} className="h-1.5" />

      {/* Flashcard with flip animation */}
      <div
        className="relative cursor-pointer"
        style={{ perspective: '1000px', minHeight: '160px' }}
        onClick={handleFlip}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleFlip()
          }
        }}
        aria-label={t('viewer.flashcards.flipCard')}
      >
        <motion.div
          style={{
            transformStyle: 'preserve-3d',
            position: 'relative',
            width: '100%',
            minHeight: '160px',
          }}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
        >
          {/* Front face */}
          <div
            style={{ backfaceVisibility: 'hidden' }}
            className={cn(
              'absolute inset-0 flex flex-col items-center justify-center rounded-xl p-4 text-center',
              'border-2 border-amber-200 bg-white dark:border-amber-800/50 dark:bg-slate-800',
              'min-h-[160px]'
            )}
          >
            <p className="mb-2 text-xs font-medium tracking-wider text-amber-500 uppercase dark:text-amber-400">
              {t('viewer.flashcards.front')}
            </p>
            <p className="text-base font-medium text-gray-900 dark:text-white">
              {currentCard?.front}
            </p>
            <p className="text-muted-foreground mt-3 text-xs">{t('viewer.flashcards.tapToFlip')}</p>
          </div>

          {/* Back face */}
          <div
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            className={cn(
              'absolute inset-0 flex flex-col items-center justify-center rounded-xl p-4 text-center',
              'border-2 border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-900/20',
              'min-h-[160px]'
            )}
          >
            <p className="mb-2 text-xs font-medium tracking-wider text-emerald-500 uppercase dark:text-emerald-400">
              {t('viewer.flashcards.back')}
            </p>
            <p className="text-base font-medium text-gray-900 dark:text-white">
              {currentCard?.back}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Self-assessment buttons (only shown when flipped) */}
      <AnimatePresence>
        {isFlipped && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 gap-2"
          >
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
              onClick={(e) => {
                e.stopPropagation()
                handleDontKnow()
              }}
            >
              <X className="h-4 w-4" />
              {t('viewer.flashcards.dontKnow')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/30"
              onClick={(e) => {
                e.stopPropagation()
                handleKnow()
              }}
            >
              <Check className="h-4 w-4" />
              {t('viewer.flashcards.know')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation arrows */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          aria-label={t('viewer.back')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1">
          {knownIds.has(currentCard?.id ?? '') && <Layers className="h-4 w-4 text-amber-400" />}
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={handleNext}
          aria-label={
            currentIndex === totalCards - 1 ? t('viewer.flashcards.finish') : t('viewer.next')
          }
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
