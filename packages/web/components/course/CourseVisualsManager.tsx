'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Image, CheckCircle, Circle, Loader2, ArrowLeft, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useSupabase } from '@/lib/supabase/browser-client'
import Link from 'next/link'

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

const BACKEND_URL = process.env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL || 'http://localhost:3456'

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
  const [coversProgress, setCoversProgress] = useState({ current: 0, total: 0 })

  const missingCovers = lessons.filter((l) => !l.hasCover).length
  const totalLessons = lessons.length
  const coverPercentage =
    totalLessons > 0 ? Math.round(((totalLessons - missingCovers) / totalLessons) * 100) : 0

  const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
  })

  const handleGenerateMissingCovers = async () => {
    if (missingCovers === 0) {
      toast.info(t('images.allGenerated'))
      return
    }

    setIsGeneratingCovers(true)
    setCoversProgress({ current: 0, total: missingCovers })

    try {
      const response = await fetch(`${BACKEND_URL}/trpc/enrichment.generateBatchCovers`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          courseId,
          skipExisting: true,
        }),
      })

      if (!response.ok) {
        throw new Error('Batch generation failed')
      }

      const result = await response.json()
      const data = result.result?.data

      toast.success(t('images.batchComplete', { count: data?.triggered || 0 }))

      // Refresh page to show updated status
      router.refresh()
    } catch (error) {
      console.error('Batch generation error:', error)
      toast.error(t('errors.generationFailed'))
    } finally {
      setIsGeneratingCovers(false)
    }
  }

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
            </div>
            <Button
              onClick={() => void handleGenerateMissingCovers()}
              disabled={isGeneratingCovers || missingCovers === 0}
            >
              {isGeneratingCovers ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('images.batchProgress', coversProgress)}
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
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
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
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
