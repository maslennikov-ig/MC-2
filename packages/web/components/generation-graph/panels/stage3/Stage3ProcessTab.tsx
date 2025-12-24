'use client';

import React, { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  BookOpen,
  GitBranch,
  Scale,
  MessageSquare,
  ShieldCheck,
  Clock,
  BrainCircuit,
  FileText,
  Cpu,
} from 'lucide-react';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { formatDuration } from '@/lib/generation-graph/format-utils';
import { getTierModelName } from '@/lib/generation-graph/constants';
import type {
  Stage3ProcessTabProps,
  ClassificationPhase,
  ClassificationPhaseId,
  ClassificationPhaseStatus,
  TelemetryData,
} from './types';

/**
 * Status icon mapping with colors for phase status
 */
const statusConfig: Record<
  ClassificationPhaseStatus,
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
    colorClass: 'text-amber-500',
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
};

/**
 * Phase configuration with icons and colors
 */
const phaseConfig: Record<
  ClassificationPhaseId,
  {
    icon: React.ElementType;
    colorClass: string;
    bgClass: string;
  }
> = {
  context_loading: {
    icon: BookOpen,
    colorClass: 'text-blue-600',
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
  },
  strategy_selection: {
    icon: GitBranch,
    colorClass: 'text-amber-600',
    bgClass: 'bg-amber-100 dark:bg-amber-900/30',
  },
  comparative_analysis: {
    icon: Scale,
    colorClass: 'text-purple-600',
    bgClass: 'bg-purple-100 dark:bg-purple-900/30',
  },
  rationale_generation: {
    icon: MessageSquare,
    colorClass: 'text-indigo-600',
    bgClass: 'bg-indigo-100 dark:bg-indigo-900/30',
  },
  hierarchy_finalization: {
    icon: ShieldCheck,
    colorClass: 'text-emerald-600',
    bgClass: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
};

/**
 * Generates default classification phases based on overall status
 * Used when no explicit phases are provided
 */
function generateDefaultPhases(
  status: 'pending' | 'active' | 'completed' | 'error',
  locale: 'ru' | 'en'
): ClassificationPhase[] {
  const t = GRAPH_TRANSLATIONS.stage3 as Record<string, { ru: string; en: string }>;

  const phaseDefinitions: Array<{
    id: ClassificationPhaseId;
    nameKey: string;
    descKey: string;
    mockDuration: number;
  }> = [
    {
      id: 'context_loading',
      nameKey: 'phaseContextLoading',
      descKey: 'phaseContextLoadingDesc',
      mockDuration: 120,
    },
    {
      id: 'strategy_selection',
      nameKey: 'phaseStrategySelection',
      descKey: 'phaseStrategySelectionDesc',
      mockDuration: 85,
    },
    {
      id: 'comparative_analysis',
      nameKey: 'phaseComparativeAnalysis',
      descKey: 'phaseComparativeAnalysisDesc',
      mockDuration: 3500,
    },
    {
      id: 'rationale_generation',
      nameKey: 'phaseRationaleGeneration',
      descKey: 'phaseRationaleGenerationDesc',
      mockDuration: 1200,
    },
    {
      id: 'hierarchy_finalization',
      nameKey: 'phaseHierarchyFinalization',
      descKey: 'phaseHierarchyFinalizationDesc',
      mockDuration: 180,
    },
  ];

  if (status === 'completed') {
    return phaseDefinitions.map((def) => ({
      id: def.id,
      name: t[def.nameKey]?.[locale] ?? def.id,
      description: t[def.descKey]?.[locale],
      status: 'completed' as const,
      durationMs: def.mockDuration,
    }));
  }

  if (status === 'error') {
    return phaseDefinitions.map((def, index) => ({
      id: def.id,
      name: t[def.nameKey]?.[locale] ?? def.id,
      description: t[def.descKey]?.[locale],
      status:
        index === phaseDefinitions.length - 1
          ? ('error' as const)
          : ('completed' as const),
      durationMs:
        index === phaseDefinitions.length - 1 ? undefined : def.mockDuration,
      message:
        index === phaseDefinitions.length - 1
          ? 'Classification validation failed'
          : undefined,
    }));
  }

  if (status === 'active') {
    // First phase is active, rest are pending
    return phaseDefinitions.map((def, index) => ({
      id: def.id,
      name: t[def.nameKey]?.[locale] ?? def.id,
      description: t[def.descKey]?.[locale],
      status: index === 0 ? ('active' as const) : ('pending' as const),
      durationMs: undefined,
    }));
  }

  // Pending: all phases are pending
  return phaseDefinitions.map((def) => ({
    id: def.id,
    name: t[def.nameKey]?.[locale] ?? def.id,
    description: t[def.descKey]?.[locale],
    status: 'pending' as const,
    durationMs: undefined,
  }));
}

/**
 * Individual phase row component
 */
interface PhaseRowProps {
  phase: ClassificationPhase;
  locale: 'ru' | 'en';
}

const PhaseRow = memo<PhaseRowProps>(function PhaseRow({ phase, locale }) {
  const t = GRAPH_TRANSLATIONS.stage3 as Record<string, { ru: string; en: string }>;
  const config = phaseConfig[phase.id];
  const statusCfg = statusConfig[phase.status];
  const PhaseIcon = config?.icon ?? Circle;
  const StatusIcon = statusCfg.icon;

  // Get description from translations if not in phase
  const getDescription = (): string => {
    if (phase.description) return phase.description;

    const descMap: Record<ClassificationPhaseId, string | undefined> = {
      context_loading: t.phaseContextLoadingDesc?.[locale],
      strategy_selection: t.phaseStrategySelectionDesc?.[locale],
      comparative_analysis: t.phaseComparativeAnalysisDesc?.[locale],
      rationale_generation: t.phaseRationaleGenerationDesc?.[locale],
      hierarchy_finalization: t.phaseHierarchyFinalizationDesc?.[locale],
    };

    return descMap[phase.id] ?? '';
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg transition-colors duration-200',
        phase.status === 'error' && 'bg-red-50 dark:bg-red-950/20',
        phase.status === 'completed' && 'bg-green-50/50 dark:bg-green-950/10',
        phase.status === 'active' && 'bg-amber-50/50 dark:bg-amber-950/10',
        phase.status === 'pending' && 'bg-muted/30'
      )}
    >
      {/* Phase type icon */}
      <div
        className={cn(
          'mt-0.5 flex-shrink-0 p-1.5 rounded-md',
          config?.bgClass ?? 'bg-muted'
        )}
      >
        <PhaseIcon className={cn('h-4 w-4', config?.colorClass ?? 'text-muted-foreground')} />
      </div>

      {/* Phase details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'font-medium text-sm',
              phase.status === 'error' && 'text-red-700 dark:text-red-400',
              phase.status === 'completed' && 'text-foreground',
              phase.status === 'active' && 'text-amber-700 dark:text-amber-400',
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
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
});

/**
 * Default telemetry data
 */
function getDefaultTelemetry(): TelemetryData {
  return {
    processingTimeMs: 0,
    totalTokens: 0,
    documentsProcessed: 0,
    tier: 'standard',
  };
}

/**
 * Stage3ProcessTab Component
 *
 * Displays an "Execution Audit" showing the classification process phases
 * and telemetry metrics. Split view with logic pipeline on left and
 * telemetry card on right.
 */
export const Stage3ProcessTab = memo<Stage3ProcessTabProps>(function Stage3ProcessTab({
  phases: providedPhases,
  telemetry: providedTelemetry,
  status = 'completed',
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage3 as Record<string, { ru: string; en: string }>;

  // Generate default phases if not provided
  const phases = providedPhases || generateDefaultPhases(status, locale);
  const telemetry = providedTelemetry || getDefaultTelemetry();

  // Check if we have any data to display
  const hasData = phases.length > 0 || telemetry.processingTimeMs > 0;

  // Empty state
  if (!hasData && status === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Scale className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground">
          {t.emptyProcess?.[locale] ?? 'Classification not started yet'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      {/* Left Column: Logic Pipeline (60% = 3/5) */}
      <div className="col-span-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Scale className="h-4 w-4 text-amber-500" />
              {t.executionAudit?.[locale] ?? 'Execution Audit'}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t.executionAuditDesc?.[locale] ?? 'Classification system execution log'}
            </p>
          </CardHeader>
          <CardContent className="space-y-1">
            {phases.map((phase) => (
              <PhaseRow key={phase.id} phase={phase} locale={locale} />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Telemetry Card (40% = 2/5) */}
      <div className="col-span-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Cpu className="h-4 w-4 text-amber-500" />
              {t.telemetry?.[locale] ?? 'Telemetry'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* 2x2 Metrics Grid */}
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
                icon={BrainCircuit}
                label={t.tokenLoad?.[locale] ?? 'Tokens'}
                value={
                  telemetry.totalTokens > 0
                    ? `${(telemetry.totalTokens / 1000).toFixed(1)}k`
                    : '-'
                }
                colorClass="text-purple-500"
              />
              <TelemetryItem
                icon={FileText}
                label={t.filesProcessed?.[locale] ?? 'Files'}
                value={telemetry.documentsProcessed > 0 ? String(telemetry.documentsProcessed) : '-'}
                colorClass="text-emerald-500"
              />
              <TelemetryItem
                icon={Cpu}
                label={t.modelUsed?.[locale] ?? 'Model'}
                value={getTierModelName(telemetry.tier, locale)}
                colorClass="text-amber-500"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});

export default Stage3ProcessTab;
