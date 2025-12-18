'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Check,
  X,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * RetryHistoryPanel - Shows retry attempts for a pipeline node
 *
 * Displays:
 * - Current attempt number (e.g., "Attempt 2 of 2")
 * - History of previous attempts with outcomes
 * - Score progression across attempts
 * - Failure reasons for each attempt
 *
 * Features:
 * - Collapsible history list
 * - Color-coded outcomes
 * - Score trend indicator
 */

interface RetryAttempt {
  /** Attempt number (1-based) */
  attemptNumber: number;
  /** When this attempt was made */
  timestamp?: string | Date;
  /** Outcome of the attempt */
  outcome: 'success' | 'failure' | 'pending';
  /** Quality score (0-1) */
  score?: number;
  /** Cascade stage reached */
  cascadeStage?: 'heuristic' | 'single_judge' | 'clev_voting';
  /** Reason for failure or success */
  reason?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Model used */
  modelUsed?: string;
}

interface RetryHistoryPanelProps {
  /** Current attempt number */
  currentAttempt: number;
  /** Maximum allowed attempts */
  maxAttempts: number;
  /** History of all attempts */
  attempts: RetryAttempt[];
  className?: string;
  /** Start collapsed */
  defaultCollapsed?: boolean;
}

function formatDuration(ms: number): string {
  if (ms >= 60000) {
    return `${(ms / 60000).toFixed(1)}м`;
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}с`;
  }
  return `${ms}мс`;
}

function formatTimestamp(timestamp: string | Date): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getOutcomeIcon(outcome: RetryAttempt['outcome']) {
  switch (outcome) {
    case 'success':
      return Check;
    case 'failure':
      return X;
    case 'pending':
      return RefreshCw;
  }
}

function getOutcomeColor(outcome: RetryAttempt['outcome']) {
  switch (outcome) {
    case 'success':
      return {
        bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        text: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800',
      };
    case 'failure':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-600 dark:text-red-400',
        border: 'border-red-200 dark:border-red-800',
      };
    case 'pending':
      return {
        bg: 'bg-yellow-100 dark:bg-yellow-900/30',
        text: 'text-yellow-600 dark:text-yellow-400',
        border: 'border-yellow-200 dark:border-yellow-800',
      };
  }
}

function getCascadeStageLabel(stage: RetryAttempt['cascadeStage']): string {
  switch (stage) {
    case 'heuristic':
      return 'Эвристика';
    case 'single_judge':
      return 'Один судья';
    case 'clev_voting':
      return 'CLEV';
    default:
      return 'N/A';
  }
}

interface AttemptCardProps {
  attempt: RetryAttempt;
  isLatest: boolean;
  previousScore?: number;
}

function AttemptCard({ attempt, isLatest, previousScore }: AttemptCardProps) {
  const [expanded, setExpanded] = useState(isLatest);
  const colors = getOutcomeColor(attempt.outcome);
  const OutcomeIcon = getOutcomeIcon(attempt.outcome);

  const scoreDiff = previousScore !== undefined && attempt.score !== undefined
    ? attempt.score - previousScore
    : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'rounded-lg border p-3 transition-all',
        colors.bg,
        colors.border,
        isLatest && 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900'
      )}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <div className={cn('p-1.5 rounded-full', colors.bg)}>
            <OutcomeIcon className={cn('w-4 h-4', colors.text)} />
          </div>
          <span className="font-medium text-sm text-slate-700 dark:text-slate-300">
            Попытка {attempt.attemptNumber}
          </span>
          {isLatest && (
            <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              Текущая
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Score with trend */}
          {attempt.score !== undefined && (
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  'text-sm font-bold',
                  attempt.score >= 0.75
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : attempt.score >= 0.5
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {attempt.score.toFixed(2)}
              </span>
              {scoreDiff !== undefined && scoreDiff !== 0 && (
                <span
                  className={cn(
                    'text-xs flex items-center',
                    scoreDiff > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  )}
                >
                  {scoreDiff > 0 ? (
                    <>
                      <TrendingUp className="w-3 h-3 mr-0.5" />
                      +{scoreDiff.toFixed(2)}
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-3 h-3 mr-0.5" />
                      {scoreDiff.toFixed(2)}
                    </>
                  )}
                </span>
              )}
            </div>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-700/50 space-y-2">
              {/* Meta info row */}
              <div className="flex flex-wrap gap-2 text-xs">
                {attempt.timestamp && (
                  <Badge variant="outline" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    {formatTimestamp(attempt.timestamp)}
                  </Badge>
                )}
                {attempt.durationMs !== undefined && (
                  <Badge variant="outline" className="text-xs">
                    {formatDuration(attempt.durationMs)}
                  </Badge>
                )}
                {attempt.cascadeStage && (
                  <Badge variant="outline" className="text-xs">
                    {getCascadeStageLabel(attempt.cascadeStage)}
                  </Badge>
                )}
                {attempt.modelUsed && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {attempt.modelUsed}
                  </Badge>
                )}
              </div>

              {/* Reason */}
              {attempt.reason && (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {attempt.reason}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function RetryHistoryPanel({
  currentAttempt,
  maxAttempts,
  attempts,
  className,
  defaultCollapsed = false,
}: RetryHistoryPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // Sort attempts by attempt number descending (latest first)
  const sortedAttempts = [...attempts].sort((a, b) => b.attemptNumber - a.attemptNumber);

  // Calculate overall progress
  const successCount = attempts.filter((a) => a.outcome === 'success').length;
  const failureCount = attempts.filter((a) => a.outcome === 'failure').length;

  // Get score trend
  const scores = attempts
    .filter((a) => a.score !== undefined)
    .sort((a, b) => a.attemptNumber - b.attemptNumber)
    .map((a) => a.score!);

  const scoreImproving = scores.length >= 2 && scores[scores.length - 1] > scores[0];

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader
        className="pb-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-slate-500" />
            История попыток
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                currentAttempt >= maxAttempts
                  ? 'border-red-500 text-red-600'
                  : 'border-blue-500 text-blue-600'
              )}
            >
              {currentAttempt} / {maxAttempts}
            </Badge>
            {collapsed ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </div>
      </CardHeader>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="space-y-4 pt-0">
              {/* Summary Row */}
              <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-500" />
                    {successCount} успешно
                  </span>
                  <span className="flex items-center gap-1">
                    <X className="w-3 h-3 text-red-500" />
                    {failureCount} неудачно
                  </span>
                </div>
                {scores.length >= 2 && (
                  <span
                    className={cn(
                      'flex items-center gap-1',
                      scoreImproving ? 'text-emerald-600' : 'text-red-600'
                    )}
                  >
                    {scoreImproving ? (
                      <>
                        <TrendingUp className="w-3 h-3" />
                        Улучшение
                      </>
                    ) : (
                      <>
                        <TrendingDown className="w-3 h-3" />
                        Ухудшение
                      </>
                    )}
                  </span>
                )}
              </div>

              {/* Attempts List */}
              <div className="space-y-2">
                {sortedAttempts.map((attempt, idx) => {
                  const previousAttempt = sortedAttempts[idx + 1];
                  return (
                    <AttemptCard
                      key={attempt.attemptNumber}
                      attempt={attempt}
                      isLatest={idx === 0}
                      previousScore={previousAttempt?.score}
                    />
                  );
                })}
              </div>

              {/* No attempts message */}
              {attempts.length === 0 && (
                <div className="text-center py-4 text-sm text-slate-500">
                  Нет истории попыток
                </div>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
