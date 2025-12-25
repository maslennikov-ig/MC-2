'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, RefreshCw, CheckCircle2, Circle, AlertCircle, Loader2, FileText, Layers, Puzzle, Sparkles, Scale, ThumbsUp, ThumbsDown, AlertTriangle } from 'lucide-react';
import * as Accordion from '@radix-ui/react-accordion';
import { cn } from '@/lib/utils';
import {
  PipelineNodeState,
  Stage6NodeName,
  STAGE6_NODE_LABELS,
  Stage6NodeStatus
} from '@megacampus/shared-types';
import type { ProgressSummary } from '@megacampus/shared-types/judge-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ProgressSummaryDisplay } from './ProgressSummaryDisplay';
import { ErrorBoundary } from 'react-error-boundary';

// =============================================================================
// Error Boundary Fallback
// =============================================================================

function NodeOutputErrorFallback({ error }: { error: Error }) {
  return (
    <div className="text-xs text-red-500 dark:text-red-400 p-2 rounded bg-red-50 dark:bg-red-900/20">
      <span className="font-medium">Ошибка отображения:</span>{' '}
      <span className="text-slate-600 dark:text-slate-400">{error.message}</span>
    </div>
  );
}

// =============================================================================
// Props & Types
// =============================================================================

export interface VerticalPipelineStepperProps {
  /** Pipeline nodes with their state */
  nodes: PipelineNodeState[];
  /** Currently active node (null if not started or completed) */
  currentNode: Stage6NodeName | null;
  /** Callback when user requests node retry */
  onRetryNode?: (node: Stage6NodeName) => void;
  /** Callback when user wants to view node output */
  onViewOutput?: (node: Stage6NodeName, output: unknown) => void;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Stagger each bar by 15% for visual wave effect in parallel progress bars */
const PARALLEL_BAR_STAGGER_INTERVAL = 15;

/** Offset to create cascading animation in parallel progress bars */
const PARALLEL_BAR_STAGGER_OFFSET = 30;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format tokens with thousands separator
 */
function formatTokens(tokens: number): string {
  return tokens.toLocaleString('ru-RU');
}

/**
 * Format cost in USD
 */
function formatCost(costUsd: number): string {
  return `$${costUsd.toFixed(4)}`;
}

/**
 * Format duration in seconds
 */
function formatDuration(durationMs: number): string {
  const seconds = (durationMs / 1000).toFixed(1);
  return `${seconds}с`;
}

/** Labels for judge criteria scores (Russian) */
const CRITERION_LABELS: Record<string, string> = {
  coherence: 'Связность',
  accuracy: 'Точность',
  completeness: 'Полнота',
  readability: 'Читаемость',
};

/**
 * Format criterion score as percentage with label
 * Returns null if value is undefined
 */
function formatCriterionScore(key: string, value: number | undefined): React.ReactNode {
  if (value === undefined) return null;
  const label = CRITERION_LABELS[key] || key;
  return <span key={key}>{label}: {Math.round(value * 100)}%</span>;
}

/**
 * Get status icon component based on node status
 */
function getStatusIcon(status: Stage6NodeStatus, isActive: boolean): React.ReactNode {
  if (status === 'completed') {
    return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
  }

  if (status === 'error') {
    return <AlertCircle className="w-5 h-5 text-red-500" />;
  }

  if (status === 'active' || isActive) {
    return (
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
      >
        <Loader2 className="w-5 h-5 text-blue-500" />
      </motion.div>
    );
  }

  // Pending
  return <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />;
}

// =============================================================================
// Human-Readable Output Display Components
// =============================================================================

/**
 * Output data types for each pipeline stage
 */
interface PlannerOutput {
  outlineLength?: number;
  sectionsPlanned?: number;
  planningStrategy?: string;
}

interface ExpanderOutput {
  expandedCount?: number;
  totalCount?: number;
  successRate?: number;
  completedSections?: number;
  totalSections?: number;
}

interface AssemblerOutput {
  contentLength?: number;
  sectionsAssembled?: number;
  exercisesIncluded?: number;
  wordCount?: number;
}

interface SmootherOutput {
  smoothedLength?: number;
  wordCount?: number;
  sectionsCount?: number;
  improvementsMade?: number;
}

interface JudgeVote {
  judgeId?: string;
  modelId?: string;
  modelDisplayName?: string;
  verdict?: 'accept' | 'reject' | 'revise' | 'ACCEPT' | 'REJECT' | 'ACCEPT_WITH_MINOR_REVISION' | 'ITERATIVE_REFINEMENT' | 'REGENERATE' | 'ESCALATE_TO_HUMAN';
  score?: number;
  confidence?: number;
  reasoning?: string;
  criteria?: {
    coherence?: number;
    accuracy?: number;
    completeness?: number;
    readability?: number;
  };
}

interface HeuristicsData {
  passed?: boolean;
  wordCount?: number;
  fleschKincaid?: number;
  examplesCount?: number;
  exercisesCount?: number;
  failureReasons?: string[];
}

interface SingleJudgeData {
  model?: string;
  score?: number;
  confidence?: string;
  criteriaScores?: Record<string, number>;
  issues?: Array<{
    criterion?: string;
    severity?: string;
    description?: string;
  }>;
  strengths?: string[];
  recommendation?: string;
}

interface JudgeOutput {
  finalRecommendation?: 'accept' | 'reject' | 'revise';
  qualityScore?: number;
  needsRegeneration?: boolean;
  needsHumanReview?: boolean;
  cascadeStage?: string;
  stageReason?: string;
  criteriaEvaluated?: number;
  passedCriteria?: number;
  failedCriteria?: number;
  modelUsed?: string;
  // Enriched cascade data
  heuristics?: HeuristicsData;
  singleJudge?: SingleJudgeData;
  costSavingsRatio?: number;
  retryCount?: number;
  // CLEV voting data
  votes?: JudgeVote[];
  consensusMethod?: string;
  isThirdJudgeInvoked?: boolean;
  tieBreakerId?: string;
  // Backward compat
  heuristics_passed?: boolean;
  heuristics_issues?: string[];
}

/**
 * Format number with Russian locale
 */
function formatNumber(num: number): string {
  return num.toLocaleString('ru-RU');
}

/**
 * Render human-readable output for Planner stage
 */
function PlannerOutputDisplay({ output }: { output: PlannerOutput }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
        <FileText className="w-4 h-4 text-purple-500" />
        <span className="text-sm font-medium">Результат планирования</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {output.outlineLength !== undefined && (
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-2">
            <div className="text-purple-600 dark:text-purple-400 font-medium">Размер плана</div>
            <div className="text-slate-900 dark:text-slate-100 font-mono">{formatNumber(output.outlineLength)} символов</div>
          </div>
        )}
        {output.sectionsPlanned !== undefined && (
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-2">
            <div className="text-purple-600 dark:text-purple-400 font-medium">Секций запланировано</div>
            <div className="text-slate-900 dark:text-slate-100 font-mono">{output.sectionsPlanned}</div>
          </div>
        )}
      </div>
      {output.planningStrategy && (
        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
          Стратегия: {output.planningStrategy}
        </div>
      )}
    </div>
  );
}

/**
 * Render human-readable output for Expander stage
 */
function ExpanderOutputDisplay({ output }: { output: ExpanderOutput }) {
  const progress = output.totalCount && output.expandedCount
    ? Math.round((output.expandedCount / output.totalCount) * 100)
    : output.successRate;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
        <Layers className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium">Наполнение секций</span>
      </div>
      {(output.expandedCount !== undefined && output.totalCount !== undefined) && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-400">Обработано секций</span>
            <span className="font-mono text-blue-600 dark:text-blue-400">{output.expandedCount} из {output.totalCount}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}
      {output.successRate !== undefined && (
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          <span className="text-slate-600 dark:text-slate-400">Успешность:</span>
          <span className="font-mono text-emerald-600 dark:text-emerald-400">{output.successRate}%</span>
        </div>
      )}
    </div>
  );
}

/**
 * Render human-readable output for Assembler stage
 */
function AssemblerOutputDisplay({ output }: { output: AssemblerOutput }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
        <Puzzle className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-medium">Сборка контента</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {output.sectionsAssembled !== undefined && (
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
            <div className="text-amber-600 dark:text-amber-400 font-medium">Секций собрано</div>
            <div className="text-slate-900 dark:text-slate-100 font-mono">{output.sectionsAssembled}</div>
          </div>
        )}
        {output.exercisesIncluded !== undefined && (
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
            <div className="text-amber-600 dark:text-amber-400 font-medium">Упражнений</div>
            <div className="text-slate-900 dark:text-slate-100 font-mono">{output.exercisesIncluded}</div>
          </div>
        )}
        {output.contentLength !== undefined && (
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
            <div className="text-amber-600 dark:text-amber-400 font-medium">Размер контента</div>
            <div className="text-slate-900 dark:text-slate-100 font-mono">{formatNumber(output.contentLength)} сим.</div>
          </div>
        )}
        {output.wordCount !== undefined && (
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
            <div className="text-amber-600 dark:text-amber-400 font-medium">Слов</div>
            <div className="text-slate-900 dark:text-slate-100 font-mono">{formatNumber(output.wordCount)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Render human-readable output for Smoother stage
 */
function SmootherOutputDisplay({ output }: { output: SmootherOutput }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
        <Sparkles className="w-4 h-4 text-cyan-500" />
        <span className="text-sm font-medium">Редактирование</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {output.sectionsCount !== undefined && (
          <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-2">
            <div className="text-cyan-600 dark:text-cyan-400 font-medium">Секций обработано</div>
            <div className="text-slate-900 dark:text-slate-100 font-mono">{output.sectionsCount}</div>
          </div>
        )}
        {output.wordCount !== undefined && (
          <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-2">
            <div className="text-cyan-600 dark:text-cyan-400 font-medium">Слов в итоге</div>
            <div className="text-slate-900 dark:text-slate-100 font-mono">{formatNumber(output.wordCount)}</div>
          </div>
        )}
        {output.smoothedLength !== undefined && (
          <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-2 col-span-2">
            <div className="text-cyan-600 dark:text-cyan-400 font-medium">Итоговый размер</div>
            <div className="text-slate-900 dark:text-slate-100 font-mono">{formatNumber(output.smoothedLength)} символов</div>
          </div>
        )}
      </div>
      {output.improvementsMade !== undefined && (
        <div className="text-xs text-slate-600 dark:text-slate-400">
          Внесено улучшений: {output.improvementsMade}
        </div>
      )}
    </div>
  );
}

/**
 * Get localized verdict label
 */
function getVerdictLabel(verdict?: string): string {
  if (!verdict) return 'Неизвестно';

  const labels: Record<string, string> = {
    ACCEPT: 'Принято',
    REJECT: 'Отклонено',
    REVISE: 'Требует правок',
    ACCEPT_WITH_MINOR_REVISION: 'Точечное исправление',
    ITERATIVE_REFINEMENT: 'Итеративная доработка',
    REGENERATE: 'Переделать',
    ESCALATE_TO_HUMAN: 'Ручная проверка',
  };

  return labels[verdict.toUpperCase()] || verdict;
}

/**
 * Get Tailwind color class for verdict
 */
function getVerdictColorClass(verdict?: string): string {
  if (!verdict) return 'text-slate-600 dark:text-slate-400';

  const colors: Record<string, string> = {
    ACCEPT: 'text-emerald-600 dark:text-emerald-400',
    REJECT: 'text-red-600 dark:text-red-400',
    REVISE: 'text-amber-600 dark:text-amber-400',
    ACCEPT_WITH_MINOR_REVISION: 'text-yellow-600 dark:text-yellow-400',
    ITERATIVE_REFINEMENT: 'text-orange-600 dark:text-orange-400',
    REGENERATE: 'text-red-600 dark:text-red-400',
    ESCALATE_TO_HUMAN: 'text-purple-600 dark:text-purple-400',
  };

  return colors[verdict.toUpperCase()] || 'text-slate-600 dark:text-slate-400';
}

/**
 * Judge output display component props
 */
interface JudgeOutputDisplayProps {
  output: JudgeOutput;
  isLoading?: boolean;
}

/**
 * Render human-readable output for Judge stage
 */
function JudgeOutputDisplay({ output, isLoading = false }: JudgeOutputDisplayProps) {
  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
        <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        <span>Загрузка данных оценки...</span>
      </div>
    );
  }
  const getRecommendationBadge = () => {
    switch (output.finalRecommendation) {
      case 'accept':
        return (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
            <ThumbsUp className="w-3 h-3 mr-1" />
            Принято
          </Badge>
        );
      case 'reject':
        return (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800">
            <ThumbsDown className="w-3 h-3 mr-1" />
            Отклонено
          </Badge>
        );
      case 'revise':
        return (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Требует доработки
          </Badge>
        );
      default:
        return null;
    }
  };

  // Handle qualityScore that might be 0-1 (decimal) or 0-100 (percentage)
  const rawScore = output.qualityScore;
  const scorePercent = rawScore !== undefined
    ? (rawScore <= 1 ? Math.round(rawScore * 100) : Math.round(rawScore))
    : null;

  const scoreColor = scorePercent !== null
    ? scorePercent >= 80
      ? 'text-emerald-600 dark:text-emerald-400'
      : scorePercent >= 60
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400'
    : '';

  // Check if we have any data to display
  const hasAnyData = output.finalRecommendation ||
    scorePercent !== null ||
    output.votes?.length ||
    output.modelUsed ||
    output.criteriaEvaluated !== undefined;

  // Get heuristics data (new format or backward compat)
  const heuristicsData = output.heuristics || (output.heuristics_passed !== undefined ? {
    passed: output.heuristics_passed,
    failureReasons: output.heuristics_issues,
  } : null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
        <Scale className="w-4 h-4 text-indigo-500" />
        <span className="text-sm font-medium">Оценка качества</span>
      </div>

      {/* Cascade Stage Badge */}
      {output.cascadeStage ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              output.cascadeStage === 'heuristic' && 'border-red-400 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
              output.cascadeStage === 'single_judge' && 'border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
              output.cascadeStage === 'clev_voting' && 'border-purple-400 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20'
            )}
          >
            {output.cascadeStage === 'heuristic' && 'Эвристика'}
            {output.cascadeStage === 'single_judge' && 'Один судья'}
            {output.cascadeStage === 'clev_voting' && 'CLEV голосование'}
          </Badge>
          {output.stageReason ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">{output.stageReason}</span>
          ) : null}
          {output.costSavingsRatio !== undefined && output.costSavingsRatio > 0 ? (
            <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-600 dark:text-emerald-400">
              Экономия: {Math.round(output.costSavingsRatio * 100)}%
            </Badge>
          ) : null}
        </div>
      ) : null}

      {/* Heuristics Details (new enriched data) */}
      {heuristicsData && (heuristicsData.wordCount !== undefined || heuristicsData.failureReasons?.length) ? (
        <div className={cn(
          'p-2 rounded-lg border text-xs',
          heuristicsData.passed !== false
            ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        )}>
          <div className="font-medium mb-1 text-slate-700 dark:text-slate-300">Эвристики</div>
          <div className="grid grid-cols-2 gap-1 text-slate-600 dark:text-slate-400">
            {heuristicsData.wordCount !== undefined ? (
              <span>Слов: <span className="font-mono">{formatNumber(heuristicsData.wordCount)}</span></span>
            ) : null}
            {heuristicsData.fleschKincaid !== undefined ? (
              <span>FK: <span className="font-mono">{heuristicsData.fleschKincaid.toFixed(1)}</span></span>
            ) : null}
            {heuristicsData.examplesCount !== undefined ? (
              <span>Примеров: <span className="font-mono">{heuristicsData.examplesCount}</span></span>
            ) : null}
            {heuristicsData.exercisesCount !== undefined ? (
              <span>Упражнений: <span className="font-mono">{heuristicsData.exercisesCount}</span></span>
            ) : null}
          </div>
          {heuristicsData.failureReasons && heuristicsData.failureReasons.length > 0 ? (
            <div className="mt-1 text-red-600 dark:text-red-400">
              {heuristicsData.failureReasons.map((r, i) => (
                <div key={i} className="flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Empty state message */}
      {!hasAnyData ? (
        <div className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
          Данные оценки еще не доступны. Ожидание завершения судейства...
        </div>
      ) : null}

      {/* Recommendation Badge */}
      {output.finalRecommendation ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600 dark:text-slate-400">Решение:</span>
          {getRecommendationBadge()}
        </div>
      ) : null}

      {/* Quality Score */}
      {scorePercent !== null ? (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-400">Качество контента</span>
            <span className={cn('font-mono font-bold', scoreColor)}>{scorePercent}%</span>
          </div>
          <Progress
            value={scorePercent}
            className={cn(
              'h-2',
              scorePercent >= 80 ? '[&>div]:bg-emerald-500' :
                scorePercent >= 60 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'
            )}
          />
        </div>
      ) : null}

      {/* CLEV Voting Panel - Individual Judge Votes */}
      {output.votes && output.votes.length > 0 ? (
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Голосование судей ({output.votes.length})
            </span>
            {output.consensusMethod ? (
              <Badge variant="outline" className="text-xs">
                {output.consensusMethod === 'unanimous' ? 'Единогласно' :
                 output.consensusMethod === 'majority' ? 'Большинство' :
                 output.consensusMethod === 'tiebreaker' ? 'Тай-брейк' :
                 output.consensusMethod}
              </Badge>
            ) : null}
          </div>

          {/* Individual votes */}
          <div className="space-y-2">
            {output.votes.map((vote, idx) => (
              <div
                key={vote.judgeId || idx}
                className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 text-xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {vote.modelDisplayName || vote.modelId || `Судья ${idx + 1}`}
                  </span>
                  <span className={cn('font-semibold', getVerdictColorClass(vote.verdict))}>
                    {getVerdictLabel(vote.verdict)}
                  </span>
                </div>

                {/* Score and confidence row */}
                <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                  {vote.score !== undefined ? (
                    <span>
                      Оценка: <span className="font-mono">{vote.score <= 1 ? Math.round(vote.score * 100) : Math.round(vote.score)}%</span>
                    </span>
                  ) : null}
                  {vote.confidence !== undefined ? (
                    <span>
                      Уверенность: <span className="font-mono">{Math.round(vote.confidence * 100)}%</span>
                    </span>
                  ) : null}
                </div>

                {/* Criteria breakdown - using helper for DRY */}
                {vote.criteria ? (
                  <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-slate-500 dark:text-slate-400">
                    {formatCriterionScore('coherence', vote.criteria.coherence)}
                    {formatCriterionScore('accuracy', vote.criteria.accuracy)}
                    {formatCriterionScore('completeness', vote.criteria.completeness)}
                    {formatCriterionScore('readability', vote.criteria.readability)}
                  </div>
                ) : null}

                {/* Reasoning */}
                {vote.reasoning ? (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 italic line-clamp-2">
                    {vote.reasoning}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {/* Third judge indicator */}
          {output.isThirdJudgeInvoked ? (
            <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Третий судья был привлечен для разрешения конфликта
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Model used (when no detailed votes) */}
      {output.modelUsed && (!output.votes || output.votes.length === 0) ? (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Модель: <span className="font-mono">{output.modelUsed}</span>
        </div>
      ) : null}

      {/* Criteria Stats */}
      {(output.criteriaEvaluated !== undefined || output.passedCriteria !== undefined) ? (
        <div className="grid grid-cols-3 gap-2 text-xs">
          {output.criteriaEvaluated !== undefined ? (
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-2 text-center">
              <div className="text-indigo-600 dark:text-indigo-400 font-medium">Критериев</div>
              <div className="text-slate-900 dark:text-slate-100 font-mono">{output.criteriaEvaluated}</div>
            </div>
          ) : null}
          {output.passedCriteria !== undefined ? (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2 text-center">
              <div className="text-emerald-600 dark:text-emerald-400 font-medium">Пройдено</div>
              <div className="text-slate-900 dark:text-slate-100 font-mono">{output.passedCriteria}</div>
            </div>
          ) : null}
          {output.failedCriteria !== undefined ? (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2 text-center">
              <div className="text-red-600 dark:text-red-400 font-medium">Не пройдено</div>
              <div className="text-slate-900 dark:text-slate-100 font-mono">{output.failedCriteria}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Additional Flags */}
      {(output.needsRegeneration || output.needsHumanReview) ? (
        <div className="flex flex-wrap gap-2">
          {output.needsRegeneration ? (
            <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 dark:text-amber-400">
              <RefreshCw className="w-3 h-3 mr-1" />
              Нужна перегенерация
            </Badge>
          ) : null}
          {output.needsHumanReview ? (
            <Badge variant="outline" className="text-xs border-blue-500 text-blue-600 dark:text-blue-400">
              Требует проверки
            </Badge>
          ) : null}
        </div>
      ) : null}

      {/* Cascade Stage */}
      {output.cascadeStage ? (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Этап каскада: <span className="font-mono">{output.cascadeStage}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * SelfReviewer output structure
 */
interface SelfReviewerOutput {
  status?: string;
  issuesCount?: number;
  criticalIssuesCount?: number;
  heuristicsPassed?: boolean;
  heuristicDetails?: {
    languageCheck?: {
      passed: boolean;
      foreignCharCount?: number;
      threshold?: number;
    };
    truncationCheck?: {
      passed: boolean;
      hasEndMarker?: boolean;
      unexpectedEnd?: boolean;
    };
  };
  progressSummary?: unknown;
}

/**
 * Render human-readable output for SelfReviewer stage
 */
function SelfReviewerOutputDisplay({ output }: { output: SelfReviewerOutput }) {
  const statusLabel = output.status === 'PASS'
    ? 'Пройдено'
    : output.status === 'PASS_WITH_FLAGS'
      ? 'Пройдено с замечаниями'
      : output.status === 'REGENERATE'
        ? 'Требует перегенерации'
        : output.status || 'Неизвестно';

  const statusColor = output.status === 'PASS'
    ? 'text-emerald-600 dark:text-emerald-400'
    : output.status === 'PASS_WITH_FLAGS'
      ? 'text-amber-600 dark:text-amber-400'
      : output.status === 'REGENERATE'
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-600 dark:text-slate-400';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
        <CheckCircle2 className="w-4 h-4 text-cyan-500" />
        <span className="text-sm font-medium">Самопроверка</span>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-600 dark:text-slate-400">Статус:</span>
        <span className={cn('font-semibold', statusColor)}>{statusLabel}</span>
      </div>

      {/* Issue counts */}
      {(output.issuesCount !== undefined || output.criticalIssuesCount !== undefined) && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {output.issuesCount !== undefined && (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
              <div className="text-slate-600 dark:text-slate-400 font-medium">Всего проблем</div>
              <div className="text-slate-900 dark:text-slate-100 font-mono">{output.issuesCount}</div>
            </div>
          )}
          {output.criticalIssuesCount !== undefined && (
            <div className={cn(
              'rounded-lg p-2',
              output.criticalIssuesCount > 0
                ? 'bg-red-50 dark:bg-red-900/20'
                : 'bg-emerald-50 dark:bg-emerald-900/20'
            )}>
              <div className={cn(
                'font-medium',
                output.criticalIssuesCount > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              )}>
                Критических
              </div>
              <div className="text-slate-900 dark:text-slate-100 font-mono">
                {output.criticalIssuesCount}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Heuristic details */}
      {output.heuristicDetails && (
        <div className="space-y-1 text-xs">
          {output.heuristicDetails.languageCheck && (
            <div className="flex items-center gap-2">
              {output.heuristicDetails.languageCheck.passed ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              ) : (
                <AlertCircle className="w-3 h-3 text-amber-500" />
              )}
              <span className="text-slate-600 dark:text-slate-400">
                Проверка языка: {output.heuristicDetails.languageCheck.passed ? 'OK' : 'Замечания'}
              </span>
            </div>
          )}
          {output.heuristicDetails.truncationCheck && (
            <div className="flex items-center gap-2">
              {output.heuristicDetails.truncationCheck.passed ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              ) : (
                <AlertCircle className="w-3 h-3 text-red-500" />
              )}
              <span className="text-slate-600 dark:text-slate-400">
                Проверка целостности: {output.heuristicDetails.truncationCheck.passed ? 'OK' : 'Обрезан'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Heuristics passed badge */}
      {output.heuristicsPassed !== undefined && (
        <Badge
          variant="outline"
          className={cn(
            'text-xs',
            output.heuristicsPassed
              ? 'border-emerald-400 text-emerald-600 dark:text-emerald-400'
              : 'border-red-400 text-red-600 dark:text-red-400'
          )}
        >
          {output.heuristicsPassed ? 'Эвристики пройдены' : 'Эвристики не пройдены'}
        </Badge>
      )}
    </div>
  );
}

/**
 * Check if we have a specialized display for this node type
 * New 3-node pipeline: generator, selfReviewer, judge
 * Legacy nodes are included for backward compatibility with old trace data
 */
function hasSpecializedDisplay(node: Stage6NodeName): boolean {
  return ['generator', 'selfReviewer', 'judge', 'planner', 'expander', 'assembler', 'smoother'].includes(node);
}

/**
 * Render human-readable output based on node type
 * New 3-node pipeline: generator, selfReviewer, judge
 * Legacy nodes are kept for backward compatibility with old trace data
 */
function NodeOutputDisplay({ node, output }: { node: Stage6NodeName; output: unknown }) {
  if (!output || typeof output !== 'object') {
    return null;
  }

  switch (node) {
    // New generator node (combines planner + expander + assembler + smoother)
    case 'generator':
      // Generator output is similar to smoother output (final content)
      return <SmootherOutputDisplay output={output as SmootherOutput} />;
    // New selfReviewer node (heuristic pre-checks)
    case 'selfReviewer':
      return <SelfReviewerOutputDisplay output={output as SelfReviewerOutput} />;
    // Legacy nodes for backward compatibility with old logs
    case 'planner':
      return <PlannerOutputDisplay output={output as PlannerOutput} />;
    case 'expander':
      return <ExpanderOutputDisplay output={output as ExpanderOutput} />;
    case 'assembler':
      return <AssemblerOutputDisplay output={output as AssemblerOutput} />;
    case 'smoother':
      return <SmootherOutputDisplay output={output as SmootherOutput} />;
    case 'judge':
      return <JudgeOutputDisplay output={output as JudgeOutput} />;
    default:
      return null;
  }
}

/**
 * Render human-readable output with JSON fallback for unsupported types
 */
function NodeOutputDisplayWithFallback({ node, output }: { node: Stage6NodeName; output: unknown }) {
  // If output is invalid, show nothing
  if (!output) {
    return (
      <div className="text-xs text-slate-500 dark:text-slate-400 italic">
        Данные вывода недоступны
      </div>
    );
  }

  // Extract progressSummary if present
  const outputObj = output as Record<string, unknown>;
  const progressSummary = outputObj?.progressSummary as ProgressSummary | undefined;

  // If we have a specialized display for this node, use it
  if (hasSpecializedDisplay(node) && typeof output === 'object') {
    return (
      <div className="space-y-4">
        {/* Show progress summary first if available */}
        {progressSummary && (
          <ProgressSummaryDisplay progressSummary={progressSummary} />
        )}
        {/* Then show specialized output display */}
        <NodeOutputDisplay node={node} output={output} />
      </div>
    );
  }

  // Fallback: show progress summary + raw JSON for unknown node types
  return (
    <div className="space-y-4">
      {progressSummary && (
        <ProgressSummaryDisplay progressSummary={progressSummary} />
      )}
      <pre className="text-xs text-slate-700 dark:text-slate-300 overflow-x-auto max-h-48 overflow-y-auto">
        {JSON.stringify(output, null, 2)}
      </pre>
    </div>
  );
}

/**
 * Render parallel progress bars for expander node
 */
function ParallelExpanderBars({ progress = 0 }: { progress?: number }) {
  const bars = 5; // Representing 5 sections processing in parallel
  const barProgress = Math.min(100, progress);

  return (
    <div className="space-y-1 mt-2">
      {Array.from({ length: bars }).map((_, idx) => {
        // Calculate staggered progress for parallel visualization
        const stagger = (idx * PARALLEL_BAR_STAGGER_INTERVAL) % 100;
        const adjustedProgress = Math.max(0, Math.min(100, barProgress + stagger - PARALLEL_BAR_STAGGER_OFFSET));

        return (
          <div key={idx} className="flex items-center gap-2">
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400"
                initial={{ width: '0%' }}
                animate={{ width: `${adjustedProgress}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 min-w-[3ch]">
              {Math.round(adjustedProgress)}%
            </span>
          </div>
        );
      })}
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        Секция {Math.ceil((barProgress / 100) * bars)} из {bars}...
      </p>
    </div>
  );
}

// =============================================================================
// Pipeline Node Card Component
// =============================================================================

interface PipelineNodeCardProps {
  node: PipelineNodeState;
  isActive: boolean;
  onRetry?: () => void;
  onViewOutput?: () => void;
}

function PipelineNodeCard({ node, isActive, onRetry, onViewOutput }: PipelineNodeCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const labels = STAGE6_NODE_LABELS[node.node];
  // Use explicit boolean check to avoid rendering 0
  const hasMetrics = node.status === 'completed' &&
    node.tokensUsed !== undefined &&
    node.costUsd !== undefined &&
    node.durationMs !== undefined;
  const hasOutput = node.output != null;
  const canExpand = hasOutput || (node.status === 'error' && node.errorMessage);

  // Handle card click to toggle accordion
  const handleCardClick = useCallback(() => {
    if (canExpand) {
      setIsExpanded((prev) => !prev);
    }
  }, [canExpand]);

  // Handle keyboard interaction
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (canExpand && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleCardClick();
    }
  }, [canExpand, handleCardClick]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={canExpand ? 0 : undefined}
      aria-expanded={canExpand ? isExpanded : undefined}
      className={cn(
        'relative rounded-lg border p-4 transition-all duration-300',
        // Status-based styling
        node.status === 'completed' && 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/10',
        node.status === 'error' && 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10',
        isActive && 'border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10 shadow-lg shadow-blue-500/10',
        node.status === 'pending' && 'border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/30',
        // Pulse animation for active node
        isActive && 'animate-pulse-slow',
        // Clickable styling
        canExpand && 'cursor-pointer hover:shadow-md hover:scale-[1.01] transition-shadow'
      )}
    >
      {/* Header Row */}
      <div className="flex items-start gap-3">
        {/* Status Icon */}
        <div className="mt-0.5">
          {getStatusIcon(node.status, isActive)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title Row */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold uppercase text-slate-900 dark:text-slate-100">
              {labels.ru}
            </h3>

            {/* Status Badge for active/error/loop */}
            {node.status === 'active' && (
              <Badge variant="outline" className="text-xs border-blue-500 text-blue-600 dark:text-blue-400">
                В процессе
              </Badge>
            )}
            {node.status === 'error' && (
              <Badge variant="destructive" className="text-xs">
                Ошибка
              </Badge>
            )}
            {node.status === 'loop' && (
              <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 dark:text-amber-400">
                Повтор
              </Badge>
            )}

            {/* Checkmark for completed */}
            {node.status === 'completed' && (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
          </div>

          {/* Description */}
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {labels.description}
          </p>

          {/* Metrics Row (only for completed nodes with metrics) */}
          {hasMetrics ? (
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono">{formatTokens(node.tokensUsed!)} tok</span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span className="font-mono">{formatCost(node.costUsd!)}</span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span className="font-mono">{formatDuration(node.durationMs!)}</span>
            </div>
          ) : null}

          {/* Parallel Progress Bars (for expander node) */}
          {node.node === 'expander' && isActive && (
            <ParallelExpanderBars progress={node.progress} />
          )}

          {/* Retry Indicator (for loop/retry attempts) */}
          {node.retryAttempt != null && node.retryAttempt > 0 ? (
            <div className="flex items-center gap-1 mt-2 text-xs text-amber-600 dark:text-amber-400">
              <RefreshCw className="w-3 h-3" />
              <span>Попытка {node.retryAttempt + 1}</span>
            </div>
          ) : null}

          {/* Error Message (collapsed by default) */}
          {node.status === 'error' && node.errorMessage && (
            <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-400">
              {node.errorMessage}
            </div>
          )}

          {/* Expandable Output Section */}
          {canExpand && (
            <Accordion.Root
              type="single"
              collapsible
              className="mt-3"
              value={isExpanded ? 'output' : ''}
              onValueChange={(value) => setIsExpanded(value === 'output')}
            >
              <Accordion.Item value="output" className="border-none">
                <Accordion.Header>
                  <Accordion.Trigger
                    className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors group"
                    onClick={(e) => {
                      // Prevent double-toggle from card click
                      e.stopPropagation();
                    }}
                  >
                    <span>Показать результат</span>
                    <ChevronDown className="w-3 h-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                  <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    {/* Human-readable output display with error boundary */}
                    <ErrorBoundary FallbackComponent={NodeOutputErrorFallback}>
                      <NodeOutputDisplayWithFallback node={node.node} output={node.output} />
                    </ErrorBoundary>

                    {/* View full output button */}
                    {onViewOutput ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          // Prevent card click from toggling accordion
                          e.stopPropagation();
                          onViewOutput();
                        }}
                        className="mt-3 text-xs h-7 w-full justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        Показать сырые данные (JSON)
                      </Button>
                    ) : null}
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            </Accordion.Root>
          )}
        </div>

        {/* Retry Button (only for error nodes) */}
        {node.status === 'error' && onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              // Prevent card click from toggling accordion
              e.stopPropagation();
              onRetry();
            }}
            className="shrink-0 text-xs h-8"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Повтор
          </Button>
        )}
      </div>
    </motion.div>
  );
}

// =============================================================================
// Connecting Line Component
// =============================================================================

function ConnectingLine({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex justify-center py-2">
      <div className="relative w-px h-8">
        {/* Base line */}
        <div className="absolute inset-0 bg-slate-200 dark:bg-slate-700" />

        {/* Animated dot for active state */}
        {isActive && (
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-500 rounded-full"
            animate={{ y: [0, 32, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * VerticalPipelineStepper Component
 *
 * Displays the 5-node Stage 6 pipeline vertically with detailed state for each node:
 * - planner → expander → assembler → smoother → judge
 *
 * Features:
 * - Status icons (completed/active/pending/error)
 * - Metrics display (tokens, cost, duration)
 * - Parallel progress bars for expander node
 * - Expandable output view
 * - Retry button for error nodes
 * - Loop/retry attempt indicators
 * - Animated connecting lines
 * - Full dark mode support
 */
export function VerticalPipelineStepper({
  nodes,
  currentNode,
  onRetryNode,
  onViewOutput,
  className,
}: VerticalPipelineStepperProps) {
  // Sort nodes in pipeline order (new 3-node pipeline)
  const nodeOrder: Stage6NodeName[] = ['generator', 'selfReviewer', 'judge'];
  const sortedNodes = nodeOrder.map(nodeName =>
    nodes.find(n => n.node === nodeName) || {
      node: nodeName,
      status: 'pending' as Stage6NodeStatus,
    }
  );

  return (
    <div className={cn('space-y-0', className)}>
      <AnimatePresence mode="sync">
        {sortedNodes.map((node, index) => {
          const isActive = currentNode === node.node;
          const isLastNode = index === sortedNodes.length - 1;

          return (
            <React.Fragment key={node.node}>
              {/* Node Card */}
              <PipelineNodeCard
                node={node as PipelineNodeState}
                isActive={isActive}
                onRetry={
                  node.status === 'error' && onRetryNode
                    ? () => onRetryNode(node.node)
                    : undefined
                }
                onViewOutput={
                  node.output && onViewOutput
                    ? () => onViewOutput(node.node, node.output)
                    : undefined
                }
              />

              {/* Connecting Line */}
              {!isLastNode && (
                <ConnectingLine
                  isActive={node.status === 'completed' && isActive}
                />
              )}
            </React.Fragment>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// CSS Animation Helpers (add to global styles if not present)
// =============================================================================

// Add to tailwind.config.ts:
// animation: {
//   'accordion-down': 'accordion-down 0.2s ease-out',
//   'accordion-up': 'accordion-up 0.2s ease-out',
//   'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
// },
// keyframes: {
//   'accordion-down': {
//     from: { height: '0' },
//     to: { height: 'var(--radix-accordion-content-height)' },
//   },
//   'accordion-up': {
//     from: { height: 'var(--radix-accordion-content-height)' },
//     to: { height: '0' },
//   },
// },
