'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorBoundary } from 'react-error-boundary';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, X, Maximize2, Minimize2, FileText, Layers, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LessonInspector } from './LessonInspector';
import { EnrichmentInspectorPanel } from '../stage7/EnrichmentInspectorPanel';
import type { LessonInspectorData, LessonInspectorDataRefinementExtension } from '@megacampus/shared-types';

/**
 * Extended data type that includes refinement fields
 */
type LessonInspectorDataWithRefinement = LessonInspectorData & Partial<LessonInspectorDataRefinementExtension>;

interface LessonPanelWithTabsProps {
  /** Lesson ID in format "module.lesson" (e.g., "1.2") */
  lessonId: string;
  /** Lesson inspector data */
  data: LessonInspectorDataWithRefinement | null;
  isLoading?: boolean;
  error?: Error | null;
  onBack: () => void;
  onClose: () => void;
  onApprove?: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
  onRetryNode?: (node: string) => void;
  isApproving?: boolean;
  isRegenerating?: boolean;
  isDeleting?: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  className?: string;
  /** User subscription tier */
  tier?: 'trial' | 'free' | 'basic' | 'standard' | 'premium';
  /** Default tab to show */
  defaultTab?: 'content' | 'enrichments';
}

/**
 * Error fallback component
 */
function TabErrorFallback({ error, resetErrorBoundary }: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
      <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
      <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
        Ошибка отображения
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 max-w-sm">
        {error.message}
      </p>
      <Button onClick={resetErrorBoundary} variant="default" size="sm">
        Попробовать снова
      </Button>
    </div>
  );
}

/**
 * LessonPanelWithTabs
 *
 * Unified lesson panel with Content and Activities tabs.
 * Has its own header to avoid duplicate headers from LessonInspector.
 *
 * Layout (single-line header, responsive):
 * ┌───────────────────────────────────────────────────────┐
 * │ ← М1/У2: Title   [Content][Activities]   [Max][Close] │
 * ├───────────────────────────────────────────────────────┤
 * │ [Tab content fills remaining space]                   │
 * └───────────────────────────────────────────────────────┘
 *
 * Mobile: М1.2 (compact), icon-only tabs
 * Desktop: М1 / У2: Title, labeled tabs
 */
export function LessonPanelWithTabs({
  lessonId,
  data,
  isLoading = false,
  error = null,
  onBack,
  onClose,
  onApprove,
  onEdit,
  onRegenerate,
  onDelete,
  onRetryNode,
  isApproving = false,
  isRegenerating = false,
  isDeleting = false,
  isMaximized,
  onToggleMaximize,
  className,
  tier = 'standard',
  defaultTab = 'content',
}: LessonPanelWithTabsProps) {
  const t = useTranslations('enrichments');
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  // Extract module/lesson numbers from lessonId (format: "1.2")
  const { moduleNumber, lessonNumber } = useMemo(() => {
    const parts = lessonId.split('.');
    return {
      moduleNumber: parseInt(parts[0] || '1', 10),
      lessonNumber: parseInt(parts[1] || '1', 10),
    };
  }, [lessonId]);

  const lessonTitle = data?.title || 'Загрузка...';

  return (
    <div className={cn('flex flex-col h-full w-full bg-white dark:bg-slate-900', className)}>
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col h-full"
      >
        {/* Unified Header - single line on desktop, compact on mobile */}
        <header className="shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex items-center justify-between px-3 py-2 gap-2">
            {/* Left: Back button + Title (compact) */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="h-8 w-8 shrink-0 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                aria-label="Назад"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1.5 text-sm min-w-0">
                <span className="text-slate-500 dark:text-slate-400 shrink-0 hidden sm:inline">
                  М{moduleNumber}
                </span>
                <span className="text-slate-400 dark:text-slate-600 shrink-0 hidden sm:inline">/</span>
                <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                  <span className="sm:hidden">М{moduleNumber}.{lessonNumber}</span>
                  <span className="hidden sm:inline">У{lessonNumber}: {lessonTitle}</span>
                </span>
              </div>
            </div>

            {/* Center: Tabs (inline) */}
            <TabsList className="h-8 bg-slate-100 dark:bg-slate-800 p-0.5 gap-0.5 shrink-0">
              <TabsTrigger
                value="content"
                className={cn(
                  'h-7 px-2.5 text-xs rounded-sm',
                  'data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700',
                  'data-[state=active]:shadow-sm'
                )}
              >
                <FileText className="w-3.5 h-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">{t('tabs.content')}</span>
              </TabsTrigger>
              <TabsTrigger
                value="enrichments"
                className={cn(
                  'h-7 px-2.5 text-xs rounded-sm',
                  'data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700',
                  'data-[state=active]:shadow-sm'
                )}
              >
                <Layers className="w-3.5 h-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">{t('tabs.enrichments')}</span>
              </TabsTrigger>
            </TabsList>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-0.5 shrink-0">
              {onToggleMaximize && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleMaximize}
                  className="h-8 w-8 text-slate-600 dark:text-slate-400"
                  aria-label={isMaximized ? 'Свернуть' : 'Развернуть'}
                >
                  {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 text-slate-600 dark:text-slate-400"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Tab content - fills remaining space */}
        <ErrorBoundary FallbackComponent={TabErrorFallback}>
          <TabsContent value="content" className="flex-1 m-0 overflow-hidden data-[state=inactive]:hidden">
            <LessonInspector
              data={data}
              isLoading={isLoading}
              error={error}
              onBack={onBack}
              onClose={onClose}
              onApprove={onApprove}
              onEdit={onEdit}
              onRegenerate={onRegenerate}
              onDelete={onDelete}
              onRetryNode={onRetryNode}
              isApproving={isApproving}
              isRegenerating={isRegenerating}
              isDeleting={isDeleting}
              isMaximized={isMaximized}
              onToggleMaximize={onToggleMaximize}
              tier={tier}
              className="h-full"
              hideHeader
            />
          </TabsContent>

          <TabsContent value="enrichments" className="flex-1 m-0 overflow-hidden data-[state=inactive]:hidden">
            <EnrichmentInspectorPanel
              lessonId={lessonId}
              className="h-full"
            />
          </TabsContent>
        </ErrorBoundary>
      </Tabs>
    </div>
  );
}

export default LessonPanelWithTabs;
