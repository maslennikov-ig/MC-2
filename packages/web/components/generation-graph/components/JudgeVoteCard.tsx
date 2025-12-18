'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, AlertTriangle, X, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SingleJudgeResult } from '@megacampus/shared-types';

/**
 * JudgeVoteCard - Individual judge vote visualization
 *
 * Displays a single judge's evaluation result with:
 * - Model name and display name
 * - Overall score (color-coded)
 * - Confidence level badge
 * - Recommendation (verdict)
 * - Expandable criteria scores
 * - Issues and strengths lists
 *
 * Features:
 * - Tie-breaker indicator
 * - Animated expansion/collapse
 * - Color-coded scores based on thresholds
 */

interface JudgeVoteCardProps {
  /** The judge's evaluation result */
  vote: SingleJudgeResult;
  /** Display name for the model */
  modelDisplayName?: string;
  /** Whether this is the tie-breaking judge */
  isTieBreaker?: boolean;
  /** External control for expanded state */
  expanded?: boolean;
  /** Callback when expansion is toggled */
  onToggle?: () => void;
  className?: string;
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
 * Get background color based on score
 */
function getScoreBgColor(score: number): string {
  if (score >= 0.9) return 'bg-emerald-100 dark:bg-emerald-900/30';
  if (score >= 0.75) return 'bg-yellow-100 dark:bg-yellow-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

/**
 * Get confidence badge color
 */
function getConfidenceBadgeColor(confidence: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'medium':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'low':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
  }
}

/**
 * Get recommendation icon based on recommendation string
 */
function getRecommendationIcon(recommendation: string) {
  const lower = recommendation.toLowerCase();
  if (lower.includes('accept')) return Check;
  if (lower.includes('regenerate') || lower.includes('reject')) return X;
  return AlertTriangle;
}

/**
 * Get recommendation badge color
 */
function getRecommendationBadgeColor(recommendation: string): string {
  const lower = recommendation.toLowerCase();
  if (lower.includes('accept')) {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
  }
  if (lower.includes('regenerate') || lower.includes('reject')) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  }
  return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
}

/**
 * Get severity badge color for issues
 */
function getSeverityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'high':
    case 'critical':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'medium':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'low':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
  }
}

const CRITERIA_LABELS: Record<string, string> = {
  coherence: 'Согласованность',
  accuracy: 'Точность',
  completeness: 'Полнота',
  readability: 'Читаемость',
  engagement: 'Вовлечённость',
  structure: 'Структура',
  examples: 'Примеры',
  exercises: 'Упражнения',
};

export function JudgeVoteCard({
  vote,
  modelDisplayName,
  isTieBreaker = false,
  expanded: externalExpanded,
  onToggle,
  className,
}: JudgeVoteCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = externalExpanded ?? internalExpanded;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  const scoreColor = getScoreColor(vote.score);
  const scoreBgColor = getScoreBgColor(vote.score);
  const RecommendationIcon = getRecommendationIcon(vote.recommendation);
  const confidenceLabel =
    vote.confidence === 'high' ? 'Высокая' : vote.confidence === 'medium' ? 'Средняя' : 'Низкая';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn(
          'relative overflow-hidden transition-all',
          isTieBreaker
            ? 'bg-purple-50 dark:bg-purple-900/10 border-purple-300 dark:border-purple-700 shadow-lg'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700',
          className
        )}
      >
        {/* Tie-breaker badge */}
        {isTieBreaker && (
          <div className="absolute -top-2 -right-2 z-10">
            <Badge className="bg-purple-600 text-white text-xs px-2 py-0.5 shadow-md flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Решающий
            </Badge>
          </div>
        )}

        <CardContent className="p-4">
          {/* Model Name */}
          <div className="text-center mb-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-0.5">
              {modelDisplayName || vote.model}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">
              {vote.model}
            </p>
          </div>

          {/* Score Circle */}
          <div className="flex justify-center mb-3">
            <div
              className={cn(
                'w-20 h-20 rounded-full flex items-center justify-center',
                scoreBgColor
              )}
            >
              <span className={cn('text-2xl font-bold', scoreColor)}>
                {vote.score.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Confidence Badge */}
          <div className="flex justify-center mb-3">
            <Badge className={cn('text-xs', getConfidenceBadgeColor(vote.confidence))}>
              Уверенность: {confidenceLabel}
            </Badge>
          </div>

          {/* Recommendation */}
          <div className="flex justify-center items-center gap-2 mb-3">
            <div
              className={cn(
                'p-1.5 rounded-full',
                vote.recommendation.toLowerCase().includes('accept')
                  ? 'bg-emerald-100 dark:bg-emerald-900/30'
                  : vote.recommendation.toLowerCase().includes('regenerate')
                  ? 'bg-red-100 dark:bg-red-900/30'
                  : 'bg-yellow-100 dark:bg-yellow-900/30'
              )}
            >
              <RecommendationIcon
                className={cn(
                  'w-4 h-4',
                  vote.recommendation.toLowerCase().includes('accept')
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : vote.recommendation.toLowerCase().includes('regenerate')
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-yellow-600 dark:text-yellow-400'
                )}
              />
            </div>
            <Badge className={cn('text-xs font-medium', getRecommendationBadgeColor(vote.recommendation))}>
              {vote.recommendation.toUpperCase()}
            </Badge>
          </div>

          {/* Expand Toggle */}
          <button
            onClick={handleToggle}
            className="w-full flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors py-2"
          >
            <span>{expanded ? 'Скрыть детали' : 'Показать детали'}</span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {/* Expanded Content */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {/* Criteria Scores */}
                {vote.criteriaScores && Object.keys(vote.criteriaScores).length > 0 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 mt-2">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                      Оценки по критериям
                    </p>
                    <div className="space-y-1.5">
                      {Object.entries(vote.criteriaScores).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between text-xs">
                          <span className="text-slate-600 dark:text-slate-400">
                            {CRITERIA_LABELS[key] || key}
                          </span>
                          <span className={cn('font-medium', getScoreColor(value))}>
                            {value.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Strengths */}
                {vote.strengths && vote.strengths.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 mt-3">
                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-2">
                      Сильные стороны
                    </p>
                    <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                      {vote.strengths.map((strength, idx) => (
                        <li key={idx}>{strength}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Issues */}
                {vote.issues && vote.issues.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 mt-3">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-2">
                      Найденные проблемы
                    </p>
                    <div className="space-y-2">
                      {vote.issues.map((issue, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded bg-slate-50 dark:bg-slate-800/50 text-xs"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={cn('text-[10px]', getSeverityColor(issue.severity))}>
                              {issue.severity.toUpperCase()}
                            </Badge>
                            {issue.criterion && (
                              <span className="text-slate-500">{issue.criterion}</span>
                            )}
                          </div>
                          <p className="text-slate-700 dark:text-slate-300">{issue.description}</p>
                          {issue.location && (
                            <p className="text-slate-400 mt-1 text-[10px]">
                              Расположение: {issue.location}
                            </p>
                          )}
                          {issue.suggestedFix && (
                            <p className="text-blue-600 dark:text-blue-400 mt-1 text-[10px]">
                              Предложение: {issue.suggestedFix}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
