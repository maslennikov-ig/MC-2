/**
 * BlueprintPreview Component
 *
 * Compact summary of Stage 4 analysis result displayed as a horizontal card
 * with key metrics for Stage 5 UI.
 *
 * Color scheme: Orange/Amber theme for Stage 5
 */

import React from 'react'
import { Target, BookOpen, Gauge, Palette, PenLine } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations'
import type { BlueprintPreviewProps } from '../types'

export function BlueprintPreview({
  analysisResult,
  frontendParams,
  locale = 'en',
}: BlueprintPreviewProps) {
  const tAnalysis = GRAPH_TRANSLATIONS.analysisResult

  // Get translated labels with fallbacks
  const categoryLabel = tAnalysis?.category?.[locale] ?? 'Category'
  const confidenceLabel = tAnalysis?.confidence?.[locale] ?? 'Confidence'
  const lessonsLabel = tAnalysis?.totalLessons?.[locale] ?? 'Lessons'
  const complexityLabel = tAnalysis?.complexity?.[locale] ?? 'Complexity'
  const contentStyleLabel = tAnalysis?.contentStyle?.[locale] ?? 'Content Style'
  const teachingStyleLabel = tAnalysis?.teachingStyle?.[locale] ?? 'Teaching Style'

  // Format confidence percentage
  const confidencePercent = Math.round(analysisResult.confidence * 100)

  // Determine confidence color
  const confidenceColor =
    confidencePercent >= 80
      ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
      : confidencePercent >= 60
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'

  // Format lessons range
  const lessonsRange = analysisResult.lessonsRange
    ? `${analysisResult.lessonsRange.min}-${analysisResult.lessonsRange.max}`
    : analysisResult.totalLessons.toString()

  return (
    <Card className="border-l-4 border-l-orange-500">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Category with icon */}
          <div className="flex min-w-[200px] items-center gap-2">
            <div className="rounded-lg bg-orange-50 p-2 dark:bg-orange-950/20">
              <Target className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{categoryLabel}</div>
              <div className="text-sm font-medium">{analysisResult.courseCategory}</div>
            </div>
          </div>

          {/* Confidence badge */}
          <div className="flex min-w-[120px] items-center gap-2">
            <div className="text-muted-foreground text-xs">{confidenceLabel}</div>
            <Badge className={cn('text-xs font-semibold', confidenceColor)}>
              {confidencePercent}%
            </Badge>
          </div>

          {/* Lessons range */}
          <div className="flex min-w-[120px] items-center gap-2">
            <div className="rounded bg-orange-50 p-1.5 dark:bg-orange-950/20">
              <BookOpen className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{lessonsLabel}</div>
              <div className="text-sm font-medium">{lessonsRange}</div>
            </div>
          </div>

          {/* Complexity indicator */}
          {analysisResult.topicAnalysis?.complexity && (
            <div className="flex min-w-[140px] items-center gap-2">
              <div className="rounded bg-orange-50 p-1.5 dark:bg-orange-950/20">
                <Gauge className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-muted-foreground text-xs">{complexityLabel}</div>
                <div className="text-sm font-medium capitalize">
                  {analysisResult.topicAnalysis.complexity}
                </div>
              </div>
            </div>
          )}

          {/* Content style (user-selected) */}
          {analysisResult.contentStyle && (
            <div className="flex min-w-[160px] items-center gap-2">
              <div className="rounded bg-orange-50 p-1.5 dark:bg-orange-950/20">
                <PenLine className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-muted-foreground text-xs">{contentStyleLabel}</div>
                <div className="text-sm font-medium capitalize">{analysisResult.contentStyle}</div>
              </div>
            </div>
          )}

          {/* Teaching style (LLM analysis) */}
          <div className="flex min-w-[160px] items-center gap-2">
            <div className="rounded bg-orange-50 p-1.5 dark:bg-orange-950/20">
              <Palette className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{teachingStyleLabel}</div>
              <div className="text-sm font-medium capitalize">{analysisResult.teachingStyle}</div>
            </div>
          </div>
        </div>

        {/* Course title (secondary row) */}
        <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
          <div className="text-muted-foreground mb-1 text-xs">{frontendParams.courseTitle}</div>
          {frontendParams.userInstructions && (
            <div className="text-muted-foreground line-clamp-2 text-xs">
              {frontendParams.userInstructions}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
