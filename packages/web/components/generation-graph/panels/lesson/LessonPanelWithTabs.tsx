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
  onRetryNode?: (node: string) => void;
  isApproving?: boolean;
  isRegenerating?: boolean;
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
 * Layout:
 * ┌─────────────────────────────────┐
 * │ ← Module 1 / Lesson 2: Title  X │  ← Unified header
 * │ ┌─────────┬──────────────┐      │
 * │ │ Content │ Activities   │      │  ← Tabs (inline with header)
 * │ └─────────┴──────────────┘      │
 * │ [Tab content fills space]       │
 * └─────────────────────────────────┘
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
  onRetryNode,
  isApproving = false,
  isRegenerating = false,
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
        {/* Combined Header + Tabs */}
        <header className="shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          {/* Top row: navigation + title + actions */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="h-9 w-9 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                aria-label="Назад"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500 dark:text-slate-400">
                  Модуль {moduleNumber}
                </span>
                <span className="text-slate-400 dark:text-slate-600">/</span>
                <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[300px]">
                  Урок {lessonNumber}: {lessonTitle}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {onToggleMaximize && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleMaximize}
                  className="h-9 w-9 text-slate-600 dark:text-slate-400"
                  aria-label={isMaximized ? 'Свернуть' : 'Развернуть'}
                >
                  {isMaximized ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-9 w-9 text-slate-600 dark:text-slate-400"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Tabs row */}
          <div className="px-4 bg-slate-50 dark:bg-slate-800/50">
            <TabsList className="h-10 bg-transparent p-0 gap-4">
              <TabsTrigger
                value="content"
                className={cn(
                  'h-10 px-1 pb-0 rounded-none border-b-2 border-transparent bg-transparent',
                  'data-[state=active]:border-primary data-[state=active]:bg-transparent',
                  'data-[state=active]:shadow-none hover:text-foreground'
                )}
              >
                <FileText className="w-4 h-4 mr-2" />
                <span className="text-sm">{t('tabs.content')}</span>
              </TabsTrigger>
              <TabsTrigger
                value="enrichments"
                className={cn(
                  'h-10 px-1 pb-0 rounded-none border-b-2 border-transparent bg-transparent',
                  'data-[state=active]:border-primary data-[state=active]:bg-transparent',
                  'data-[state=active]:shadow-none hover:text-foreground'
                )}
              >
                <Layers className="w-4 h-4 mr-2" />
                <span className="text-sm">{t('tabs.enrichments')}</span>
              </TabsTrigger>
            </TabsList>
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
              onRetryNode={onRetryNode}
              isApproving={isApproving}
              isRegenerating={isRegenerating}
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
