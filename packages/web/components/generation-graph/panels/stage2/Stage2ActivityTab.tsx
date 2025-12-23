'use client';

import React, { useMemo, memo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ScanLine,
  Eraser,
  Image,
  Scissors,
  BrainCircuit,
  Database,
  Sparkles,
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
import {
  Stage2ActivityTabProps,
  ActivityPhaseGroup,
  ActivityEvent,
  ProcessingPhaseId,
} from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Phase icons mapping for accordion group headers
 */
const PHASE_ICONS: Record<ProcessingPhaseId, LucideIcon> = {
  docling: ScanLine,
  markdown: Eraser,
  images: Image,
  chunking: Scissors,
  embedding: BrainCircuit,
  qdrant: Database,
  summarization: Sparkles,
};

/**
 * All phases in processing order
 */
const PHASE_ORDER: ProcessingPhaseId[] = [
  'docling',
  'markdown',
  'images',
  'chunking',
  'embedding',
  'qdrant',
  'summarization',
];

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

/**
 * Renders actor icon based on event actor type
 */
function ActorIcon({ actor }: { actor: 'user' | 'system' | 'ai' }) {
  switch (actor) {
    case 'user':
      return <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />;
    case 'ai':
      return <Bot className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />;
    default:
      return <Cog className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />;
  }
}

/**
 * Renders status icon based on event type
 */
function StatusIcon({ type }: { type: ActivityEvent['type'] }) {
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

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Detects the actor type from a trace
 */
function detectActor(trace: GenerationTrace): 'user' | 'system' | 'ai' {
  const phase = trace.phase?.toLowerCase() || '';
  const stepName = trace.step_name?.toLowerCase() || '';

  // AI indicators - embedding, summarization, analysis phases
  const aiIndicators = ['embedding', 'summarization', 'summarize', 'analyze', 'ai', 'llm', 'gpt', 'claude'];
  for (const indicator of aiIndicators) {
    if (phase.includes(indicator) || stepName.includes(indicator)) {
      return 'ai';
    }
  }

  // User indicators
  const userIndicators = ['user', 'upload', 'submit', 'input'];
  for (const indicator of userIndicators) {
    if (phase.includes(indicator) || stepName.includes(indicator)) {
      return 'user';
    }
  }

  return 'system';
}

/**
 * Determines event type from trace data
 */
function determineEventType(trace: GenerationTrace): 'info' | 'success' | 'warning' | 'error' {
  if (trace.error_data) {
    return 'error';
  }
  if (trace.output_data?.warnings || trace.output_data?.warning) {
    return 'warning';
  }
  if (trace.output_data) {
    return 'success';
  }
  return 'info';
}

/**
 * Maps trace phase to ProcessingPhaseId
 */
function mapTraceToPhase(trace: GenerationTrace): ProcessingPhaseId | null {
  const phase = trace.phase?.toLowerCase() || '';
  const stepName = trace.step_name?.toLowerCase() || '';
  const combined = `${phase} ${stepName}`;

  if (combined.includes('docling') || combined.includes('convert') || combined.includes('digitiz')) {
    return 'docling';
  }
  if (combined.includes('markdown') || combined.includes('clean') || combined.includes('format')) {
    return 'markdown';
  }
  if (combined.includes('image') || combined.includes('visual') || combined.includes('ocr')) {
    return 'images';
  }
  if (combined.includes('chunk') || combined.includes('segment') || combined.includes('split')) {
    return 'chunking';
  }
  if (combined.includes('embed') || combined.includes('vector')) {
    return 'embedding';
  }
  if (combined.includes('qdrant') || combined.includes('index') || combined.includes('store')) {
    return 'qdrant';
  }
  if (combined.includes('summar') || combined.includes('synth')) {
    return 'summarization';
  }

  return null;
}

/**
 * Translates event message from trace
 */
function translateEventMessage(trace: GenerationTrace, locale: 'ru' | 'en'): string {
  const phase = trace.phase || '';
  const stepName = trace.step_name || '';

  // Try to create a readable message
  if (stepName) {
    return stepName;
  }
  if (phase) {
    return phase;
  }

  return locale === 'ru' ? 'Событие обработки' : 'Processing event';
}

/**
 * Converts trace to ActivityEvent
 */
function traceToActivityEvent(
  trace: GenerationTrace,
  locale: 'ru' | 'en',
  previousTimestamp?: Date
): ActivityEvent {
  const timestamp = (() => {
    try {
      const date = new Date(trace.created_at);
      return isNaN(date.getTime()) ? new Date() : date;
    } catch {
      return new Date();
    }
  })();
  const deltaMs = previousTimestamp
    ? timestamp.getTime() - previousTimestamp.getTime()
    : undefined;

  return {
    id: trace.id,
    timestamp,
    actor: detectActor(trace),
    type: determineEventType(trace),
    message: translateEventMessage(trace, locale),
    deltaMs: deltaMs !== undefined && deltaMs >= 0 ? deltaMs : undefined,
    details: trace.input_data,
  };
}

/**
 * Gets translated phase name
 */
function getPhaseName(phaseId: ProcessingPhaseId, locale: 'ru' | 'en'): string {
  const t = GRAPH_TRANSLATIONS.stage2;
  const phaseNameMap: Record<ProcessingPhaseId, string> = {
    docling: t?.phaseDocling?.[locale] || 'Digitization',
    markdown: t?.phaseMarkdown?.[locale] || 'Cleanup',
    images: t?.phaseImages?.[locale] || 'Visual Analysis',
    chunking: t?.phaseChunking?.[locale] || 'Segmentation',
    embedding: t?.phaseEmbedding?.[locale] || 'AI Encoding',
    qdrant: t?.phaseQdrant?.[locale] || 'Knowledge Save',
    summarization: t?.phaseSummarization?.[locale] || 'Insight Generation',
  };
  return phaseNameMap[phaseId];
}

/**
 * Formats duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

/**
 * Formats delta time for display
 */
function formatDeltaTime(ms: number): string {
  if (ms < 1000) {
    return `+${ms}ms`;
  }
  return `+${(ms / 1000).toFixed(1)}s`;
}

/**
 * Generates synthetic phase groups when no traces exist
 */
function generateSyntheticGroups(locale: 'ru' | 'en'): ActivityPhaseGroup[] {
  const now = new Date();

  return PHASE_ORDER.map((phaseId, index) => {
    const baseTime = new Date(now.getTime() - (PHASE_ORDER.length - index) * 60000);
    const syntheticEvents: ActivityEvent[] = [
      {
        id: `synthetic_${phaseId}_start`,
        timestamp: baseTime,
        actor: 'system',
        type: 'info',
        message: locale === 'ru' ? 'Ожидание запуска' : 'Waiting to start',
      },
    ];

    return {
      phaseId,
      phaseName: getPhaseName(phaseId, locale),
      totalDurationMs: 0,
      eventCount: syntheticEvents.length,
      events: syntheticEvents,
    };
  });
}

/**
 * Groups traces by processing phase
 */
function groupTracesByPhase(
  traces: GenerationTrace[],
  locale: 'ru' | 'en'
): ActivityPhaseGroup[] {
  // Group traces by phase
  const groupedTraces = new Map<ProcessingPhaseId, GenerationTrace[]>();

  // Initialize all phases
  for (const phaseId of PHASE_ORDER) {
    groupedTraces.set(phaseId, []);
  }

  // Assign traces to phases
  for (const trace of traces) {
    const phaseId = mapTraceToPhase(trace);
    if (phaseId) {
      groupedTraces.get(phaseId)!.push(trace);
    }
  }

  // Build phase groups
  const groups: ActivityPhaseGroup[] = [];

  for (const phaseId of PHASE_ORDER) {
    const phaseTraces = groupedTraces.get(phaseId) || [];

    // Sort traces chronologically within phase
    phaseTraces.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Convert to activity events with delta times
    const events: ActivityEvent[] = [];
    let previousTimestamp: Date | undefined;

    for (const trace of phaseTraces) {
      const event = traceToActivityEvent(trace, locale, previousTimestamp);
      events.push(event);
      previousTimestamp = event.timestamp;
    }

    // Calculate total duration
    let totalDurationMs = 0;
    if (events.length >= 2) {
      const firstTime = events[0].timestamp.getTime();
      const lastTime = events[events.length - 1].timestamp.getTime();
      totalDurationMs = lastTime - firstTime;
    } else if (phaseTraces.length > 0 && phaseTraces[0]?.duration_ms) {
      totalDurationMs = phaseTraces[0].duration_ms;
    }

    groups.push({
      phaseId,
      phaseName: getPhaseName(phaseId, locale),
      totalDurationMs,
      eventCount: events.length,
      events,
    });
  }

  return groups;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * Stage 2 Activity Tab - Grouped Accordion Timeline
 *
 * Displays processing events grouped by phase with expandable sections.
 * Shows timestamp, delta time, actor icon, event message, and status.
 */
export const Stage2ActivityTab = memo<Stage2ActivityTabProps>(
  function Stage2ActivityTab({ nodeId, documentId, locale = 'ru' }) {
    const t = GRAPH_TRANSLATIONS.stage2;
    const dateLocale = locale === 'ru' ? ruLocale : enLocale;

    // Get traces from realtime context
    const { traces } = useGenerationRealtime();

    // Filter and group traces
    const phaseGroups = useMemo(() => {
      if (!nodeId) return [];

      const safeTraces = Array.isArray(traces) ? traces : [];

      // Filter traces for stage_2 and optionally by documentId
      const stage2Traces = safeTraces.filter((trace) => {
        if (trace.stage !== 'stage_2') return false;

        // If documentId is provided, filter by it
        if (documentId && trace.input_data?.documentId) {
          return trace.input_data.documentId === documentId;
        }

        // Also check if documentId is in the file path or other locations
        if (documentId && trace.input_data?.fileId) {
          return trace.input_data.fileId === documentId;
        }

        return true;
      });

      // If we have real traces, group them
      if (stage2Traces.length > 0) {
        return groupTracesByPhase(stage2Traces, locale);
      }

      // Generate synthetic groups to show structure
      return generateSyntheticGroups(locale);
    }, [traces, nodeId, documentId, locale]);

    // Check if we have any events at all
    const hasEvents = phaseGroups.some((group) => group.eventCount > 0);

    // Empty state
    if (!hasEvents) {
      return (
        <div className="flex h-[300px] items-center justify-center p-4">
          <p className="text-sm text-muted-foreground">
            {t?.noActivity?.[locale] || 'No events recorded'}
          </p>
        </div>
      );
    }

    return (
      <ScrollArea className="h-[400px]">
        <div className="p-4">
          <Accordion type="multiple" className="space-y-2">
            {phaseGroups.map((group) => {
              const PhaseIcon = PHASE_ICONS[group.phaseId];
              const hasGroupEvents = group.eventCount > 0;

              return (
                <AccordionItem
                  key={group.phaseId}
                  value={group.phaseId}
                  className={cn(
                    'rounded-lg border bg-card px-4',
                    !hasGroupEvents && 'opacity-50'
                  )}
                >
                  <AccordionTrigger
                    className="py-3 hover:no-underline"
                    aria-label={`${group.phaseName}: ${group.eventCount} ${t?.eventsCount?.[locale] || 'events'}${group.totalDurationMs > 0 ? `, ${formatDuration(group.totalDurationMs)}` : ''}`}
                  >
                    <div className="flex flex-1 items-center gap-3">
                      {/* Phase icon */}
                      <div
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-lg',
                          hasGroupEvents
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <PhaseIcon className="h-4 w-4" aria-hidden="true" />
                      </div>

                      {/* Phase name */}
                      <span className="flex-1 text-left font-medium">
                        {group.phaseName}
                      </span>

                      {/* Event count badge */}
                      <Badge
                        variant={hasGroupEvents ? 'secondary' : 'outline'}
                        className="ml-2"
                      >
                        {group.eventCount} {t?.eventsCount?.[locale] || 'events'}
                      </Badge>

                      {/* Duration */}
                      {group.totalDurationMs > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground" aria-hidden="true">
                          <Clock className="h-3 w-3" />
                          <span>{formatDuration(group.totalDurationMs)}</span>
                        </div>
                      )}
                    </div>
                  </AccordionTrigger>

                  <AccordionContent>
                    <div className="relative border-l-2 border-dashed border-slate-200 pl-4 dark:border-slate-700">
                      {group.events.length === 0 ? (
                        <p className="py-2 text-sm text-muted-foreground">
                          {t?.noActivity?.[locale] || 'No events recorded'}
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {group.events.map((event, index) => {
                            const isLast = index === group.events.length - 1;

                            return (
                              <div
                                key={event.id}
                                className={cn(
                                  'relative flex items-start gap-3',
                                  !isLast && 'pb-2'
                                )}
                              >
                                {/* Timeline connector dot */}
                                <div className="absolute -left-[1.35rem] top-1.5 h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />

                                {/* Timestamp column */}
                                <div className="flex w-24 shrink-0 flex-col">
                                  <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                                    {(() => {
                                      try {
                                        return isNaN(event.timestamp.getTime())
                                          ? '--:--:--'
                                          : format(event.timestamp, 'HH:mm:ss', {
                                              locale: dateLocale,
                                            });
                                      } catch {
                                        return '--:--:--';
                                      }
                                    })()}
                                  </span>
                                  {event.deltaMs !== undefined && event.deltaMs > 0 && (
                                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                                      {formatDeltaTime(event.deltaMs)}
                                    </span>
                                  )}
                                </div>

                                {/* Actor icon */}
                                <div
                                  className={cn(
                                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                                    event.actor === 'user'
                                      ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950'
                                      : event.actor === 'ai'
                                      ? 'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-950'
                                      : 'border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-900'
                                  )}
                                >
                                  <ActorIcon actor={event.actor} />
                                </div>

                                {/* Event message */}
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <span
                                    className={cn(
                                      'truncate text-sm',
                                      event.type === 'error'
                                        ? 'text-red-600 dark:text-red-400'
                                        : event.type === 'success'
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : event.type === 'warning'
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-slate-700 dark:text-slate-300'
                                    )}
                                  >
                                    {event.message}
                                  </span>

                                  {/* Status icon */}
                                  <StatusIcon type={event.type} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </ScrollArea>
    );
  }
);

export default Stage2ActivityTab;
