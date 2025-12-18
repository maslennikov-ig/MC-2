'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, X, AlertTriangle, FileText, BookOpen, Dumbbell, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HeuristicsResult } from '@megacampus/shared-types';
import { HEURISTIC_THRESHOLDS } from '@megacampus/shared-types';

/**
 * HeuristicResultsCard - Visualizes heuristic pre-filter results
 *
 * Shows pass/fail status for each heuristic check:
 * - Word count (min 500)
 * - Flesch-Kincaid readability (target 8-12)
 * - Examples count (min 1)
 * - Exercises count (min 1)
 *
 * Features:
 * - Overall pass/fail status
 * - Individual metric cards with thresholds
 * - Failure reasons list
 * - Color-coded severity indicators
 */

interface HeuristicResultsCardProps {
  result: HeuristicsResult;
  className?: string;
  /** Thresholds for validation (defaults provided) */
  thresholds?: {
    minWordCount?: number;
    targetFleschKincaidMin?: number;
    targetFleschKincaidMax?: number;
    minExamples?: number;
    minExercises?: number;
  };
}

const DEFAULT_THRESHOLDS = HEURISTIC_THRESHOLDS;

interface MetricItemProps {
  label: string;
  value: number | string | undefined;
  passed: boolean;
  threshold: string;
  icon: React.ElementType;
}

function MetricItem({ label, value, passed, threshold, icon: Icon }: MetricItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border transition-colors',
        passed
          ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
          : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
      )}
    >
      <div
        className={cn(
          'p-2 rounded-full',
          passed
            ? 'bg-emerald-100 dark:bg-emerald-900/30'
            : 'bg-red-100 dark:bg-red-900/30'
        )}
      >
        <Icon
          className={cn(
            'w-4 h-4',
            passed
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
            {label}
          </span>
          <span
            className={cn(
              'text-sm font-bold',
              passed
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            )}
          >
            {value ?? 'N/A'}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {threshold}
          </span>
          {passed ? (
            <Check className="w-3 h-3 text-emerald-500" />
          ) : (
            <X className="w-3 h-3 text-red-500" />
          )}
        </div>
      </div>
    </div>
  );
}

export function HeuristicResultsCard({
  result,
  className,
  thresholds: customThresholds,
}: HeuristicResultsCardProps) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };

  // Calculate individual pass/fail status
  const wordCountPassed = (result.wordCount ?? 0) >= thresholds.minWordCount;

  // Flesch-Kincaid: if skipped (non-English), treat as passed
  const fleschKincaidSkipped = result.fleschKincaidSkipped ?? false;
  const fleschPassed = fleschKincaidSkipped || (
    result.fleschKincaid !== undefined &&
    result.fleschKincaid >= thresholds.targetFleschKincaidMin &&
    result.fleschKincaid <= thresholds.targetFleschKincaidMax
  );
  const examplesPassed = (result.examplesCount ?? 0) >= thresholds.minExamples;
  const exercisesPassed = (result.exercisesCount ?? 0) >= thresholds.minExercises;

  // Count total checks (exclude Flesch-Kincaid from count if skipped)
  const checksToCount = fleschKincaidSkipped
    ? [wordCountPassed, examplesPassed, exercisesPassed]
    : [wordCountPassed, fleschPassed, examplesPassed, exercisesPassed];
  const passedCount = checksToCount.filter(Boolean).length;
  const totalChecks = checksToCount.length;

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            Результаты эвристик
          </CardTitle>
          <Badge
            className={cn(
              'text-xs font-medium',
              result.passed
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            )}
          >
            {result.passed ? 'Пройдено' : 'Не пройдено'}
          </Badge>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {passedCount} из {totalChecks} проверок пройдено
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MetricItem
            label="Количество слов"
            value={result.wordCount}
            passed={wordCountPassed}
            threshold={`мин. ${thresholds.minWordCount}`}
            icon={FileText}
          />
          {fleschKincaidSkipped ? (
            <div
              className="flex items-center gap-3 p-3 rounded-lg border bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
            >
              <div className="p-2 rounded-full bg-slate-100 dark:bg-slate-800">
                <BookOpen className="w-4 h-4 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">
                    Flesch-Kincaid
                  </span>
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Пропущено
                  </span>
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Не применимо для данного языка
                </div>
              </div>
            </div>
          ) : (
            <MetricItem
              label="Flesch-Kincaid"
              value={result.fleschKincaid?.toFixed(1)}
              passed={fleschPassed}
              threshold={`${thresholds.targetFleschKincaidMin}-${thresholds.targetFleschKincaidMax}`}
              icon={BookOpen}
            />
          )}
          <MetricItem
            label="Примеры"
            value={result.examplesCount}
            passed={examplesPassed}
            threshold={`мин. ${thresholds.minExamples}`}
            icon={BookOpen}
          />
          <MetricItem
            label="Упражнения"
            value={result.exercisesCount}
            passed={exercisesPassed}
            threshold={`мин. ${thresholds.minExercises}`}
            icon={Dumbbell}
          />
        </div>

        {/* Failure Reasons */}
        {result.failureReasons && result.failureReasons.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200 mb-2">
                  Причины отклонения:
                </p>
                <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-1 list-disc list-inside">
                  {result.failureReasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
