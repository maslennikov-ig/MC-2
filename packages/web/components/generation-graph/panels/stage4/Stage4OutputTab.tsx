'use client';

import React, { memo, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Briefcase,
  Heart,
  Palette,
  Gamepad2,
  Sparkles,
  GraduationCap,
  BookOpen,
  Clock,
  Layers,
  Loader2,
} from 'lucide-react';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { AnalysisResultView } from '../output/AnalysisResultView';
import type { Stage4OutputTabProps, AnalysisHeroProps } from './types';
import type { AnalysisResult } from '@megacampus/shared-types';

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
};

// ============================================================================
// TYPE GUARDS
// ============================================================================

function isAnalysisResult(data: unknown): data is AnalysisResult {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.course_category === 'object' &&
    d.course_category !== null &&
    typeof (d.course_category as Record<string, unknown>).primary === 'string' &&
    typeof d.recommended_structure === 'object' &&
    d.recommended_structure !== null &&
    typeof d.pedagogical_strategy === 'object' &&
    d.pedagogical_strategy !== null
  );
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
  teachingStyle,
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage4 as Record<string, { ru: string; en: string }>;

  // Get category icon
  const CategoryIcon =
    CATEGORY_ICONS[category as AnalysisResult['course_category']['primary']] || GraduationCap;

  // Get translated category name
  const categoryTranslationKey = `category${category.charAt(0).toUpperCase()}${category.slice(1)}` as keyof typeof t;
  const categoryName = t[categoryTranslationKey]?.[locale] ?? category;

  // Get translated teaching style
  const styleKey = `style${teachingStyle
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')}` as keyof typeof t;
  const styleName = t[styleKey]?.[locale] ?? teachingStyle;

  // Calculate approximate total duration in hours
  const totalMinutes = totalLessons * lessonDuration;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const durationDisplay =
    hours > 0
      ? `~${hours}${t.hoursShort?.[locale] ?? 'h'}${minutes > 0 ? ` ${minutes}${t.minutesShort?.[locale] ?? 'min'}` : ''}`
      : `~${minutes}${t.minutesShort?.[locale] ?? 'min'}`;

  return (
    <Card
      className={cn(
        'border-violet-200 dark:border-violet-800',
        'bg-gradient-to-r from-violet-50 to-indigo-50',
        'dark:from-violet-900/20 dark:to-indigo-900/20'
      )}
    >
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Left: Category + Confidence */}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex items-center justify-center w-12 h-12 rounded-xl',
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
                {Math.round(confidence * 100)}% {t.confidenceLevel?.[locale] ?? 'confidence'}
              </Badge>
            </div>
          </div>

          {/* Right: Stats Grid */}
          <div className="grid grid-cols-3 gap-4 sm:gap-6">
            {/* Lessons */}
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-violet-500 dark:text-violet-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {totalLessons}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {t.lessonsLabel?.[locale] ?? 'Lessons'}
                </div>
              </div>
            </div>

            {/* Duration */}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-violet-500 dark:text-violet-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {durationDisplay}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {t.durationLabel?.[locale] ?? 'Duration'}
                </div>
              </div>
            </div>

            {/* Style */}
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-violet-500 dark:text-violet-400 shrink-0" />
              <div className="min-w-0">
                <div
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate"
                  title={styleName}
                >
                  {styleName}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {t.teachingStyle?.[locale] ?? 'Style'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Stage4OutputTab Component
 *
 * "The Blueprint" - displays analysis results with:
 * - AnalysisHero: Key metrics at a glance (category, lessons, duration, style)
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
  onApproved,
}) {
  const t = GRAPH_TRANSLATIONS.stage4 as Record<string, { ru: string; en: string }>;

  // Parse output data as AnalysisResult
  const analysisResult = useMemo((): AnalysisResult | null => {
    if (isAnalysisResult(outputData)) {
      return outputData;
    }
    return null;
  }, [outputData]);

  // Extract hero data from analysis result
  const heroData = useMemo(() => {
    if (!analysisResult) return null;

    // Check all required fields exist
    if (
      !analysisResult.course_category?.primary ||
      typeof analysisResult.course_category?.confidence !== 'number' ||
      !analysisResult.recommended_structure?.total_lessons ||
      !analysisResult.recommended_structure?.total_sections ||
      !analysisResult.recommended_structure?.lesson_duration_minutes ||
      !analysisResult.pedagogical_strategy?.teaching_style
    ) {
      return null;
    }

    return {
      category: analysisResult.course_category.primary,
      confidence: analysisResult.course_category.confidence,
      totalLessons: analysisResult.recommended_structure.total_lessons,
      totalSections: analysisResult.recommended_structure.total_sections,
      lessonDuration: analysisResult.recommended_structure.lesson_duration_minutes,
      teachingStyle: analysisResult.pedagogical_strategy.teaching_style,
    };
  }, [analysisResult]);

  // Loading state - no data yet
  if (!analysisResult) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500 mb-4" />
        <p className="text-sm text-muted-foreground">
          {t.emptyOutput?.[locale] ?? 'Analysis results will appear here'}
        </p>
      </div>
    );
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
          teachingStyle={heroData.teachingStyle}
          locale={locale}
        />
      )}

      {/* Detailed Analysis View */}
      <AnalysisResultView
        data={analysisResult}
        locale={locale}
        courseId={courseId}
        editable={editable}
        autoFocus={autoFocus}
        readOnly={readOnly}
      />

      {/* Approval callback is passed but not used directly here */}
      {/* It's handled by parent component or AnalysisResultView internally */}
      {onApproved && null}
    </div>
  );
});

export default Stage4OutputTab;
