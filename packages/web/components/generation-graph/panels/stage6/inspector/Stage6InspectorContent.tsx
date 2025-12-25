'use client';

import React, { memo, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { MarkdownRendererFull } from '@/components/markdown';
import { JsonViewer } from '../../shared/JsonViewer';
import { Stage6StatsStrip } from './Stage6StatsStrip';
import { Stage6QualityTab } from './tabs/Stage6QualityTab';
import {
  CheckCircle2,
  Edit3,
  RotateCcw,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type {
  LessonContentPreview,
  SelfReviewResult,
  JudgeVerdictDisplay,
  Stage6NodeName,
} from '@megacampus/shared-types';

// =============================================================================
// TYPES
// =============================================================================

interface Stage6InspectorContentProps {
  // Content
  content: LessonContentPreview | null;
  rawMarkdown: string | null;
  metadata: Record<string, unknown> | null;
  logs: Array<{ level: string; message: string; timestamp: string; details?: unknown }>;

  // Quality data
  selfReviewResult: SelfReviewResult | null;
  judgeResult: JudgeVerdictDisplay | null;

  // Stats for StatsStrip
  stats: {
    tokens: number;
    costUsd?: number;
    durationMs: number;
    /** Subscription tier: 'trial' | 'free' | 'basic' | 'standard' | 'premium' */
    modelTier: string;
    quality: number; // 0-100
    tokensBreakdown?: Record<Stage6NodeName, number>;
  };

  // Status
  status: 'pending' | 'active' | 'completed' | 'error';
  errorMessage?: string;

  // Actions
  onApprove: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
  isApproving?: boolean;
  isRegenerating?: boolean;

  // i18n
  locale?: 'ru' | 'en';
  className?: string;
}

// =============================================================================
// ERROR FALLBACK
// =============================================================================

function InspectorContentErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center p-4">
      <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
      <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
        Ошибка отображения контента
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 max-w-md">
        {error.message}
      </p>
      <Button onClick={resetErrorBoundary} variant="outline" size="sm">
        Попробовать снова
      </Button>
    </div>
  );
}

// =============================================================================
// LOG VIEWER COMPONENT
// =============================================================================

interface LogViewerProps {
  logs: Array<{ level: string; message: string; timestamp: string; details?: unknown }>;
  locale: 'ru' | 'en';
}

const LogViewer = memo(function LogViewer({ logs, locale }: LogViewerProps) {
  const levelColors: Record<string, string> = {
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300 dark:border-red-700',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300 dark:border-amber-700',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300 dark:border-blue-700',
    debug: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300 border-slate-300 dark:border-slate-700',
  };

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        {locale === 'ru' ? 'Логов нет' : 'No logs available'}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log, idx) => (
        <div
          key={idx}
          className="flex items-start gap-3 p-3 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
        >
          <Badge
            variant="outline"
            className={cn('text-xs shrink-0 mt-0.5', levelColors[log.level] || levelColors.debug)}
          >
            {log.level.toUpperCase()}
          </Badge>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground break-words">{log.message}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(log.timestamp).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')}
            </p>
            {log.details && typeof log.details === 'object' && log.details !== null ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  {locale === 'ru' ? 'Детали' : 'Details'}
                </summary>
                <pre className="mt-2 p-2 bg-slate-100 dark:bg-slate-800 rounded text-xs overflow-auto max-h-40">
                  {JSON.stringify(log.details as Record<string, unknown>, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * Stage6InspectorContent - Editorial IDE layout for Lesson Inspector
 *
 * Features:
 * - Top tabs: Preview | Quality | Blueprint | Trace
 * - Sticky StatsStrip header below tabs
 * - Scrollable content area
 * - Actions in tab header (right-aligned)
 *
 * Replaces the old inline panels approach with a cohesive tabbed interface.
 */
export const Stage6InspectorContent = memo(function Stage6InspectorContent({
  content,
  rawMarkdown,
  metadata,
  logs,
  selfReviewResult,
  judgeResult,
  stats,
  status,
  errorMessage,
  onApprove,
  onEdit,
  onRegenerate,
  isApproving = false,
  isRegenerating = false,
  locale = 'en',
  className,
}: Stage6InspectorContentProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'quality' | 'blueprint' | 'trace'>('preview');

  // Localized labels
  const labels = {
    preview: locale === 'ru' ? 'Просмотр' : 'Preview',
    quality: locale === 'ru' ? 'Качество' : 'Quality',
    blueprint: locale === 'ru' ? 'Схема' : 'Blueprint',
    trace: locale === 'ru' ? 'Трассировка' : 'Trace',
    approve: locale === 'ru' ? 'Одобрить' : 'Approve',
    edit: locale === 'ru' ? 'Редактировать' : 'Edit',
    regenerate: locale === 'ru' ? 'Переделать' : 'Regenerate',
    approving: locale === 'ru' ? 'Одобрение...' : 'Approving...',
    regenerating: locale === 'ru' ? 'Переделывается...' : 'Regenerating...',
    noContent: locale === 'ru' ? 'Контент урока недоступен' : 'Lesson content unavailable',
    noMetadata: locale === 'ru' ? 'Метаданные недоступны' : 'Metadata unavailable',
    error: locale === 'ru' ? 'Ошибка генерации' : 'Generation Error',
  };

  // Action bar visibility - show for completed OR error with content
  const showActions = status === 'completed' || (status === 'error' && (rawMarkdown || content));

  // Render content based on active tab
  const renderTabContent = () => {
    if (activeTab === 'preview') {
      if (!rawMarkdown && !content) {
        return (
          <div className="text-center py-12 text-sm text-muted-foreground">
            {labels.noContent}
          </div>
        );
      }

      return (
        <ErrorBoundary
          FallbackComponent={({ error, resetErrorBoundary }) => (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
              <p className="font-medium mb-2">{labels.error}</p>
              <p className="text-xs mb-3">{error.message}</p>
              <Button onClick={resetErrorBoundary} variant="outline" size="sm">
                {locale === 'ru' ? 'Попробовать снова' : 'Retry'}
              </Button>
            </div>
          )}
        >
          <MarkdownRendererFull content={rawMarkdown || ''} preset="preview" />
        </ErrorBoundary>
      );
    }

    if (activeTab === 'quality') {
      return (
        <Stage6QualityTab
          selfReviewResult={selfReviewResult || undefined}
          judgeResult={judgeResult || undefined}
          originalContent={undefined} // TODO: Add diff support
          fixedContent={selfReviewResult?.patchedContent ? JSON.stringify(selfReviewResult.patchedContent) : undefined}
          locale={locale}
        />
      );
    }

    if (activeTab === 'blueprint') {
      if (!metadata) {
        return (
          <div className="text-center py-12 text-sm text-muted-foreground">
            {labels.noMetadata}
          </div>
        );
      }

      return (
        <JsonViewer
          data={metadata}
          title={locale === 'ru' ? 'Метаданные урока' : 'Lesson Metadata'}
          defaultExpanded={false}
        />
      );
    }

    if (activeTab === 'trace') {
      return <LogViewer logs={logs} locale={locale} />;
    }

    return null;
  };

  return (
    <ErrorBoundary FallbackComponent={InspectorContentErrorFallback}>
      <div className={cn('flex flex-col h-full bg-white dark:bg-slate-950', className)}>
        {/* Tabs at TOP */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 pt-4 pb-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value="preview">{labels.preview}</TabsTrigger>
              <TabsTrigger value="quality">{labels.quality}</TabsTrigger>
              <TabsTrigger value="blueprint">{labels.blueprint}</TabsTrigger>
              <TabsTrigger value="trace">{labels.trace}</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Actions (right-aligned) */}
          {showActions && (
            <div className="flex items-center gap-2 ml-auto pb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                disabled={isRegenerating || isApproving}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {labels.regenerating}
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {labels.regenerate}
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
                {labels.edit}
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
                    {labels.approving}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {labels.approve}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* StatsStrip (sticky header) */}
        <Stage6StatsStrip
          tokens={stats.tokens}
          costUsd={stats.costUsd}
          durationMs={stats.durationMs}
          modelTier={stats.modelTier}
          quality={stats.quality}
          tokensBreakdown={stats.tokensBreakdown}
          locale={locale}
        />

        {/* Error banner (if error status) */}
        {status === 'error' && errorMessage && (
          <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                {labels.error}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400/80 truncate" title={errorMessage}>
                {errorMessage}
              </p>
            </div>
          </div>
        )}

        {/* Tab Content Area (scrollable) */}
        <ScrollArea className="flex-1">
          <div className="p-6">
            {renderTabContent()}
          </div>
        </ScrollArea>
      </div>
    </ErrorBoundary>
  );
});
