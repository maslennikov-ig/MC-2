'use client';

import React, { memo, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  ScanLine,
  Eraser,
  Image,
  Scissors,
  BrainCircuit,
  Database,
  Sparkles,
  Circle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { formatDuration } from '@/lib/generation-graph/format-utils';
import type {
  Stage2ProcessTabProps,
  ProcessingPhase,
  ProcessingPhaseId,
  ProcessingPhaseStatus,
  TerminalLogEntry,
} from './types';

/**
 * Phase configuration with icons and progress ranges
 */
const PHASE_CONFIG: Record<ProcessingPhaseId, { icon: LucideIcon; progressRange: [number, number] }> = {
  docling: { icon: ScanLine, progressRange: [10, 25] },
  markdown: { icon: Eraser, progressRange: [25, 30] },
  images: { icon: Image, progressRange: [30, 35] },
  chunking: { icon: Scissors, progressRange: [35, 50] },
  embedding: { icon: BrainCircuit, progressRange: [50, 70] },
  qdrant: { icon: Database, progressRange: [70, 80] },
  summarization: { icon: Sparkles, progressRange: [80, 90] },
};

/**
 * Status icon configuration with colors
 */
const STATUS_CONFIG: Record<
  ProcessingPhaseStatus,
  {
    icon: React.ElementType;
    colorClass: string;
    bgClass: string;
    animate?: boolean;
  }
> = {
  pending: {
    icon: Circle,
    colorClass: 'text-muted-foreground',
    bgClass: '',
  },
  active: {
    icon: Loader2,
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-50 dark:bg-blue-950/30',
    animate: true,
  },
  completed: {
    icon: CheckCircle2,
    colorClass: 'text-green-500',
    bgClass: 'bg-green-50/50 dark:bg-green-950/10',
  },
  skipped: {
    icon: AlertCircle,
    colorClass: 'text-amber-500',
    bgClass: 'bg-amber-50/50 dark:bg-amber-950/10',
  },
  error: {
    icon: XCircle,
    colorClass: 'text-red-500',
    bgClass: 'bg-red-50 dark:bg-red-950/20',
  },
};

/**
 * All phase IDs in order
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

/**
 * Generates default phases (all pending) when not provided
 */
function generateDefaultPhases(locale: 'ru' | 'en'): ProcessingPhase[] {
  const t = GRAPH_TRANSLATIONS.stage2;

  const phaseNameMap: Record<ProcessingPhaseId, { name: string; desc: string }> = {
    docling: {
      name: t?.phaseDocling?.[locale] ?? 'Digitization',
      desc: t?.phaseDoclingDesc?.[locale] ?? 'Smart document structure reading',
    },
    markdown: {
      name: t?.phaseMarkdown?.[locale] ?? 'Cleanup',
      desc: t?.phaseMarkdownDesc?.[locale] ?? 'Text formatting and cleanup',
    },
    images: {
      name: t?.phaseImages?.[locale] ?? 'Visual Analysis',
      desc: t?.phaseImagesDesc?.[locale] ?? 'Image and table recognition',
    },
    chunking: {
      name: t?.phaseChunking?.[locale] ?? 'Segmentation',
      desc: t?.phaseChunkingDesc?.[locale] ?? 'Splitting into semantic blocks',
    },
    embedding: {
      name: t?.phaseEmbedding?.[locale] ?? 'AI Encoding',
      desc: t?.phaseEmbeddingDesc?.[locale] ?? 'Creating semantic fingerprints',
    },
    qdrant: {
      name: t?.phaseQdrant?.[locale] ?? 'Knowledge Save',
      desc: t?.phaseQdrantDesc?.[locale] ?? 'Saving to knowledge base',
    },
    summarization: {
      name: t?.phaseSummarization?.[locale] ?? 'Insight Generation',
      desc: t?.phaseSummarizationDesc?.[locale] ?? 'Creating executive summary',
    },
  };

  return PHASE_ORDER.map((id) => ({
    id,
    name: phaseNameMap[id].name,
    description: phaseNameMap[id].desc,
    status: 'pending' as const,
  }));
}

/**
 * Get phase description from translations
 */
function getPhaseDescription(
  phaseId: ProcessingPhaseId,
  phase: ProcessingPhase,
  locale: 'ru' | 'en'
): string {
  // If phase has a custom description (e.g., live status), use it
  if (phase.description) return phase.description;

  const t = GRAPH_TRANSLATIONS.stage2;
  const descMap: Record<ProcessingPhaseId, string | undefined> = {
    docling: t?.phaseDoclingDesc?.[locale],
    markdown: t?.phaseMarkdownDesc?.[locale],
    images: t?.phaseImagesDesc?.[locale],
    chunking: t?.phaseChunkingDesc?.[locale],
    embedding: t?.phaseEmbeddingDesc?.[locale],
    qdrant: t?.phaseQdrantDesc?.[locale],
    summarization: t?.phaseSummarizationDesc?.[locale],
  };

  return descMap[phaseId] ?? '';
}

/**
 * Get phase name from translations
 */
function getPhaseName(phaseId: ProcessingPhaseId, phase: ProcessingPhase, locale: 'ru' | 'en'): string {
  // If phase has a custom name, use it
  if (phase.name) return phase.name;

  const t = GRAPH_TRANSLATIONS.stage2;
  const nameMap: Record<ProcessingPhaseId, string | undefined> = {
    docling: t?.phaseDocling?.[locale],
    markdown: t?.phaseMarkdown?.[locale],
    images: t?.phaseImages?.[locale],
    chunking: t?.phaseChunking?.[locale],
    embedding: t?.phaseEmbedding?.[locale],
    qdrant: t?.phaseQdrant?.[locale],
    summarization: t?.phaseSummarization?.[locale],
  };

  return nameMap[phaseId] ?? phaseId;
}

/**
 * Format metrics for display
 */
function formatMetrics(metrics: Record<string, number | string> | undefined): string {
  if (!metrics) return '';

  const parts: string[] = [];
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === 'number') {
      parts.push(`${key}: ${value.toLocaleString()}`);
    } else {
      parts.push(`${key}: ${value}`);
    }
  }
  return parts.join(' | ');
}

/**
 * Individual phase row component
 */
interface PhaseRowProps {
  phase: ProcessingPhase;
  locale: 'ru' | 'en';
}

const PhaseRow = memo<PhaseRowProps>(function PhaseRow({ phase, locale }) {
  const config = PHASE_CONFIG[phase.id];
  const statusConfig = STATUS_CONFIG[phase.status];
  const PhaseIcon = config?.icon ?? Circle;
  const StatusIcon = statusConfig?.icon ?? Circle;

  const phaseName = getPhaseName(phase.id, phase, locale);
  const phaseDesc = getPhaseDescription(phase.id, phase, locale);
  const metricsText = formatMetrics(phase.metrics);

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg transition-all duration-300',
        statusConfig.bgClass,
        phase.status === 'active' && 'animate-pulse'
      )}
    >
      {/* Status Icon */}
      <div className="mt-0.5 flex-shrink-0" role="status" aria-live="polite">
        {statusConfig.animate ? (
          <StatusIcon
            className={cn('h-5 w-5 animate-spin', statusConfig.colorClass)}
            aria-label={locale === 'ru' ? 'Обработка...' : 'Processing...'}
          />
        ) : (
          <StatusIcon className={cn('h-5 w-5', statusConfig.colorClass)} />
        )}
      </div>

      {/* Phase Icon + Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PhaseIcon
              className={cn(
                'h-4 w-4 flex-shrink-0',
                phase.status === 'active'
                  ? 'text-blue-600 dark:text-blue-400'
                  : phase.status === 'completed'
                    ? 'text-green-600 dark:text-green-400'
                    : phase.status === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-muted-foreground'
              )}
            />
            <span
              className={cn(
                'font-medium text-sm',
                phase.status === 'error' && 'text-red-700 dark:text-red-400',
                phase.status === 'completed' && 'text-foreground',
                phase.status === 'active' && 'text-blue-700 dark:text-blue-300',
                phase.status === 'pending' && 'text-muted-foreground',
                phase.status === 'skipped' && 'text-amber-700 dark:text-amber-400'
              )}
            >
              {phaseName}
            </span>
          </div>

          {/* Duration + Metrics */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {metricsText && (
              <span className="text-xs text-muted-foreground font-mono">{metricsText}</span>
            )}
            {phase.durationMs !== undefined && phase.durationMs > 0 && (
              <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                {formatDuration(phase.durationMs)}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mt-0.5">{phaseDesc}</p>

        {/* Progress bar for active phase */}
        {phase.status === 'active' && phase.progress !== undefined && (
          <div className="mt-2">
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, phase.progress))}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {phase.status === 'error' && phase.errorMessage && (
          <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded-md">
            <p className="text-sm text-red-700 dark:text-red-300 font-mono">{phase.errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Terminal log level color mapping
 */
const LOG_LEVEL_COLORS: Record<TerminalLogEntry['level'], string> = {
  info: 'text-blue-400',
  success: 'text-green-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
};

/**
 * Terminal footer component showing live logs
 */
interface TerminalFooterProps {
  logs: TerminalLogEntry[];
  locale: 'ru' | 'en';
}

const TerminalFooter = memo<TerminalFooterProps>(function TerminalFooter({ logs, locale }) {
  const t = GRAPH_TRANSLATIONS.stage2;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Get display name for phase (memoized to avoid recreation on each render)
  const getPhaseDisplayName = useCallback(
    (phaseId: ProcessingPhaseId): string => {
      const nameMap: Record<ProcessingPhaseId, string | undefined> = {
        docling: t?.phaseDocling?.[locale],
        markdown: t?.phaseMarkdown?.[locale],
        images: t?.phaseImages?.[locale],
        chunking: t?.phaseChunking?.[locale],
        embedding: t?.phaseEmbedding?.[locale],
        qdrant: t?.phaseQdrant?.[locale],
        summarization: t?.phaseSummarization?.[locale],
      };
      return nameMap[phaseId] ?? phaseId.toUpperCase();
    },
    [t, locale]
  );

  return (
    <div className="border-t bg-zinc-900 dark:bg-zinc-950 rounded-b-lg overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 dark:bg-zinc-900 border-b border-zinc-700">
        <Terminal className="h-3.5 w-3.5 text-zinc-400" />
        <span className="text-xs font-medium text-zinc-400">
          {t?.terminal?.[locale] ?? 'System Log'}
        </span>
      </div>

      {/* Terminal content */}
      <div
        ref={scrollRef}
        className="h-24 overflow-y-auto p-2 font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 ? (
          <div className="text-zinc-500 italic">{'> Waiting for events...'}</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="flex gap-2 text-zinc-300">
              <span className="text-zinc-500 select-none">{'>'}</span>
              <span className={cn('font-semibold', LOG_LEVEL_COLORS[log.level])}>
                [{getPhaseDisplayName(log.phase)}]
              </span>
              <span className="flex-1 break-words">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

/**
 * Stage2ProcessTab Component
 *
 * Visualizes the 7-phase document processing pipeline with a vertical layout.
 * Shows phase status, progress, metrics, and a terminal footer with live logs.
 */
export const Stage2ProcessTab = memo<Stage2ProcessTabProps>(function Stage2ProcessTab({
  phases: providedPhases,
  terminalLogs = [],
  status = 'pending',
  totalProgress,
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage2;

  // Generate default phases if not provided
  const phases = providedPhases || generateDefaultPhases(locale);

  // Safety check for terminalLogs in case null is passed instead of undefined
  const safeLogs = Array.isArray(terminalLogs) ? terminalLogs : [];

  return (
    <div className="space-y-4">
      {/* Pipeline Card */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            {t?.pipeline?.[locale] ?? 'Processing Pipeline'}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t?.pipelineDesc?.[locale] ?? 'Transforming document into knowledge'}
          </p>

          {/* Total progress bar */}
          {totalProgress !== undefined && status === 'active' && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{t?.statusActive?.[locale] ?? 'Processing'}</span>
                <span className="font-mono">{totalProgress}%</span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, totalProgress)}%` }}
                />
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-1 pb-0">
          <ScrollArea className="max-h-[400px]">
            {phases.map((phase) => (
              <PhaseRow key={phase.id} phase={phase} locale={locale} />
            ))}
          </ScrollArea>
        </CardContent>

        {/* Terminal Footer */}
        <TerminalFooter logs={safeLogs} locale={locale} />
      </Card>
    </div>
  );
});

export default Stage2ProcessTab;
