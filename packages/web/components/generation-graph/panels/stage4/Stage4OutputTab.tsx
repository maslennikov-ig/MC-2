'use client'

import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Briefcase,
  Heart,
  Palette,
  Gamepad2,
  Sparkles,
  GraduationCap,
  BookOpen,
  Clock,
  Loader2,
  Pen,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AnalysisResultView } from '../output/AnalysisResultView'
import { VisualStylePreview } from './VisualStylePreview'
import { useStaticGraph } from '../../contexts/StaticGraphContext'
import type { Stage4OutputTabProps, AnalysisHeroProps } from './types'
import { parseAnalysisResult, type AnalysisResult } from '@megacampus/shared-types'
import { getLearningStyleTitle } from '@/lib/constants/learning-styles'
import { createClient } from '@/lib/supabase/client'

// ============================================================================
// CATEGORY ICON MAPPING
// ============================================================================

const CATEGORY_ICONS: Record<
  AnalysisResult['course_category']['primary'],
  React.ComponentType<{ className?: string }>
> = {
  professional: Briefcase,
  personal: Heart,
  creative: Palette,
  hobby: Gamepad2,
  spiritual: Sparkles,
  academic: GraduationCap,
}

// ============================================================================
// ANALYSIS HERO COMPONENT
// ============================================================================

/**
 * AnalysisHero Component
 *
 * Hero card displaying key analysis metrics at a glance:
 * - Category with icon
 * - Confidence badge
 * - Lesson count, duration, and teaching style
 *
 * Design: Violet/Purple gradient background (Stage 4 color scheme)
 */
const AnalysisHero = memo<AnalysisHeroProps>(function AnalysisHero({
  category,
  confidence,
  totalLessons,
  totalSections: _totalSections, // Available for future use (e.g., modules count display)
  lessonDuration,
  writingStyle,
  locale: _locale = 'ru',
}) {
  const t = useTranslations('generation.stage4')

  // Get category icon
  const CategoryIcon =
    CATEGORY_ICONS[category as AnalysisResult['course_category']['primary']] || GraduationCap

  // Get translated category name
  const categoryTranslationKey =
    `category${category.charAt(0).toUpperCase()}${category.slice(1)}` as
      | 'categoryProfessional'
      | 'categoryPersonal'
      | 'categoryCreative'
      | 'categoryHobby'
      | 'categorySpiritual'
      | 'categoryAcademic'
  const categoryName = t(categoryTranslationKey)

  // Calculate approximate total duration in hours
  const totalMinutes = totalLessons * lessonDuration
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const durationDisplay =
    hours > 0
      ? `~${hours}${t('hoursShort')}${minutes > 0 ? ` ${minutes}${t('minutesShort')}` : ''}`
      : `~${minutes}${t('minutesShort')}`

  return (
    <Card
      className={cn(
        'border-violet-200 dark:border-violet-800',
        'bg-gradient-to-r from-violet-50 to-indigo-50',
        'dark:from-violet-900/20 dark:to-indigo-900/20'
      )}
    >
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: Category + Confidence */}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl',
                'bg-violet-100 dark:bg-violet-900/40',
                'text-violet-600 dark:text-violet-400'
              )}
            >
              <CategoryIcon className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{categoryName}</h3>
              <Badge
                variant="secondary"
                className={cn(
                  'text-xs font-medium',
                  confidence >= 0.9
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                    : confidence >= 0.7
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                )}
              >
                {Math.round(confidence * 100)}% {t('confidenceLevel')}
              </Badge>
            </div>
          </div>

          {/* Right: Stats Grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
            {/* Lessons */}
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 shrink-0 text-violet-500 dark:text-violet-400" />
              <div className="min-w-0">
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {totalLessons}
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {t('lessonsLabel')}
                </div>
              </div>
            </div>

            {/* Duration */}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-violet-500 dark:text-violet-400" />
              <div className="min-w-0">
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {durationDisplay}
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {t('durationLabel')}
                </div>
              </div>
            </div>

            {/* Writing Style */}
            {writingStyle && (
              <div className="flex items-center gap-2">
                <Pen className="h-4 w-4 shrink-0 text-violet-500 dark:text-violet-400" />
                <div className="min-w-0">
                  <div
                    className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100"
                    title={getLearningStyleTitle(writingStyle)}
                  >
                    {getLearningStyleTitle(writingStyle)}
                  </div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {t('writingStyleLabel')}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
})

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Stage4OutputTab Component
 *
 * "The Blueprint" - displays analysis results with:
 * - AnalysisHero: Key metrics at a glance (category, lessons, duration, style)
 * - VisualStylePreview: Visual style recommendations for course imagery (generated in Stage 4)
 * - AnalysisResultView: Detailed accordion sections for all analysis data
 *
 * Color scheme: Violet/Purple (wisdom, synthesis, strategy)
 */
export const Stage4OutputTab = memo<Stage4OutputTabProps>(function Stage4OutputTab({
  outputData,
  courseId,
  editable = false,
  autoFocus = false,
  readOnly = false,
  locale = 'ru',
  onApproved: _onApproved, // Reserved for future use (approval handled by parent)
}) {
  const t = useTranslations('generation.stage4')

  // Get visual style, writing style, and persisted analysis result from context
  const { courseInfo } = useStaticGraph()
  const visualStyle = courseInfo.visualStyle
  const writingStyle = courseInfo.courseStyle
  const persistedAnalysisResult = courseInfo.analysisResult

  // Pull-fallback: fetch analysis_result directly if not available via context/traces
  // Retries every 3s until data is found (handles case when tab is opened before Stage 4 completes)
  const [directFetchResult, setDirectFetchResult] = useState<AnalysisResult | null>(null)
  const hasFetched = useRef(false)

  useEffect(() => {
    if (persistedAnalysisResult || outputData) return
    if (hasFetched.current || !courseId) return

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const fetchData = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('courses')
          .select('analysis_result')
          .eq('id', courseId)
          .single()

        if (cancelled) return

        if (data?.analysis_result) {
          const parsed = parseAnalysisResult(data.analysis_result)
          if (parsed) {
            hasFetched.current = true
            setDirectFetchResult(parsed)
            return
          }
        }

        // Data not yet available — retry after 3s
        retryTimer = setTimeout(() => {
          if (!cancelled) void fetchData()
        }, 3000)
      } catch {
        // Best-effort fallback — retry after 5s
        retryTimer = setTimeout(() => {
          if (!cancelled) void fetchData()
        }, 5000)
      }
    }

    void fetchData()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [persistedAnalysisResult, outputData, courseId])

  // Parse output data as AnalysisResult
  // Priority: persisted analysis_result (from courses table, includes user edits) > outputData (from traces) > direct fetch
  const analysisResult = useMemo((): AnalysisResult | null => {
    // First try persisted analysis_result from courses table (includes user edits)
    if (persistedAnalysisResult) {
      const parsed = parseAnalysisResult(persistedAnalysisResult)
      if (parsed) return parsed
    }
    // Fall back to outputData from generation_trace
    if (outputData) {
      const parsed = parseAnalysisResult(outputData)
      if (parsed) return parsed
    }
    // Final fallback: direct Supabase fetch
    return directFetchResult
  }, [persistedAnalysisResult, outputData, directFetchResult])

  // Extract hero data from analysis result
  const heroData = useMemo(() => {
    if (!analysisResult) return null

    // Check all required fields exist
    if (
      !analysisResult.course_category?.primary ||
      typeof analysisResult.course_category?.confidence !== 'number' ||
      !analysisResult.recommended_structure?.total_lessons ||
      !analysisResult.recommended_structure?.total_sections ||
      !analysisResult.recommended_structure?.lesson_duration_minutes
    ) {
      return null
    }

    return {
      category: analysisResult.course_category.primary,
      confidence: analysisResult.course_category.confidence,
      totalLessons: analysisResult.recommended_structure.total_lessons,
      totalSections: analysisResult.recommended_structure.total_sections,
      lessonDuration: analysisResult.recommended_structure.lesson_duration_minutes,
    }
  }, [analysisResult])

  // Loading state - no data yet
  if (!analysisResult) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Loader2 className="mb-4 h-8 w-8 animate-spin text-violet-500" />
        <p className="text-muted-foreground text-sm">{t('emptyOutput')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-1">
      {/* Hero Card - only show if we have complete hero data */}
      {heroData && (
        <AnalysisHero
          category={heroData.category}
          confidence={heroData.confidence}
          totalLessons={heroData.totalLessons}
          totalSections={heroData.totalSections}
          lessonDuration={heroData.lessonDuration}
          writingStyle={writingStyle}
        />
      )}

      {/* Visual Style Preview - only show if visual style data is available */}
      {visualStyle && <VisualStylePreview visualStyle={visualStyle} locale={locale} />}

      {/* Detailed Analysis View */}
      <AnalysisResultView
        data={analysisResult}
        locale={locale}
        courseId={courseId}
        editable={editable}
        autoFocus={autoFocus}
        readOnly={readOnly}
      />
    </div>
  )
})

export default Stage4OutputTab
