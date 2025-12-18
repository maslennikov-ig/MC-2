'use client';

import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2,
  Circle,
  XCircle,
  Clock,
  Loader2,
  DollarSign,
  Zap,
  Eye,
  PlayCircle,
  RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NodeStatus } from '@megacampus/shared-types';

interface LessonSummary {
  id: string;
  title: string;
  status: NodeStatus;
  duration?: number;
  tokens?: number;
}

interface ModuleSummaryViewProps {
  data: {
    moduleId?: string;
    title?: string;
    lessons?: LessonSummary[];
    totalTokens?: number;
    totalCost?: number;
    totalDuration?: number;
    outputData?: Record<string, unknown>;
  };
  locale?: 'ru' | 'en';
  courseId?: string;
  readOnly?: boolean;
}

const translations = {
  ru: {
    title: 'Обзор модуля',
    description: 'Статус и метрики всех уроков',
    progress: 'Прогресс',
    lessons: 'Уроки',
    totalLessons: 'Всего уроков',
    completed: 'Завершено',
    inProgress: 'В процессе',
    pending: 'Ожидает',
    failed: 'Ошибки',
    metrics: 'Метрики',
    totalTokens: 'Всего токенов',
    totalCost: 'Общая стоимость',
    totalDuration: 'Общее время',
    actions: 'Действия',
    generateAll: 'Сгенерировать все',
    retryFailed: 'Повторить ошибки',
    viewLesson: 'Просмотр',
    status: 'Статус',
    readOnly: 'Режим просмотра',
    noLessons: 'Уроки не найдены',
  },
  en: {
    title: 'Module Summary',
    description: 'Status and metrics for all lessons',
    progress: 'Progress',
    lessons: 'Lessons',
    totalLessons: 'Total Lessons',
    completed: 'Completed',
    inProgress: 'In Progress',
    pending: 'Pending',
    failed: 'Failed',
    metrics: 'Metrics',
    totalTokens: 'Total Tokens',
    totalCost: 'Total Cost',
    totalDuration: 'Total Duration',
    actions: 'Actions',
    generateAll: 'Generate All',
    retryFailed: 'Retry Failed',
    viewLesson: 'View',
    status: 'Status',
    readOnly: 'View Only',
    noLessons: 'No lessons found',
  },
};

const statusIcons = {
  pending: Circle,
  active: Loader2,
  completed: CheckCircle2,
  error: XCircle,
  awaiting: Clock,
  skipped: Circle,
};

const statusColors = {
  pending: 'text-slate-400',
  active: 'text-blue-500 animate-spin',
  completed: 'text-green-500',
  error: 'text-red-500',
  awaiting: 'text-amber-500',
  skipped: 'text-slate-300',
};

const formatDuration = (ms?: number): string => {
  if (!ms) return 'N/A';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
};

const formatTokens = (tokens?: number): string => {
  if (!tokens) return 'N/A';
  return tokens.toLocaleString();
};

const formatCost = (cost?: number): string => {
  if (!cost) return 'N/A';
  return `$${cost.toFixed(4)}`;
};

export function ModuleSummaryView({
  data,
  locale = 'ru',
  courseId,
  readOnly = false
}: ModuleSummaryViewProps) {
  const t = translations[locale];

  // Extract lessons from various possible locations
  const lessons: LessonSummary[] = data.lessons ||
                                   (data.outputData?.lessons as LessonSummary[]) ||
                                   [];

  // Calculate statistics
  const stats = useMemo(() => {
    const total = lessons.length;
    const completed = lessons.filter(l => l.status === 'completed').length;
    const inProgress = lessons.filter(l => l.status === 'active').length;
    const pending = lessons.filter(l => l.status === 'pending').length;
    const failed = lessons.filter(l => l.status === 'error').length;
    const progressPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      inProgress,
      pending,
      failed,
      progressPercentage,
    };
  }, [lessons]);

  if (lessons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Circle className="w-8 h-8 mb-2 text-slate-400" />
        <p className="text-sm font-medium">{t.noLessons}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      {/* Read-only banner */}
      {readOnly && (
        <div className="mb-4 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-700 dark:text-blue-300">
          <Eye className="inline-block w-4 h-4 mr-2" />
          {t.readOnly}
        </div>
      )}

      {/* Progress Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{t.progress}</CardTitle>
          <CardDescription>
            {stats.completed} / {stats.total} {t.lessons.toLowerCase()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={stats.progressPercentage} className="h-2" />

          {/* Status Badges */}
          <div className="flex flex-wrap gap-2">
            {stats.completed > 0 && (
              <Badge variant="default" className="text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {stats.completed} {t.completed}
              </Badge>
            )}
            {stats.inProgress > 0 && (
              <Badge variant="secondary" className="text-xs">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                {stats.inProgress} {t.inProgress}
              </Badge>
            )}
            {stats.pending > 0 && (
              <Badge variant="outline" className="text-xs">
                <Circle className="w-3 h-3 mr-1" />
                {stats.pending} {t.pending}
              </Badge>
            )}
            {stats.failed > 0 && (
              <Badge variant="destructive" className="text-xs">
                <XCircle className="w-3 h-3 mr-1" />
                {stats.failed} {t.failed}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Metrics Card */}
      {(data.totalTokens || data.totalCost || data.totalDuration) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t.metrics}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              {data.totalDuration !== undefined && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Clock className="w-3 h-3" />
                    {t.totalDuration}
                  </div>
                  <div className="font-mono font-medium">{formatDuration(data.totalDuration)}</div>
                </div>
              )}
              {data.totalTokens !== undefined && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Zap className="w-3 h-3" />
                    {t.totalTokens}
                  </div>
                  <div className="font-mono font-medium">{formatTokens(data.totalTokens)}</div>
                </div>
              )}
              {data.totalCost !== undefined && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <DollarSign className="w-3 h-3" />
                    {t.totalCost}
                  </div>
                  <div className="font-mono font-medium">{formatCost(data.totalCost)}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lessons List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            {t.lessons} ({lessons.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {lessons.map((lesson, idx) => {
              const StatusIcon = statusIcons[lesson.status] || Circle;
              const statusColor = statusColors[lesson.status] || 'text-slate-400';

              return (
                <div
                  key={lesson.id || idx}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    "bg-white dark:bg-slate-800",
                    "hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  )}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <StatusIcon className={cn("w-4 h-4 flex-shrink-0", statusColor)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{lesson.title}</p>
                      {(lesson.duration !== undefined || lesson.tokens !== undefined) && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          {lesson.duration !== undefined && (
                            <span className="font-mono">{formatDuration(lesson.duration)}</span>
                          )}
                          {lesson.tokens !== undefined && (
                            <span className="font-mono">{formatTokens(lesson.tokens)} tokens</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {lesson.status}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Batch Actions */}
      {!readOnly && courseId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t.actions}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled>
                <PlayCircle className="w-4 h-4 mr-2" />
                {t.generateAll}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({locale === 'ru' ? 'скоро' : 'coming soon'})
                </span>
              </Button>
              {stats.failed > 0 && (
                <Button variant="outline" size="sm" disabled>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  {t.retryFailed}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({locale === 'ru' ? 'скоро' : 'coming soon'})
                  </span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Skeleton loader
export const ModuleSummaryViewSkeleton = () => (
  <div className="space-y-4 p-2">
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-3 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-2 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  </div>
);
