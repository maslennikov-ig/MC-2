'use client';

import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { cn } from '@/lib/utils';
import { ModuleDashboardData } from '@megacampus/shared-types';
import { ModuleDashboardHeader } from './ModuleDashboardHeader';
import { LessonMatrix } from './LessonMatrix';
import { ModuleDashboardFooter } from './ModuleDashboardFooter';
import { useNodeSelection } from '../../hooks/useNodeSelection';
import { Loader2, AlertCircle } from 'lucide-react';
import { logger } from '@/lib/client-logger';

/**
 * Error fallback for ModuleDashboard
 */
function DashboardErrorFallback({ error, resetErrorBoundary }: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
      <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
      <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
        Ошибка отображения модуля
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 max-w-sm">
        {error.message}
      </p>
      <button
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-md text-sm"
      >
        Попробовать снова
      </button>
    </div>
  );
}

interface ModuleDashboardProps {
  data: ModuleDashboardData | null;
  isLoading?: boolean;
  error?: Error | null;
  onExportAll?: () => void;
  onRegenerateFailed?: () => void;
  onImproveQuality?: () => void;
  isExporting?: boolean;
  isRegenerating?: boolean;
  className?: string;
}

/**
 * ModuleDashboard - Complete module view for Stage 6 "Glass Factory" UI
 *
 * Combines:
 * - Header with vital signs (progress, cost, quality, time)
 * - Lesson matrix table
 * - Footer with batch actions
 */
export function ModuleDashboard({
  data,
  isLoading = false,
  error = null,
  onExportAll,
  onRegenerateFailed,
  onImproveQuality,
  isExporting = false,
  isRegenerating = false,
  className,
}: ModuleDashboardProps) {
  const { selectNode } = useNodeSelection();

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full py-12', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Загрузка данных модуля...
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full py-12', className)}>
        <div className="text-red-500 dark:text-red-400 text-center">
          <p className="font-medium">Ошибка загрузки</p>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  // No data state
  if (!data) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full py-12', className)}>
        <p className="text-slate-500 dark:text-slate-400">
          Данные модуля не найдены
        </p>
      </div>
    );
  }

  // Calculate low quality count
  const lowQualityCount = data.lessons.filter(
    l => l.qualityScore !== null && l.qualityScore < 0.75
  ).length;

  // Convert lesson label "1.1" to React Flow node ID "lesson_1_1"
  const toNodeId = (lessonId: string) => `lesson_${lessonId.replace('.', '_')}`;

  // Handle lesson click - open lesson inspector
  const handleLessonClick = (lessonId: string) => {
    selectNode(toNodeId(lessonId));
  };

  // Handle lesson action
  const handleLessonAction = (lessonId: string, action: 'view' | 'retry' | 'pause' | 'play') => {
    if (action === 'view') {
      const nodeId = toNodeId(lessonId);
      selectNode(nodeId);
    }
    // TODO: Implement other actions (retry, pause, play) via tRPC mutations
    logger.debug(`Lesson action: ${action}`, { lessonId, action });
  };

  return (
    <ErrorBoundary FallbackComponent={DashboardErrorFallback}>
      <div className={cn('flex flex-col h-full', className)}>
        {/* Header with vital signs */}
        <ModuleDashboardHeader data={data} className="flex-shrink-0" />

        {/* Lesson matrix - scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4">
          <LessonMatrix
            lessons={data.lessons}
            onLessonClick={handleLessonClick}
            onLessonAction={handleLessonAction}
          />
        </div>

        {/* Footer with batch actions */}
        <ModuleDashboardFooter
          aggregates={data.aggregates}
          lowQualityCount={lowQualityCount}
          onExportAll={onExportAll || (() => {})}
          onRegenerateFailed={onRegenerateFailed || (() => {})}
          onImproveQuality={onImproveQuality || (() => {})}
          isExporting={isExporting}
          isRegenerating={isRegenerating}
          className="flex-shrink-0"
        />
      </div>
    </ErrorBoundary>
  );
}

export default ModuleDashboard;
