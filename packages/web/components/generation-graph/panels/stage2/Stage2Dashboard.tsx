'use client';

import React, { useMemo } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../../hooks/useNodeSelection';
import { useTranslation } from '@/lib/generation-graph/useTranslation';
import {
  Loader2,
  AlertCircle,
  FileStack,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Layers,
  Hash,
  Timer,
  Eye,
  RotateCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Document matrix row representing a single document in processing
 */
export interface DocumentMatrixRow {
  /** Document UUID */
  documentId: string;
  /** Original filename */
  filename: string;
  /** Processing status */
  status: 'pending' | 'active' | 'completed' | 'error';
  /** Document priority for processing order */
  priority?: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  /** Number of completed processing stages */
  completedStages: number;
  /** Total number of processing stages */
  totalStages: number;
  /** Processing time in milliseconds */
  processingTimeMs?: number;
  /** Error message if status is 'error' */
  errorMessage?: string;
}

/**
 * Stage 2 Dashboard aggregated data
 */
export interface Stage2DashboardData {
  /** Total number of documents */
  totalDocuments: number;
  /** Number of completed documents */
  completedDocuments: number;
  /** Number of currently processing documents */
  processingDocuments: number;
  /** Number of failed documents */
  failedDocuments: number;
  /** Document list for matrix display */
  documents: DocumentMatrixRow[];
  /** Aggregated processing statistics */
  aggregates: {
    /** Total pages across all documents */
    totalPages: number;
    /** Total chunks created */
    totalChunks: number;
    /** Total tokens embedded */
    totalTokens: number;
    /** Average processing time per document in ms */
    avgProcessingTimeMs: number;
  };
}

// ============================================================================
// ERROR FALLBACK
// ============================================================================

/**
 * Error fallback for Stage2Dashboard
 */
function DashboardErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
      <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
      <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
        {t('stage2.displayError')}
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 max-w-sm">
        {error.message}
      </p>
      <button
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md text-sm"
      >
        {t('stage2.tryAgain')}
      </button>
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format processing time in human-readable format
 */
function formatDuration(ms: number | undefined, t: (key: string) => string): string {
  if (ms === undefined || ms === 0) return '-';
  if (ms < 1000) return `${ms}${t('stage2.milliseconds')}`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}${t('stage2.seconds')}`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}${t('stage2.minutes')} ${remainingSeconds}${t('stage2.seconds')}`;
}

/**
 * Format average processing time
 */
function formatAvgTime(ms: number, t: (key: string) => string): string {
  if (ms === 0) return '-';
  if (ms < 1000) return `~${Math.round(ms)}${t('stage2.milliseconds')}`;
  return `~${(ms / 1000).toFixed(1)}${t('stage2.seconds')}`;
}

/**
 * Get row styling based on document status
 */
function getRowClassName(status: DocumentMatrixRow['status']): string {
  switch (status) {
    case 'pending':
      return 'text-slate-400 dark:text-slate-500';
    case 'active':
      return 'bg-indigo-50 dark:bg-indigo-950/30 font-semibold text-indigo-900 dark:text-indigo-100';
    case 'completed':
      return '';
    case 'error':
      return 'text-red-600 dark:text-red-400';
  }
}

/**
 * Get priority badge color
 */
function getPriorityBadge(priority: DocumentMatrixRow['priority'], t: (key: string) => string) {
  if (!priority) return null;

  // Type guard to ensure priority is valid
  const validPriorities = ['CORE', 'IMPORTANT', 'SUPPLEMENTARY'] as const;
  if (!validPriorities.includes(priority as any)) {
    console.warn(`[Stage2Dashboard] Invalid priority value: ${priority}`);
    return null;
  }

  const variants: Record<
    NonNullable<DocumentMatrixRow['priority']>,
    { bg: string; text: string; border: string }
  > = {
    CORE: {
      bg: 'bg-indigo-100 dark:bg-indigo-900/40',
      text: 'text-indigo-700 dark:text-indigo-300',
      border: 'border-indigo-300 dark:border-indigo-700',
    },
    IMPORTANT: {
      bg: 'bg-amber-100 dark:bg-amber-900/40',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-300 dark:border-amber-700',
    },
    SUPPLEMENTARY: {
      bg: 'bg-slate-100 dark:bg-slate-800/40',
      text: 'text-slate-600 dark:text-slate-400',
      border: 'border-slate-300 dark:border-slate-600',
    },
  };

  const labels: Record<NonNullable<DocumentMatrixRow['priority']>, string> = {
    CORE: t('stage2.priorityCore'),
    IMPORTANT: t('stage2.priorityImportant'),
    SUPPLEMENTARY: t('stage2.prioritySupplementary'),
  };

  const variant = variants[priority];

  return (
    <Badge
      variant="outline"
      className={cn('text-xs', variant.bg, variant.text, variant.border)}
    >
      {labels[priority]}
    </Badge>
  );
}

/**
 * Get status badge for overall dashboard status
 */
function getStatusBadge(data: Stage2DashboardData, t: (key: string) => string) {
  if (data.failedDocuments > 0) {
    return (
      <Badge
        variant="outline"
        className={cn(
          'text-sm font-medium',
          'border-orange-300 dark:border-orange-700',
          'text-orange-700 dark:text-orange-400',
          'bg-orange-50 dark:bg-orange-900/30'
        )}
      >
        {t('stage2.requiresAttention')}
      </Badge>
    );
  }

  if (data.processingDocuments > 0) {
    return (
      <Badge
        variant="outline"
        className={cn(
          'text-sm font-medium',
          'border-indigo-300 dark:border-indigo-700',
          'text-indigo-700 dark:text-indigo-400',
          'bg-indigo-50 dark:bg-indigo-900/30',
          'animate-pulse'
        )}
      >
        {t('stage2.statusActive')}
      </Badge>
    );
  }

  if (data.completedDocuments === data.totalDocuments && data.totalDocuments > 0) {
    return (
      <Badge
        variant="outline"
        className={cn(
          'text-sm font-medium',
          'border-emerald-300 dark:border-emerald-700',
          'text-emerald-700 dark:text-emerald-400',
          'bg-emerald-50 dark:bg-emerald-900/30'
        )}
      >
        {t('stage2.statusCompleted')}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'text-sm font-medium',
        'border-slate-300 dark:border-slate-700',
        'text-slate-700 dark:text-slate-400',
        'bg-slate-50 dark:bg-slate-900/30'
      )}
    >
      {t('stage2.statusPending')}
    </Badge>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface Stage2DashboardHeaderProps {
  data: Stage2DashboardData;
  className?: string;
}

/**
 * Dashboard header with title and vital signs
 */
function Stage2DashboardHeader({ data, className }: Stage2DashboardHeaderProps) {
  const { t } = useTranslation();
  const progressPercent =
    data.totalDocuments > 0
      ? Math.round((data.completedDocuments / data.totalDocuments) * 100)
      : 0;

  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-900',
        'border-b border-slate-200 dark:border-slate-800',
        'sticky top-0 z-10',
        className
      )}
    >
      <div className="p-6 space-y-6">
        {/* Title Row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
              <FileStack className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {t('stage2.dashboardTitle')}
            </h2>
          </div>
          {getStatusBadge(data, t)}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">
              {t('stage2.overallProgress')}
            </span>
            <span className="font-mono text-indigo-600 dark:text-indigo-400">
              {data.completedDocuments}/{data.totalDocuments} ({progressPercent}%)
            </span>
          </div>
          <Progress
            value={progressPercent}
            className="h-2 bg-indigo-100 dark:bg-indigo-900/30 [&>div]:bg-indigo-500 dark:[&>div]:bg-indigo-400"
            aria-label={t('stage2.overallProgress') || "Общий прогресс обработки документов"}
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {/* Vital Signs Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Documents */}
          <VitalSignCard
            icon={<FileStack className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />}
            label={t('stage2.totalLabel')}
            value={data.totalDocuments.toString()}
          />

          {/* Completed */}
          <VitalSignCard
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />}
            label={t('stage2.readyLabel')}
            value={data.completedDocuments.toString()}
            variant="success"
          />

          {/* Processing */}
          <VitalSignCard
            icon={<Clock className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />}
            label={t('stage2.inProgressLabel')}
            value={data.processingDocuments.toString()}
            variant="active"
          />

          {/* Failed */}
          <VitalSignCard
            icon={<AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" />}
            label={t('stage2.errorsLabel')}
            value={data.failedDocuments.toString()}
            variant={data.failedDocuments > 0 ? 'error' : undefined}
          />
        </div>
      </div>
    </div>
  );
}

interface VitalSignCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  variant?: 'success' | 'active' | 'error';
}

/**
 * Individual vital sign card
 */
function VitalSignCard({ icon, label, value, variant }: VitalSignCardProps) {
  const variantClasses = {
    success: 'text-emerald-600 dark:text-emerald-400',
    active: 'text-indigo-600 dark:text-indigo-400',
    error: 'text-red-600 dark:text-red-400',
  };

  return (
    <div
      className={cn(
        'p-4 rounded-lg border',
        'border-slate-200 dark:border-slate-700',
        'bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-900',
        'transition-all duration-300',
        'hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600'
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <div className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400 font-medium">
          {label}
        </div>
      </div>
      <div
        className={cn(
          'text-2xl font-mono font-semibold',
          variant ? variantClasses[variant] : 'text-slate-900 dark:text-indigo-400'
        )}
      >
        {value}
      </div>
    </div>
  );
}

interface DocumentMatrixProps {
  documents: DocumentMatrixRow[];
  onDocumentClick: (documentId: string) => void;
  className?: string;
  isLoading?: boolean;
}

/**
 * Document matrix table
 */
function DocumentMatrix({
  documents,
  onDocumentClick,
  className,
  isLoading,
}: DocumentMatrixProps) {
  const { t } = useTranslation();

  // Loading skeleton state
  if (isLoading) {
    return (
      <div
        className={cn(
          'rounded-lg border border-slate-200 dark:border-slate-700',
          className
        )}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[40%]">{t('stage2.tableDocument')}</TableHead>
              <TableHead className="w-24">{t('stage2.tablePriority')}</TableHead>
              <TableHead className="w-28 text-center">{t('stage2.tableProgress')}</TableHead>
              <TableHead className="w-24 text-center">{t('stage2.tableStatus')}</TableHead>
              <TableHead className="w-24 text-right">{t('stage2.tableTime')}</TableHead>
              <TableHead className="w-16 text-center">{t('stage2.tableAction')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3].map((i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                </TableCell>
                <TableCell>
                  <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                </TableCell>
                <TableCell className="text-center">
                  <div className="h-4 w-20 mx-auto bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                </TableCell>
                <TableCell className="text-center">
                  <div className="h-6 w-16 mx-auto bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                </TableCell>
                <TableCell className="text-right">
                  <div className="h-4 w-12 ml-auto bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                </TableCell>
                <TableCell className="text-center">
                  <div className="h-8 w-8 mx-auto bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Sort by priority (CORE > IMPORTANT > SUPPLEMENTARY) then by filename
  const sortedDocuments = useMemo(() => {
    const priorityOrder: Record<string, number> = { CORE: 0, IMPORTANT: 1, SUPPLEMENTARY: 2 };
    return [...documents].sort((a, b) => {
      const aPriority = a.priority ? priorityOrder[a.priority] ?? 3 : 3;
      const bPriority = b.priority ? priorityOrder[b.priority] ?? 3 : 3;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.filename.localeCompare(b.filename);
    });
  }, [documents]);

  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 dark:border-slate-700',
        className
      )}
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[40%]">{t('stage2.tableDocument')}</TableHead>
            <TableHead className="w-24">{t('stage2.tablePriority')}</TableHead>
            <TableHead className="w-28 text-center">{t('stage2.tableProgress')}</TableHead>
            <TableHead className="w-24 text-center">{t('stage2.tableStatus')}</TableHead>
            <TableHead className="w-24 text-right">{t('stage2.tableTime')}</TableHead>
            <TableHead className="w-16 text-center">{t('stage2.tableAction')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedDocuments.map((doc) => (
            <TableRow
              key={doc.documentId}
              onClick={() => onDocumentClick(doc.documentId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onDocumentClick(doc.documentId);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`${t('stage2.openDocument')} ${doc.filename}`}
              className={cn(
                'cursor-pointer transition-colors',
                getRowClassName(doc.status),
                'hover:bg-slate-100 dark:hover:bg-slate-800',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
              )}
            >
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {doc.status === 'error' && (
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  )}
                  <span className="truncate max-w-xs" title={doc.filename}>
                    {doc.filename}
                  </span>
                </div>
                {doc.errorMessage && (
                  <p className="text-xs text-red-500 mt-1 truncate" title={doc.errorMessage}>
                    {doc.errorMessage}
                  </p>
                )}
              </TableCell>
              <TableCell>{getPriorityBadge(doc.priority, t)}</TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <span className="font-mono text-sm">
                    {doc.completedStages}/{doc.totalStages}
                  </span>
                  <Progress
                    value={(doc.completedStages / doc.totalStages) * 100}
                    className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 [&>div]:bg-indigo-500"
                    aria-label={`${doc.filename}: ${doc.completedStages}/${doc.totalStages}`}
                    aria-valuenow={doc.completedStages}
                    aria-valuemin={0}
                    aria-valuemax={doc.totalStages}
                  />
                </div>
              </TableCell>
              <TableCell className="text-center">
                <StatusIndicator status={doc.status} />
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatDuration(doc.processingTimeMs, t)}
              </TableCell>
              <TableCell className="text-center">
                <ActionButton document={doc} onDocumentClick={onDocumentClick} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={6} className="text-center">
              <div className="flex items-center justify-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
                <span>{t('stage2.totalLabel')}: {documents.length} {t('stage2.documentsCount')}</span>
              </div>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

interface StatusIndicatorProps {
  status: DocumentMatrixRow['status'];
}

/**
 * Status indicator badge
 */
function StatusIndicator({ status }: StatusIndicatorProps) {
  const { t } = useTranslation();

  const variants: Record<
    DocumentMatrixRow['status'],
    { bg: string; text: string; label: string }
  > = {
    pending: {
      bg: 'bg-slate-100 dark:bg-slate-800',
      text: 'text-slate-500 dark:text-slate-400',
      label: t('stage2.statusPending'),
    },
    active: {
      bg: 'bg-indigo-100 dark:bg-indigo-900/40',
      text: 'text-indigo-600 dark:text-indigo-400',
      label: t('stage2.statusActive'),
    },
    completed: {
      bg: 'bg-emerald-100 dark:bg-emerald-900/40',
      text: 'text-emerald-600 dark:text-emerald-400',
      label: t('stage2.statusCompleted'),
    },
    error: {
      bg: 'bg-red-100 dark:bg-red-900/40',
      text: 'text-red-600 dark:text-red-400',
      label: t('stage2.statusError'),
    },
  };

  const variant = variants[status];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        variant.bg,
        variant.text
      )}
    >
      {status === 'active' && (
        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mr-1.5 animate-pulse" />
      )}
      {variant.label}
    </span>
  );
}

interface ActionButtonProps {
  document: DocumentMatrixRow;
  onDocumentClick: (documentId: string) => void;
}

/**
 * Action button for document row
 */
function ActionButton({ document, onDocumentClick }: ActionButtonProps) {
  const { t } = useTranslation();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDocumentClick(document.documentId);
  };

  if (document.status === 'error') {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        title={t('stage2.retryAction')}
        className="h-8 w-8"
        disabled // Disabled for MVP
      >
        <RotateCw className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      title={t('stage2.viewAction')}
      className="h-8 w-8"
    >
      <Eye className="h-4 w-4" />
    </Button>
  );
}

interface Stage2DashboardFooterProps {
  aggregates: Stage2DashboardData['aggregates'];
  failedCount: number;
  onRetryFailed?: () => void;
  className?: string;
}

/**
 * Dashboard footer with statistics and actions
 */
function Stage2DashboardFooter({
  aggregates,
  failedCount,
  onRetryFailed,
  className,
}: Stage2DashboardFooterProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 p-4',
        'border-t border-slate-200 dark:border-slate-700',
        'bg-slate-50 dark:bg-slate-900/50',
        className
      )}
    >
      {/* Statistics */}
      <div className="flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4" />
          <span>{aggregates.totalPages} {t('stage2.pagesLabel')}</span>
        </div>
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4" />
          <span>{aggregates.totalChunks} {t('stage2.chunksLabel')}</span>
        </div>
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4" />
          <span>{formatAvgTime(aggregates.avgProcessingTimeMs, t)}{t('stage2.perDoc')}</span>
        </div>
      </div>

      {/* Actions */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetryFailed}
          disabled={failedCount === 0 || !onRetryFailed}
          className={cn(
            'gap-2',
            failedCount > 0 &&
              'border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20'
          )}
        >
          <RotateCw className="h-4 w-4" />
          {t('stage2.retryErrors')}{failedCount > 0 && ` (${failedCount})`}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface Stage2DashboardProps {
  /** Dashboard data */
  data: Stage2DashboardData | null;
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Handler for retry failed documents */
  onRetryFailed?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Stage2Dashboard - Document Processing Overview Panel
 *
 * Displays all documents in Stage 2 processing with their status,
 * progress, and aggregated statistics. Supports clicking on documents
 * to view details.
 *
 * Features:
 * - Header with vital signs (total, completed, processing, failed)
 * - Overall progress bar
 * - Document matrix table with sorting by priority
 * - Footer with aggregated statistics
 * - Loading, error, and empty states
 *
 * Used when clicking on Stage2Group node in the generation graph.
 */
export function Stage2Dashboard({
  data,
  isLoading = false,
  error = null,
  onRetryFailed,
  className,
}: Stage2DashboardProps) {
  const { selectNode } = useNodeSelection();
  const { t } = useTranslation();

  // Convert documentId to React Flow node ID
  const toNodeId = (documentId: string) => `doc_${documentId}`;

  // Handle document click - select document node
  const handleDocumentClick = (documentId: string) => {
    selectNode(toNodeId(documentId));
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full py-12', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          {t('stage2.loadingDocuments')}
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full py-12', className)}>
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <div className="text-red-500 dark:text-red-400 text-center">
          <p className="font-medium">{t('stage2.loadingError')}</p>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  // No data state
  if (!data) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full py-12 text-center', className)}>
        <FileStack className="h-12 w-12 text-slate-400 mb-4" />
        <p className="text-slate-500 dark:text-slate-400 font-medium">
          {t('stage2.documentsNotFound')}
        </p>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-2 max-w-sm">
          {t('stage2.documentsNotFoundHint')}
        </p>
      </div>
    );
  }

  // Empty documents state
  if (data.documents.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full py-12 text-center', className)}>
        <FileStack className="h-12 w-12 text-slate-400 mb-4" />
        <p className="text-slate-500 dark:text-slate-400 font-medium">
          {t('stage2.noDocumentsToProcess')}
        </p>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-2 max-w-sm">
          {t('stage2.noDocumentsHint')}
        </p>
      </div>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={DashboardErrorFallback}>
      <div
        className={cn('flex flex-col h-full', className)}
        aria-live="polite"
        aria-atomic="false"
      >
        {/* Header with vital signs */}
        <ErrorBoundary fallback={<div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200"><p className="text-sm text-red-600">{t('stage2.headerLoadError')}</p></div>}>
          <Stage2DashboardHeader data={data} className="flex-shrink-0" />
        </ErrorBoundary>

        {/* Document matrix - scrollable */}
        <ErrorBoundary fallback={<div className="flex-1 flex items-center justify-center p-4"><p className="text-sm text-red-600">{t('stage2.tableLoadError')}</p></div>}>
          <div className="flex-1 overflow-y-auto min-h-0 p-4">
            <DocumentMatrix
              documents={data.documents}
              onDocumentClick={handleDocumentClick}
            />
          </div>
        </ErrorBoundary>

        {/* Footer with statistics and actions */}
        <ErrorBoundary fallback={<div className="p-4 bg-red-50 dark:bg-red-900/20 border-t border-red-200"><p className="text-sm text-red-600">{t('stage2.statsLoadError')}</p></div>}>
          <Stage2DashboardFooter
            aggregates={data.aggregates}
            failedCount={data.failedDocuments}
            onRetryFailed={onRetryFailed}
            className="flex-shrink-0"
          />
        </ErrorBoundary>
      </div>
    </ErrorBoundary>
  );
}

export default Stage2Dashboard;
