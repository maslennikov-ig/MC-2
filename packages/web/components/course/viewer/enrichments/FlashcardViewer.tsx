'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  ThumbsDown,
  ThumbsUp,
  Shuffle,
  Layers,
  Maximize2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { FlashcardsEnrichmentContent, FlashcardItem } from '@megacampus/shared-types'
import { cn } from '@/lib/utils'
import { FlashcardCard } from './FlashcardCard'
import { FlashcardDots } from './FlashcardDots'
import { FlashcardSummary } from './FlashcardSummary'

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
 * Interactive flashcard viewer with flip animation, self-assessment,
 * fullscreen study mode, progress tracking, and localStorage persistence.
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
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isDraggingRef = useRef(false)

  // Stable fingerprint of card IDs for localStorage reload dependency
  const cardsFingerprint = content.cards.map((c) => c.id).join(',')

  // Load saved progress from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FLASHCARD_STORAGE_KEY(enrichmentId))
      if (!saved) return
      const parsed = JSON.parse(saved) as {
        known: string[]
        unknown: string[]
        currentIndex: number
        isFinished: boolean
      }
      const currentCardIds = new Set(content.cards.map((c) => c.id))
      const validKnown = (parsed.known || []).filter((id: string) => currentCardIds.has(id))
      const validUnknown = (parsed.unknown || []).filter((id: string) => currentCardIds.has(id))
      setKnownIds(new Set<string>(validKnown))
      setUnknownIds(new Set<string>(validUnknown))
      setCurrentIndex(Math.min(parsed.currentIndex, content.cards.length - 1))
      setIsFinished(parsed.isFinished)
    } catch {
      // Ignore localStorage errors
    }
  }, [enrichmentId, cardsFingerprint, content.cards])

  // Save progress to localStorage
  const saveProgress = useCallback(
    (known: Set<string>, unknown: Set<string>, index: number, finished: boolean) => {
      try {
        localStorage.setItem(
          FLASHCARD_STORAGE_KEY(enrichmentId),
          JSON.stringify({
            known: Array.from(known),
            unknown: Array.from(unknown),
            currentIndex: index,
            isFinished: finished,
          })
        )
      } catch {
        // Ignore localStorage errors
      }
    },
    [enrichmentId]
  )

  const currentCard = cards[currentIndex]
  const totalCards = cards.length
  const progressPercent = totalCards > 0 ? ((currentIndex + 1) / totalCards) * 100 : 0

  const handleFlip = useCallback(() => setIsFlipped((prev) => !prev), [])

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
      setIsFlipped(false)
    }
  }, [currentIndex])

  // Navigate to next card. skipSave=true when caller handles persistence.
  const handleNext = useCallback(
    (skipSave?: boolean) => {
      if (currentIndex < totalCards - 1) {
        setCurrentIndex((prev) => prev + 1)
        setIsFlipped(false)
      } else {
        setIsFinished(true)
        if (!skipSave) saveProgress(knownIds, unknownIds, currentIndex, true)
      }
    },
    [currentIndex, totalCards, knownIds, unknownIds, saveProgress]
  )

  const handleKnow = useCallback(() => {
    if (!currentCard) return
    const newKnown = new Set(knownIds)
    newKnown.add(currentCard.id)
    const newUnknown = new Set(unknownIds)
    newUnknown.delete(currentCard.id)
    setKnownIds(newKnown)
    setUnknownIds(newUnknown)
    saveProgress(newKnown, newUnknown, currentIndex, currentIndex >= totalCards - 1)
    handleNext(true)
  }, [currentCard, knownIds, unknownIds, currentIndex, totalCards, saveProgress, handleNext])

  const handleDontKnow = useCallback(() => {
    if (!currentCard) return
    const newUnknown = new Set(unknownIds)
    newUnknown.add(currentCard.id)
    const newKnown = new Set(knownIds)
    newKnown.delete(currentCard.id)
    setKnownIds(newKnown)
    setUnknownIds(newUnknown)
    saveProgress(newKnown, newUnknown, currentIndex, currentIndex >= totalCards - 1)
    handleNext(true)
  }, [currentCard, unknownIds, knownIds, currentIndex, totalCards, saveProgress, handleNext])

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

  // Keyboard navigation — fullscreen only
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false)
      } else if (e.key === 'ArrowLeft') {
        handlePrevious()
      } else if (e.key === 'ArrowRight') {
        handleNext()
      } else if (e.key === ' ' || e.key === 'Enter') {
        // Don't intercept on focusable elements
        if (
          e.target instanceof HTMLElement &&
          ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)
        )
          return
        e.preventDefault()
        handleFlip()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isFullscreen, handlePrevious, handleNext, handleFlip])

  // Body scroll lock in fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isFullscreen])

  if (cards.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('viewer.noMaterials')}</p>
  }

  if (isFinished) {
    return (
      <FlashcardSummary
        totalCards={totalCards}
        knownCount={knownIds.size}
        unknownCount={unknownIds.size}
        labels={{
          summary: t('viewer.flashcards.summary'),
          greatJob: t('viewer.flashcards.greatJob'),
          keepPracticing: t('viewer.flashcards.keepPracticing'),
          score: t('viewer.flashcards.score'),
          total: t('viewer.flashcards.total'),
          known: t('viewer.flashcards.known'),
          unknown: t('viewer.flashcards.unknown'),
          restart: t('viewer.flashcards.restart'),
        }}
        onReset={handleReset}
      />
    )
  }

  const onCardFlip = () => {
    if (!isDraggingRef.current) handleFlip()
  }

  return (
    <>
      {/* Backdrop overlay — fullscreen only */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm"
          onClick={() => setIsFullscreen(false)}
        />
      )}

      <div
        className={cn(
          isFullscreen && 'fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900'
        )}
      >
        {/* Fullscreen header */}
        {isFullscreen && (
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Layers className="h-4 w-4 text-amber-500" />
              {t('viewer.flashcards.title')}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm" aria-live="polite">
                {t('viewer.flashcards.cardOf', { current: currentIndex + 1, total: totalCards })}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsFullscreen(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">{t('viewer.close')}</span>
              </Button>
            </div>
          </div>
        )}

        {isFullscreen && <Progress value={progressPercent} className="h-1 rounded-none" />}

        {/* Card area */}
        <div
          className={cn(
            isFullscreen
              ? 'relative flex flex-1 flex-col items-center justify-center gap-4 px-4'
              : 'space-y-3'
          )}
        >
          {/* Inline header */}
          {!isFullscreen && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm" aria-live="polite">
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
                  aria-label={t('viewer.flashcards.shuffle')}
                  title={t('viewer.flashcards.shuffle')}
                >
                  <Shuffle className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {!isFullscreen && <Progress value={progressPercent} className="h-1.5" />}

          {/* Card with swipe wrapper */}
          <motion.div
            className="w-full"
            drag={isFullscreen ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.3}
            onDragStart={() => {
              isDraggingRef.current = true
            }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 80) handlePrevious()
              else if (info.offset.x < -80) handleNext()
              requestAnimationFrame(() => {
                isDraggingRef.current = false
              })
            }}
          >
            <FlashcardCard
              card={currentCard}
              isFlipped={isFlipped}
              isFullscreen={isFullscreen}
              onFlip={onCardFlip}
              tapToFlipLabel={t('viewer.flashcards.tapToFlip')}
              flipCardLabel={t('viewer.flashcards.flipCard')}
            />
          </motion.div>

          {/* Self-assessment buttons */}
          <AnimatePresence>
            {isFlipped && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="mx-auto flex w-full max-w-lg gap-3"
              >
                <Button
                  variant="secondary"
                  className="flex-1 gap-2"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDontKnow()
                  }}
                >
                  <ThumbsDown className="h-4 w-4" />
                  {t('viewer.flashcards.dontKnow')}
                </Button>
                <Button
                  variant="default"
                  className="flex-1 gap-2"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleKnow()
                  }}
                >
                  <ThumbsUp className="h-4 w-4" />
                  {t('viewer.flashcards.know')}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Click zones — fullscreen only */}
          {isFullscreen && (
            <>
              <button
                type="button"
                className="group absolute top-0 left-0 z-10 flex h-full w-16 cursor-pointer items-center justify-start pl-2"
                onClick={(e) => {
                  e.stopPropagation()
                  handlePrevious()
                }}
                aria-label={t('viewer.flashcards.previousCard')}
                tabIndex={-1}
              >
                <ChevronLeft
                  className={cn(
                    'h-8 w-8 rounded-full bg-black/20 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-70',
                    currentIndex === 0 && 'hidden'
                  )}
                />
              </button>
              <button
                type="button"
                className="group absolute top-0 right-0 z-10 flex h-full w-16 cursor-pointer items-center justify-end pr-2"
                onClick={(e) => {
                  e.stopPropagation()
                  handleNext()
                }}
                aria-label={t('viewer.flashcards.nextCard')}
                tabIndex={-1}
              >
                <ChevronRight className="h-8 w-8 rounded-full bg-black/20 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-70" />
              </button>
            </>
          )}

          <FlashcardDots
            cards={cards}
            currentIndex={currentIndex}
            knownIds={knownIds}
            unknownIds={unknownIds}
            onNavigate={(i) => {
              setCurrentIndex(i)
              setIsFlipped(false)
            }}
            cardOfLabel={(cur, tot) => t('viewer.flashcards.cardOf', { current: cur, total: tot })}
          />

          {/* Inline navigation */}
          {!isFullscreen && (
            <div className="mx-auto flex w-full max-w-lg items-center justify-between">
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
                {currentCard && knownIds.has(currentCard.id) && (
                  <Layers className="h-4 w-4 text-amber-400" />
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleNext()}
                aria-label={
                  currentIndex === totalCards - 1 ? t('viewer.flashcards.finish') : t('viewer.next')
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {isFullscreen && (
          <p className="text-muted-foreground shrink-0 border-t px-4 py-1.5 text-center text-xs">
            {t('viewer.flashcards.fullscreenHint')}
          </p>
        )}
      </div>

      {!isFullscreen && !isFinished && (
        <div className="mx-auto mt-2 flex max-w-lg justify-end">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setIsFullscreen(true)}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            {t('viewer.flashcards.enterFullscreen')}
          </Button>
        </div>
      )}
    </>
  )
}
