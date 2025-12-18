'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { RefinementIterationDisplay } from '@megacampus/shared-types';

/**
 * IterationProgressChart - Sparkline chart for refinement iteration progress
 *
 * Displays:
 * - Score progression across iterations as a mini sparkline
 * - Iteration dots connected by lines
 * - Color-coded by score improvement/regression
 * - Target threshold line
 * - Hover tooltips with iteration details
 *
 * Features:
 * - Compact design (~40px height) for embedding in cards
 * - SVG-based rendering for crisp visuals
 * - Responsive to container width
 * - Russian labels
 */

interface IterationProgressChartProps {
  /** Refinement iterations to display */
  iterations: RefinementIterationDisplay[];
  /** Current iteration number (1-based) */
  currentIteration: number;
  /** Initial score before any refinement */
  initialScore: number;
  /** Target quality threshold */
  targetScore: number;
  className?: string;
}

/**
 * Get color for score point based on value
 */
function getScoreColor(score: number, targetScore: number): string {
  if (score >= targetScore) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.75) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

/**
 * Get stroke color for line segment based on improvement
 */
function getLineColor(improvement: number): string {
  if (improvement > 0) return 'stroke-emerald-500 dark:stroke-emerald-400';
  if (improvement < 0) return 'stroke-red-500 dark:stroke-red-400';
  return 'stroke-slate-400 dark:stroke-slate-500'; // flat
}

/**
 * Get dot color based on iteration status
 */
function getDotColor(
  status: 'pending' | 'active' | 'completed',
  score: number | null,
  targetScore: number
): string {
  if (status === 'pending') {
    return 'fill-slate-300 dark:fill-slate-600';
  }
  if (status === 'active') {
    return 'fill-blue-500 dark:fill-blue-400';
  }
  // completed
  if (score === null) return 'fill-slate-400 dark:fill-slate-500';
  if (score >= targetScore) return 'fill-emerald-500 dark:fill-emerald-400';
  if (score >= 0.75) return 'fill-yellow-500 dark:fill-yellow-400';
  return 'fill-red-500 dark:fill-red-400';
}

export function IterationProgressChart({
  iterations,
  initialScore,
  targetScore,
  className,
}: IterationProgressChartProps) {
  // Chart dimensions
  const width = 300;
  const height = 40;
  const padding = { left: 10, right: 10, top: 5, bottom: 5 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Build data points: [initial, iter1End, iter2End, iter3End]
  const dataPoints: Array<{
    x: number;
    y: number;
    iteration: number; // 0 = initial, 1-3 = iterations
    score: number;
    status: 'pending' | 'active' | 'completed' | 'initial';
    improvement: number | null;
  }> = [];

  // Initial point (iteration 0)
  dataPoints.push({
    x: padding.left,
    y: 0, // will be scaled
    iteration: 0,
    score: initialScore,
    status: 'initial',
    improvement: null,
  });

  // Iteration points (1-based)
  iterations.forEach((iter, idx) => {
    const x = padding.left + ((idx + 1) / iterations.length) * chartWidth;
    const score = iter.endScore ?? iter.startScore; // use start if not completed
    dataPoints.push({
      x,
      y: 0, // will be scaled
      iteration: iter.iterationNumber,
      score,
      status: iter.status,
      improvement: iter.improvement,
    });
  });

  // Scale Y values (0-1 score range -> chartHeight)
  const minScore = 0;
  const maxScore = 1;
  const scoreRange = maxScore - minScore;

  dataPoints.forEach((point) => {
    // Invert Y (SVG top-left origin)
    const normalizedScore = (point.score - minScore) / scoreRange;
    point.y = padding.top + chartHeight - normalizedScore * chartHeight;
  });

  // Target threshold line Y position
  const targetY =
    padding.top + chartHeight - ((targetScore - minScore) / scoreRange) * chartHeight;

  return (
    <TooltipProvider>
      <div className={cn('w-full max-w-sm', className)}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-10"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Target threshold line (dashed) */}
          <line
            x1={padding.left}
            y1={targetY}
            x2={width - padding.right}
            y2={targetY}
            className="stroke-slate-300 dark:stroke-slate-600"
            strokeWidth="1"
            strokeDasharray="2,2"
          />

          {/* Line segments connecting points */}
          {dataPoints.map((point, idx) => {
            if (idx === 0) return null; // no line before first point
            const prevPoint = dataPoints[idx - 1];
            const improvement = point.improvement ?? 0;
            const lineColorClass = getLineColor(improvement);

            return (
              <motion.line
                key={`line-${idx}`}
                x1={prevPoint.x}
                y1={prevPoint.y}
                x2={point.x}
                y2={point.y}
                className={cn(lineColorClass)}
                strokeWidth="2"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.3, delay: idx * 0.1 }}
              />
            );
          })}

          {/* Data points (dots) */}
          {dataPoints.map((point, idx) => {
            const isActive = point.status === 'active';
            const isInitial = point.status === 'initial';
            const isPending = point.status === 'pending';
            const dotColor = getDotColor(point.status as any, point.score, targetScore);

            const tooltipContent = isInitial
              ? `Начальный балл: ${point.score.toFixed(2)}`
              : `Итерация ${point.iteration}: ${point.score.toFixed(2)}${
                  point.improvement !== null
                    ? ` (${point.improvement > 0 ? '+' : ''}${point.improvement.toFixed(2)})`
                    : ''
                }`;

            return (
              <Tooltip key={`point-${idx}`}>
                <TooltipTrigger asChild>
                  <motion.circle
                    cx={point.x}
                    cy={point.y}
                    r={isActive ? 5 : isPending ? 3 : 4}
                    className={cn(dotColor, 'cursor-pointer')}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.2, delay: idx * 0.1 }}
                    whileHover={{ scale: 1.3 }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <div className="space-y-0.5">
                    <p className="font-medium">{tooltipContent}</p>
                    {!isInitial && (
                      <p className="text-slate-400">
                        {point.status === 'pending'
                          ? 'Ожидание'
                          : point.status === 'active'
                          ? 'В процессе'
                          : 'Завершена'}
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Active indicator ring (pulsing) */}
          {dataPoints.map((point, idx) => {
            if (point.status !== 'active') return null;
            return (
              <motion.circle
                key={`ring-${idx}`}
                cx={point.x}
                cy={point.y}
                r={7}
                className="stroke-blue-500 dark:stroke-blue-400 fill-none"
                strokeWidth="1.5"
                initial={{ scale: 0.8, opacity: 1 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  ease: 'easeOut',
                }}
              />
            );
          })}
        </svg>

        {/* Legend */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-1 px-2">
          <span>Начало: {initialScore.toFixed(2)}</span>
          <span className="text-slate-400">Цель: {targetScore.toFixed(2)}</span>
          {iterations.length > 0 && iterations[iterations.length - 1].endScore !== null && (
            <span>
              Текущий:{' '}
              <span
                className={cn(
                  getScoreColor(
                    iterations[iterations.length - 1].endScore!,
                    targetScore
                  )
                )}
              >
                {iterations[iterations.length - 1].endScore!.toFixed(2)}
              </span>
            </span>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
