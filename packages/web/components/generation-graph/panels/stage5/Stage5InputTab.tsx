'use client';

import React, { memo, useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  Cpu,
  Users,
  Palette,
  BookOpen,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { getTierModelName } from '@/lib/generation-graph/constants';
import { getSupabaseClient } from '@/lib/supabase/browser-client';
import type { Stage5InputTabProps, Stage5InputData } from './types';
import { BlueprintPreview } from './components/BlueprintPreview';

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Runtime type guard for Stage5InputData
 */
function isStage5InputData(data: unknown): data is Stage5InputData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.analysisResult !== undefined && d.frontendParameters !== undefined;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const Stage5InputTab = memo<Stage5InputTabProps>(function Stage5InputTab({
  courseId,
  inputData,
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage5;

  // State for fetched data
  const [analysisResult, setAnalysisResult] = useState<Stage5InputData['analysisResult'] | null>(
    null
  );
  const [frontendParams, setFrontendParams] = useState<
    Stage5InputData['frontendParameters'] | null
  >(null);
  const [generationParams, setGenerationParams] = useState<{
    batchSize?: number;
    qualityThreshold?: number;
    minLessons?: number;
    tier?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Parse inputData if valid
  const parsedInputData = useMemo(() => {
    if (isStage5InputData(inputData)) {
      return inputData;
    }
    return null;
  }, [inputData]);

  // Fetch data from Supabase
  useEffect(() => {
    // If we have valid inputData, use it directly
    if (parsedInputData) {
      setAnalysisResult(parsedInputData.analysisResult);
      setFrontendParams(parsedInputData.frontendParameters);
      setGenerationParams(parsedInputData.generationParams || null);
      return;
    }

    // Otherwise fetch from database
    if (!courseId) return;

    // Cancelled flag pattern for cleanup
    let cancelled = false;

    const fetchData = async () => {
      setIsLoading(true);
      setFetchError(null);

      try {
        const supabase = getSupabaseClient();

        // Fetch course data: analysis_result, title, language, settings
        const { data: courseData, error: courseError } = await supabase
          .from('courses')
          .select('analysis_result, title, settings')
          .eq('id', courseId)
          .single();

        if (cancelled) return;

        if (courseError) {
          console.error('[Stage5InputTab] Error fetching course:', courseError);
          setFetchError(
            locale === 'ru' ? 'Ошибка загрузки курса' : 'Failed to load course'
          );
          return;
        }

        if (courseData) {
          // Parse analysis_result from Stage 4 (uses snake_case from AnalysisResult type)
          let parsedAnalysisResult: Stage5InputData['analysisResult'] | null = null;
          if (courseData.analysis_result && typeof courseData.analysis_result === 'object') {
            const ar = courseData.analysis_result as Record<string, unknown>;
            // Real paths from AnalysisResult type (shared-types)
            const courseCategory = ar.course_category as Record<string, unknown> | undefined;
            const recommendedStructure = ar.recommended_structure as Record<string, unknown> | undefined;
            const pedagogicalStrategy = ar.pedagogical_strategy as Record<string, unknown> | undefined;
            const topicAnalysis = ar.topic_analysis as Record<string, unknown> | undefined;

            // Get total_lessons from recommended_structure
            const totalLessons = (recommendedStructure?.total_lessons as number) || 10;
            const totalSections = (recommendedStructure?.total_sections as number) || 1;

            parsedAnalysisResult = {
              // Use 'primary' not 'category' - real AnalysisResult structure
              courseCategory: (courseCategory?.primary as string) || 'professional',
              confidence: (courseCategory?.confidence as number) || 0,
              totalLessons,
              lessonsRange: {
                // Calculate approximate min/max based on sections
                min: Math.max(10, totalLessons - totalSections * 2),
                max: totalLessons + totalSections * 2,
              },
              // Use 'pedagogical_strategy.teaching_style' - real path
              teachingStyle: (pedagogicalStrategy?.teaching_style as string) || 'mixed',
              topicAnalysis: topicAnalysis
                ? {
                    complexity: (topicAnalysis.complexity as string) || 'intermediate',
                    prerequisites: (topicAnalysis.prerequisites as string[]) || [],
                  }
                : undefined,
            };
          }

          // Parse frontend parameters
          const settings = courseData.settings as Record<string, unknown> | null;
          const frontendParameters: Stage5InputData['frontendParameters'] = {
            courseTitle: courseData.title || '',
            language: (settings?.language as string) || 'ru',
            userInstructions: (settings?.userInstructions as string) || undefined,
          };

          setAnalysisResult(parsedAnalysisResult);
          setFrontendParams(frontendParameters);
        }

        // Fetch organization tier for tier-based model naming
        const { data: orgData, error: orgError } = await supabase
          .from('courses')
          .select('organization_id, organizations!inner(tier)')
          .eq('id', courseId)
          .single();

        if (cancelled) return;

        let tier = 'standard'; // default tier
        if (!orgError && orgData) {
          const org = orgData.organizations as { tier?: string } | null;
          tier = org?.tier || 'standard';
        }

        // Set generation parameters
        setGenerationParams({
          batchSize: 4,
          qualityThreshold: 0.7,
          minLessons: 10,
          tier,
        });
      } catch (err) {
        if (cancelled) return;
        console.error('[Stage5InputTab] Fetch error:', err);
        setFetchError(
          locale === 'ru' ? 'Ошибка загрузки данных' : 'Failed to load data'
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    // Cleanup: prevent state updates on unmounted component
    return () => {
      cancelled = true;
    };
  }, [courseId, parsedInputData, locale, retryCount]);

  // Retry handler
  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500 mb-4" />
        <p className="text-sm text-muted-foreground">
          {locale === 'ru' ? 'Загрузка данных...' : 'Loading data...'}
        </p>
      </div>
    );
  }

  // Error state
  if (fetchError) {
    return (
      <div className="p-4 text-center" role="alert" aria-live="polite">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
        <p className="text-destructive mb-2">{fetchError}</p>
        <button
          type="button"
          onClick={handleRetry}
          className="text-sm text-muted-foreground hover:text-foreground underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
          aria-label={locale === 'ru' ? 'Повторить загрузку данных' : 'Retry loading data'}
        >
          {locale === 'ru' ? 'Попробовать снова' : 'Try again'}
        </button>
      </div>
    );
  }

  // Empty state
  if (!analysisResult || !frontendParams) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <BookOpen className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-sm text-muted-foreground">
          {t?.emptyInput?.[locale] || 'Waiting for Stage 4 data...'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-4 p-4">
      {/* ============================================================
          Card A: Blueprint Preview (Full Width = 5/5 columns)
          ============================================================ */}
      <Card className="col-span-5 border-l-4 border-l-orange-500">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t?.blueprintReview?.[locale] || 'Blueprint Review'}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {t?.blueprintReviewDesc?.[locale] || 'Source data from Stage 4'}
          </p>
        </CardHeader>
        <CardContent>
          <BlueprintPreview
            analysisResult={analysisResult}
            frontendParams={frontendParams}
            locale={locale}
          />
        </CardContent>
      </Card>

      {/* ============================================================
          Card B: Frontend Parameters (60% = 3/5 columns)
          ============================================================ */}
      <Card className="col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t?.frontendParams?.[locale] || 'Course Parameters'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Course Title */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-orange-500" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">
                {t?.courseTitle?.[locale] || 'Course Title'}
              </span>
            </div>
            <p className="text-sm font-medium pl-6">{frontendParams.courseTitle}</p>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-orange-500" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">
                {t?.courseLanguage?.[locale] || 'Language'}
              </span>
            </div>
            <Badge variant="outline" className="ml-6">
              {frontendParams.language === 'ru' ? 'Русский' : 'English'}
            </Badge>
          </div>

          {/* User Instructions */}
          {frontendParams.userInstructions && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-orange-500" aria-hidden="true" />
                <span className="text-xs text-muted-foreground">
                  {t?.userInstructions?.[locale] || 'Instructions'}
                </span>
              </div>
              <ScrollArea className="h-[80px] rounded-md border p-2 ml-6">
                <p className="text-xs text-muted-foreground">{frontendParams.userInstructions}</p>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================
          Card C: Model Information (40% = 2/5 columns)
          ============================================================ */}
      <Card className="col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t?.modelInfo?.[locale] || 'Model'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Model (tier-based naming) */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-orange-50/50 dark:bg-orange-950/20">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-orange-500" aria-hidden="true" />
              <span className="text-sm">{t?.modelTier?.[locale] || 'AI Model'}</span>
            </div>
            <Badge
              variant="outline"
              className="font-mono bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-400 dark:border-orange-700"
            >
              {getTierModelName(generationParams?.tier, locale)}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default Stage5InputTab;
