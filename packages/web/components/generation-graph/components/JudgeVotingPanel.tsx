'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  JudgeVerdictDisplay,
  IndividualJudgeVote,
  JudgeVerdictType,
  JUDGE_VERDICT_LABELS,
  CONSENSUS_METHOD_LABELS,
  RefinementTaskDisplay,
  FIX_ACTION_LABELS,
} from '@megacampus/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, AlertTriangle, X, ChevronDown, ChevronUp, TrendingUp, Loader2, Circle, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * JudgeVotingPanel - Visualizes CLEV voting with individual judge decisions
 *
 * Shows how multiple AI judges evaluated lesson quality, their individual votes,
 * and the consensus result.
 *
 * Features:
 * - Header with final quality score (color-coded)
 * - Individual judge cards (2-3 judges)
 * - Tie-breaker indicator (if 3rd judge invoked)
 * - Consensus footer with method and final verdict
 * - Optional criteria breakdown expansion
 */

interface JudgeVotingPanelProps {
  result: JudgeVerdictDisplay;
  /** Optional refinement tasks to show */
  refinementTasks?: RefinementTaskDisplay[];
  className?: string;
  expanded?: boolean;
  onExpand?: () => void;
}

/**
 * Get verdict icon based on verdict type
 */
function getVerdictIcon(verdict: JudgeVerdictType) {
  switch (verdict) {
    case 'ACCEPT':
      return Check;
    case 'ACCEPT_WITH_MINOR_REVISION':
    case 'ITERATIVE_REFINEMENT':
      return AlertTriangle;
    case 'REGENERATE':
    case 'ESCALATE_TO_HUMAN':
      return X;
    default:
      return AlertTriangle;
  }
}

/**
 * Get score color class based on score value
 */
function getScoreColor(score: number): string {
  if (score >= 0.9) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.75) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

/**
 * Get verdict badge color class
 *
 * Handles unknown verdicts gracefully (e.g., ACCEPT_WITH_MINOR_REVISION from LLM)
 */
function getVerdictBadgeColor(verdict: JudgeVerdictType): string {
  const labelConfig = JUDGE_VERDICT_LABELS[verdict];

  // Fallback for unknown verdicts (LLM may return non-standard values like ACCEPT_WITH_MINOR_REVISION)
  if (!labelConfig) {
    // Map known LLM variations to appropriate colors
    const verdictStr = String(verdict).toUpperCase();
    if (verdictStr.includes('ACCEPT')) {
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    }
    if (verdictStr.includes('FIX') || verdictStr.includes('REVISION')) {
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    }
    if (verdictStr.includes('REGENERATE')) {
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    }
    return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
  }

  const color = labelConfig.color;

  switch (color) {
    case 'emerald':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'yellow':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'orange':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    case 'red':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'purple':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
  }
}

/**
 * Get task status indicator icon
 */
function getTaskStatusIndicator(status: RefinementTaskDisplay['status']) {
  switch (status) {
    case 'completed':
      return <Check className="w-4 h-4 text-emerald-500" />;
    case 'failed':
      return <X className="w-4 h-4 text-red-500" />;
    case 'active':
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case 'skipped':
      return <MinusCircle className="w-4 h-4 text-slate-400" />;
    default: // 'pending'
      return <Circle className="w-4 h-4 text-slate-300" />;
  }
}

/**
 * Get plural suffix for issue count
 */
function getIssuePlural(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11) return 'а';
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return 'ы';
  return '';
}

/**
 * Individual Judge Card Component
 */
interface JudgeCardProps {
  vote: IndividualJudgeVote;
  isTieBreaker?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}

function JudgeCard({ vote, isTieBreaker = false, expanded = false, onToggle }: JudgeCardProps) {
  const VerdictIcon = getVerdictIcon(vote.verdict);
  const scoreColor = getScoreColor(vote.score);
  const verdictLabel = JUDGE_VERDICT_LABELS[vote.verdict]?.ru ?? String(vote.verdict).replace(/_/g, ' ');
  const verdictBadgeColor = getVerdictBadgeColor(vote.verdict);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'relative rounded-lg border p-4 transition-all',
        isTieBreaker
          ? 'bg-purple-50 dark:bg-purple-900/10 border-purple-300 dark:border-purple-700 shadow-lg'
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
      )}
    >
      {/* Tie-breaker badge */}
      {isTieBreaker && (
        <div className="absolute -top-2 -right-2">
          <Badge className="bg-purple-600 text-white text-xs px-2 py-0.5 shadow-md">
            Решающий
          </Badge>
        </div>
      )}

      {/* Model name */}
      <div className="text-center mb-3">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-0.5">
          {vote.modelDisplayName}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {vote.modelId}
        </p>
      </div>

      {/* Score */}
      <div className="flex items-center justify-center mb-3">
        <div className={cn('text-3xl font-bold', scoreColor)}>
          {vote.score.toFixed(2)}
        </div>
      </div>

      {/* Verdict icon */}
      <div className="flex justify-center mb-2">
        <div
          className={cn(
            'p-2 rounded-full',
            vote.verdict === 'ACCEPT'
              ? 'bg-emerald-100 dark:bg-emerald-900/30'
              : vote.verdict === 'REGENERATE' || vote.verdict === 'ESCALATE_TO_HUMAN'
              ? 'bg-red-100 dark:bg-red-900/30'
              : 'bg-yellow-100 dark:bg-yellow-900/30'
          )}
        >
          <VerdictIcon
            className={cn(
              'w-5 h-5',
              vote.verdict === 'ACCEPT'
                ? 'text-emerald-600 dark:text-emerald-400'
                : vote.verdict === 'REGENERATE' || vote.verdict === 'ESCALATE_TO_HUMAN'
                ? 'text-red-600 dark:text-red-400'
                : 'text-yellow-600 dark:text-yellow-400'
            )}
          />
        </div>
      </div>

      {/* Verdict label */}
      <div className="text-center mb-3">
        <Badge className={cn('text-xs font-medium', verdictBadgeColor)}>
          {verdictLabel.toUpperCase()}
        </Badge>
      </div>

      {/* Criteria breakdown toggle */}
      {onToggle && (
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          <span>Критерии</span>
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      )}

      {/* Criteria breakdown (expanded) */}
      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2"
        >
          {Object.entries(vote.criteria).map(([key, value]) => {
            if (typeof value !== 'number') return null;
            return (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400 capitalize">
                  {key === 'coherence'
                    ? 'Согласованность'
                    : key === 'accuracy'
                    ? 'Точность'
                    : key === 'completeness'
                    ? 'Полнота'
                    : key === 'readability'
                    ? 'Читаемость'
                    : key}
                </span>
                <span className={cn('font-medium', getScoreColor(value))}>
                  {value.toFixed(2)}
                </span>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* Reasoning (if available and expanded) */}
      {expanded && vote.reasoning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700"
        >
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">
            {vote.reasoning}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

/**
 * Main JudgeVotingPanel Component
 */
export function JudgeVotingPanel({
  result,
  refinementTasks,
  className,
  expanded: globalExpanded = false,
  onExpand,
}: JudgeVotingPanelProps) {
  const [expandedJudgeIds, setExpandedJudgeIds] = useState<Set<string>>(new Set());

  const { votingResult, heuristicsPassed } = result;
  const { votes, consensusMethod, finalVerdict, finalScore, tieBreakerId } = votingResult;

  const finalScoreColor = getScoreColor(finalScore);
  // Guard against undefined finalVerdict (can happen during cascade evaluation when single judge was used)
  const finalVerdictLabel = finalVerdict ? JUDGE_VERDICT_LABELS[finalVerdict]?.ru ?? 'Неизвестно' : 'Неизвестно';
  const finalVerdictBadgeColor = finalVerdict ? getVerdictBadgeColor(finalVerdict) : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
  const consensusLabel = consensusMethod ? CONSENSUS_METHOD_LABELS[consensusMethod] ?? 'Неизвестно' : 'Неизвестно';

  const toggleJudgeExpansion = (judgeId: string) => {
    setExpandedJudgeIds((prev) => {
      const next = new Set(prev);
      if (next.has(judgeId)) {
        next.delete(judgeId);
      } else {
        next.add(judgeId);
      }
      return next;
    });
  };

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Оценка качества</CardTitle>
          <div className={cn('text-3xl font-bold', finalScoreColor)}>
            {finalScore.toFixed(2)}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Cascade Stage Indicator */}
        {result.cascadeStage && (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                result.cascadeStage === 'heuristic' && 'border-red-500 text-red-600',
                result.cascadeStage === 'single_judge' && 'border-blue-500 text-blue-600',
                result.cascadeStage === 'clev_voting' && 'border-purple-500 text-purple-600'
              )}
            >
              {result.cascadeStage === 'heuristic' && 'Эвристика'}
              {result.cascadeStage === 'single_judge' && 'Один судья'}
              {result.cascadeStage === 'clev_voting' && 'CLEV голосование'}
            </Badge>
            {result.stageReason && (
              <span className="text-xs text-slate-500">{result.stageReason}</span>
            )}
          </div>
        )}

        {/* Heuristics Details Card */}
        {result.heuristicsResult && (
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <div className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
              Результаты эвристик
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-slate-600 dark:text-slate-400">
                Слов: <span className="font-mono text-slate-900 dark:text-slate-100">{result.heuristicsResult.wordCount}</span>
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                Flesch-Kincaid: <span className="font-mono text-slate-900 dark:text-slate-100">{result.heuristicsResult.fleschKincaid?.toFixed(1)}</span>
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                Примеров: <span className="font-mono text-slate-900 dark:text-slate-100">{result.heuristicsResult.examplesCount}</span>
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                Упражнений: <span className="font-mono text-slate-900 dark:text-slate-100">{result.heuristicsResult.exercisesCount}</span>
              </div>
            </div>
          </div>
        )}

        {/* Judge Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {votes.map((vote) => (
            <JudgeCard
              key={vote.judgeId}
              vote={vote}
              isTieBreaker={vote.judgeId === tieBreakerId}
              expanded={globalExpanded || expandedJudgeIds.has(vote.judgeId)}
              onToggle={
                onExpand
                  ? onExpand
                  : () => toggleJudgeExpansion(vote.judgeId)
              }
            />
          ))}
        </div>

        {/* Heuristics Warning (if any) */}
        {!heuristicsPassed && result.heuristicsIssues && result.heuristicsIssues.length > 0 && (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200 mb-1">
                  Обнаружены проблемы:
                </p>
                <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5 list-disc list-inside">
                  {result.heuristicsIssues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Highlighted Sections (if any) */}
        {result.highlightedSections && result.highlightedSections.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Разделы с замечаниями:
            </p>
            <div className="space-y-2">
              {result.highlightedSections.map((section, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'p-3 rounded-lg border',
                    section.severity === 'high'
                      ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                      : section.severity === 'medium'
                      ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800'
                      : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Badge
                      className={cn(
                        'text-xs flex-shrink-0',
                        section.severity === 'high'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : section.severity === 'medium'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      )}
                    >
                      Раздел {section.sectionIndex + 1}
                    </Badge>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {section.sectionTitle}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        {section.issue}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Refinement Tasks (if any) */}
        {refinementTasks && refinementTasks.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              План исправлений:
            </p>
            <div className="space-y-2">
              {refinementTasks.map((task) => (
                <div
                  key={task.taskId}
                  className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-start gap-2">
                    <Badge className="text-xs flex-shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {FIX_ACTION_LABELS[task.fixAction].ru}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {task.sectionTitle}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {task.issueCount} проблем{getIssuePlural(task.issueCount)}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      {getTaskStatusIndicator(task.status)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Consensus Footer */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            {/* Consensus Method */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Консенсус:
              </span>
              <Badge
                variant="outline"
                className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600"
              >
                {consensusLabel}
                {consensusMethod === 'unanimous' && (
                  <Check className="w-3 h-3 ml-1 text-emerald-600 dark:text-emerald-400" />
                )}
              </Badge>
            </div>

            {/* Final Verdict */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Итоговый вердикт:
              </span>
              <Badge className={cn('font-medium', finalVerdictBadgeColor)}>
                {finalVerdictLabel.toUpperCase()}
              </Badge>
            </div>
          </div>

          {/* Cost Savings Indicator */}
          {result.costSavingsRatio !== undefined && result.costSavingsRatio > 0 && (
            <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 mt-2">
              <TrendingUp className="w-3 h-3" />
              <span>Экономия: {Math.round(result.costSavingsRatio * 100)}%</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
