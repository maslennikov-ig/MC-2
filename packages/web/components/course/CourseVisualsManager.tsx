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
import { useSupabase } from '@/lib/supabase/browser-client'
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
  hasCourseCard: boolean
  lessons: Lesson[]
}

type GenerationType = 'covers' | 'cards'

// Backend URL for tRPC calls (client-side)
// In production: uses '/api' (nginx proxies /api/trpc to API server)
// In development: uses env var or localhost:3456
const BACKEND_URL = (() => {
  // 1. If NEXT_PUBLIC_* is set → use it (CI/CD sets at build time)
  const url = process.env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL
  if (url) return url // → '/api' for production builds

  // 2. Fallback: runtime detection by hostname
  if (typeof window !== 'undefined') {
    const isProduction =
      window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    if (isProduction) return '/api' // Relative URL - nginx proxies /api/trpc to API
  }

  // 3. Development fallback
  return 'http://localhost:3456'
})()

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
  hasCourseCard,
  lessons,
}: CourseVisualsManagerProps) {
  const t = useTranslations('enrichments')
  const tCourse = useTranslations('course')
  const router = useRouter()
  const { session } = useSupabase()

  const [isGeneratingCovers, setIsGeneratingCovers] = useState(false)
  const [isGeneratingCards, setIsGeneratingCards] = useState(false)

  // AbortController refs for cleanup on unmount
  const coversAbortRef = useRef<AbortController | null>(null)
  const cardsAbortRef = useRef<AbortController | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      coversAbortRef.current?.abort()
      cardsAbortRef.current?.abort()
    }
  }, [])

  const missingCovers = lessons.filter((l) => !l.hasCover).length
  const missingCards = lessons.filter((l) => !l.hasCard).length
  const totalLessons = lessons.length
  const coverPercentage =
    totalLessons > 0 ? Math.round(((totalLessons - missingCovers) / totalLessons) * 100) : 0
  const cardPercentage =
    totalLessons > 0 ? Math.round(((totalLessons - missingCards) / totalLessons) * 100) : 0

  const getAuthHeaders = useCallback(
    () => ({
      'Content-Type': 'application/json',
      Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
    }),
    [session?.access_token]
  )

  /**
   * Shared batch generation handler with AbortController support
   */
  const handleBatchGeneration = useCallback(
    async (
      type: GenerationType,
      endpoint: string,
      missingCount: number,
      setIsGenerating: (value: boolean) => void,
      abortRef: React.MutableRefObject<AbortController | null>
    ) => {
      if (missingCount === 0) {
        toast.info(t('images.allGenerated'))
        return
      }

      // Abort previous request if any
      abortRef.current?.abort()
      abortRef.current = new AbortController()

      setIsGenerating(true)

      try {
        const response = await fetch(`${BACKEND_URL}/trpc/${endpoint}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          signal: abortRef.current.signal,
          body: JSON.stringify({
            courseId,
            skipExisting: true,
          }),
        })

        if (!response.ok) {
          // Try to extract error details from response
          const errorData = await response.json().catch(() => ({}))
          const errorMessage =
            errorData?.error?.message ||
            (response.status === 429
              ? t('errors.rateLimitExceeded')
              : response.status >= 500
                ? t('errors.serverError')
                : `Batch ${type} generation failed`)
          throw new Error(errorMessage)
        }

        const result = await response.json()
        const data = result.result?.data

        toast.success(t('images.batchComplete', { count: data?.triggered || 0 }))
        router.refresh()
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
    [courseId, getAuthHeaders, router, t]
  )

  const handleGenerateMissingCovers = useCallback(
    () =>
      handleBatchGeneration(
        'covers',
        'enrichment.generateBatchCovers',
        missingCovers,
        setIsGeneratingCovers,
        coversAbortRef
      ),
    [handleBatchGeneration, missingCovers]
  )

  const handleGenerateMissingCards = useCallback(
    () =>
      handleBatchGeneration(
        'cards',
        'enrichment.generateBatchCards',
        missingCards,
        setIsGeneratingCards,
        cardsAbortRef
      ),
    [handleBatchGeneration, missingCards]
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/courses/${courseSlug}`}>
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
