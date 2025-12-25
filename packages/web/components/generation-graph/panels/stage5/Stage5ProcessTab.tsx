'use client';

import React, { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  ClipboardCheck,
  FileText,
  Layers,
  CheckCircle,
  ListChecks,
  Clock,
  Coins,
  DollarSign,
  Target,
  BookOpen,
} from 'lucide-react';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { formatDuration } from '@/lib/generation-graph/format-utils';
import type {
  Stage5ProcessTabProps,
  Stage5Phase,
  Stage5PhaseId,
  Stage5PhaseStatus,
  Stage5TelemetryData,
} from './types';
import { BatchProgress } from './components/BatchProgress';

/** Number of parallel workers for batch processing */
const BATCH_WORKER_COUNT = 4;

/**
 * Status icon mapping with colors for phase status
 */
const statusConfig: Record<
  Stage5PhaseStatus,
  {
    icon: React.ElementType;
    colorClass: string;
    animate?: boolean;
  }
> = {
  completed: {
    icon: CheckCircle2,
    colorClass: 'text-green-500',
  },
  active: {
    icon: Loader2,
    colorClass: 'text-orange-500',
    animate: true,
  },
  error: {
    icon: XCircle,
    colorClass: 'text-red-500',
  },
  pending: {
    icon: Circle,
    colorClass: 'text-muted-foreground',
  },
  skipped: {
    icon: Circle,
    colorClass: 'text-muted-foreground/50',
  },
};

/**
 * Phase configuration with icons and colors - Orange theme
 */
const phaseConfig: Record<
  Stage5PhaseId,
  {
    icon: React.ElementType;
    colorClass: string;
    bgClass: string;
    isHighlight?: boolean;
  }
> = {
  validate_input: {
    icon: ClipboardCheck,
    colorClass: 'text-orange-600 dark:text-orange-400',
    bgClass: 'bg-orange-100 dark:bg-orange-900/30',
  },
  generate_metadata: {
    icon: FileText,
    colorClass: 'text-orange-600 dark:text-orange-400',
    bgClass: 'bg-orange-100 dark:bg-orange-900/30',
  },
  generate_sections: {
    icon: Layers,
    colorClass: 'text-orange-600 dark:text-orange-400',
    bgClass: 'bg-orange-100 dark:bg-orange-900/30',
  },
  validate_quality: {
    icon: CheckCircle,
    colorClass: 'text-orange-600 dark:text-orange-400',
    bgClass: 'bg-orange-100 dark:bg-orange-900/30',
  },
  validate_lessons: {
    icon: ListChecks,
    colorClass: 'text-orange-600 dark:text-orange-400',
    bgClass: 'bg-orange-100 dark:bg-orange-900/30',
  },
};

/**
 * Generates default phases based on overall status
 */
function generateDefaultPhases(
  status: 'pending' | 'active' | 'completed' | 'error',
  locale: 'ru' | 'en'
): Stage5Phase[] {
  const t = GRAPH_TRANSLATIONS.stage5!;

  const phaseDefinitions: Array<{
    id: Stage5PhaseId;
    nameKey: string;
    descKey: string;
    mockDuration: number;
  }> = [
    {
      id: 'validate_input',
      nameKey: 'phaseValidateInput',
      descKey: 'phaseValidateInputDesc',
      mockDuration: 100,
    },
    {
      id: 'generate_metadata',
      nameKey: 'phaseGenerateMetadata',
      descKey: 'phaseGenerateMetadataDesc',
      mockDuration: 3500,
    },
    {
      id: 'generate_sections',
      nameKey: 'phaseGenerateSections',
      descKey: 'phaseGenerateSectionsDesc',
      mockDuration: 12000,
    },
    {
      id: 'validate_quality',
      nameKey: 'phaseValidateQuality',
      descKey: 'phaseValidateQualityDesc',
      mockDuration: 800,
    },
    {
      id: 'validate_lessons',
      nameKey: 'phaseValidateLessons',
      descKey: 'phaseValidateLessonsDesc',
      mockDuration: 200,
    },
  ];

  if (status === 'completed') {
    return phaseDefinitions.map((def) => ({
      id: def.id,
      name: t[def.nameKey]?.[locale] ?? def.id,
      description: t[def.descKey]?.[locale] ?? '',
      status: 'completed' as const,
      durationMs: def.mockDuration,
    }));
  }

  if (status === 'error') {
    return phaseDefinitions.map((def, index) => ({
      id: def.id,
      name: t[def.nameKey]?.[locale] ?? def.id,
      description: t[def.descKey]?.[locale] ?? '',
      status:
        index === phaseDefinitions.length - 1
          ? ('error' as const)
          : ('completed' as const),
      durationMs:
        index === phaseDefinitions.length - 1 ? undefined : def.mockDuration,
      message:
        index === phaseDefinitions.length - 1
          ? 'Structure generation failed'
          : undefined,
    }));
  }

  if (status === 'active') {
    // First phase is active, rest are pending
    return phaseDefinitions.map((def, index) => ({
      id: def.id,
      name: t[def.nameKey]?.[locale] ?? def.id,
      description: t[def.descKey]?.[locale] ?? '',
      status: index === 0 ? ('active' as const) : ('pending' as const),
      durationMs: undefined,
    }));
  }

  // Pending: all phases are pending
  return phaseDefinitions.map((def) => ({
    id: def.id,
    name: t[def.nameKey]?.[locale] ?? def.id,
    description: t[def.descKey]?.[locale] ?? '',
    status: 'pending' as const,
    durationMs: undefined,
  }));
}

/**
 * Individual phase row component
 */
interface PhaseRowProps {
  phase: Stage5Phase;
  locale: 'ru' | 'en';
}

const PhaseRow = memo<PhaseRowProps>(function PhaseRow({ phase, locale }) {
  const t = GRAPH_TRANSLATIONS.stage5!;
  const config = phaseConfig[phase.id];
  const statusCfg = statusConfig[phase.status];
  const PhaseIcon = config?.icon ?? Circle;
  const StatusIcon = statusCfg.icon;
  const isHighlight = config?.isHighlight ?? false;

  // Get description from translations if not in phase
  const getDescription = (): string => {
    if (phase.description) return phase.description;

    const descMap: Record<Stage5PhaseId, string | undefined> = {
      validate_input: t.phaseValidateInputDesc?.[locale],
      generate_metadata: t.phaseGenerateMetadataDesc?.[locale],
      generate_sections: t.phaseGenerateSectionsDesc?.[locale],
      validate_quality: t.phaseValidateQualityDesc?.[locale],
      validate_lessons: t.phaseValidateLessonsDesc?.[locale],
    };

    return descMap[phase.id] ?? '';
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-start gap-3 p-3 rounded-lg transition-colors duration-200',
          phase.status === 'error' && 'bg-red-50 dark:bg-red-950/20',
          phase.status === 'completed' && 'bg-green-50/50 dark:bg-green-950/10',
          phase.status === 'active' && 'bg-orange-50/50 dark:bg-orange-950/10',
          phase.status === 'pending' && 'bg-muted/30',
          isHighlight && phase.status !== 'error' && 'ring-1 ring-orange-300 dark:ring-orange-700'
        )}
      >
        {/* Phase type icon */}
        <div
          className={cn(
            'mt-0.5 flex-shrink-0 rounded-md',
            isHighlight ? 'p-2' : 'p-1.5',
            config?.bgClass ?? 'bg-muted'
          )}
        >
          <PhaseIcon
            className={cn(
              isHighlight ? 'h-5 w-5' : 'h-4 w-4',
              config?.colorClass ?? 'text-muted-foreground'
            )}
          />
        </div>

        {/* Phase details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'font-medium text-sm',
                isHighlight && 'text-base',
                phase.status === 'error' && 'text-red-700 dark:text-red-400',
                phase.status === 'completed' && 'text-foreground',
                phase.status === 'active' && 'text-orange-700 dark:text-orange-400',
                phase.status === 'pending' && 'text-muted-foreground'
              )}
            >
              {phase.name}
            </span>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Duration badge */}
              {phase.durationMs !== undefined && phase.durationMs > 0 && (
                <span className="text-xs font-mono text-muted-foreground">
                  {formatDuration(phase.durationMs)}
                </span>
              )}

              {/* Status icon */}
              {statusCfg.animate ? (
                <StatusIcon className={cn('h-4 w-4 animate-spin', statusCfg.colorClass)} />
              ) : (
                <StatusIcon className={cn('h-4 w-4', statusCfg.colorClass)} />
              )}
            </div>
          </div>

          <p className="text-sm text-muted-foreground mt-0.5">{getDescription()}</p>

          {/* Error message */}
          {phase.status === 'error' && phase.message && (
            <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded-md">
              <p className="text-sm text-red-700 dark:text-red-300 font-mono">
                {phase.message}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Batch Progress - shown only for generate_sections phase */}
      {phase.id === 'generate_sections' && phase.batchInfo && (
        <div className="mt-2 ml-14">
          <BatchProgress
            workers={Array.from({ length: BATCH_WORKER_COUNT }, (_, i) => ({
              workerId: i + 1,
              status: i < (phase.batchInfo?.current ?? 0) ? 'completed' : i === (phase.batchInfo?.current ?? 0) ? 'working' : 'idle',
              currentSectionTitle: i === (phase.batchInfo?.current ?? 0) ? `Section ${i + 1}` : undefined,
            }))}
            locale={locale}
          />
        </div>
      )}
    </div>
  );
});

/**
 * Telemetry metric item component
 */
interface TelemetryItemProps {
  icon: React.ElementType;
  label: string;
  value: string;
  colorClass?: string;
}

const TelemetryItem = memo<TelemetryItemProps>(function TelemetryItem({
  icon: Icon,
  label,
  value,
  colorClass = 'text-muted-foreground',
}) {
  return (
    <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
      <Icon className={cn('h-5 w-5 mb-1', colorClass)} />
      <span className="text-lg font-mono font-semibold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground text-center">{label}</span>
    </div>
  );
});

/**
 * Default telemetry data
 */
function getDefaultTelemetry(): Stage5TelemetryData {
  return {
    processingTimeMs: 0,
    totalTokens: 0,
    tier: 'standard',
  };
}

/**
 * Type guard to check if outputData is a CourseStructure
 */
function isCourseStructure(data: unknown): data is { sections: Array<{ lessons: unknown[] }> } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.course_title === 'string' && Array.isArray(d.sections);
}

/**
 * Stage5ProcessTab Component
 *
 * Displays a "Forge Pipeline" showing the 5-phase structure generation process
 * with telemetry metrics and batch progress. Split view with pipeline on left (60%)
 * and telemetry on right (40%).
 */
export const Stage5ProcessTab = memo<Stage5ProcessTabProps>(function Stage5ProcessTab({
  phases: providedPhases,
  telemetry: providedTelemetry,
  status = 'completed',
  locale = 'ru',
  outputData,
  processingTimeMs,
  totalTokens,
}) {
  const t = GRAPH_TRANSLATIONS.stage5!;

  // Generate default phases if not provided
  const phases = providedPhases || generateDefaultPhases(status, locale);

  // Calculate sections and lessons count from outputData
  let sectionsCount: number | undefined;
  let lessonsCount: number | undefined;
  if (isCourseStructure(outputData)) {
    sectionsCount = outputData.sections.length;
    lessonsCount = outputData.sections.reduce(
      (sum, section) => sum + (section.lessons?.length ?? 0),
      0
    );
  }

  // Merge telemetry with real data from props
  const telemetry: Stage5TelemetryData = {
    ...getDefaultTelemetry(),
    ...providedTelemetry,
    // Override with real values if available
    ...(processingTimeMs !== undefined && { processingTimeMs }),
    ...(totalTokens !== undefined && { totalTokens }),
    ...(sectionsCount !== undefined && { sectionsCount }),
    ...(lessonsCount !== undefined && { lessonsCount }),
  };

  // Check if we have any data to display
  const hasData = phases.length > 0 || telemetry.processingTimeMs > 0;

  // Empty state
  if (!hasData && status === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Layers className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground">
          {t.emptyProcess?.[locale] ?? 'Generation not started yet'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      {/* Left Column: Forge Pipeline (60% = 3/5) */}
      <div className="col-span-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-orange-500" />
              {t.forgePipeline?.[locale] ?? 'Assembly Pipeline'}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t.forgePipelineDesc?.[locale] ?? 'Transforming blueprint into course structure'}
            </p>
          </CardHeader>
          <CardContent className="space-y-1">
            {phases.map((phase) => (
              <PhaseRow key={phase.id} phase={phase} locale={locale} />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Telemetry Grid (40% = 2/5) */}
      <div className="col-span-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-orange-500" />
              {t.telemetry?.[locale] ?? 'Telemetry'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* 2x3 Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <TelemetryItem
                icon={Clock}
                label={t.processingTime?.[locale] ?? 'Time'}
                value={
                  telemetry.processingTimeMs > 0
                    ? `${(telemetry.processingTimeMs / 1000).toFixed(1)}s`
                    : '-'
                }
                colorClass="text-blue-500"
              />
              <TelemetryItem
                icon={Coins}
                label={t.tokensUsed?.[locale] ?? 'Tokens'}
                value={
                  telemetry.totalTokens > 0
                    ? `${(telemetry.totalTokens / 1000).toFixed(1)}k`
                    : '-'
                }
                colorClass="text-orange-500"
              />
              <TelemetryItem
                icon={DollarSign}
                label={t.costLabel?.[locale] ?? 'Cost'}
                value={
                  telemetry.costUsd !== undefined && telemetry.costUsd > 0
                    ? `$${telemetry.costUsd.toFixed(3)}`
                    : '-'
                }
                colorClass="text-green-500"
              />
              <TelemetryItem
                icon={Target}
                label={t.qualityScore?.[locale] ?? 'Quality'}
                value={
                  telemetry.qualityScore !== undefined
                    ? `${Math.round(telemetry.qualityScore * 100)}%`
                    : '-'
                }
                colorClass="text-emerald-500"
              />
              <TelemetryItem
                icon={Layers}
                label={t.sectionsCount?.[locale] ?? 'Sections'}
                value={
                  telemetry.sectionsCount !== undefined
                    ? telemetry.sectionsCount.toString()
                    : '-'
                }
                colorClass="text-amber-500"
              />
              <TelemetryItem
                icon={BookOpen}
                label={t.lessonsCount?.[locale] ?? 'Lessons'}
                value={
                  telemetry.lessonsCount !== undefined
                    ? telemetry.lessonsCount.toString()
                    : '-'
                }
                colorClass="text-violet-500"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});

export default Stage5ProcessTab;
