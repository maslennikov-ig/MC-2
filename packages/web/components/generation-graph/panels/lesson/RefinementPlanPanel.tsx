'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Target,
  AlertCircle,
  Timer,
  Coins,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  RefinementPlanDisplay,
  RefinementIterationDisplay,
  RefinementTaskDisplay,
  BestEffortDisplay,
  FixActionType,
} from '@megacampus/shared-types';
import {
  REFINEMENT_MODE_LABELS,
  FIX_ACTION_LABELS,
  AGREEMENT_LEVEL_LABELS,
} from '@megacampus/shared-types';
import { SectionLockIndicator } from '../../components/SectionLockIndicator';

/**
 * RefinementPlanPanel - Displays targeted refinement progress
 *
 * Shows:
 * - Refinement mode and status
 * - Agreement score and level
 * - Iteration progress and history
 * - Task details with section info
 * - Locked sections tracking
 * - Best effort result (if applicable)
 * - Token/time metrics
 *
 * Based on: RetryHistoryPanel pattern with accordion iterations
 * Design: Russian labels, collapsible layout, color-coded statuses
 */

// =============================================================================
// Props
// =============================================================================

interface RefinementPlanPanelProps {
  plan: RefinementPlanDisplay;
  bestEffortResult?: BestEffortDisplay | null;
  className?: string;
  defaultExpanded?: boolean;
}

// =============================================================================
// Utility Functions
// =============================================================================

function formatDuration(ms: number): string {
  if (ms >= 60000) {
    return `${(ms / 60000).toFixed(1)}м`;
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}с`;
  }
  return `${ms}мс`;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getStatusColor(status: RefinementPlanDisplay['status']) {
  switch (status) {
    case 'completed':
      return {
        bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        text: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800',
      };
    case 'active':
      return {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-600 dark:text-blue-400',
        border: 'border-blue-200 dark:border-blue-800',
      };
    case 'escalated':
      return {
        bg: 'bg-purple-100 dark:bg-purple-900/30',
        text: 'text-purple-600 dark:text-purple-400',
        border: 'border-purple-200 dark:border-purple-800',
      };
    case 'pending':
    default:
      return {
        bg: 'bg-slate-100 dark:bg-slate-800',
        text: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-200 dark:border-slate-700',
      };
  }
}

function getTaskStatusIcon(status: RefinementTaskDisplay['status']) {
  switch (status) {
    case 'completed':
      return CheckCircle2;
    case 'failed':
      return XCircle;
    case 'active':
      return Clock;
    case 'skipped':
      return AlertCircle;
    case 'pending':
    default:
      return Clock;
  }
}

function getTaskStatusColor(status: RefinementTaskDisplay['status']) {
  switch (status) {
    case 'completed':
      return {
        bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        text: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800',
      };
    case 'failed':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-600 dark:text-red-400',
        border: 'border-red-200 dark:border-red-800',
      };
    case 'active':
      return {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-600 dark:text-blue-400',
        border: 'border-blue-200 dark:border-blue-800',
      };
    case 'skipped':
      return {
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-200 dark:border-amber-800',
      };
    case 'pending':
    default:
      return {
        bg: 'bg-slate-100 dark:bg-slate-800',
        text: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-200 dark:border-slate-700',
      };
  }
}

function getFixActionBadge(fixAction: FixActionType) {
  const label = FIX_ACTION_LABELS[fixAction];
  const colors = {
    SURGICAL_EDIT: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-200 dark:border-blue-800',
    },
    REGENERATE_SECTION: {
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      text: 'text-orange-600 dark:text-orange-400',
      border: 'border-orange-200 dark:border-orange-800',
    },
    FULL_REGENERATE: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-600 dark:text-red-400',
      border: 'border-red-200 dark:border-red-800',
    },
  };
  return { label: label.ru, colors: colors[fixAction] };
}

function getAgreementLevelColor(level: 'high' | 'moderate' | 'low') {
  switch (level) {
    case 'high':
      return {
        bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        text: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800',
      };
    case 'moderate':
      return {
        bg: 'bg-yellow-100 dark:bg-yellow-900/30',
        text: 'text-yellow-600 dark:text-yellow-400',
        border: 'border-yellow-200 dark:border-yellow-800',
      };
    case 'low':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-600 dark:text-red-400',
        border: 'border-red-200 dark:border-red-800',
      };
  }
}

// =============================================================================
// Task Card Component
// =============================================================================

interface TaskCardProps {
  task: RefinementTaskDisplay;
}

function TaskCard({ task }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const colors = getTaskStatusColor(task.status);
  const StatusIcon = getTaskStatusIcon(task.status);
  const fixActionBadge = getFixActionBadge(task.fixAction);

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-lg border p-3 transition-all',
        colors.bg,
        colors.border
      )}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={cn('p-1 rounded-full', colors.bg)}>
            <StatusIcon className={cn('w-3.5 h-3.5', colors.text)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-slate-700 dark:text-slate-300 truncate">
                {task.sectionTitle}
              </span>
              {task.isLocked && task.lockReason && (
                <SectionLockIndicator
                  reason={task.lockReason}
                  sectionTitle={task.sectionTitle}
                  size="sm"
                />
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge
                className={cn(
                  'text-xs',
                  fixActionBadge.colors.bg,
                  fixActionBadge.colors.text,
                  fixActionBadge.colors.border
                )}
              >
                {fixActionBadge.label}
              </Badge>
              {task.issueCount > 0 && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {task.issueCount} {task.issueCount === 1 ? 'проблема' : 'проблем'}
                </span>
              )}
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0 ml-2" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 ml-2" />
        )}
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-700/50 space-y-3">
              {/* Issues */}
              {task.issueSummaries.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Проблемы:
                  </p>
                  <ul className="space-y-1">
                    {task.issueSummaries.map((issue, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-slate-600 dark:text-slate-400 pl-3 relative before:content-['•'] before:absolute before:left-0"
                      >
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Instructions Preview */}
              {task.instructionsPreview && (
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Инструкции:
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                    {task.instructionsPreview}
                  </p>
                </div>
              )}

              {/* Metrics */}
              <div className="flex flex-wrap gap-2 text-xs">
                {task.tokensUsed !== null && (
                  <Badge variant="outline" className="text-xs">
                    <Coins className="w-3 h-3 mr-1" />
                    {task.tokensUsed.toLocaleString()} токенов
                  </Badge>
                )}
                {task.durationMs !== null && (
                  <Badge variant="outline" className="text-xs">
                    <Timer className="w-3 h-3 mr-1" />
                    {formatDuration(task.durationMs)}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  Правок: {task.editCount}
                </Badge>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// Iteration Accordion Item
// =============================================================================

interface IterationItemProps {
  iteration: RefinementIterationDisplay;
  isCurrent: boolean;
}

function IterationItem({ iteration, isCurrent }: IterationItemProps) {
  const scoreDelta = iteration.improvement;
  const hasImprovement = scoreDelta !== null && scoreDelta > 0;

  return (
    <AccordionItem value={`iteration-${iteration.iterationNumber}`}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center justify-between w-full pr-4">
          {/* Left: Iteration Title */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              Итерация {iteration.iterationNumber}
            </span>
            {isCurrent && (
              <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                Текущая
              </Badge>
            )}
            {iteration.status === 'completed' && (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
            {iteration.status === 'active' && (
              <Clock className="w-4 h-4 text-blue-500 animate-pulse" />
            )}
          </div>

          {/* Right: Score with trend */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600 dark:text-slate-400">
              {iteration.startScore.toFixed(2)}
            </span>
            <span className="text-slate-400">→</span>
            {iteration.endScore !== null ? (
              <>
                <span
                  className={cn(
                    'font-bold',
                    iteration.endScore >= 0.75
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : iteration.endScore >= 0.5
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-red-600 dark:text-red-400'
                  )}
                >
                  {iteration.endScore.toFixed(2)}
                </span>
                {scoreDelta !== null && scoreDelta !== 0 && (
                  <span
                    className={cn(
                      'text-xs flex items-center',
                      hasImprovement
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {hasImprovement ? (
                      <>
                        <TrendingUp className="w-3 h-3 mr-0.5" />
                        +{scoreDelta.toFixed(2)}
                      </>
                    ) : (
                      <>
                        <TrendingDown className="w-3 h-3 mr-0.5" />
                        {scoreDelta.toFixed(2)}
                      </>
                    )}
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-400 text-xs">В процессе...</span>
            )}
          </div>
        </div>
      </AccordionTrigger>

      <AccordionContent>
        <div className="space-y-3 px-1">
          {/* Tasks */}
          <div className="space-y-2">
            {iteration.tasks.map((task) => (
              <TaskCard
                key={task.taskId}
                task={task}
              />
            ))}
          </div>

          {/* Locked Sections Summary */}
          {iteration.sectionsLocked.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">
                Заблокированные разделы после итерации:
              </p>
              <div className="flex flex-wrap gap-2">
                {iteration.sectionsLocked.map((sectionId) => {
                  const task = iteration.tasks.find((t) => t.sectionId === sectionId);
                  return (
                    <div
                      key={sectionId}
                      className="text-xs bg-white dark:bg-slate-800 px-2 py-1 rounded border border-amber-300 dark:border-amber-700"
                    >
                      {task?.sectionTitle || sectionId}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Iteration Metrics */}
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
            <span className="flex items-center gap-1">
              <Coins className="w-3 h-3" />
              {iteration.tokensUsed.toLocaleString()} токенов
            </span>
            {iteration.durationMs !== null && (
              <span className="flex items-center gap-1">
                <Timer className="w-3 h-3" />
                {formatDuration(iteration.durationMs)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" />
              {iteration.tasks.filter((t) => t.status === 'completed').length} /{' '}
              {iteration.tasks.length} задач
            </span>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// =============================================================================
// Best Effort Warning Component
// =============================================================================

interface BestEffortWarningProps {
  result: BestEffortDisplay;
}

function BestEffortWarning({ result }: BestEffortWarningProps) {
  if (!result.isActive) return null;

  const colors =
    result.qualityStatus === 'meets_threshold'
      ? {
          bg: 'bg-emerald-50 dark:bg-emerald-900/20',
          border: 'border-emerald-200 dark:border-emerald-800',
          text: 'text-emerald-700 dark:text-emerald-400',
        }
      : result.qualityStatus === 'acceptable'
      ? {
          bg: 'bg-yellow-50 dark:bg-yellow-900/20',
          border: 'border-yellow-200 dark:border-yellow-800',
          text: 'text-yellow-700 dark:text-yellow-400',
        }
      : {
          bg: 'bg-orange-50 dark:bg-orange-900/20',
          border: 'border-orange-200 dark:border-orange-800',
          text: 'text-orange-700 dark:text-orange-400',
        };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('p-3 rounded-lg border', colors.bg, colors.border)}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className={cn('w-4 h-4 mt-0.5 flex-shrink-0', colors.text)} />
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium', colors.text)}>{result.statusLabel}</p>
          {result.warningMessage && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {result.warningMessage}
            </p>
          )}
          {result.selectionReason && (
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1 italic">
              {result.selectionReason}
            </p>
          )}
          {result.requiresReview && (
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-2 font-medium">
              Рекомендуется ручная проверка
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function RefinementPlanPanel({
  plan,
  bestEffortResult,
  className,
  defaultExpanded = true,
}: RefinementPlanPanelProps) {
  const [collapsed, setCollapsed] = useState(!defaultExpanded);

  // Calculate progress
  const progressPercentage = Math.min(
    (plan.currentScore / plan.acceptThreshold) * 100,
    100
  );
  const scoreDelta = plan.currentScore - plan.initialScore;
  const hasImprovement = scoreDelta > 0;

  // Colors
  const statusColors = getStatusColor(plan.status);
  const agreementColors = getAgreementLevelColor(plan.agreementLevel);
  const modeLabel = REFINEMENT_MODE_LABELS[plan.mode];
  const agreementLabel = AGREEMENT_LEVEL_LABELS[plan.agreementLevel];

  // Token budget usage
  const tokenUsagePercent = (plan.totalTokensUsed / plan.tokenBudget) * 100;

  return (
    <Card className={cn('w-full', className)}>
      {/* Header */}
      <CardHeader
        className="pb-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
              <Sparkles className="w-4 h-4 text-slate-500" />
              <span>Целевая доработка</span>
              {/* Mode Badge */}
              <Badge
                variant="outline"
                className={cn(
                  'text-xs',
                  plan.mode === 'full-auto'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-purple-500 text-purple-600'
                )}
              >
                {modeLabel.ru}
              </Badge>
              {/* Status Badge */}
              <Badge
                className={cn(
                  'text-xs',
                  statusColors.bg,
                  statusColors.text,
                  statusColors.border
                )}
              >
                {plan.status === 'pending' && 'Ожидание'}
                {plan.status === 'active' && 'Выполняется'}
                {plan.status === 'completed' && 'Завершено'}
                {plan.status === 'escalated' && 'Эскалировано'}
              </Badge>
            </CardTitle>
            {/* Subtitle: Agreement + Iteration Progress */}
            <div className="flex items-center gap-3 mt-2 flex-wrap text-xs">
              {/* Agreement */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Согласие судей:</span>
                <Badge
                  className={cn(
                    'text-xs',
                    agreementColors.bg,
                    agreementColors.text,
                    agreementColors.border
                  )}
                >
                  {agreementLabel.ru}
                </Badge>
                <span className={cn('font-medium', agreementColors.text)}>
                  {plan.agreementScore.toFixed(2)}
                </span>
              </div>
              {/* Iteration Progress */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Итерация:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {plan.currentIteration} / {plan.maxIterations}
                </span>
              </div>
            </div>
          </div>
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
          )}
        </div>
      </CardHeader>

      {/* Expanded Content */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="space-y-4 pt-0">
              {/* Best Effort Warning */}
              {bestEffortResult && bestEffortResult.isActive && (
                <BestEffortWarning result={bestEffortResult} />
              )}

              {/* Score Summary */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">
                    Прогресс качества:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{plan.initialScore.toFixed(2)}</span>
                    <span className="text-slate-400">→</span>
                    <span
                      className={cn(
                        'font-bold',
                        plan.currentScore >= plan.acceptThreshold
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : plan.currentScore >= plan.goodEnoughThreshold
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {plan.currentScore.toFixed(2)}
                    </span>
                    {scoreDelta !== 0 && (
                      <span
                        className={cn(
                          'text-xs flex items-center',
                          hasImprovement
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {hasImprovement ? (
                          <>
                            <TrendingUp className="w-3 h-3 mr-0.5" />
                            +{scoreDelta.toFixed(2)}
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-3 h-3 mr-0.5" />
                            {scoreDelta.toFixed(2)}
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                {/* Progress Bar */}
                <div className="space-y-1">
                  <Progress value={progressPercentage} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Цель: {plan.acceptThreshold.toFixed(2)}</span>
                    <span>{progressPercentage.toFixed(0)}%</span>
                  </div>
                </div>
              </div>

              {/* Issues Summary */}
              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    {plan.acceptedIssueCount} принято
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-red-500" />
                    {plan.rejectedIssueCount} отклонено
                  </span>
                </div>
                <span>
                  {plan.lockedSections.length} / {plan.targetSections.length} секций
                  заблокировано
                </span>
              </div>

              {/* Iterations Accordion */}
              {plan.iterations.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Итерации доработки
                  </h4>
                  <Accordion
                    type="single"
                    collapsible
                    defaultValue={
                      plan.currentIteration > 0
                        ? `iteration-${plan.currentIteration}`
                        : undefined
                    }
                  >
                    {plan.iterations.map((iteration) => (
                      <IterationItem
                        key={iteration.iterationNumber}
                        iteration={iteration}
                        isCurrent={
                          iteration.iterationNumber === plan.currentIteration
                        }
                      />
                    ))}
                  </Accordion>
                </div>
              )}

              {/* Metrics Footer */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Использовано токенов:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {plan.totalTokensUsed.toLocaleString()} /{' '}
                      {plan.tokenBudget.toLocaleString()}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs',
                        tokenUsagePercent > 90
                          ? 'border-red-500 text-red-600'
                          : tokenUsagePercent > 70
                          ? 'border-yellow-500 text-yellow-600'
                          : 'border-emerald-500 text-emerald-600'
                      )}
                    >
                      {tokenUsagePercent.toFixed(0)}%
                    </Badge>
                  </div>
                </div>
                {plan.totalDurationMs !== null && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Общее время:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {formatDuration(plan.totalDurationMs)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Начало:</span>
                  <span className="text-slate-600 dark:text-slate-400">
                    {formatTimestamp(plan.startedAt)}
                  </span>
                </div>
                {plan.completedAt && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Завершено:</span>
                    <span className="text-slate-600 dark:text-slate-400">
                      {formatTimestamp(plan.completedAt)}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
