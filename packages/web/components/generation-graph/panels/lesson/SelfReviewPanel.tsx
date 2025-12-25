'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type {
  SelfReviewResult,
  SelfReviewIssue,
  SelfReviewStatus,
} from '@megacampus/shared-types/judge-types';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, XCircle, Info, Shield } from 'lucide-react';

interface SelfReviewPanelProps {
  result: SelfReviewResult;
  className?: string;
}

/**
 * Status configuration for SelfReview statuses
 * Maps status to color, icon, and Russian label
 */
const STATUS_CONFIG: Record<
  SelfReviewStatus,
  { color: string; icon: React.ReactNode; label: string }
> = {
  PASS: {
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    icon: <CheckCircle className="h-4 w-4" />,
    label: 'Проверка пройдена',
  },
  PASS_WITH_FLAGS: {
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: <Info className="h-4 w-4" />,
    label: 'Пройдена с замечаниями',
  },
  FIXED: {
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    icon: <CheckCircle className="h-4 w-4" />,
    label: 'Исправлено автоматически',
  },
  REGENERATE: {
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: <XCircle className="h-4 w-4" />,
    label: 'Требуется перегенерация',
  },
  FLAG_TO_JUDGE: {
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    icon: <AlertTriangle className="h-4 w-4" />,
    label: 'Передано судьям',
  },
};

/**
 * Severity color classes for issues
 */
const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  FIXABLE: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  COMPLEX: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
  INFO: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
};

/**
 * IssueItem - Displays a single self-review issue
 */
function IssueItem({ issue }: { issue: SelfReviewIssue }) {
  const severityColor = SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.INFO;

  return (
    <div className={cn('text-xs p-2 rounded border', severityColor)}>
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {issue.type}
        </Badge>
        <span className="text-slate-500 dark:text-slate-400 text-[10px]">
          {issue.location}
        </span>
      </div>
      <p className="leading-relaxed">{issue.description}</p>
    </div>
  );
}

/**
 * SelfReviewPanel - Displays self-review validation results
 *
 * Shows the pre-judge validation status including:
 * - Overall status with icon and label
 * - Reasoning text explaining the decision
 * - List of issues found (if any)
 * - Performance metrics (duration, tokens, heuristics)
 *
 * Part of the Fail-Fast architecture to reduce Judge token costs
 * by filtering obviously broken content before expensive evaluation.
 */
export function SelfReviewPanel({ result, className }: SelfReviewPanelProps) {
  // Guard against invalid status
  const config = STATUS_CONFIG[result.status];
  if (!config) {
    console.error('Invalid self-review status:', result.status);
    return (
      <div className={cn(
        'rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-4',
        className
      )}>
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-medium">
            Неизвестный статус самопроверки: {result.status}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Результат самопроверки"
      className={cn(
        'rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4',
        className
      )}
    >
      {/* Header with status */}
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Самопроверка
        </h3>
        <Badge className={cn('ml-auto flex items-center gap-1', config.color)}>
          <span aria-hidden="true">{config.icon}</span>
          <span>{config.label}</span>
        </Badge>
      </div>

      {/* Reasoning */}
      {result.reasoning && (
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
          {result.reasoning}
        </p>
      )}

      {/* Issues list (if any) */}
      {result.issues && result.issues.length > 0 && (
        <div className="space-y-2 mb-3">
          <h4
            className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide"
            aria-label={`Найдено ${result.issues.length} проблем`}
          >
            Найденные проблемы ({result.issues.length})
          </h4>
          <div className="space-y-2">
            {result.issues.map((issue, i) => (
              <IssueItem key={`issue-${i}`} issue={issue} />
            ))}
          </div>
        </div>
      )}

      {/* Heuristic details (if available) */}
      {result.heuristicDetails && (
        <div className="mb-3 p-2 rounded bg-slate-50 dark:bg-slate-800 text-xs">
          <div className="grid grid-cols-2 gap-2">
            {result.heuristicDetails.languageCheck && (
              <div className="flex items-center gap-1">
                {result.heuristicDetails.languageCheck.passed ? (
                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
                <span className="text-slate-600 dark:text-slate-400">Язык</span>
                {!result.heuristicDetails.languageCheck.passed && (
                  <span className="text-red-500 text-[10px]">
                    ({result.heuristicDetails.languageCheck.scriptsFound?.join(', ')})
                  </span>
                )}
              </div>
            )}
            {result.heuristicDetails.truncationCheck && (
              <div className="flex items-center gap-1">
                {result.heuristicDetails.truncationCheck.passed ? (
                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
                <span className="text-slate-600 dark:text-slate-400">Целостность</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Metrics footer */}
      <div className="flex items-center gap-4 pt-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
        {result.durationMs > 0 && <span>{result.durationMs}ms</span>}
        {result.tokensUsed > 0 && <span>{result.tokensUsed} tokens</span>}
        {result.heuristicsPassed !== undefined && (
          <span
            className={cn(
              result.heuristicsPassed
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            )}
          >
            {result.heuristicsPassed ? 'Эвристики OK' : 'Эвристики failed'}
          </span>
        )}
      </div>
    </div>
  );
}

export default SelfReviewPanel;
