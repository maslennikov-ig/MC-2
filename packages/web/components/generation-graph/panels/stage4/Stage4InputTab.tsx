'use client';

import React, { memo, useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
// cn utility available if needed for conditional classnames
import {
  FileText,
  Crown,
  Star,
  ChevronDown,
  ChevronUp,
  Cpu,
  Coins,
  Users,
  Palette,
  BookOpen,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { getTierModelName } from '@/lib/generation-graph/constants';
import { getSupabaseClient } from '@/lib/supabase/browser-client';
import type {
  Stage4InputTabProps,
  Stage4InputData,
  Stage4DocumentClassification,
} from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Description text length threshold for show more/less toggle (~80 chars per line x 3 lines) */
const DESCRIPTION_TRUNCATE_LENGTH = 240;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Runtime type guard for Stage4InputData
 */
function isStage4InputData(data: unknown): data is Stage4InputData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  return (
    d.courseContext !== undefined &&
    typeof d.courseContext === 'object' &&
    Array.isArray(d.classifications)
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface DescriptionWithToggleProps {
  description: string;
  locale: 'ru' | 'en';
}

function DescriptionWithToggle({ description, locale }: DescriptionWithToggleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const t = GRAPH_TRANSLATIONS.stage1;

  const shouldShowToggle = description.length > DESCRIPTION_TRUNCATE_LENGTH;
  const displayText =
    shouldShowToggle && !isExpanded
      ? description.slice(0, DESCRIPTION_TRUNCATE_LENGTH) + '...'
      : description;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground leading-relaxed">{displayText}</p>
      {shouldShowToggle && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
          aria-expanded={isExpanded}
          aria-label={
            isExpanded
              ? t?.showLess?.[locale] || 'Show less'
              : t?.showMore?.[locale] || 'Show more'
          }
        >
          {isExpanded ? (
            <>
              {t?.showLess?.[locale] || 'Show less'}
              <ChevronUp className="h-3 w-3" aria-hidden="true" />
            </>
          ) : (
            <>
              {t?.showMore?.[locale] || 'Show more'}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// KNOWLEDGE STACK SUB-COMPONENT
// ============================================================================

interface KnowledgeStackProps {
  classifications: Stage4DocumentClassification[];
  locale: 'ru' | 'en';
}

function KnowledgeStack({ classifications, locale }: KnowledgeStackProps) {
  const t = GRAPH_TRANSLATIONS.stage4;
  const [showSupplementary, setShowSupplementary] = useState(false);

  // Group documents by priority
  const { coreDoc, importantDocs, supplementaryDocs } = useMemo(() => {
    const core = classifications.find((c) => c.priority === 'CORE');
    const important = classifications.filter((c) => c.priority === 'IMPORTANT');
    const supplementary = classifications.filter((c) => c.priority === 'SUPPLEMENTARY');

    return {
      coreDoc: core,
      importantDocs: important,
      supplementaryDocs: supplementary,
    };
  }, [classifications]);

  if (classifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">
          {t?.noDocumentsClassified?.[locale] || 'No classified documents'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* CORE Document - Highlighted with Crown */}
      {coreDoc && (
        <div className="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-l-amber-500">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 shrink-0">
              <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                  {t?.coreSource?.[locale] || 'Core Source'}
                </span>
              </div>
              <p className="text-sm font-medium truncate" title={coreDoc.filename}>
                {coreDoc.filename}
              </p>
              {coreDoc.rationale && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {coreDoc.rationale}
                </p>
              )}
            </div>
            <Badge
              variant="outline"
              className="shrink-0 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700"
            >
              {Math.round(coreDoc.importanceScore * 100)}%
            </Badge>
          </div>
        </div>
      )}

      {/* IMPORTANT Documents - 2-column grid */}
      {importantDocs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-blue-500" aria-hidden="true" />
            <span className="text-xs font-medium text-muted-foreground">
              {t?.importantSources?.[locale] || 'Key Materials'}
            </span>
            <Badge variant="secondary" className="text-xs">
              {importantDocs.length}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {importantDocs.map((doc) => (
              <div
                key={doc.fileId}
                className="p-2 rounded-md bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/50"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" aria-hidden="true" />
                  <span className="text-xs font-medium truncate" title={doc.filename}>
                    {doc.filename}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUPPLEMENTARY Documents - Collapsed by default */}
      {supplementaryDocs.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowSupplementary(!showSupplementary)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
            aria-expanded={showSupplementary}
          >
            {showSupplementary ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>
              + {supplementaryDocs.length}{' '}
              {t?.supplementarySources?.[locale] || 'supporting files'}
            </span>
          </button>
          {showSupplementary && (
            <div className="space-y-1 pl-5">
              {supplementaryDocs.map((doc) => (
                <div
                  key={doc.fileId}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate" title={doc.filename}>
                    {doc.filename}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const Stage4InputTab = memo<Stage4InputTabProps>(function Stage4InputTab({
  courseId,
  inputData,
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage4;

  // State for fetched data
  const [courseContext, setCourseContext] = useState<{
    topic: string;
    description: string;
    style?: string;
    targetAudience?: string;
    lessonsRange?: { min: number; max: number };
  } | null>(null);
  const [classifications, setClassifications] = useState<Stage4DocumentClassification[]>([]);
  const [parameters, setParameters] = useState<{
    tokenBudget?: number;
    model?: string;
    tier?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Parse inputData if valid
  const parsedInputData = useMemo(() => {
    if (isStage4InputData(inputData)) {
      return inputData;
    }
    return null;
  }, [inputData]);

  // Fetch course context and classifications from Supabase
  useEffect(() => {
    // If we have valid inputData, use it directly
    if (parsedInputData) {
      setCourseContext(parsedInputData.courseContext);
      setClassifications(parsedInputData.classifications);
      setParameters(parsedInputData.parameters || null);
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

        // Fetch course context
        const { data: courseData, error: courseError } = await supabase
          .from('courses')
          .select(
            'title, course_description, style, target_audience, settings'
          )
          .eq('id', courseId)
          .single();

        if (cancelled) return;

        if (courseError) {
          console.error('[Stage4InputTab] Error fetching course:', courseError);
          setFetchError(
            locale === 'ru' ? 'Ошибка загрузки курса' : 'Failed to load course'
          );
          return;
        }

        if (courseData) {
          // Parse settings for lessons range
          let lessonsRange: { min: number; max: number } | undefined;
          if (courseData.settings && typeof courseData.settings === 'object') {
            const settings = courseData.settings as Record<string, unknown>;
            if (settings.lessonsMin && settings.lessonsMax) {
              lessonsRange = {
                min: Number(settings.lessonsMin) || 5,
                max: Number(settings.lessonsMax) || 15,
              };
            }
          }

          setCourseContext({
            topic: courseData.title || '',
            description: courseData.course_description || '',
            style: courseData.style || undefined,
            targetAudience: courseData.target_audience || undefined,
            lessonsRange,
          });
        }

        // Fetch document classifications directly from file_catalog
        const { data: filesData, error: filesError } = await supabase
          .from('file_catalog')
          .select('id, filename, original_name, priority')
          .eq('course_id', courseId)
          .not('priority', 'is', null)
          .order('priority', { ascending: true }); // CORE first, then IMPORTANT, then SUPPLEMENTARY

        if (cancelled) return;

        if (filesError) {
          console.error('[Stage4InputTab] Error fetching files:', filesError);
          // Don't set error - just show empty classifications
        }

        if (filesData) {
          try {
            // Priority order mapping for importance score
            const priorityScores: Record<string, number> = {
              CORE: 1.0,
              IMPORTANT: 0.7,
              SUPPLEMENTARY: 0.4,
            };

            const mappedClassifications: Stage4DocumentClassification[] = filesData
              .filter((row) => row.priority !== null)
              .map((row) => ({
                fileId: row.id,
                filename: row.original_name || row.filename || 'Unknown',
                priority: row.priority as 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY',
                rationale: '',
                importanceScore: priorityScores[row.priority!] || 0.5,
              }));
            setClassifications(mappedClassifications);
          } catch (mapErr) {
            console.error('[Stage4InputTab] Error mapping classifications:', mapErr);
          }
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

        // Set parameters with tier-based model naming
        setParameters({
          tokenBudget: 100_000,
          tier,
        });
      } catch (err) {
        if (cancelled) return;
        console.error('[Stage4InputTab] Fetch error:', err);
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
        <Loader2 className="h-8 w-8 animate-spin text-violet-500 mb-4" />
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
  if (!courseContext && classifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <BookOpen className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-sm text-muted-foreground">
          {t?.emptyInput?.[locale] || 'Waiting for Stage 3 data...'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-4 p-4">
      {/* ============================================================
          Card A: Course Brief (Full Width = 5/5 columns)
          ============================================================ */}
      <Card className="col-span-5 border-l-4 border-l-violet-500">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t?.courseBrief?.[locale] || 'Course Brief'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Topic - Large H3 typography */}
          <h3 className="text-xl font-bold leading-tight">
            {courseContext?.topic || (locale === 'ru' ? 'Загрузка...' : 'Loading...')}
          </h3>

          {/* Description with show more/less */}
          {courseContext?.description && (
            <DescriptionWithToggle description={courseContext.description} locale={locale} />
          )}

          {/* Metadata row: audience, style, lessons range */}
          <div className="flex flex-wrap gap-3 pt-2 border-t border-border/50">
            {courseContext?.targetAudience && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{courseContext.targetAudience}</span>
              </div>
            )}
            {courseContext?.style && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{courseContext.style}</span>
              </div>
            )}
            {courseContext?.lessonsRange && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {courseContext.lessonsRange.min}-{courseContext.lessonsRange.max}{' '}
                  {t?.lessonsRangeLabel?.[locale] || 'lessons'}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ============================================================
          Card B: Knowledge Foundation (60% = 3/5 columns)
          ============================================================ */}
      <Card className="col-span-3">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t?.knowledgeFoundation?.[locale] || 'Knowledge Foundation'}
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {classifications.length}{' '}
              {locale === 'ru' ? 'файлов' : 'files'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t?.knowledgeFoundationDesc?.[locale] || 'Selected materials from Stage 3'}
          </p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[260px] pr-4">
            <KnowledgeStack classifications={classifications} locale={locale} />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* ============================================================
          Card C: Technical Constraints (40% = 2/5 columns)
          ============================================================ */}
      <Card className="col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t?.technicalConstraints?.[locale] || 'Technical Parameters'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Token Budget */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-violet-50/50 dark:bg-violet-950/20">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-violet-500" aria-hidden="true" />
              <span className="text-sm">{t?.tokenBudget?.[locale] || 'Token Budget'}</span>
            </div>
            <Badge
              variant="outline"
              className="font-mono bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/40 dark:text-violet-400 dark:border-violet-700"
            >
              {parameters?.tokenBudget?.toLocaleString() || '100,000'}
            </Badge>
          </div>

          {/* Model (tier-based naming) */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm">{t?.modelUsed?.[locale] || 'Model'}</span>
            </div>
            <Badge variant="secondary" className="text-xs">
              {getTierModelName(parameters?.tier, locale)}
            </Badge>
          </div>

          {/* Document Stats Summary */}
          <div className="pt-4 border-t border-border/50">
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded bg-amber-50/50 dark:bg-amber-950/20">
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {classifications.filter((c) => c.priority === 'CORE').length}
                </span>
                <p className="text-xs text-muted-foreground">
                  {locale === 'ru' ? 'Ядро' : 'Core'}
                </p>
              </div>
              <div className="text-center p-2 rounded bg-blue-50/50 dark:bg-blue-950/20">
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  {classifications.filter((c) => c.priority === 'IMPORTANT').length}
                </span>
                <p className="text-xs text-muted-foreground">
                  {locale === 'ru' ? 'Важные' : 'Important'}
                </p>
              </div>
              <div className="text-center p-2 rounded bg-slate-50/50 dark:bg-slate-900/20">
                <span className="text-lg font-bold text-slate-600 dark:text-slate-400">
                  {classifications.filter((c) => c.priority === 'SUPPLEMENTARY').length}
                </span>
                <p className="text-xs text-muted-foreground">
                  {locale === 'ru' ? 'Доп.' : 'Supp.'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default Stage4InputTab;
