'use client';

import React, { useMemo } from 'react';
import { LessonMatrixRow } from '@megacampus/shared-types';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { SegmentedPillTrack } from '../stage6/dashboard/SegmentedPillTrack';
import { Eye, Play, Pause, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * LessonMatrix - High-density table for lesson list with pipeline status
 *
 * Shows all lessons in a module with:
 * - Lesson number and title
 * - Pipeline status (MicroStepper with 5 dots)
 * - Quality score (0.XX or "—" if not evaluated)
 * - Cost in USD
 * - Action buttons (View/Pause/Retry based on status)
 *
 * Row states:
 * - Pending: gray text
 * - Active: blue highlight, bold
 * - Completed: normal
 * - Error: red text with error icon
 *
 * Features:
 * - Click row to open lesson inspector
 * - Action buttons for prioritize/pause/view/retry
 * - Footer row with summary statistics
 * - Dark mode support
 *
 * Used in: Stage 6 Module Dashboard
 */

interface LessonMatrixProps {
  /** List of lessons to display */
  lessons: LessonMatrixRow[];
  /** Callback when clicking a lesson row */
  onLessonClick: (lessonId: string) => void;
  /** Callback for action buttons */
  onLessonAction: (lessonId: string, action: 'view' | 'retry' | 'pause' | 'play') => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format cost as USD currency
 */
function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Format quality score as 0.XX or "—"
 */
function formatQuality(score: number | null): string {
  if (score === null) return '—';
  return score.toFixed(2);
}

/**
 * Get row styling based on lesson status
 */
function getRowClassName(status: LessonMatrixRow['status']): string {
  switch (status) {
    case 'pending':
      return 'text-slate-400 dark:text-slate-500';
    case 'active':
      return 'bg-blue-50 dark:bg-blue-950/30 font-semibold text-blue-900 dark:text-blue-100';
    case 'completed':
      return '';
    case 'error':
      return 'text-red-600 dark:text-red-400';
  }
}

/**
 * Get action button based on lesson status
 */
function ActionButton({
  lesson,
  onClick,
}: {
  lesson: LessonMatrixRow;
  onClick: (action: 'view' | 'retry' | 'pause' | 'play') => void;
}) {
  switch (lesson.status) {
    case 'pending':
      return (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onClick('play');
          }}
          title="Приоритезировать"
          className="h-8 w-8"
        >
          <Play className="h-4 w-4" />
        </Button>
      );
    case 'active':
      return (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onClick('pause');
          }}
          title="Приостановить"
          className="h-8 w-8"
        >
          <Pause className="h-4 w-4" />
        </Button>
      );
    case 'completed':
      return (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onClick('view');
          }}
          title="Просмотр"
          className="h-8 w-8"
        >
          <Eye className="h-4 w-4" />
        </Button>
      );
    case 'error':
      return (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onClick('retry');
          }}
          title="Повторить"
          className="h-8 w-8"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      );
  }
}

/**
 * Calculate summary statistics
 */
function calculateSummary(lessons: LessonMatrixRow[]) {
  const totalCost = lessons.reduce((sum, lesson) => sum + lesson.costUsd, 0);
  const completedLessons = lessons.filter((l) => l.qualityScore !== null);
  const avgQuality =
    completedLessons.length > 0
      ? completedLessons.reduce((sum, l) => sum + (l.qualityScore || 0), 0) / completedLessons.length
      : null;

  return {
    totalLessons: lessons.length,
    totalCost,
    avgQuality,
  };
}

export function LessonMatrix({ lessons, onLessonClick, onLessonAction, className }: LessonMatrixProps) {
  const summary = useMemo(() => calculateSummary(lessons), [lessons]);

  return (
    <div className={cn('rounded-lg border border-slate-200 dark:border-slate-700', className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12 text-center">#</TableHead>
            <TableHead>Название</TableHead>
            <TableHead className="w-40">Pipeline</TableHead>
            <TableHead className="w-24 text-center">Качество</TableHead>
            <TableHead className="w-24 text-right">Стоим.</TableHead>
            <TableHead className="w-20 text-center">Действие</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lessons.map((lesson) => (
            <TableRow
              key={lesson.lessonId}
              onClick={() => onLessonClick(lesson.lessonId)}
              className={cn(
                'cursor-pointer transition-colors',
                getRowClassName(lesson.status),
                'hover:bg-slate-100 dark:hover:bg-slate-800',
              )}
            >
              <TableCell className="text-center font-mono text-sm">
                {lesson.lessonNumber}
              </TableCell>
              <TableCell className="font-medium">
                <div className="truncate max-w-xs" title={lesson.title}>
                  {lesson.title}
                </div>
              </TableCell>
              <TableCell>
                <SegmentedPillTrack
                  pipelineState={lesson.pipelineState}
                  className="h-2"
                />
              </TableCell>
              <TableCell className="text-center font-mono">
                {formatQuality(lesson.qualityScore)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatCost(lesson.costUsd)}
              </TableCell>
              <TableCell className="text-center">
                <ActionButton
                  lesson={lesson}
                  onClick={(action) => onLessonAction(lesson.lessonId, action)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={6} className="text-center">
              <div className="flex items-center justify-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
                <span>Всего: {summary.totalLessons} уроков</span>
                <span className="text-slate-400 dark:text-slate-600">•</span>
                <span>{formatCost(summary.totalCost)}</span>
                {summary.avgQuality !== null && (
                  <>
                    <span className="text-slate-400 dark:text-slate-600">•</span>
                    <span>Среднее качество: {formatQuality(summary.avgQuality)}</span>
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
