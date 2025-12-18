'use client';

import React, { useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { MarkdownRendererClient } from '@/components/markdown';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Edit3, RotateCcw, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { JsonViewer } from '../../panels/shared/JsonViewer';
import { LessonContentPreview, JudgeVerdictDisplay, JUDGE_VERDICT_LABELS } from '@megacampus/shared-types';

interface ContentPreviewPanelProps {
  content: LessonContentPreview | null;
  rawMarkdown: string | null;
  metadata: Record<string, unknown> | null;
  judgeResult: JudgeVerdictDisplay | null;
  status: 'pending' | 'active' | 'completed' | 'error';
  errorMessage?: string;
  onApprove: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
  isApproving?: boolean;
  isRegenerating?: boolean;
  className?: string;
}

export function ContentPreviewPanel({
  content,
  rawMarkdown,
  metadata,
  judgeResult,
  status,
  errorMessage,
  onApprove,
  onEdit,
  onRegenerate,
  isApproving = false,
  isRegenerating = false,
  className,
}: ContentPreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'markdown' | 'metadata'>('preview');

  // Render content based on status
  const renderContent = () => {
    // Error state
    if (status === 'error') {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <div>
            <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">
              Ошибка генерации
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {errorMessage || 'Произошла ошибка при генерации контента'}
            </p>
            {errorMessage && (
              <details className="text-left">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Технические детали
                </summary>
                <pre className="mt-2 p-3 bg-slate-100 dark:bg-slate-800 rounded text-xs overflow-auto max-h-40">
                  {errorMessage}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    // Pending/Active states
    if (status === 'pending' || status === 'active') {
      return (
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-center space-x-2 text-muted-foreground mb-6">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">
              {status === 'pending' ? 'Ожидание генерации...' : 'Генерация контента...'}
            </span>
          </div>

          {/* Skeleton loaders */}
          <div className="space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="pt-4">
              <Skeleton className="h-5 w-1/2" />
              <div className="mt-2 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
            <div className="pt-4">
              <Skeleton className="h-5 w-1/2" />
              <div className="mt-2 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          </div>

          {/* Streaming text overlay (if content is partially available) */}
          {content && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
              <p className="text-xs text-blue-700 dark:text-blue-300 mb-2 font-medium">
                Предварительный просмотр (генерация продолжается)
              </p>
              <div className="text-sm text-foreground">
                {content.introduction && (
                  <p className="mb-2 opacity-80">{content.introduction}</p>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Completed state - render actual content
    if (status === 'completed') {
      if (activeTab === 'preview') {
        return (
          <ScrollArea className="h-full">
            <div className="p-6">
              {rawMarkdown ? (
                <ErrorBoundary
                  fallback={
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
                      Ошибка отображения контента
                    </div>
                  }
                >
                  <MarkdownRendererClient content={rawMarkdown} />
                </ErrorBoundary>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Контент урока недоступен
                </p>
              )}
            </div>
          </ScrollArea>
        );
      }

      if (activeTab === 'markdown') {
        return (
          <ScrollArea className="h-full">
            <div className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Исходный текст в формате Markdown
                </p>
                {rawMarkdown && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(rawMarkdown);
                    }}
                    className="text-xs h-7"
                  >
                    Скопировать
                  </Button>
                )}
              </div>
              <pre className="p-4 bg-slate-900 dark:bg-slate-950 text-slate-50 rounded-lg overflow-auto text-xs font-mono whitespace-pre-wrap">
                {rawMarkdown || 'Markdown контент недоступен'}
              </pre>
            </div>
          </ScrollArea>
        );
      }

      if (activeTab === 'metadata') {
        return (
          <ScrollArea className="h-full">
            <div className="p-6">
              {metadata ? (
                <JsonViewer data={metadata} title="Метаданные урока" defaultExpanded={false} />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Метаданные недоступны
                </p>
              )}
            </div>
          </ScrollArea>
        );
      }
    }

    return null;
  };

  // Action bar visibility
  const showActions = status === 'completed';

  return (
    <div className={cn('flex flex-col h-full bg-white dark:bg-slate-950', className)}>
      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 px-4 pt-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="preview">Просмотр</TabsTrigger>
            <TabsTrigger value="markdown">Markdown</TabsTrigger>
            <TabsTrigger value="metadata">Метаданные</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden relative">
        {renderContent()}
      </div>

      {/* Action bar (floating at bottom) */}
      {showActions && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
          <div className="flex items-center justify-between gap-3">
            {/* Judge verdict indicator */}
            {judgeResult && (
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs',
                    judgeResult.votingResult.finalVerdict === 'ACCEPT' && 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
                    judgeResult.votingResult.finalVerdict === 'TARGETED_FIX' && 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700',
                    judgeResult.votingResult.finalVerdict === 'ITERATIVE_REFINEMENT' && 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700',
                    judgeResult.votingResult.finalVerdict === 'REGENERATE' && 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700',
                    judgeResult.votingResult.finalVerdict === 'ESCALATE_TO_HUMAN' && 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700'
                  )}
                >
                  {JUDGE_VERDICT_LABELS[judgeResult.votingResult.finalVerdict].ru}
                  {' '}
                  ({Math.round(judgeResult.votingResult.finalScore * 100)}%)
                </Badge>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                disabled={isRegenerating || isApproving}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Переделывается...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Переделать
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                disabled={isApproving || isRegenerating}
              >
                <Edit3 className="w-4 h-4 mr-2" />
                Редактировать
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={onApprove}
                disabled={isApproving || isRegenerating}
              >
                {isApproving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Одобрение...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Одобрить
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Skeleton loader for the entire panel
export function ContentPreviewPanelSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col h-full bg-white dark:bg-slate-950', className)}>
      <div className="border-b border-slate-200 dark:border-slate-800 px-4 pt-4">
        <div className="flex gap-2 pb-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="pt-4">
          <Skeleton className="h-5 w-1/2" />
          <div className="mt-2 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
