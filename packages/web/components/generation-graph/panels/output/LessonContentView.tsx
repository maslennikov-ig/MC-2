'use client';

import React, { useState } from 'react';
import { MarkdownRendererClient } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, AlertCircle, Clock, Sparkles, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TraceAttempt } from '@megacampus/shared-types';

interface LessonSection {
  title?: string;
  content: string;
  type?: string;
}

interface LessonContentStructure {
  title?: string;
  sections?: LessonSection[];
}

interface LessonContentViewProps {
  data: {
    content?: string | LessonContentStructure | { content?: LessonContentStructure };
    qualityScore?: number;
    attempts?: TraceAttempt[];
    lessonId?: string;
    title?: string;
    outputData?: Record<string, unknown>;
  };
  locale?: 'ru' | 'en';
  courseId?: string;
  editable?: boolean;
  readOnly?: boolean;
}

const translations = {
  ru: {
    title: 'Содержимое урока',
    description: 'Сгенерированный контент урока',
    qualityScore: 'Оценка качества',
    attempts: 'Попытки генерации',
    noContent: 'Контент еще не сгенерирован',
    preview: 'Предварительный просмотр',
    refine: 'Улучшить',
    viewFull: 'Просмотреть полностью',
    attemptLabel: 'Попытка',
    success: 'Успешно',
    failed: 'Ошибка',
    generatedAt: 'Сгенерировано',
    tokens: 'Токены',
    duration: 'Длительность',
    readOnly: 'Режим просмотра',
  },
  en: {
    title: 'Lesson Content',
    description: 'Generated lesson content',
    qualityScore: 'Quality Score',
    attempts: 'Generation Attempts',
    noContent: 'Content not yet generated',
    preview: 'Preview',
    refine: 'Refine',
    viewFull: 'View Full',
    attemptLabel: 'Attempt',
    success: 'Success',
    failed: 'Failed',
    generatedAt: 'Generated',
    tokens: 'Tokens',
    duration: 'Duration',
    readOnly: 'View Only',
  },
};

const formatDuration = (ms?: number): string => {
  if (!ms) return 'N/A';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
};

const formatTokens = (tokens?: number): string => {
  if (!tokens) return 'N/A';
  return tokens.toLocaleString();
};

export function LessonContentView({
  data,
  locale = 'ru',
  courseId,
  editable = false,
  readOnly = false
}: LessonContentViewProps) {
  const t = translations[locale];
  const [showFullContent, setShowFullContent] = useState(false);

  // Extract content from various possible locations
  // Handle nested structure: { content: { content: { sections: [...] } } }
  const extractTextContent = (): string => {
    // Direct string content
    if (typeof data.content === 'string') return data.content;

    // Structure with sections: { sections: [...] } or { content: { sections: [...] } }
    let contentObj: LessonContentStructure | undefined;

    if (data.content && typeof data.content === 'object') {
      // Check if it's { content: { sections } } (from lesson_contents.content column)
      if ('content' in data.content && typeof data.content.content === 'object') {
        contentObj = data.content.content as LessonContentStructure;
      } else if ('sections' in data.content) {
        // Direct { sections } structure
        contentObj = data.content as LessonContentStructure;
      }
    }

    // Extract from outputData if not found
    if (!contentObj && data.outputData) {
      const outputContent = data.outputData.content || data.outputData.lesson_content;
      if (typeof outputContent === 'string') return outputContent;
      if (outputContent && typeof outputContent === 'object') {
        if ('content' in (outputContent as any) && typeof (outputContent as any).content === 'object') {
          contentObj = (outputContent as any).content as LessonContentStructure;
        } else if ('sections' in (outputContent as any)) {
          contentObj = outputContent as LessonContentStructure;
        }
      }
    }

    // Convert sections to text
    if (contentObj?.sections && Array.isArray(contentObj.sections)) {
      return contentObj.sections
        .map((section: LessonSection) => {
          const title = section.title ? `## ${section.title}\n\n` : '';
          return title + (section.content || '');
        })
        .join('\n\n');
    }

    return '';
  };

  const content = extractTextContent();

  const qualityScore = data.qualityScore ||
                       (data.outputData?.quality_score as number) ||
                       (data.outputData?.qualityScore as number);

  const attempts = data.attempts || [];
  const canEdit = editable && !readOnly;

  // If no content, show empty state
  if (!content && attempts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <AlertCircle className="w-8 h-8 mb-2 text-amber-500" />
        <p className="text-sm font-medium">{t.noContent}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      {/* Read-only banner */}
      {readOnly && (
        <div className="mb-4 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-700 dark:text-blue-300">
          <Eye className="inline-block w-4 h-4 mr-2" />
          {t.readOnly}
        </div>
      )}

      {/* Quality Score Badge */}
      {qualityScore !== undefined && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              {t.qualityScore}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge
                variant={qualityScore >= 80 ? 'default' : qualityScore >= 60 ? 'secondary' : 'destructive'}
                className="text-lg font-bold px-3 py-1"
              >
                {qualityScore}/100
              </Badge>
              {qualityScore >= 80 && (
                <span className="text-xs text-green-600 dark:text-green-400">
                  {locale === 'ru' ? 'Отличное качество' : 'Excellent quality'}
                </span>
              )}
              {qualityScore >= 60 && qualityScore < 80 && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {locale === 'ru' ? 'Хорошее качество' : 'Good quality'}
                </span>
              )}
              {qualityScore < 60 && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {locale === 'ru' ? 'Требуется улучшение' : 'Needs improvement'}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t.preview}</CardTitle>
          <CardDescription>{t.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "p-4 bg-slate-50 dark:bg-slate-900 rounded-lg",
              !showFullContent && "max-h-96 overflow-hidden relative"
            )}
          >
            <MarkdownRendererClient content={content} />
            {!showFullContent && content.length > 500 && (
              <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-slate-50 dark:from-slate-900 to-transparent" />
            )}
          </div>
          {content.length > 500 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFullContent(!showFullContent)}
              className="mt-2"
            >
              {showFullContent ?
                (locale === 'ru' ? 'Свернуть' : 'Collapse') :
                t.viewFull
              }
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Attempts Timeline */}
      {attempts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t.attempts}</CardTitle>
            <CardDescription>
              {attempts.length} {attempts.length === 1 ?
                (locale === 'ru' ? 'попытка' : 'attempt') :
                (locale === 'ru' ? 'попыток' : 'attempts')
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {attempts.map((attempt, idx) => (
                <div
                  key={`attempt-${idx}-${attempt.attemptNumber}`}
                  className={cn(
                    "p-3 rounded-lg border",
                    attempt.status === 'success'
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {attempt.status === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      )}
                      <span className="font-medium text-sm">
                        {t.attemptLabel} {attempt.attemptNumber}
                      </span>
                      <Badge variant={attempt.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                        {attempt.status === 'success' ? t.success : t.failed}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {attempt.timestamp ? new Date(attempt.timestamp).toLocaleString(locale) : 'N/A'}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <span>{t.duration}:</span>
                      <span className="font-mono">{formatDuration(attempt.processMetrics?.duration)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <span>{t.tokens}:</span>
                      <span className="font-mono">{formatTokens(attempt.processMetrics?.tokens)}</span>
                    </div>
                  </div>

                  {/* Error message if failed */}
                  {attempt.status === 'failed' && attempt.errorMessage && (
                    <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded text-xs text-red-800 dark:text-red-300">
                      {attempt.errorMessage}
                    </div>
                  )}

                  {/* Refinement message if exists */}
                  {attempt.refinementMessage && (
                    <div className="mt-2 p-2 bg-blue-100 dark:bg-blue-900/30 rounded text-xs text-blue-800 dark:text-blue-300">
                      <span className="font-medium">{locale === 'ru' ? 'Запрос на улучшение:' : 'Refinement:'}</span>
                      <p className="mt-1">{attempt.refinementMessage}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Refinement Action */}
      {canEdit && courseId && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" disabled>
            <Sparkles className="w-4 h-4 mr-2" />
            {t.refine}
            <span className="ml-2 text-xs text-muted-foreground">
              ({locale === 'ru' ? 'скоро' : 'coming soon'})
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}

// Skeleton loader
export const LessonContentViewSkeleton = () => (
  <div className="space-y-4 p-2">
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20" />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-3 w-48" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </CardContent>
    </Card>
  </div>
);
