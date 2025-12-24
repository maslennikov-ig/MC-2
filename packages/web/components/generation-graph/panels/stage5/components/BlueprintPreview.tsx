/**
 * BlueprintPreview Component
 *
 * Compact summary of Stage 4 analysis result displayed as a horizontal card
 * with key metrics for Stage 5 UI.
 *
 * Color scheme: Orange/Amber theme for Stage 5
 */

import React from 'react';
import { Target, BookOpen, Gauge, Palette } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import type { BlueprintPreviewProps } from '../types';

export function BlueprintPreview({
  analysisResult,
  frontendParams,
  locale = 'en',
}: BlueprintPreviewProps) {
  const tAnalysis = GRAPH_TRANSLATIONS.analysisResult;

  // Get translated labels with fallbacks
  const categoryLabel = tAnalysis?.category?.[locale] ?? 'Category';
  const confidenceLabel = tAnalysis?.confidence?.[locale] ?? 'Confidence';
  const lessonsLabel = tAnalysis?.totalLessons?.[locale] ?? 'Lessons';
  const complexityLabel = tAnalysis?.complexity?.[locale] ?? 'Complexity';
  const styleLabel = tAnalysis?.teachingStyle?.[locale] ?? 'Style';

  // Format confidence percentage
  const confidencePercent = Math.round(analysisResult.confidence * 100);

  // Determine confidence color
  const confidenceColor =
    confidencePercent >= 80
      ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
      : confidencePercent >= 60
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';

  // Format lessons range
  const lessonsRange = analysisResult.lessonsRange
    ? `${analysisResult.lessonsRange.min}-${analysisResult.lessonsRange.max}`
    : analysisResult.totalLessons.toString();

  return (
    <Card className="border-l-4 border-l-orange-500">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Category with icon */}
          <div className="flex items-center gap-2 min-w-[200px]">
            <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/20">
              <Target className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {categoryLabel}
              </div>
              <div className="font-medium text-sm">
                {analysisResult.courseCategory}
              </div>
            </div>
          </div>

          {/* Confidence badge */}
          <div className="flex items-center gap-2 min-w-[120px]">
            <div className="text-xs text-muted-foreground">
              {confidenceLabel}
            </div>
            <Badge
              className={cn(
                'text-xs font-semibold',
                confidenceColor
              )}
            >
              {confidencePercent}%
            </Badge>
          </div>

          {/* Lessons range */}
          <div className="flex items-center gap-2 min-w-[120px]">
            <div className="p-1.5 rounded bg-orange-50 dark:bg-orange-950/20">
              <BookOpen className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {lessonsLabel}
              </div>
              <div className="font-medium text-sm">{lessonsRange}</div>
            </div>
          </div>

          {/* Complexity indicator */}
          {analysisResult.topicAnalysis?.complexity && (
            <div className="flex items-center gap-2 min-w-[140px]">
              <div className="p-1.5 rounded bg-orange-50 dark:bg-orange-950/20">
                <Gauge className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {complexityLabel}
                </div>
                <div className="font-medium text-sm capitalize">
                  {analysisResult.topicAnalysis.complexity}
                </div>
              </div>
            </div>
          )}

          {/* Teaching style chip */}
          <div className="flex items-center gap-2 min-w-[160px]">
            <div className="p-1.5 rounded bg-orange-50 dark:bg-orange-950/20">
              <Palette className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {styleLabel}
              </div>
              <div className="font-medium text-sm">
                {analysisResult.teachingStyle}
              </div>
            </div>
          </div>
        </div>

        {/* Course title (secondary row) */}
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs text-muted-foreground mb-1">
            {frontendParams.courseTitle}
          </div>
          {frontendParams.userInstructions && (
            <div className="text-xs text-muted-foreground line-clamp-2">
              {frontendParams.userInstructions}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
