'use client';

import React from 'react';
import { Trophy, Layers, BookOpen, ExternalLink, Clock, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/src/i18n/navigation';
import { useTranslation } from '@/lib/generation-graph/useTranslation';
import { cn } from '@/lib/utils';

interface EndNodePanelProps {
  courseSlug?: string;
  courseTitle: string;
  moduleCount: number;
  lessonCount: number;
  isCompleted: boolean;
}

/**
 * Panel content for End Node in NodeDetailsDrawer.
 * Shows course completion status and statistics.
 */
export function EndNodePanel({
  courseSlug,
  courseTitle,
  moduleCount,
  lessonCount,
  isCompleted,
}: EndNodePanelProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full">
      {/* Hero Section */}
      <div className={cn(
        'relative overflow-hidden rounded-xl p-6 mb-6',
        isCompleted
          ? 'bg-gradient-to-br from-emerald-500 to-green-600 dark:from-emerald-600 dark:to-green-700'
          : 'bg-gradient-to-br from-slate-400 to-slate-500 dark:from-slate-600 dark:to-slate-700'
      )}>
        {/* Decorative sparkles for completed state */}
        {isCompleted && (
          <>
            <Sparkles className="absolute top-3 right-3 w-6 h-6 text-yellow-300/50 animate-pulse" />
            <Sparkles className="absolute bottom-4 left-4 w-4 h-4 text-yellow-300/30 animate-pulse delay-75" />
          </>
        )}

        <div className="relative z-10 flex items-center gap-4">
          <div className={cn(
            'flex h-16 w-16 items-center justify-center rounded-full',
            isCompleted
              ? 'bg-white/20 text-white'
              : 'bg-white/10 text-white/80'
          )}>
            {isCompleted ? (
              <Trophy size={32} className="drop-shadow-lg" />
            ) : (
              <Clock size={32} />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm text-white/80 mb-1">
              {t('endNode.completionStatus')}
            </p>
            <h2 className="text-xl font-bold text-white">
              {isCompleted
                ? t('endNode.generationComplete')
                : t('endNode.generationPending')
              }
            </h2>
          </div>
        </div>
      </div>

      {/* Course Title */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          {courseTitle}
        </h3>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className={cn(
          'p-4 rounded-lg border transition-colors',
          isCompleted
            ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700/50'
            : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Layers size={18} className={cn(
              isCompleted
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            )} />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {t('endNode.modules')}
            </span>
          </div>
          <p className={cn(
            'text-2xl font-bold',
            isCompleted
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-slate-700 dark:text-slate-300'
          )}>
            {moduleCount}
          </p>
        </div>

        <div className={cn(
          'p-4 rounded-lg border transition-colors',
          isCompleted
            ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700/50'
            : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'
        )}>
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={18} className={cn(
              isCompleted
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            )} />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {t('endNode.lessons')}
            </span>
          </div>
          <p className={cn(
            'text-2xl font-bold',
            isCompleted
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-slate-700 dark:text-slate-300'
          )}>
            {lessonCount}
          </p>
        </div>
      </div>

      {/* Message */}
      <div className={cn(
        'flex items-start gap-3 p-4 rounded-lg mb-6',
        isCompleted
          ? 'bg-emerald-50 dark:bg-emerald-900/20'
          : 'bg-amber-50 dark:bg-amber-900/20'
      )}>
        <CheckCircle2 size={20} className={cn(
          'mt-0.5 shrink-0',
          isCompleted
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-amber-600 dark:text-amber-400'
        )} />
        <p className={cn(
          'text-sm',
          isCompleted
            ? 'text-emerald-700 dark:text-emerald-300'
            : 'text-amber-700 dark:text-amber-300'
        )}>
          {isCompleted
            ? t('endNode.congratulations')
            : t('endNode.pendingMessage')
          }
        </p>
      </div>

      {/* CTA Button */}
      {isCompleted && courseSlug && (
        <div className="mt-auto">
          <Link href={`/courses/${courseSlug}`}>
            <Button
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500"
              size="lg"
            >
              <span>{t('endNode.viewCourse')}</span>
              <ExternalLink size={16} className="ml-2" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
