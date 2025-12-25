'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { cn } from '@/lib/utils';
import {
  LessonInspectorData,
  LessonInspectorDataRefinementExtension,
  STAGE6_NODE_LABELS,
  JudgeVerdictDisplay,
  PipelineNodeState,
  Stage6NodeName,
} from '@megacampus/shared-types';
import { LessonInspectorLayout } from './LessonInspectorLayout';
import { PipelinePanel } from './PipelinePanel';
import { Stage6InspectorContent } from '../stage6/inspector/Stage6InspectorContent';
import { Loader2, AlertCircle, Copy, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Error fallback for LessonInspector
 */
function InspectorErrorFallback({ error, resetErrorBoundary }: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
      <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
      <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
        Ошибка отображения урока
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
 * Extended data type that includes refinement fields
 */
type LessonInspectorDataWithRefinement = LessonInspectorData & Partial<LessonInspectorDataRefinementExtension>;

interface LessonInspectorProps {
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
}

/**
 * LessonInspector - Complete lesson view for Stage 6 "Glass Factory" UI
 *
 * Split-view layout with:
 * - Left: Pipeline stepper
 * - Right: Content preview with tabs + judge voting panel + actions
 */
export function LessonInspector({
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
}: LessonInspectorProps) {
  // Modal state for viewing node output
  const [outputModal, setOutputModal] = useState<{
    isOpen: boolean;
    node: string;
    output: unknown;
  }>({ isOpen: false, node: '', output: null });

  // Copy to clipboard state
  const [copied, setCopied] = useState(false);

  // Handle copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(outputModal.output, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [outputModal.output]);

  // Handle view output - open modal (must be before conditional returns - Rules of Hooks)
  const handleViewOutput = useCallback((node: string, output: unknown) => {
    setOutputModal({ isOpen: true, node, output });
  }, []);

  // Get node label for modal title
  const getNodeLabel = useCallback((node: string): string => {
    const labels = STAGE6_NODE_LABELS[node as keyof typeof STAGE6_NODE_LABELS];
    return labels?.ru || node;
  }, []);

  /**
   * Extract quality score (0-100) from judge result
   * @param judgeResult - Judge verdict with voting results
   * @returns Quality score as integer 0-100
   */
  const extractQualityScore = useCallback((judgeResult: JudgeVerdictDisplay | null): number => {
    // Guard: No judge result or no voting result
    if (!judgeResult?.votingResult) return 0;

    // finalScore could be 0 (valid score), so use nullish coalescing
    const score = judgeResult.votingResult.finalScore ?? 0;

    // Convert to 0-100 scale: if already 0-100 keep as is, if 0-1 multiply by 100
    return score > 1 ? Math.round(score) : Math.round(score * 100);
  }, []);

  /**
   * Extract tokens breakdown per node from pipeline nodes
   */
  const extractTokensBreakdown = useCallback(
    (pipelineNodes: PipelineNodeState[]): Record<Stage6NodeName, number> | undefined => {
      const breakdown: Partial<Record<Stage6NodeName, number>> = {};
      let hasTokens = false;

      for (const node of pipelineNodes) {
        if (node.tokensUsed && node.tokensUsed > 0) {
          breakdown[node.node as Stage6NodeName] = node.tokensUsed;
          hasTokens = true;
        }
      }

      return hasTokens ? (breakdown as Record<Stage6NodeName, number>) : undefined;
    },
    []
  );

  /**
   * Build metadata object from lesson data
   */
  const buildMetadata = useMemo(() => {
    if (!data) return null;
    return {
      lessonId: data.lessonId,
      moduleId: data.moduleId,
      lessonNumber: data.lessonNumber,
      title: data.title,
      totalTokens: data.totalTokensUsed,
      totalCost: data.totalCostUsd,
      totalDuration: data.totalDurationMs,
      retryCount: data.retryCount,
      refinementIterations: data.refinementIterations,
    };
  }, [data]);

  /**
   * Transform logs to required format
   */
  const transformedLogs = useMemo(() => {
    if (!data?.logs) return [];
    return data.logs.map((log) => ({
      level: log.level,
      message: log.message,
      timestamp: typeof log.timestamp === 'string' ? log.timestamp : log.timestamp.toISOString(),
      details: log.details,
    }));
  }, [data?.logs]);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full py-12', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Загрузка данных урока...
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
          Данные урока не найдены
        </p>
      </div>
    );
  }

  // Extract module number from moduleId
  const moduleNumberMatch = data.moduleId.match(/\d+/);
  const moduleNumber = moduleNumberMatch ? parseInt(moduleNumberMatch[0]) : 1;

  /**
   * Extract actual error message from pipeline data
   * Priority: 1. Pipeline node with error status, 2. Error log entry, 3. Default message
   */
  const getErrorMessage = (): string | undefined => {
    if (data.status !== 'error') return undefined;

    // Check pipeline nodes for error (iterate in reverse to get the latest error)
    const errorNode = [...data.pipelineNodes].reverse().find(n => n.status === 'error');
    if (errorNode?.errorMessage) {
      // Return node name + error message for context
      const nodeLabel = STAGE6_NODE_LABELS[errorNode.node as keyof typeof STAGE6_NODE_LABELS]?.ru || errorNode.node;
      return `${nodeLabel}: ${errorNode.errorMessage}`;
    }

    // Check logs for error entries (get the latest one)
    const errorLogs = data.logs.filter(l => l.level === 'error');
    if (errorLogs.length > 0) {
      const latestError = errorLogs[errorLogs.length - 1];
      // Try to get error details from the log
      if (latestError.details?.error && typeof latestError.details.error === 'string') {
        return latestError.details.error;
      }
      return latestError.message;
    }

    // Default fallback
    return 'Ошибка генерации урока';
  };

  // Left panel: Pipeline
  const leftPanel = (
    <PipelinePanel
      nodes={data.pipelineNodes}
      currentNode={data.currentNode}
      onRetryNode={onRetryNode}
      onViewOutput={handleViewOutput}
      className="h-full"
    />
  );

  // Right panel: Stage6InspectorContent (Editorial IDE layout)
  const rightPanel = (
    <Stage6InspectorContent
      content={data.content}
      rawMarkdown={data.rawMarkdown}
      metadata={buildMetadata}
      logs={transformedLogs}
      selfReviewResult={data.selfReviewResult ?? null}
      judgeResult={data.judgeResult}
      stats={{
        tokens: data.totalTokensUsed,
        costUsd: data.totalCostUsd,
        durationMs: data.totalDurationMs,
        modelTier: 'standard', // TODO: Extract from user subscription or course settings
        quality: extractQualityScore(data.judgeResult),
        tokensBreakdown: extractTokensBreakdown(data.pipelineNodes),
      }}
      status={data.status}
      errorMessage={getErrorMessage()}
      onApprove={onApprove || (() => {})}
      onEdit={onEdit || (() => {})}
      onRegenerate={onRegenerate || (() => {})}
      isApproving={isApproving}
      isRegenerating={isRegenerating}
      locale="ru"
      className="h-full"
    />
  );

  return (
    <ErrorBoundary FallbackComponent={InspectorErrorFallback}>
      <LessonInspectorLayout
        moduleNumber={moduleNumber}
        lessonNumber={data.lessonNumber}
        lessonTitle={data.title}
        onBack={onBack}
        onClose={onClose}
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        isMaximized={isMaximized}
        onToggleMaximize={onToggleMaximize}
        className={className}
      />

      {/* Output Modal */}
      <Dialog
        open={outputModal.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setOutputModal({ isOpen: false, node: '', output: null });
            setCopied(false);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center justify-between">
              <span>Вывод: {getNodeLabel(outputModal.node)}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="ml-4 h-8"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-1 text-emerald-500" />
                    Скопировано
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1" />
                    Копировать
                  </>
                )}
              </Button>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Сырые данные вывода этапа конвейера в формате JSON
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto mt-4">
            <pre className="text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 p-4 rounded border border-slate-200 dark:border-slate-700 overflow-x-auto whitespace-pre-wrap break-words">
              {JSON.stringify(outputModal.output, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </ErrorBoundary>
  );
}

export default LessonInspector;
