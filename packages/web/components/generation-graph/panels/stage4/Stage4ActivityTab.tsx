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
  Sparkles,
  Target,
  Map,
  Layers,
  Database,
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
  Stage4ActivityTabProps,
  Stage4ActivityEvent,
  ActivityPhaseGroup,
  ActivityActor,
  Stage4PhaseId,
} from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Phase group icons for accordion headers
 * Using violet/purple themed icons to match Stage 4's color scheme
 */
const PHASE_GROUP_ICONS: Record<ActivityPhaseGroup, LucideIcon> = {
  preparation: Database,
  classification: Target,
  planning: Layers,
  synthesis: Sparkles,
  mapping: Map,
};

/**
 * Phase group colors - violet/purple theme for Stage 4
 */
const PHASE_GROUP_COLORS: Record<ActivityPhaseGroup, string> = {
  preparation: 'text-violet-500 dark:text-violet-400',
  classification: 'text-purple-500 dark:text-purple-400',
  planning: 'text-violet-600 dark:text-violet-400',
  synthesis: 'text-fuchsia-500 dark:text-fuchsia-400',
  mapping: 'text-purple-600 dark:text-purple-400',
};

/**
 * Phase group display order
 */
const PHASE_GROUP_ORDER: ActivityPhaseGroup[] = [
  'preparation',
  'classification',
  'planning',
  'synthesis',
  'mapping',
];

/**
 * Maps Stage 4 phase IDs to activity phase groups
 */
const PHASE_TO_GROUP: Record<Stage4PhaseId, ActivityPhaseGroup> = {
  phase_0: 'preparation',
  phase_1: 'classification',
  phase_2: 'planning',
  phase_3: 'planning',
  phase_4: 'synthesis',
  phase_5: 'synthesis',
  phase_6: 'mapping',
};

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
      return <Brain className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" aria-hidden="true" />;
    default:
      return <Cog className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />;
  }
}

/**
 * Renders status icon based on event type
 * Icons are decorative - meaning is conveyed by adjacent text and styling
 */
function StatusIcon({ type }: { type: Stage4ActivityEvent['type'] }) {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />;
    case 'error':
      return <XCircle className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />;
    case 'warning':
      return <AlertCircle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />;
    case 'decision':
      return <Sparkles className="h-3.5 w-3.5 text-violet-500" aria-hidden="true" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />;
  }
}

/**
 * Single activity event row
 */
interface ActivityEventRowProps {
  event: Stage4ActivityEvent;
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

  // Decision events get violet highlight
  const isDecision = event.type === 'decision';

  return (
    <div
      className={cn(
        'flex items-start gap-3 py-2 px-3 rounded-md transition-colors',
        event.type === 'error' && 'bg-red-50 dark:bg-red-950/20',
        event.type === 'success' && 'bg-green-50/50 dark:bg-green-950/10',
        event.type === 'warning' && 'bg-amber-50/50 dark:bg-amber-950/10',
        isDecision && 'bg-violet-50/70 dark:bg-violet-950/20 border-l-2 border-violet-500'
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
              isDecision ? 'text-violet-900 dark:text-violet-100 font-medium' : 'text-foreground'
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
 * Stage4ActivityTab Component
 *
 * "Decision Journal" - Shows activity timeline grouped by phase:
 * - Preparation: phase_0 (data audit)
 * - Classification: phase_1 (domain classification)
 * - Planning: phase_2, phase_3 (scoping, strategy)
 * - Synthesis: phase_4, phase_5 (content extraction, blueprint)
 * - Mapping: phase_6 (RAG connections)
 *
 * Color theme: Violet/Purple (wisdom, synthesis, strategy)
 */
export const Stage4ActivityTab = memo<Stage4ActivityTabProps>(function Stage4ActivityTab({
  nodeId,
  courseId: _courseId,
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage4 as Record<string, { ru: string; en: string }>;

  // Get traces from realtime provider
  const { traces } = useGenerationRealtime();

  // Filter and transform traces to activity events
  const events = useMemo((): Stage4ActivityEvent[] => {
    if (!traces || traces.length === 0) {
      return generateMockEvents(locale);
    }

    // Filter traces for this node/stage
    const relevantTraces = traces.filter((trace) => {
      // Match by nodeId if provided
      if (nodeId) {
        // nodeId format: "stage_4" or "stage_4_<something>"
        if (nodeId.startsWith('stage_4') && trace.stage === 'stage_4') {
          return true;
        }
        // Also check lesson_id for more specific filtering
        if (trace.lesson_id === nodeId) {
          return true;
        }
      }
      // Fallback: match Stage 4 traces
      return trace.stage === 'stage_4';
    });

    if (relevantTraces.length === 0) {
      return generateMockEvents(locale);
    }

    // Sort by timestamp ascending for proper delta calculation
    const sortedTraces = [...relevantTraces].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Transform traces to events
    return sortedTraces.map((trace): Stage4ActivityEvent => {
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
    const groups: Record<ActivityPhaseGroup, Stage4ActivityEvent[]> = {
      preparation: [],
      classification: [],
      planning: [],
      synthesis: [],
      mapping: [],
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
      hasDecisions: eventsByPhase[phase].some((e) => e.type === 'decision'),
    }));
  }, [eventsByPhase]);

  // Determine which accordion sections to open by default
  const defaultOpenSections = useMemo(() => {
    // Open sections with content, prioritize planning (main phase)
    const sectionsWithContent = phaseStats.filter((s) => s.count > 0).map((s) => s.phase);
    if (sectionsWithContent.includes('planning')) {
      return ['planning'];
    }
    return sectionsWithContent.length > 0 ? [sectionsWithContent[0]] : ['planning'];
  }, [phaseStats]);

  // Translation helper for phase labels
  const getPhaseLabel = (phase: ActivityPhaseGroup): string => {
    const labelKey = `phase${phase.charAt(0).toUpperCase() + phase.slice(1)}Group` as keyof typeof t;
    return t[labelKey]?.[locale] ?? phase;
  };

  // Empty state
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Sparkles className="h-12 w-12 text-violet-300 dark:text-violet-700 mb-4" aria-hidden="true" />
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
          {phaseStats.map(({ phase, count, hasErrors, hasWarnings, hasDecisions }) => {
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
                      {hasDecisions && !hasErrors && !hasWarnings && (
                        <Badge
                          variant="outline"
                          className="text-xs text-violet-600 dark:text-violet-400 border-violet-300 dark:border-violet-700"
                        >
                          {locale === 'ru' ? 'Решение' : 'Decision'}
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
    stepName.includes('analyze') ||
    stepName.includes('classify') ||
    stepName.includes('strategy') ||
    stepName.includes('synthesis') ||
    stepName.includes('generate')
  ) {
    return 'ai';
  }

  // Default to system for automated actions
  return 'system';
}

/**
 * Map trace to event type
 */
function mapTypeFromTrace(trace: GenerationTrace): Stage4ActivityEvent['type'] {
  if (trace.error_data) return 'error';

  const stepName = (trace.step_name || '').toLowerCase();
  const phase = (trace.phase || '').toLowerCase();

  // Decision events - key analysis decisions
  if (
    stepName.includes('decision') ||
    stepName.includes('selected') ||
    stepName.includes('determined') ||
    stepName.includes('strategy') ||
    stepName.includes('category') ||
    phase.includes('strategy') ||
    phase.includes('classification')
  ) {
    return 'decision';
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
function mapPhaseGroupFromTrace(trace: GenerationTrace): ActivityPhaseGroup {
  const phase = (trace.phase || '').toLowerCase();

  // Try to extract phase_X pattern
  const phaseMatch = phase.match(/phase[_-]?(\d)/);
  if (phaseMatch) {
    const phaseId = `phase_${phaseMatch[1]}` as Stage4PhaseId;
    if (phaseId in PHASE_TO_GROUP) {
      return PHASE_TO_GROUP[phaseId];
    }
  }

  // Keyword-based fallback
  const content = (trace.step_name || trace.phase || '').toLowerCase();

  if (content.includes('audit') || content.includes('init') || content.includes('load')) {
    return 'preparation';
  }
  if (content.includes('classif') || content.includes('domain') || content.includes('category')) {
    return 'classification';
  }
  if (content.includes('scope') || content.includes('strategy') || content.includes('plan')) {
    return 'planning';
  }
  if (content.includes('synthes') || content.includes('extract') || content.includes('blueprint')) {
    return 'synthesis';
  }
  if (content.includes('map') || content.includes('rag') || content.includes('connect')) {
    return 'mapping';
  }

  // Default to preparation
  return 'preparation';
}

/**
 * Extract relevant details from trace for display
 * Note: model_used is intentionally excluded to hide concrete model names from users.
 * Users should only see tier-based naming (e.g., "Premium Model") which is shown elsewhere.
 */
function extractDetailsFromTrace(trace: GenerationTrace): Record<string, unknown> | undefined {
  const details: Record<string, unknown> = {};

  // Skip model_used to hide concrete model names from users
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
function generateMockEvents(locale: 'ru' | 'en'): Stage4ActivityEvent[] {
  const now = new Date();
  const t = GRAPH_TRANSLATIONS.stage4 as Record<string, { ru: string; en: string }>;

  return [
    {
      id: 'mock-1',
      timestamp: new Date(now.getTime() - 10000),
      actor: 'system',
      type: 'success',
      message: locale === 'ru' ? 'Входные данные загружены' : 'Input data loaded',
      phase: 'preparation',
    },
    {
      id: 'mock-2',
      timestamp: new Date(now.getTime() - 8000),
      actor: 'ai',
      type: 'decision',
      message:
        t.insightCategorySelected?.[locale]
          ?.replace('{category}', locale === 'ru' ? 'Профессиональный' : 'Professional')
          .replace('{confidence}', '92') ??
        'Category: Professional (92%)',
      phase: 'classification',
      details: { tokens: 2450 },
    },
    {
      id: 'mock-3',
      timestamp: new Date(now.getTime() - 6000),
      actor: 'ai',
      type: 'decision',
      message:
        t.insightStructureRecommended?.[locale]
          ?.replace('{sections}', '4')
          .replace('{lessons}', '12') ?? 'Recommended: 4 modules, 12 lessons',
      phase: 'planning',
      details: { tokens: 1850 },
    },
    {
      id: 'mock-4',
      timestamp: new Date(now.getTime() - 4000),
      actor: 'ai',
      type: 'success',
      message: locale === 'ru' ? 'Ключевые концепции извлечены' : 'Key concepts extracted',
      phase: 'synthesis',
    },
    {
      id: 'mock-5',
      timestamp: new Date(now.getTime() - 2000),
      actor: 'system',
      type: 'success',
      message: locale === 'ru' ? 'RAG-связи установлены' : 'RAG connections established',
      phase: 'mapping',
    },
  ];
}

export default Stage4ActivityTab;
