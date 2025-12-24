'use client';

import React, { useMemo, memo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Cog,
  Brain,
  User,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ClipboardCheck,
  FileText,
  Layers,
  CheckCircle,
  ListChecks,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { ru as ruLocale, enUS as enLocale } from 'date-fns/locale';
import {
  useGenerationRealtime,
  type GenerationTrace,
} from '@/components/generation-monitoring/realtime-provider';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import type {
  Stage5ActivityTabProps,
  Stage5ActivityEvent,
  Stage5ActivityPhaseGroup,
  ActivityActor,
} from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Phase group icons for accordion headers
 * Using orange themed icons to match Stage 5's color scheme
 */
const PHASE_GROUP_ICONS: Record<Stage5ActivityPhaseGroup, LucideIcon> = {
  validation: ClipboardCheck,
  metadata: FileText,
  sections: Layers,
  quality: CheckCircle,
  finalization: ListChecks,
};

/**
 * Phase group colors - orange/amber theme for Stage 5
 */
const PHASE_GROUP_COLORS: Record<Stage5ActivityPhaseGroup, string> = {
  validation: 'text-slate-500 dark:text-slate-400',
  metadata: 'text-blue-500 dark:text-blue-400',
  sections: 'text-orange-500 dark:text-orange-400',
  quality: 'text-emerald-500 dark:text-emerald-400',
  finalization: 'text-violet-500 dark:text-violet-400',
};

/**
 * Phase group display order
 */
const PHASE_GROUP_ORDER: Stage5ActivityPhaseGroup[] = [
  'validation',
  'metadata',
  'sections',
  'quality',
  'finalization',
];

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

/**
 * Renders actor icon based on event actor type
 * Icons are decorative - meaning is conveyed by adjacent text
 */
function ActorIcon({ actor }: { actor: ActivityActor }) {
  switch (actor) {
    case 'user':
      return <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />;
    case 'ai':
      return <Brain className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" aria-hidden="true" />;
    default:
      return <Cog className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />;
  }
}

/**
 * Renders status icon based on event type
 * Icons are decorative - meaning is conveyed by adjacent text and styling
 */
function StatusIcon({ type }: { type: Stage5ActivityEvent['type'] }) {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />;
    case 'error':
      return <XCircle className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />;
    case 'warning':
      return <AlertCircle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />;
    case 'progress':
      return <Activity className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />;
  }
}

/**
 * Single activity event row
 */
interface ActivityEventRowProps {
  event: Stage5ActivityEvent;
  locale: 'ru' | 'en';
  previousEventTime?: Date;
}

const ActivityEventRow = memo<ActivityEventRowProps>(function ActivityEventRow({
  event,
  locale,
  previousEventTime,
}) {
  const dateLocale = locale === 'ru' ? ruLocale : enLocale;

  // Format timestamp
  const timeStr = format(new Date(event.timestamp), 'HH:mm:ss', { locale: dateLocale });

  // Calculate delta time from previous event
  const deltaMs = previousEventTime
    ? new Date(event.timestamp).getTime() - previousEventTime.getTime()
    : undefined;

  const deltaStr =
    deltaMs !== undefined && deltaMs > 0 ? `+${(deltaMs / 1000).toFixed(1)}s` : null;

  // Progress events get orange highlight
  const isProgress = event.type === 'progress';

  return (
    <div
      className={cn(
        'flex items-start gap-3 py-2 px-3 rounded-md transition-colors',
        event.type === 'error' && 'bg-red-50 dark:bg-red-950/20',
        event.type === 'success' && 'bg-green-50/50 dark:bg-green-950/10',
        event.type === 'warning' && 'bg-amber-50/50 dark:bg-amber-950/10',
        isProgress && 'bg-orange-50/70 dark:bg-orange-950/20 border-l-2 border-orange-500'
      )}
    >
      {/* Status Icon */}
      <div className="mt-0.5 flex-shrink-0">
        <StatusIcon type={event.type} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <ActorIcon actor={event.actor} />
          <span
            className={cn(
              'text-sm',
              isProgress ? 'text-orange-900 dark:text-orange-100 font-medium' : 'text-foreground'
            )}
          >
            {event.message}
          </span>
        </div>

        {/* Optional details */}
        {event.details && Object.keys(event.details).length > 0 && (
          <div className="mt-1 text-xs text-muted-foreground">
            {Object.entries(event.details).map(([key, value]) => (
              <span key={key} className="mr-3">
                <span className="font-medium">{key}:</span> {String(value)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="flex-shrink-0 text-right">
        <span className="text-xs text-muted-foreground font-mono">{timeStr}</span>
        {deltaStr && (
          <div className="text-xs text-muted-foreground/70 font-mono">{deltaStr}</div>
        )}
      </div>
    </div>
  );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * Stage5ActivityTab Component
 *
 * "Assembly Journal" - Shows activity timeline grouped by phase:
 * - Validation: validate_input events
 * - Metadata: generate_metadata events
 * - Sections: generate_sections events (with batch progress)
 * - Quality: validate_quality events
 * - Finalization: validate_lessons events
 *
 * Color theme: Orange/Amber (energy, creativity, transformation)
 */
export const Stage5ActivityTab = memo<Stage5ActivityTabProps>(function Stage5ActivityTab({
  nodeId,
  courseId: _courseId,
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage5!;

  // Get traces from realtime provider
  const { traces } = useGenerationRealtime();

  // Filter and transform traces to activity events
  const events = useMemo((): Stage5ActivityEvent[] => {
    if (!traces || traces.length === 0) {
      return generateSyntheticEvents(locale);
    }

    // Filter traces for this node/stage
    const relevantTraces = traces.filter((trace) => {
      // Match by nodeId if provided
      if (nodeId) {
        // nodeId format: "stage_5" or "stage_5_<something>"
        if (nodeId.startsWith('stage_5') && trace.stage === 'stage_5') {
          return true;
        }
        // Also check lesson_id for more specific filtering
        if (trace.lesson_id === nodeId) {
          return true;
        }
      }
      // Fallback: match Stage 5 traces
      return trace.stage === 'stage_5';
    });

    if (relevantTraces.length === 0) {
      return generateSyntheticEvents(locale);
    }

    // Sort by timestamp ascending for proper delta calculation
    const sortedTraces = [...relevantTraces].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Transform traces to events
    return sortedTraces.map((trace): Stage5ActivityEvent => {
      return {
        id: trace.id,
        timestamp: new Date(trace.created_at),
        actor: mapActorFromTrace(trace),
        type: mapTypeFromTrace(trace),
        message: trace.step_name || trace.phase || 'Activity',
        phase: mapPhaseGroupFromTrace(trace),
        details: extractDetailsFromTrace(trace),
      };
    });
  }, [traces, nodeId, locale]);

  // Group events by phase
  const eventsByPhase = useMemo(() => {
    const groups: Record<Stage5ActivityPhaseGroup, Stage5ActivityEvent[]> = {
      validation: [],
      metadata: [],
      sections: [],
      quality: [],
      finalization: [],
    };

    for (const event of events) {
      groups[event.phase].push(event);
    }

    return groups;
  }, [events]);

  // Calculate phase statistics
  const phaseStats = useMemo(() => {
    return PHASE_GROUP_ORDER.map((phase) => ({
      phase,
      count: eventsByPhase[phase].length,
      hasErrors: eventsByPhase[phase].some((e) => e.type === 'error'),
      hasWarnings: eventsByPhase[phase].some((e) => e.type === 'warning'),
      hasProgress: eventsByPhase[phase].some((e) => e.type === 'progress'),
    }));
  }, [eventsByPhase]);

  // Determine which accordion sections to open by default
  const defaultOpenSections = useMemo(() => {
    // Open sections with content, prioritize sections (main phase)
    const sectionsWithContent = phaseStats.filter((s) => s.count > 0).map((s) => s.phase);
    if (sectionsWithContent.includes('sections')) {
      return ['sections'];
    }
    return sectionsWithContent.length > 0 ? [sectionsWithContent[0]] : ['sections'];
  }, [phaseStats]);

  // Translation helper for phase labels
  const getPhaseLabel = (phase: Stage5ActivityPhaseGroup): string => {
    const labelKey = `phase${phase.charAt(0).toUpperCase() + phase.slice(1)}` as keyof typeof t;
    return t[labelKey]?.[locale] ?? phase;
  };

  // Empty state
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Activity className="h-12 w-12 text-orange-300 dark:text-orange-700 mb-4" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {t.emptyActivity?.[locale] ?? 'No events recorded yet'}
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="p-1 pr-4">
        <Accordion type="multiple" defaultValue={defaultOpenSections} className="space-y-2">
          {phaseStats.map(({ phase, count, hasErrors, hasWarnings, hasProgress }) => {
            const PhaseIcon = PHASE_GROUP_ICONS[phase];
            const phaseEvents = eventsByPhase[phase];

            return (
              <AccordionItem
                key={phase}
                value={phase}
                className="border rounded-lg overflow-hidden"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                  <div className="flex items-center gap-3 w-full">
                    <PhaseIcon className={cn('h-4 w-4', PHASE_GROUP_COLORS[phase])} aria-hidden="true" />
                    <span className="font-medium text-sm">{getPhaseLabel(phase)}</span>
                    <div className="ml-auto flex items-center gap-2">
                      {hasErrors && (
                        <Badge variant="destructive" className="text-xs">
                          Error
                        </Badge>
                      )}
                      {hasWarnings && !hasErrors && (
                        <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400">
                          Warning
                        </Badge>
                      )}
                      {hasProgress && !hasErrors && !hasWarnings && (
                        <Badge
                          variant="outline"
                          className="text-xs text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-700"
                        >
                          {locale === 'ru' ? 'Прогресс' : 'Progress'}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {count}
                      </Badge>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-2">
                  {phaseEvents.length > 0 ? (
                    <div className="space-y-1">
                      {phaseEvents.map((event, index) => (
                        <ActivityEventRow
                          key={event.id}
                          event={event}
                          locale={locale}
                          previousEventTime={index > 0 ? phaseEvents[index - 1].timestamp : undefined}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {t.noEventsInPhase?.[locale] ?? 'No events in this phase'}
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </ScrollArea>
  );
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Map trace to actor type
 * Uses multiple heuristics for accurate actor detection
 */
function mapActorFromTrace(trace: GenerationTrace): ActivityActor {
  const stepName = (trace.step_name || '').toLowerCase();
  const phase = (trace.phase || '').toLowerCase();

  // User actions - check step_name/phase for user-related keywords
  if (
    stepName.includes('user') ||
    stepName.includes('manual') ||
    stepName.includes('override') ||
    stepName.includes('approve') ||
    stepName.includes('confirm') ||
    phase.includes('user') ||
    phase.includes('manual')
  ) {
    return 'user';
  }

  // AI actions - check if a model was used or AI-related keywords
  if (
    trace.model_used ||
    stepName.includes('ai') ||
    stepName.includes('generate') ||
    stepName.includes('metadata') ||
    stepName.includes('sections') ||
    stepName.includes('validate')
  ) {
    return 'ai';
  }

  // Default to system for automated actions
  return 'system';
}

/**
 * Map trace to event type
 */
function mapTypeFromTrace(trace: GenerationTrace): Stage5ActivityEvent['type'] {
  if (trace.error_data) return 'error';

  const stepName = (trace.step_name || '').toLowerCase();
  const phase = (trace.phase || '').toLowerCase();

  // Progress events - batch generation updates
  if (
    stepName.includes('progress') ||
    stepName.includes('batch') ||
    stepName.includes('generating') ||
    phase.includes('batch')
  ) {
    return 'progress';
  }

  // Warning events
  if (stepName.includes('warning') || stepName.includes('caution')) {
    return 'warning';
  }

  // Success events
  if (trace.output_data && !trace.error_data) return 'success';

  return 'info';
}

/**
 * Map trace phase to activity phase group
 */
function mapPhaseGroupFromTrace(trace: GenerationTrace): Stage5ActivityPhaseGroup {
  const content = (trace.step_name || trace.phase || '').toLowerCase();

  // Keyword-based mapping
  if (content.includes('validate_input') || content.includes('validation') || content.includes('schema')) {
    return 'validation';
  }
  if (content.includes('metadata') || content.includes('generate_metadata')) {
    return 'metadata';
  }
  if (content.includes('sections') || content.includes('generate_sections') || content.includes('batch')) {
    return 'sections';
  }
  if (content.includes('quality') || content.includes('validate_quality') || content.includes('embedding')) {
    return 'quality';
  }
  if (content.includes('finalization') || content.includes('validate_lessons') || content.includes('minimum')) {
    return 'finalization';
  }

  // Default to validation
  return 'validation';
}

/**
 * Extract relevant details from trace for display
 */
function extractDetailsFromTrace(trace: GenerationTrace): Record<string, unknown> | undefined {
  const details: Record<string, unknown> = {};

  if (trace.model_used) {
    details.model = trace.model_used;
  }
  if (trace.tokens_used) {
    details.tokens = trace.tokens_used;
  }
  if (trace.duration_ms) {
    details.duration = `${(trace.duration_ms / 1000).toFixed(2)}s`;
  }
  if (trace.quality_score !== undefined) {
    details.quality = `${Math.round(trace.quality_score * 100)}%`;
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

/**
 * Generate mock events for demo/empty state
 */
function generateSyntheticEvents(locale: 'ru' | 'en'): Stage5ActivityEvent[] {
  const now = new Date();
  const t = GRAPH_TRANSLATIONS.stage5!;

  return [
    {
      id: 'mock-1',
      timestamp: new Date(now.getTime() - 12000),
      actor: 'system',
      type: 'success',
      message: t.insightValidationPassed?.[locale] ?? (locale === 'ru' ? 'Валидация пройдена' : 'Validation passed'),
      phase: 'validation',
    },
    {
      id: 'mock-2',
      timestamp: new Date(now.getTime() - 10000),
      actor: 'ai',
      type: 'success',
      message:
        t.insightMetadataGenerated?.[locale]
          ?.replace('{outcomes}', '5') ??
        (locale === 'ru' ? 'Метаданные сгенерированы: 5 целей обучения' : 'Metadata generated: 5 learning outcomes'),
      phase: 'metadata',
      details: { tokens: 2100 },
    },
    {
      id: 'mock-3',
      timestamp: new Date(now.getTime() - 8000),
      actor: 'ai',
      type: 'progress',
      message:
        t.insightBatchStarted?.[locale]
          ?.replace('{batch}', '1')
          .replace('{sections}', '3') ??
        (locale === 'ru' ? 'Запущен батч 1: 3 секций' : 'Batch 1 started: 3 sections'),
      phase: 'sections',
    },
    {
      id: 'mock-4',
      timestamp: new Date(now.getTime() - 5000),
      actor: 'ai',
      type: 'progress',
      message:
        t.insightBatchCompleted?.[locale]
          ?.replace('{batch}', '1')
          .replace('{time}', '3.2') ??
        (locale === 'ru' ? 'Батч 1 завершён за 3.2с' : 'Batch 1 completed in 3.2s'),
      phase: 'sections',
      details: { tokens: 5400 },
    },
    {
      id: 'mock-5',
      timestamp: new Date(now.getTime() - 3000),
      actor: 'system',
      type: 'success',
      message:
        t.insightQualityScore?.[locale]
          ?.replace('{score}', '92')
          .replace('{threshold}', '85') ??
        (locale === 'ru' ? 'Оценка качества: 92% (порог: 85%)' : 'Quality score: 92% (threshold: 85%)'),
      phase: 'quality',
    },
    {
      id: 'mock-6',
      timestamp: new Date(now.getTime() - 1000),
      actor: 'system',
      type: 'success',
      message:
        t.insightLessonsValidated?.[locale]
          ?.replace('{count}', '12')
          .replace('{min}', '10') ??
        (locale === 'ru' ? 'Проверено 12 уроков (минимум: 10)' : 'Validated 12 lessons (minimum: 10)'),
      phase: 'finalization',
    },
  ];
}

export default Stage5ActivityTab;
