'use client';

import React, { useMemo, memo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Settings2,
  Scale,
  UserPen,
  User,
  Cog,
  Bot,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { ru as ruLocale, enUS as enLocale } from 'date-fns/locale';
import {
  useGenerationRealtime,
  GenerationTrace,
} from '@/components/generation-monitoring/realtime-provider';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import type {
  Stage3ActivityTabProps,
  Stage3ActivityEvent,
  ActivityPhaseGroup,
  ActivityActor,
} from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Phase icons mapping for accordion group headers
 */
const PHASE_ICONS: Record<ActivityPhaseGroup, LucideIcon> = {
  setup: Settings2,
  judgment: Scale,
  overrides: UserPen,
};

/**
 * Phase colors for styling
 */
const PHASE_COLORS: Record<ActivityPhaseGroup, string> = {
  setup: 'text-slate-600 dark:text-slate-400',
  judgment: 'text-amber-600 dark:text-amber-400',
  overrides: 'text-blue-600 dark:text-blue-400',
};

/**
 * Phase order for display
 */
const PHASE_ORDER: ActivityPhaseGroup[] = ['setup', 'judgment', 'overrides'];

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
      return <Bot className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" aria-hidden="true" />;
    default:
      return <Cog className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />;
  }
}

/**
 * Renders status icon based on event type
 * Icons are decorative - meaning is conveyed by adjacent text and styling
 */
function StatusIcon({ type }: { type: Stage3ActivityEvent['type'] }) {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />;
    case 'error':
      return <XCircle className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />;
    case 'warning':
      return <AlertCircle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />;
  }
}

/**
 * Single activity event row
 */
interface ActivityEventRowProps {
  event: Stage3ActivityEvent;
  locale: 'ru' | 'en';
}

const ActivityEventRow = memo<ActivityEventRowProps>(function ActivityEventRow({
  event,
  locale,
}) {
  const dateLocale = locale === 'ru' ? ruLocale : enLocale;

  // Format timestamp
  const timeStr = format(new Date(event.timestamp), 'HH:mm:ss', { locale: dateLocale });

  // Format delta time if available
  const deltaStr = event.deltaMs !== undefined && event.deltaMs > 0
    ? `+${(event.deltaMs / 1000).toFixed(1)}s`
    : null;

  return (
    <div
      className={cn(
        'flex items-start gap-3 py-2 px-3 rounded-md transition-colors',
        event.type === 'error' && 'bg-red-50 dark:bg-red-950/20',
        event.type === 'success' && 'bg-green-50/50 dark:bg-green-950/10',
        event.type === 'warning' && 'bg-amber-50/50 dark:bg-amber-950/10'
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
          <span className="text-sm text-foreground">{event.message}</span>
        </div>

        {/* Priority change details */}
        {event.oldPriority && event.newPriority && (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <Badge variant="outline" className="text-xs">
              {event.oldPriority}
            </Badge>
            <span className="text-muted-foreground">→</span>
            <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-900/20">
              {event.newPriority}
            </Badge>
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
 * Stage3ActivityTab Component
 *
 * Shows activity timeline grouped by phase:
 * - Setup: Context loading, strategy selection
 * - AI Judgment: Classification decisions
 * - User Overrides: Manual priority changes
 */
export const Stage3ActivityTab = memo<Stage3ActivityTabProps>(function Stage3ActivityTab({
  nodeId,
  courseId: _courseId,
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage3 as Record<string, { ru: string; en: string }>;

  // Get traces from realtime provider
  const { traces } = useGenerationRealtime();

  // Filter and transform traces to activity events
  const events = useMemo((): Stage3ActivityEvent[] => {
    if (!traces || traces.length === 0) {
      return generateMockEvents(locale);
    }

    // Filter traces for this node/stage
    const relevantTraces = traces.filter((trace) => {
      if (nodeId && trace.lesson_id !== nodeId) return false;
      // Filter for Stage 3 related traces
      return trace.stage === 'stage_3' || trace.phase?.includes('classification');
    });

    if (relevantTraces.length === 0) {
      return generateMockEvents(locale);
    }

    // Transform traces to events
    return relevantTraces.map((trace, index, arr): Stage3ActivityEvent => {
      const prevTrace = index > 0 ? arr[index - 1] : null;
      const deltaMs = prevTrace
        ? new Date(trace.created_at).getTime() - new Date(prevTrace.created_at).getTime()
        : undefined;

      return {
        id: trace.id,
        timestamp: new Date(trace.created_at),
        actor: mapActorFromTrace(trace),
        type: mapTypeFromTrace(trace),
        message: trace.step_name || 'Activity',
        phase: mapPhaseFromTrace(trace),
        deltaMs,
      };
    });
  }, [traces, nodeId, locale]);

  // Group events by phase
  const eventsByPhase = useMemo(() => {
    const groups: Record<ActivityPhaseGroup, Stage3ActivityEvent[]> = {
      setup: [],
      judgment: [],
      overrides: [],
    };

    for (const event of events) {
      groups[event.phase].push(event);
    }

    return groups;
  }, [events]);

  // Calculate phase statistics
  const phaseStats = useMemo(() => {
    return PHASE_ORDER.map((phase) => ({
      phase,
      count: eventsByPhase[phase].length,
      hasErrors: eventsByPhase[phase].some((e) => e.type === 'error'),
      hasWarnings: eventsByPhase[phase].some((e) => e.type === 'warning'),
    }));
  }, [eventsByPhase]);

  // Empty state
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Scale className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-sm text-muted-foreground">
          {t.emptyActivity?.[locale] ?? 'No activity yet'}
        </p>
      </div>
    );
  }

  return (
    <div className="p-1">
      <Accordion type="multiple" defaultValue={['judgment']} className="space-y-2">
        {phaseStats.map(({ phase, count, hasErrors, hasWarnings }) => {
          const PhaseIcon = PHASE_ICONS[phase];
          const phaseEvents = eventsByPhase[phase];
          const labelKey = `phase${phase.charAt(0).toUpperCase() + phase.slice(1)}` as keyof typeof t;

          return (
            <AccordionItem
              key={phase}
              value={phase}
              className="border rounded-lg overflow-hidden"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                <div className="flex items-center gap-3 w-full">
                  <PhaseIcon className={cn('h-4 w-4', PHASE_COLORS[phase])} />
                  <span className="font-medium text-sm">
                    {t[labelKey]?.[locale] ?? phase}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    {hasErrors && (
                      <Badge variant="destructive" className="text-xs">
                        Error
                      </Badge>
                    )}
                    {hasWarnings && !hasErrors && (
                      <Badge variant="outline" className="text-xs text-amber-600">
                        Warning
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
                    {phaseEvents.map((event) => (
                      <ActivityEventRow key={event.id} event={event} locale={locale} />
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
    phase.includes('user') ||
    phase.includes('manual')
  ) {
    return 'user';
  }

  // AI actions - check if a model was used
  if (trace.model_used) return 'ai';

  // Default to system for automated actions
  return 'system';
}

/**
 * Map trace to event type
 */
function mapTypeFromTrace(trace: GenerationTrace): Stage3ActivityEvent['type'] {
  if (trace.error_data) return 'error';
  if (trace.output_data && !trace.error_data) return 'success';
  return 'info';
}

/**
 * Map trace to phase group
 */
function mapPhaseFromTrace(trace: GenerationTrace): ActivityPhaseGroup {
  const content = (trace.step_name || trace.phase || '').toLowerCase();

  if (content.includes('override') || content.includes('manual') || content.includes('user')) {
    return 'overrides';
  }
  if (content.includes('classif') || content.includes('judgment') || content.includes('priority') || content.includes('rationale')) {
    return 'judgment';
  }
  return 'setup';
}

/**
 * Generate mock events for demo/empty state
 */
function generateMockEvents(locale: 'ru' | 'en'): Stage3ActivityEvent[] {
  const now = new Date();
  const t = GRAPH_TRANSLATIONS.stage3 as Record<string, { ru: string; en: string }>;

  return [
    {
      id: 'mock-1',
      timestamp: new Date(now.getTime() - 5000),
      actor: 'system',
      type: 'success',
      message: t.eventContextLoaded?.[locale] ?? 'Course context loaded',
      phase: 'setup',
    },
    {
      id: 'mock-2',
      timestamp: new Date(now.getTime() - 4000),
      actor: 'system',
      type: 'info',
      message: t.eventStrategySelected?.[locale] ?? 'Classification strategy: single pass',
      phase: 'setup',
      deltaMs: 1000,
    },
    {
      id: 'mock-3',
      timestamp: new Date(now.getTime() - 3000),
      actor: 'ai',
      type: 'success',
      message: t.eventClassificationComplete?.[locale] ?? 'Documents classified: 5 total',
      phase: 'judgment',
      deltaMs: 1000,
    },
    {
      id: 'mock-4',
      timestamp: new Date(now.getTime() - 2000),
      actor: 'ai',
      type: 'info',
      message: t.eventRationalesGenerated?.[locale] ?? 'Rationales generated for all documents',
      phase: 'judgment',
      deltaMs: 1000,
    },
  ];
}

export default Stage3ActivityTab;
