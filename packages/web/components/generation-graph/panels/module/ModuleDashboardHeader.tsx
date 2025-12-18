'use client';

import React from 'react';
import { ModuleDashboardData } from '@megacampus/shared-types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Clock, DollarSign, TrendingUp, CheckCircle2 } from 'lucide-react';

export interface ModuleDashboardHeaderProps {
  data: ModuleDashboardData;
  className?: string;
}

/**
 * Format cost to display as "$X.XX"
 */
function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/**
 * Format quality score to 2 decimal places
 */
function formatQuality(score: number): string {
  return score.toFixed(2);
}

/**
 * Format estimated time remaining
 */
function formatTimeEstimate(ms: number | null): string {
  if (ms === null) return '—';

  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return '< 1 мин';
  return `~${minutes} мин`;
}

/**
 * Get quality score color variant
 */
function getQualityColor(score: number): {
  text: string;
  bg: string;
  ring: string;
} {
  if (score >= 0.9) {
    return {
      text: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/30',
      ring: 'ring-emerald-200 dark:ring-emerald-700/50',
    };
  }
  if (score >= 0.75) {
    return {
      text: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-50 dark:bg-yellow-900/30',
      ring: 'ring-yellow-200 dark:ring-yellow-700/50',
    };
  }
  return {
    text: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/30',
    ring: 'ring-red-200 dark:ring-red-700/50',
  };
}

/**
 * Get module status badge
 */
function getStatusBadge(status: 'pending' | 'active' | 'completed' | 'error', aggregates: ModuleDashboardData['aggregates']) {
  // Check if any lessons have errors
  if (aggregates.errorLessons > 0) {
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
        Требует внимания
      </Badge>
    );
  }

  switch (status) {
    case 'active':
      return (
        <Badge
          variant="outline"
          className={cn(
            'text-sm font-medium',
            'border-blue-300 dark:border-blue-700',
            'text-blue-700 dark:text-blue-400',
            'bg-blue-50 dark:bg-blue-900/30',
            'animate-pulse'
          )}
        >
          Генерация
        </Badge>
      );
    case 'completed':
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
          Готово
        </Badge>
      );
    case 'error':
      return (
        <Badge
          variant="outline"
          className={cn(
            'text-sm font-medium',
            'border-red-300 dark:border-red-700',
            'text-red-700 dark:text-red-400',
            'bg-red-50 dark:bg-red-900/30'
          )}
        >
          Ошибка
        </Badge>
      );
    case 'pending':
    default:
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
          Ожидает
        </Badge>
      );
  }
}

/**
 * Circular progress SVG component
 */
function CircularProgress({
  progress,
  size = 64,
  strokeWidth = 6
}: {
  progress: number;
  size?: number;
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
        className="text-slate-200 dark:text-slate-700"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-blue-500 dark:text-cyan-400 transition-all duration-500"
      />
    </svg>
  );
}

/**
 * ModuleDashboardHeader Component
 *
 * Sticky header showing module title, status, and vital signs (progress, cost, quality, time).
 * Provides aggregate metrics for all lessons in the module.
 */
export function ModuleDashboardHeader({
  data,
  className,
}: ModuleDashboardHeaderProps) {
  const { title, moduleNumber, status, aggregates } = data;

  // Calculate progress percentage
  const progressPercent = aggregates.totalLessons > 0
    ? Math.round((aggregates.completedLessons / aggregates.totalLessons) * 100)
    : 0;

  // Get quality color if available
  const qualityColor = aggregates.avgQualityScore !== null
    ? getQualityColor(aggregates.avgQualityScore)
    : null;

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
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Модуль {moduleNumber}: {title}
          </h2>
          {getStatusBadge(status, aggregates)}
        </div>

        {/* Vital Signs Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Progress */}
          <div
            className={cn(
              'p-4 rounded-lg border',
              'border-slate-200 dark:border-slate-700',
              'bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-900',
              'transition-all duration-300',
              'hover:shadow-md hover:border-blue-300 dark:hover:border-cyan-600'
            )}
          >
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-blue-500 dark:text-cyan-400" />
              <div className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400 font-medium">
                Прогресс
              </div>
            </div>
            <div className="flex items-center gap-4">
              <CircularProgress progress={progressPercent} size={48} strokeWidth={4} />
              <div className="flex flex-col">
                <div className="text-xl font-mono font-semibold text-slate-900 dark:text-cyan-400">
                  {aggregates.completedLessons}/{aggregates.totalLessons}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {progressPercent}%
                </div>
              </div>
            </div>
          </div>

          {/* Cost */}
          <div
            className={cn(
              'p-4 rounded-lg border',
              'border-slate-200 dark:border-slate-700',
              'bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-900',
              'transition-all duration-300',
              'hover:shadow-md hover:border-blue-300 dark:hover:border-cyan-600'
            )}
          >
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-blue-500 dark:text-cyan-400" />
              <div className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400 font-medium">
                Стоимость
              </div>
            </div>
            <div className="text-2xl font-mono font-semibold text-slate-900 dark:text-cyan-400">
              {formatCost(aggregates.totalCostUsd)}
            </div>
          </div>

          {/* Average Quality */}
          <div
            className={cn(
              'p-4 rounded-lg border',
              'border-slate-200 dark:border-slate-700',
              'bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-900',
              'transition-all duration-300',
              'hover:shadow-md hover:border-blue-300 dark:hover:border-cyan-600',
              qualityColor ? qualityColor.bg : '',
              qualityColor ? qualityColor.ring : ''
            )}
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-blue-500 dark:text-cyan-400" />
              <div className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400 font-medium">
                Качество
              </div>
            </div>
            <div
              className={cn(
                'text-2xl font-mono font-semibold',
                qualityColor ? qualityColor.text : 'text-slate-900 dark:text-cyan-400'
              )}
            >
              {aggregates.avgQualityScore !== null
                ? formatQuality(aggregates.avgQualityScore)
                : '—'}
            </div>
          </div>

          {/* Estimated Time */}
          <div
            className={cn(
              'p-4 rounded-lg border',
              'border-slate-200 dark:border-slate-700',
              'bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-900',
              'transition-all duration-300',
              'hover:shadow-md hover:border-blue-300 dark:hover:border-cyan-600'
            )}
          >
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-blue-500 dark:text-cyan-400" />
              <div className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400 font-medium">
                Время
              </div>
            </div>
            <div className="text-2xl font-mono font-semibold text-slate-900 dark:text-cyan-400">
              {formatTimeEstimate(aggregates.estimatedTimeRemainingMs)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
