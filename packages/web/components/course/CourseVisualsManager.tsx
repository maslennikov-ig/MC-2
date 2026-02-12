'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Image, CheckCircle, Circle, Loader2, ArrowLeft, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { getBrowserTrpcClient } from '@/lib/trpc/browser-client'
import { Link } from '@/src/i18n/navigation'

interface Lesson {
  id: string
  title: string
  sectionTitle: string
  hasCover: boolean
  hasCard: boolean
}

interface CourseVisualsManagerProps {
  courseId: string
  courseTitle: string
  courseSlug: string
  orgSlug: string
  hasCourseCard: boolean
  lessons: Lesson[]
}

type GenerationType = 'covers' | 'cards'

/**
 * CourseVisualsManager
 *
 * Manages visual assets for a course including:
 * - Course thumbnail (1:1 card)
 * - Lesson covers (16:9 banners)
 * - Lesson cards (1:1 thumbnails)
 *
 * Provides batch generation UI for missing assets.
 */
export function CourseVisualsManager({
  courseId,
  courseTitle,
  courseSlug,
  orgSlug,
  hasCourseCard,
  lessons,
}: CourseVisualsManagerProps) {
  const t = useTranslations('enrichments')
  const tCourse = useTranslations('course')
  const router = useRouter()
  const [isGeneratingCovers, setIsGeneratingCovers] = useState(false)
  const [isGeneratingCards, setIsGeneratingCards] = useState(false)

  // Polling state for tracking generation progress
  const [pendingEnrichmentIds, setPendingEnrichmentIds] = useState<string[]>([])
  const [completedCount, setCompletedCount] = useState(0)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // AbortController refs for cleanup on unmount
  const coversAbortRef = useRef<AbortController | null>(null)
  const cardsAbortRef = useRef<AbortController | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      coversAbortRef.current?.abort()
      cardsAbortRef.current?.abort()
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  const missingCovers = lessons.filter((l) => !l.hasCover).length
  const missingCards = lessons.filter((l) => !l.hasCard).length
  const totalLessons = lessons.length
  const coverPercentage =
    totalLessons > 0 ? Math.round(((totalLessons - missingCovers) / totalLessons) * 100) : 0
  const cardPercentage =
    totalLessons > 0 ? Math.round(((totalLessons - missingCards) / totalLessons) * 100) : 0

  /**
   * Poll generation status for enrichment IDs
   * Checks every 3 seconds until all complete
   */
  const startPolling = useCallback(
    (ids: string[]) => {
      // Clear existing polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }

      const checkStatus = async () => {
        const client = getBrowserTrpcClient()
        let completed = 0
        for (const id of ids) {
          try {
            const data = await client.enrichment.getGenerationStatus.query({ enrichmentId: id })
            if (data.status === 'completed') {
              completed++
            }
          } catch {
            // Ignore errors, continue polling
          }
        }

        setCompletedCount(completed)

        if (completed === ids.length) {
          // All done - stop polling, refresh page
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          setPendingEnrichmentIds([])
          setCompletedCount(0)
          toast.success(t('images.batchAllComplete', { count: completed }))
          router.refresh()
        }
      }

      // Immediate first check
      void checkStatus()
      // Then poll every 3 seconds
      pollingIntervalRef.current = setInterval(() => void checkStatus(), 3000)
    },
    [router, t]
  )

  /**
   * Shared batch generation handler with AbortController support
   */
  const handleBatchGeneration = useCallback(
    async (
      type: GenerationType,
      missingCount: number,
      setIsGenerating: (value: boolean) => void,
      abortRef: React.MutableRefObject<AbortController | null>
    ) => {
      if (missingCount === 0) {
        toast.info(t('images.allGenerated'))
        return
      }

      // Abort previous polling if any
      abortRef.current?.abort()
      abortRef.current = new AbortController()

      setIsGenerating(true)

      try {
        const client = getBrowserTrpcClient()
        const input = { courseId, skipExisting: true }

        const data =
          type === 'covers'
            ? await client.enrichment.generateBatchCovers.mutate(input)
            : await client.enrichment.generateBatchCards.mutate(input)

        const enrichmentIds: string[] = data?.details?.succeededIds || []

        if (enrichmentIds.length > 0) {
          toast.info(t('images.batchStarted', { count: enrichmentIds.length }))
          setPendingEnrichmentIds(enrichmentIds)
          startPolling(enrichmentIds)
        } else {
          toast.success(t('images.batchComplete', { count: data?.triggered || 0 }))
          router.refresh()
        }
      } catch (error) {
        // Ignore abort errors (user navigated away or cancelled)
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }

        console.error(`Batch ${type} generation error:`, error)

        // Show error message (either extracted from response or generic)
        const errorMessage = error instanceof Error ? error.message : t('errors.generationFailed')
        toast.error(errorMessage)
      } finally {
        setIsGenerating(false)
        abortRef.current = null
      }
    },
    [courseId, router, startPolling, t]
  )

  const handleGenerateMissingCovers = useCallback(
    () => handleBatchGeneration('covers', missingCovers, setIsGeneratingCovers, coversAbortRef),
    [handleBatchGeneration, missingCovers]
  )

  const handleGenerateMissingCards = useCallback(
    () => handleBatchGeneration('cards', missingCards, setIsGeneratingCards, cardsAbortRef),
    [handleBatchGeneration, missingCards]
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/courses/${orgSlug}/${courseSlug}`}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                {tCourse('backToCourse')}
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-bold">{tCourse('visuals.title')}</h1>
          <p className="text-muted-foreground">{courseTitle}</p>
        </div>
      </div>

      {/* Course Card Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5 text-indigo-500" />
                {tCourse('visuals.courseCard')}
              </CardTitle>
              <CardDescription>{tCourse('visuals.courseCardDescription')}</CardDescription>
            </div>
            <Badge variant={hasCourseCard ? 'default' : 'secondary'}>
              {hasCourseCard ? (
                <>
                  <CheckCircle className="mr-1 h-3 w-3" /> {t('status.completed')}
                </>
              ) : (
                <>
                  <Circle className="mr-1 h-3 w-3" /> {t('status.pending')}
                </>
              )}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Lesson Covers Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5 text-cyan-500" />
                {tCourse('visuals.lessonCovers')}
              </CardTitle>
              <CardDescription>
                {tCourse('visuals.lessonCoversDescription', {
                  completed: totalLessons - missingCovers,
                  total: totalLessons,
                })}
              </CardDescription>
              <p className="text-muted-foreground mt-1 text-xs italic">
                {tCourse('visuals.lessonCoversHint')}
              </p>
            </div>
            <Button
              onClick={() => void handleGenerateMissingCovers()}
              disabled={isGeneratingCovers || missingCovers === 0}
              aria-label={tCourse('visuals.generateMissingCovers', { count: missingCovers })}
              aria-busy={isGeneratingCovers}
            >
              {isGeneratingCovers ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('generating')}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('images.batchGenerate')} ({missingCovers})
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-sm">
              <span>{tCourse('visuals.progress')}</span>
              <span>{coverPercentage}%</span>
            </div>
            <Progress value={coverPercentage} className="h-2" />
          </div>

          {/* Generation progress indicator */}
          {pendingEnrichmentIds.length > 0 && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                {t('images.batchGenerating', {
                  completed: completedCount,
                  total: pendingEnrichmentIds.length,
                })}
              </span>
            </div>
          )}

          <div className="max-h-96 space-y-2 overflow-y-auto">
            {lessons.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center text-sm">
                {tCourse('visuals.noLessons')}
              </div>
            ) : (
              lessons.map((lesson) => (
                <div
                  key={`cover-${lesson.id}`}
                  className="bg-muted/50 flex items-center justify-between rounded-lg p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{lesson.title}</p>
                    <p className="text-muted-foreground truncate text-sm">{lesson.sectionTitle}</p>
                  </div>
                  <Badge variant={lesson.hasCover ? 'default' : 'outline'} className="ml-2">
                    {lesson.hasCover ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lesson Cards Section (1:1 thumbnails) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5 text-indigo-500" />
                {tCourse('visuals.lessonCards')}
              </CardTitle>
              <CardDescription>
                {tCourse('visuals.lessonCardsDescription', {
                  completed: totalLessons - missingCards,
                  total: totalLessons,
                })}
              </CardDescription>
              <p className="text-muted-foreground mt-1 text-xs italic">
                {tCourse('visuals.lessonCardsHint')}
              </p>
            </div>
            <Button
              onClick={() => void handleGenerateMissingCards()}
              disabled={isGeneratingCards || missingCards === 0}
              aria-label={tCourse('visuals.generateMissingCards', { count: missingCards })}
              aria-busy={isGeneratingCards}
            >
              {isGeneratingCards ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('generating')}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('images.batchGenerate')} ({missingCards})
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-sm">
              <span>{tCourse('visuals.progress')}</span>
              <span>{cardPercentage}%</span>
            </div>
            <Progress value={cardPercentage} className="h-2" />
          </div>

          <div className="max-h-96 space-y-2 overflow-y-auto">
            {lessons.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center text-sm">
                {tCourse('visuals.noLessons')}
              </div>
            ) : (
              lessons.map((lesson) => (
                <div
                  key={`card-${lesson.id}`}
                  className="bg-muted/50 flex items-center justify-between rounded-lg p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{lesson.title}</p>
                    <p className="text-muted-foreground truncate text-sm">{lesson.sectionTitle}</p>
                  </div>
                  <Badge variant={lesson.hasCard ? 'default' : 'outline'} className="ml-2">
                    {lesson.hasCard ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
