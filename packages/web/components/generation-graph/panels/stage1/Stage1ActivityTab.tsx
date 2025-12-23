'use client';

import React, { useMemo, memo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { User, Cog, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru as ruLocale, enUS as enLocale } from 'date-fns/locale';
import {
  useGenerationRealtime,
  GenerationTrace,
} from '@/components/generation-monitoring/realtime-provider';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { Stage1ActivityTabProps, ActivityEvent, ActivityActor, Stage1InputData, Stage1OutputData } from './types';

/**
 * Detects if a trace represents a user action or a system action
 */
function detectActor(trace: GenerationTrace): ActivityActor {
  // User actions typically involve user-initiated phases or steps
  const userIndicators = [
    'user',
    'upload',
    'create',
    'submit',
    'edit',
    'update',
    'input',
  ];

  const phase = trace.phase?.toLowerCase() || '';
  const stepName = trace.step_name?.toLowerCase() || '';

  for (const indicator of userIndicators) {
    if (phase.includes(indicator) || stepName.includes(indicator)) {
      return 'user';
    }
  }

  return 'system';
}

/**
 * Determines the event type based on trace data
 */
function determineEventType(
  trace: GenerationTrace
): 'info' | 'success' | 'warning' | 'error' {
  if (trace.error_data) {
    return 'error';
  }

  // Check for warnings in output data
  if (trace.output_data?.warnings || trace.output_data?.warning) {
    return 'warning';
  }

  // If we have output data, it's a success
  if (trace.output_data) {
    return 'success';
  }

  return 'info';
}

/**
 * Translates trace data to a human-readable message
 */
function translateEventMessage(
  trace: GenerationTrace,
  locale: 'ru' | 'en'
): string {
  const t = GRAPH_TRANSLATIONS.stage1;

  // Map common step names to translated messages
  const stepMessageMap: Record<string, { ru: string; en: string }> = {
    course_created: { ru: 'Курс создан', en: 'Course created' },
    topic_updated: { ru: 'Тема обновлена', en: 'Topic updated' },
    files_uploaded: { ru: 'Файлы загружены', en: 'Files uploaded' },
    file_upload: { ru: 'Файлы загружены', en: 'Files uploaded' },
    validation_passed: { ru: 'Валидация пройдена', en: 'Validation passed' },
    validation_failed: {
      ru: 'Валидация не пройдена',
      en: 'Validation failed',
    },
    triggered_stage_2: { ru: 'Запущен Этап 2', en: 'Triggered Stage 2' },
    stage_2_triggered: { ru: 'Запущен Этап 2', en: 'Triggered Stage 2' },
    initialization: { ru: 'Инициализация', en: 'Initialization' },
    security_scan: { ru: 'Проверка безопасности', en: 'Security scan' },
    storage_upload: { ru: 'Загрузка в хранилище', en: 'Storage upload' },
    registry: { ru: 'Регистрация курса', en: 'Course registration' },
  };

  // Normalize step name
  const normalizedStep = trace.step_name?.toLowerCase().replace(/\s+/g, '_');

  // Try to find a translation
  if (normalizedStep && stepMessageMap[normalizedStep]) {
    return stepMessageMap[normalizedStep][locale];
  }

  // Fallback: use phase and step_name
  if (trace.phase && trace.step_name) {
    return `${trace.phase}: ${trace.step_name}`;
  }

  // Use translation keys if available
  if (t?.courseCreated && trace.step_name?.includes('create')) {
    return t.courseCreated[locale];
  }
  if (t?.filesUploaded && trace.step_name?.includes('upload')) {
    return t.filesUploaded[locale];
  }
  if (t?.validationPassed && trace.step_name?.includes('validation')) {
    return trace.error_data
      ? t.validationFailed?.[locale] || 'Validation failed'
      : t.validationPassed[locale];
  }

  return trace.step_name || trace.phase || 'Unknown event';
}

/**
 * Converts a GenerationTrace to an ActivityEvent
 */
function traceToActivityEvent(
  trace: GenerationTrace,
  locale: 'ru' | 'en'
): ActivityEvent {
  return {
    id: trace.id,
    timestamp: new Date(trace.created_at),
    actor: detectActor(trace),
    type: determineEventType(trace),
    message: translateEventMessage(trace, locale),
    details: trace.input_data,
  };
}

/**
 * Generates synthetic activity events from Stage 1 course data.
 * Used when no real traces exist (before generation starts).
 */
function generateSyntheticEvents(
  inputData: Stage1InputData | undefined,
  outputData: Stage1OutputData | undefined,
  locale: 'ru' | 'en'
): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const t = GRAPH_TRANSLATIONS.stage1;

  // Event: Course created (from outputData.createdAt)
  if (outputData?.createdAt) {
    events.push({
      id: 'synthetic_course_created',
      timestamp: new Date(outputData.createdAt),
      actor: 'system',
      type: 'success',
      message: t?.courseCreated?.[locale] || 'Course created',
    });
  }

  // Event: Topic set (from inputData.topic)
  if (inputData?.topic && outputData?.createdAt) {
    events.push({
      id: 'synthetic_topic_set',
      timestamp: new Date(new Date(outputData.createdAt).getTime() + 100), // slightly after creation
      actor: 'user',
      type: 'info',
      message: locale === 'ru'
        ? `Тема курса: "${inputData.topic.slice(0, 50)}${inputData.topic.length > 50 ? '...' : ''}"`
        : `Course topic: "${inputData.topic.slice(0, 50)}${inputData.topic.length > 50 ? '...' : ''}"`,
    });
  }

  // Event: Files uploaded (from inputData.files)
  if (inputData?.files && inputData.files.length > 0 && outputData?.createdAt) {
    const fileCount = inputData.files.length;
    events.push({
      id: 'synthetic_files_uploaded',
      timestamp: new Date(new Date(outputData.createdAt).getTime() + 200),
      actor: 'user',
      type: 'success',
      message: locale === 'ru'
        ? `Загружено файлов: ${fileCount}`
        : `Files uploaded: ${fileCount}`,
      details: { fileCount, files: inputData.files.map(f => f.name) },
    });
  }

  // Event: Strategy selected (from inputData.content_strategy)
  if (inputData?.content_strategy && outputData?.createdAt) {
    const strategyLabels: Record<string, { ru: string; en: string }> = {
      auto: { ru: 'Автоматическая', en: 'Automatic' },
      create_from_scratch: { ru: 'Создание с нуля', en: 'Create from scratch' },
      expand_and_enhance: { ru: 'Расширение материалов', en: 'Expand and enhance' },
    };
    const strategyLabel = strategyLabels[inputData.content_strategy]?.[locale] || inputData.content_strategy;
    events.push({
      id: 'synthetic_strategy_set',
      timestamp: new Date(new Date(outputData.createdAt).getTime() + 300),
      actor: 'user',
      type: 'info',
      message: locale === 'ru'
        ? `Выбрана стратегия: ${strategyLabel}`
        : `Strategy selected: ${strategyLabel}`,
    });
  }

  // Event: Course initialized/ready (from outputData.status)
  if (outputData?.status === 'ready' && outputData?.createdAt) {
    events.push({
      id: 'synthetic_initialized',
      timestamp: new Date(new Date(outputData.createdAt).getTime() + 500),
      actor: 'system',
      type: 'success',
      message: t?.validationPassed?.[locale] || 'Validation passed',
    });
  }

  return events;
}

/**
 * Returns the appropriate icon for the event type
 */
function getStatusIcon(type: ActivityEvent['type']) {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case 'error':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'warning':
      return <AlertCircle className="h-3.5 w-3.5 text-amber-500" />;
    default:
      return null;
  }
}

/**
 * Returns the color class for the event message based on actor and type
 */
function getMessageColorClass(
  actor: ActivityActor,
  type: ActivityEvent['type']
): string {
  if (type === 'error') {
    return 'text-red-600 dark:text-red-400';
  }
  if (type === 'success') {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  if (actor === 'user') {
    return 'text-blue-600 dark:text-blue-400';
  }
  return 'text-slate-600 dark:text-slate-400';
}

/**
 * Stage 1 Activity Tab - Audit Trail Timeline
 *
 * Displays a chronological timeline of events with User/System actor distinction.
 * Newest events appear at the top.
 */
export const Stage1ActivityTab = memo<Stage1ActivityTabProps>(function Stage1ActivityTab({
  nodeId,
  courseId: _courseId,
  locale = 'ru',
  inputData,
  outputData,
}) {
  const t = GRAPH_TRANSLATIONS.stage1;
  const dateLocale = locale === 'ru' ? ruLocale : enLocale;

  // Get traces from realtime context - will throw if provider is missing (intentional)
  const { traces } = useGenerationRealtime();

  // Parse inputData and outputData safely
  const parsedInputData = inputData as Stage1InputData | undefined;
  const parsedOutputData = outputData as Stage1OutputData | undefined;

  // Filter and transform traces to activity events, or use synthetic events
  const activities = useMemo(() => {
    if (!nodeId) return [];

    // Safe array access with fallback
    const safeTraces = Array.isArray(traces) ? traces : [];

    // Get real traces for stage_1
    const realActivities = safeTraces
      .filter((trace) => trace.stage === 'stage_1')
      .map((trace) => traceToActivityEvent(trace, locale));

    // If we have real traces, use them
    if (realActivities.length > 0) {
      return realActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    // Otherwise, generate synthetic events from course data
    const syntheticActivities = generateSyntheticEvents(parsedInputData, parsedOutputData, locale);
    return syntheticActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [traces, nodeId, locale, parsedInputData, parsedOutputData]);

  // Empty state
  if (activities.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">
          {t?.noActivity?.[locale] || 'No activity recorded'}
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="relative px-4 py-2">
        {/* Vertical timeline line */}
        <div className="absolute left-[2.25rem] top-0 bottom-0 w-px border-l-2 border-dashed border-slate-200 dark:border-slate-700" />

        <div className="space-y-4">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="relative flex items-start gap-3 pl-2"
            >
              {/* Timestamp - Left side */}
              <div className="w-14 shrink-0 pt-0.5 text-right">
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(activity.timestamp, {
                    addSuffix: false,
                    locale: dateLocale,
                  })}
                </span>
              </div>

              {/* Actor icon - Center (on the timeline) */}
              <div
                className={cn(
                  'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-background',
                  activity.actor === 'user'
                    ? 'border-blue-300 dark:border-blue-600'
                    : 'border-slate-300 dark:border-slate-600'
                )}
              >
                {activity.actor === 'user' ? (
                  <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Cog className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                )}
              </div>

              {/* Event description - Right side */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
                <div className="flex items-center gap-2">
                  {getStatusIcon(activity.type)}
                  <span
                    className={cn(
                      'text-sm font-medium',
                      getMessageColorClass(activity.actor, activity.type)
                    )}
                  >
                    {activity.message}
                  </span>
                </div>

                {/* Actor label */}
                <span className="text-xs text-muted-foreground">
                  {activity.actor === 'user'
                    ? t?.userAction?.[locale] || 'User'
                    : t?.systemAction?.[locale] || 'System'}
                </span>

                {/* Error details if present */}
                {activity.type === 'error' && activity.details && (
                  <div className="mt-1 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
                    {typeof activity.details === 'string'
                      ? activity.details
                      : JSON.stringify(activity.details, null, 2)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
});

export default Stage1ActivityTab;
