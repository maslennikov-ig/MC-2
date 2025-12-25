'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Loader2,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import type {
  ProgressSummary,
  NodeAttemptSummary,
  SummaryItem,
} from '@megacampus/shared-types/judge-types';

// =============================================================================
// Localization Labels
// =============================================================================

const LABELS = {
  ru: {
    selfReviewer: 'Самопроверка',
    judge: 'Оценка',
    current: 'Текущая',
    issuesFound: 'Обнаруженные проблемы:',
    actionsPerformed: 'Выполненные действия:',
    noAttempts: 'Попыток пока не было',
    status: {
      generating: 'Генерация',
      reviewing: 'Проверка',
      fixing: 'Исправление',
      completed: 'Завершено',
      failed: 'Ошибка',
    },
    result: {
      PASS: 'Пройдено',
      PASS_WITH_FLAGS: 'Пройдено с замечаниями',
      FIXED: 'Исправлено',
      REGENERATE: 'Требует перегенерации',
      FLAG_TO_JUDGE: 'Передано судье',
      ACCEPT: 'Принято',
      ACCEPT_WITH_MINOR_REVISION: 'Принято с правками',
      ITERATIVE_REFINEMENT: 'Итеративное улучшение',
      ESCALATE_TO_HUMAN: 'Требует проверки',
    },
  },
  en: {
    selfReviewer: 'Self-Review',
    judge: 'Evaluation',
    current: 'Current',
    issuesFound: 'Issues found:',
    actionsPerformed: 'Actions performed:',
    noAttempts: 'No attempts yet',
    status: {
      generating: 'Generating',
      reviewing: 'Reviewing',
      fixing: 'Fixing',
      completed: 'Completed',
      failed: 'Failed',
    },
    result: {
      PASS: 'Passed',
      PASS_WITH_FLAGS: 'Passed with flags',
      FIXED: 'Fixed',
      REGENERATE: 'Needs regeneration',
      FLAG_TO_JUDGE: 'Flagged to judge',
      ACCEPT: 'Accepted',
      ACCEPT_WITH_MINOR_REVISION: 'Accepted with revisions',
      ITERATIVE_REFINEMENT: 'Iterative refinement',
      ESCALATE_TO_HUMAN: 'Needs human review',
    },
  },
} as const;

type LabelLang = keyof typeof LABELS;
type LabelsType = typeof LABELS[LabelLang];

function getLabels(language: string): LabelsType {
  return (LABELS[language as LabelLang] || LABELS.en) as LabelsType;
}

// =============================================================================
// Props & Types
// =============================================================================

export interface ProgressSummaryDisplayProps {
  /** Progress summary from node output */
  progressSummary: ProgressSummary | null | undefined;
  /** Whether to show compact view (less detail) */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export interface AttemptSummaryCardProps {
  /** Single attempt summary */
  attempt: NodeAttemptSummary;
  /** Whether this is the latest/current attempt */
  isLatest?: boolean;
  /** Language for localized labels */
  language?: string;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get icon for status
 */
function getStatusIcon(status: string): React.ReactNode {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'fixing':
      return (
        <div className="animate-spin">
          <Loader2 className="w-4 h-4 text-amber-500" />
        </div>
      );
    case 'reviewing':
      return (
        <div className="animate-pulse">
          <AlertCircle className="w-4 h-4 text-blue-500" />
        </div>
      );
    case 'generating':
    default:
      return (
        <div className="animate-spin">
          <Loader2 className="w-4 h-4 text-blue-500" />
        </div>
      );
  }
}

/**
 * Get icon for severity
 */
function getSeverityIcon(severity: string): React.ReactNode {
  switch (severity) {
    case 'error':
      return <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" />;
    case 'warning':
      return <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />;
    case 'info':
    default:
      return <Info className="w-3 h-3 text-blue-500 flex-shrink-0" />;
  }
}

/**
 * Get status badge variant
 */
function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'failed':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'fixing':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'reviewing':
    case 'generating':
    default:
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  }
}

/**
 * Get localized status label
 */
function getStatusLabel(status: string, language: string): string {
  const labels = getLabels(language);
  return labels.status[status as keyof typeof labels.status] || status;
}

/**
 * Get localized result label
 */
function getResultLabel(label: string | undefined, language: string): string {
  if (!label) return '';
  const labels = getLabels(language);
  return labels.result[label as keyof typeof labels.result] || label;
}

// =============================================================================
// Summary Item Component
// =============================================================================

function SummaryItemRow({ item }: { item: SummaryItem }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      {getSeverityIcon(item.severity)}
      <span className="text-slate-700 dark:text-slate-300">{item.text}</span>
    </div>
  );
}

// =============================================================================
// Attempt Summary Card Component
// =============================================================================

export function AttemptSummaryCard({
  attempt,
  isLatest = false,
  language = 'en',
  className,
}: AttemptSummaryCardProps) {
  const labels = getLabels(language);
  const hasIssues = attempt.issuesFound && attempt.issuesFound.length > 0;
  const hasActions = attempt.actionsPerformed && attempt.actionsPerformed.length > 0;
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        isLatest
          ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20'
          : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {getStatusIcon(attempt.status)}
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {attempt.node === 'selfReviewer' ? labels.selfReviewer : labels.judge}
          </span>
          {attempt.resultLabel && (
            <Badge
              variant="outline"
              className={cn('text-xs', getStatusBadgeClass(attempt.status))}
            >
              {getResultLabel(attempt.resultLabel, language)}
            </Badge>
          )}
        </div>
        {isLatest && (
          <Badge variant="outline" className="text-xs border-blue-400 text-blue-600 dark:text-blue-400">
            {labels.current}
          </Badge>
        )}
      </div>

      {/* Issues Found */}
      {hasIssues && (
        <div className="mt-2">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            {labels.issuesFound}
          </div>
          <div className="space-y-1 pl-2 border-l-2 border-amber-200 dark:border-amber-800">
            {attempt.issuesFound.map((item, idx) => (
              <SummaryItemRow key={idx} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Actions Performed */}
      {hasActions && (
        <div className="mt-2">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            {labels.actionsPerformed}
          </div>
          <div className="space-y-1 pl-2 border-l-2 border-emerald-200 dark:border-emerald-800">
            {attempt.actionsPerformed.map((item, idx) => (
              <SummaryItemRow key={idx} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Outcome */}
      {attempt.outcome && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <ArrowRight className="w-3 h-3 text-slate-400" />
          <span className="text-slate-600 dark:text-slate-400">{attempt.outcome}</span>
        </div>
      )}

      {/* Metrics */}
      {(attempt.durationMs !== undefined || attempt.tokensUsed !== undefined) && (
        <div className="mt-2 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {attempt.durationMs !== undefined && (
            <span className="font-mono">{(attempt.durationMs / 1000).toFixed(1)}s</span>
          )}
          {attempt.tokensUsed !== undefined && attempt.tokensUsed > 0 && (
            <span className="font-mono">{attempt.tokensUsed.toLocaleString(locale)} tok</span>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Progress Summary Display Component
// =============================================================================

/**
 * ProgressSummaryDisplay Component
 *
 * Displays localized progress information from selfReviewer and judge nodes.
 * Shows issues found, actions performed, and outcomes in a user-friendly format.
 *
 * Features:
 * - Localized messages (Russian/English)
 * - Severity-based icons (info/warning/error)
 * - Status badges
 * - Attempt cards (if multiple attempts)
 * - Metrics display (duration, tokens)
 */
export function ProgressSummaryDisplay({
  progressSummary,
  compact = false,
  className,
}: ProgressSummaryDisplayProps) {
  if (!progressSummary) {
    return null;
  }

  const { status, currentPhase, attempts, outcome, language = 'en' } = progressSummary;
  const labels = getLabels(language);

  // Compact view: just show status and outcome
  if (compact) {
    return (
      <div className={cn('flex items-center gap-2 text-xs', className)}>
        {getStatusIcon(status)}
        <span className="text-slate-600 dark:text-slate-400">
          {currentPhase}
          {outcome && ` - ${outcome}`}
        </span>
      </div>
    );
  }

  // Full view: show attempts with details
  return (
    <div className={cn('space-y-3', className)}>
      {/* Current Status Header */}
      <div className="flex items-center gap-2">
        {getStatusIcon(status)}
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {currentPhase}
        </span>
        <Badge variant="outline" className={cn('text-xs', getStatusBadgeClass(status))}>
          {getStatusLabel(status, language)}
        </Badge>
      </div>

      {/* Attempt Cards */}
      {attempts && attempts.length > 0 && (
        <div className="space-y-2">
          {attempts.map((attempt, idx) => (
            <AttemptSummaryCard
              key={`${attempt.node}-${attempt.attempt}-${idx}`}
              attempt={attempt}
              isLatest={idx === attempts.length - 1}
              language={language}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {(!attempts || attempts.length === 0) && !outcome && (
        <div className="text-xs text-slate-500 dark:text-slate-400 italic">
          {labels.noAttempts}
        </div>
      )}

      {/* Final Outcome (if different from last attempt) */}
      {outcome && (!attempts || attempts.length === 0) && (
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <ArrowRight className="w-4 h-4" />
          <span>{outcome}</span>
        </div>
      )}
    </div>
  );
}

// Default export
export default ProgressSummaryDisplay;
