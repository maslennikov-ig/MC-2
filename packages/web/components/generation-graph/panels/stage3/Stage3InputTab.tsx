'use client';

import React, { memo, useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { FileText, Scale, Zap, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { formatFileSize } from '@/lib/generation-graph/format-utils';
import { getSupabaseClient } from '@/lib/supabase/browser-client';
import type { Stage3InputTabProps, Stage3InputData, Stage3DocumentCandidate } from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Token budget threshold for strategy selection */
const TOKEN_BUDGET = 100_000;

/** Token count threshold for "heavy document" badge */
const HEAVY_TOKEN_THRESHOLD = 5_000;

/** Description text length threshold for show more/less toggle (~80 chars per line × 3 lines) */
const DESCRIPTION_TRUNCATE_LENGTH = 240;

/** Summary preview text length threshold for document candidates */
const SUMMARY_PREVIEW_LENGTH = 140;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Runtime type guard for Stage3InputData
 */
function isStage3InputData(data: unknown): data is Stage3InputData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  return (
    typeof d.courseId === 'string' &&
    typeof d.organizationId === 'string' &&
    d.courseContext !== undefined &&
    typeof d.courseContext === 'object' &&
    Array.isArray(d.documents)
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
    shouldShowToggle && !isExpanded ? description.slice(0, DESCRIPTION_TRUNCATE_LENGTH) + '...' : description;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground leading-relaxed">{displayText}</p>
      {shouldShowToggle && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? (t?.showLess?.[locale] || 'Show less') : (t?.showMore?.[locale] || 'Show more')}
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

interface DocumentCandidateItemProps {
  document: Stage3DocumentCandidate;
  locale: 'ru' | 'en';
}

function DocumentCandidateItem({ document }: DocumentCandidateItemProps) {
  const isHeavy = document.summaryTokens > HEAVY_TOKEN_THRESHOLD;

  // Create summary preview: first sentence, truncated
  const summaryPreview = useMemo(() => {
    if (!document.summary) return '';
    const firstSentence = document.summary.split('.')[0] || '';
    return firstSentence.length > SUMMARY_PREVIEW_LENGTH
      ? firstSentence.slice(0, SUMMARY_PREVIEW_LENGTH) + '...'
      : firstSentence + (document.summary.includes('.') ? '.' : '');
  }, [document.summary]);

  const displayName = document.originalName || document.filename;

  return (
    <div className="p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors space-y-2">
      {/* Header: Filename + Token Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate" title={displayName}>
            {displayName}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              isHeavy
                ? 'bg-yellow-50 text-yellow-600 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
                : 'bg-muted/50'
            )}
          >
            {document.summaryTokens.toLocaleString()} tokens
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatFileSize(document.fileSize)}
          </span>
        </div>
      </div>

      {/* Summary Preview - Quote Style */}
      {summaryPreview && (
        <div className="border-l-2 border-amber-500/30 pl-2">
          <p className="text-xs text-muted-foreground italic line-clamp-2">
            {summaryPreview}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const Stage3InputTab = memo<Stage3InputTabProps>(function Stage3InputTab({
  courseId,
  inputData,
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage3;

  // State for fetched data
  const [courseContext, setCourseContext] = useState<{ title: string; description: string } | null>(null);
  const [documents, setDocuments] = useState<Stage3DocumentCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Parse inputData if valid
  const parsedInputData = useMemo(() => {
    if (isStage3InputData(inputData)) {
      return inputData;
    }
    return null;
  }, [inputData]);

  // Fetch course context and documents from Supabase
  useEffect(() => {
    // If we have valid inputData, use it directly
    if (parsedInputData) {
      setCourseContext(parsedInputData.courseContext);
      setDocuments(parsedInputData.documents);
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
          .select('title, course_description')
          .eq('id', courseId)
          .single();

        if (cancelled) return;

        if (courseError) {
          console.error('[Stage3InputTab] Error fetching course:', courseError);
          setFetchError(locale === 'ru' ? 'Ошибка загрузки курса' : 'Failed to load course');
          return;
        }

        if (courseData) {
          setCourseContext({
            title: courseData.title || '',
            description: courseData.course_description || '',
          });
        }

        // Fetch documents with summaries from file_catalog
        // summary_metadata contains: { summary, token_count, ... }
        const { data: filesData, error: filesError } = await supabase
          .from('file_catalog')
          .select('id, filename, original_name, file_size, mime_type, summary_metadata, processed_content')
          .eq('course_id', courseId)
          .not('summary_metadata', 'is', null)
          .order('file_size', { ascending: false });

        if (cancelled) return;

        if (filesError) {
          console.error('[Stage3InputTab] Error fetching files:', filesError);
          // Don't set error - just show empty documents
        }

        if (filesData) {
          try {
            const mappedDocs: Stage3DocumentCandidate[] = filesData.map((file) => {
              // Safely parse summary_metadata jsonb with type validation
              let metadata: { summary?: string; token_count?: number } | null = null;
              if (file.summary_metadata && typeof file.summary_metadata === 'object') {
                metadata = file.summary_metadata as { summary?: string; token_count?: number };
              }

              const summary = metadata?.summary || file.processed_content || '';
              const tokenCount = typeof metadata?.token_count === 'number'
                ? metadata.token_count
                : Math.ceil((summary.length || 0) / 4);

              return {
                id: file.id,
                filename: file.filename || '',
                originalName: file.original_name || undefined,
                fileSize: file.file_size || 0,
                mimeType: file.mime_type || 'application/octet-stream',
                summary,
                summaryTokens: tokenCount,
              };
            });
            setDocuments(mappedDocs);
          } catch (mapErr) {
            console.error('[Stage3InputTab] Error mapping documents:', mapErr);
            setFetchError(locale === 'ru' ? 'Ошибка обработки данных' : 'Failed to process data');
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[Stage3InputTab] Fetch error:', err);
        setFetchError(locale === 'ru' ? 'Ошибка загрузки данных' : 'Failed to load data');
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

  // Compute total tokens and strategy
  const { totalTokens, strategy, progressPercent } = useMemo(() => {
    const total = documents.reduce((sum, doc) => sum + (doc.summaryTokens || 0), 0);
    const strat = total > TOKEN_BUDGET ? 'tournament' : 'single_pass';
    const percent = Math.min((total / TOKEN_BUDGET) * 100, 100);
    return { totalTokens: total, strategy: strat, progressPercent: percent };
  }, [documents]);

  // Empty state
  if (!isLoading && !courseContext && documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Scale className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-sm text-muted-foreground">
          {t?.emptyInput?.[locale] || 'Waiting for Stage 2 documents...'}
        </p>
      </div>
    );
  }

  // Retry handler
  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  // Error state
  if (fetchError) {
    return (
      <div className="p-4 text-center" role="alert" aria-live="polite">
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

  return (
    <div className="grid grid-cols-5 gap-4 p-4">
      {/* ============================================================
          Card A: Course Context (Full Width = 5/5 columns)
          ============================================================ */}
      <Card className="col-span-5 border-l-4 border-l-amber-500">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t?.courseContext?.[locale] || 'Course Criteria'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Topic - Large H3 typography */}
          <h3 className="text-xl font-bold leading-tight">
            {courseContext?.title || (locale === 'ru' ? 'Загрузка...' : 'Loading...')}
          </h3>

          {/* Description with show more/less */}
          {courseContext?.description && (
            <DescriptionWithToggle description={courseContext.description} locale={locale} />
          )}
        </CardContent>
      </Card>

      {/* ============================================================
          Card B: Document Candidates (60% = 3/5 columns)
          ============================================================ */}
      <Card className="col-span-3">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t?.candidates?.[locale] || 'Candidates'}
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {documents.length} {t?.candidatesCount?.[locale] || 'documents'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t?.sortedByTokens?.[locale] || 'Sorted by weight (tokens)'}
          </p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[280px] pr-4">
            <div className="space-y-2">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {locale === 'ru' ? 'Загрузка...' : 'Loading...'}
                </div>
              ) : documents.length > 0 ? (
                documents.map((doc) => (
                  <DocumentCandidateItem
                    key={doc.id}
                    document={doc}
                    locale={locale}
                  />
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {t?.noDocumentsToClassify?.[locale] || 'No documents to classify'}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* ============================================================
          Card C: Strategy Engine (40% = 2/5 columns)
          ============================================================ */}
      <Card className="col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t?.strategyEngine?.[locale] || 'Evaluation Mode'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Token Budget Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t?.tokenBudget?.[locale] || 'Token Budget'}
              </span>
              <span className="font-mono">
                {totalTokens.toLocaleString()} / {TOKEN_BUDGET.toLocaleString()}
              </span>
            </div>
            <Progress
              value={progressPercent}
              className={cn(
                'h-2',
                progressPercent >= 100 ? '[&>div]:bg-amber-500' : '[&>div]:bg-green-500'
              )}
            />
          </div>

          {/* Strategy Badge */}
          <div className="pt-2">
            {strategy === 'single_pass' ? (
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-green-500/10">
                  <Zap className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <Badge className="bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400">
                    {t?.strategySinglePass?.[locale] || 'Single Pass'}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t?.strategySinglePassDesc?.[locale] || 'All documents evaluated in one call'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-amber-500/10">
                  <Trophy className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400">
                    {t?.strategyTournament?.[locale] || 'Tournament Mode'}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t?.strategyTournamentDesc?.[locale] || 'Documents compared pairwise'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Document Stats */}
          <div className="pt-4 border-t border-border/50">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <span className="text-2xl font-bold">{documents.length}</span>
                <p className="text-xs text-muted-foreground">
                  {t?.candidatesCount?.[locale] || 'documents'}
                </p>
              </div>
              <div className="text-center">
                <span className="text-2xl font-bold">
                  {documents.filter((d) => d.summaryTokens > HEAVY_TOKEN_THRESHOLD).length}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t?.heavyDocument?.[locale] || 'Heavy Document'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default Stage3InputTab;
