'use client';

import React, { memo, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  ClipboardCheck,
  Tag,
  Ruler,
  GraduationCap,
  FlaskConical,
  Map,
  Network,
  Clock,
  BrainCircuit,
  Target,
  Layers,
  Terminal,
} from 'lucide-react';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { formatDuration } from '@/lib/generation-graph/format-utils';
import type {
  Stage4ProcessTabProps,
  Stage4Phase,
  Stage4PhaseId,
  Stage4PhaseStatus,
  Stage4TelemetryData,
  InsightMessage,
} from './types';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';

/**
 * Status icon mapping with colors for phase status
 */
const statusConfig: Record<
  Stage4PhaseStatus,
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
    colorClass: 'text-violet-500',
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
 * Phase configuration with icons and colors - Violet theme
 */
const phaseConfig: Record<
  Stage4PhaseId,
  {
    icon: React.ElementType;
    colorClass: string;
    bgClass: string;
    isHighlight?: boolean;
  }
> = {
  phase_0: {
    icon: ClipboardCheck,
    colorClass: 'text-violet-600 dark:text-violet-400',
    bgClass: 'bg-violet-100 dark:bg-violet-900/30',
  },
  phase_1: {
    icon: Tag,
    colorClass: 'text-violet-600 dark:text-violet-400',
    bgClass: 'bg-violet-100 dark:bg-violet-900/30',
  },
  phase_2: {
    icon: Ruler,
    colorClass: 'text-violet-600 dark:text-violet-400',
    bgClass: 'bg-violet-100 dark:bg-violet-900/30',
  },
  phase_3: {
    icon: GraduationCap,
    colorClass: 'text-violet-600 dark:text-violet-400',
    bgClass: 'bg-violet-100 dark:bg-violet-900/30',
  },
  phase_4: {
    icon: FlaskConical,
    colorClass: 'text-violet-600 dark:text-violet-400',
    bgClass: 'bg-violet-100 dark:bg-violet-900/30',
  },
  phase_5: {
    icon: Map,
    colorClass: 'text-violet-600 dark:text-violet-400',
    bgClass: 'bg-violet-100 dark:bg-violet-900/30',
  },
  phase_6: {
    icon: Network,
    colorClass: 'text-violet-600 dark:text-violet-400',
    bgClass: 'bg-violet-100 dark:bg-violet-900/30',
  },
};

/**
 * Generates default phases based on overall status
 */
function generateDefaultPhases(
  status: 'pending' | 'active' | 'completed' | 'error',
  locale: 'ru' | 'en'
): Stage4Phase[] {
  const t = GRAPH_TRANSLATIONS.stage4 as Record<string, { ru: string; en: string }>;

  const phaseDefinitions: Array<{
    id: Stage4PhaseId;
    nameKey: string;
    descKey: string;
    mockDuration: number;
  }> = [
    {
      id: 'phase_0',
      nameKey: 'phaseAudit',
      descKey: 'phaseAuditDesc',
      mockDuration: 150,
    },
    {
      id: 'phase_1',
      nameKey: 'phaseClassify',
      descKey: 'phaseClassifyDesc',
      mockDuration: 2500,
    },
    {
      id: 'phase_2',
      nameKey: 'phaseScoping',
      descKey: 'phaseScopingDesc',
      mockDuration: 1800,
    },
    {
      id: 'phase_3',
      nameKey: 'phaseStrategy',
      descKey: 'phaseStrategyDesc',
      mockDuration: 4500,
    },
    {
      id: 'phase_4',
      nameKey: 'phaseSynthesis',
      descKey: 'phaseSynthesisDesc',
      mockDuration: 3200,
    },
    {
      id: 'phase_5',
      nameKey: 'phaseBlueprint',
      descKey: 'phaseBlueprintDesc',
      mockDuration: 1200,
    },
    {
      id: 'phase_6',
      nameKey: 'phaseMapping',
      descKey: 'phaseMappingDesc',
      mockDuration: 800,
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
          ? 'Analysis validation failed'
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
 * Generate synthetic insight messages from AnalysisResult
 */
function generateInsightMessages(
  outputData: unknown,
  locale: 'ru' | 'en'
): InsightMessage[] {
  const t = GRAPH_TRANSLATIONS.stage4 as Record<string, { ru: string; en: string }>;
  const messages: InsightMessage[] = [];

  if (!outputData || typeof outputData !== 'object') {
    return messages;
  }

  const data = outputData as Partial<AnalysisResult>;

  // Category decision
  if (data.course_category?.primary && data.course_category?.confidence !== undefined) {
    const categoryKey = `category${data.course_category.primary.charAt(0).toUpperCase()}${data.course_category.primary.slice(1)}` as keyof typeof t;
    const categoryName = t[categoryKey]?.[locale] ?? data.course_category.primary;
    const confidence = Math.round(data.course_category.confidence * 100);

    const template = t.insightCategorySelected?.[locale] ?? 'Category determined: {category} (confidence {confidence}%)';
    messages.push({
      id: 'category-decision',
      timestamp: new Date(),
      type: 'decision',
      message: template.replace('{category}', categoryName).replace('{confidence}', String(confidence)),
      phase: 'phase_1',
    });
  }

  // Strategy selection
  if (data.pedagogical_strategy?.teaching_style) {
    const styleKey = `style${data.pedagogical_strategy.teaching_style.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}` as keyof typeof t;
    const styleName = t[styleKey]?.[locale] ?? data.pedagogical_strategy.teaching_style;

    const template = t.insightStrategySelected?.[locale] ?? 'Strategy selected: {strategy}';
    messages.push({
      id: 'strategy-decision',
      timestamp: new Date(),
      type: 'decision',
      message: template.replace('{strategy}', styleName),
      phase: 'phase_3',
    });
  }

  // Structure recommendation
  if (data.recommended_structure?.total_sections && data.recommended_structure?.total_lessons) {
    const template = t.insightStructureRecommended?.[locale] ?? 'Recommended structure: {sections} modules, {lessons} lessons';
    messages.push({
      id: 'structure-decision',
      timestamp: new Date(),
      type: 'info',
      message: template
        .replace('{sections}', String(data.recommended_structure.total_sections))
        .replace('{lessons}', String(data.recommended_structure.total_lessons)),
      phase: 'phase_5',
    });
  }

  return messages;
}

/**
 * Individual phase row component
 */
interface PhaseRowProps {
  phase: Stage4Phase;
  locale: 'ru' | 'en';
}

const PhaseRow = memo<PhaseRowProps>(function PhaseRow({ phase, locale }) {
  const t = GRAPH_TRANSLATIONS.stage4 as Record<string, { ru: string; en: string }>;
  const config = phaseConfig[phase.id];
  const statusCfg = statusConfig[phase.status];
  const PhaseIcon = config?.icon ?? Circle;
  const StatusIcon = statusCfg.icon;
  const isHighlight = config?.isHighlight ?? false;

  // Get description from translations if not in phase
  const getDescription = (): string => {
    if (phase.description) return phase.description;

    const descMap: Record<Stage4PhaseId, string | undefined> = {
      phase_0: t.phaseAuditDesc?.[locale],
      phase_1: t.phaseClassifyDesc?.[locale],
      phase_2: t.phaseScopingDesc?.[locale],
      phase_3: t.phaseStrategyDesc?.[locale],
      phase_4: t.phaseSynthesisDesc?.[locale],
      phase_5: t.phaseBlueprintDesc?.[locale],
      phase_6: t.phaseMappingDesc?.[locale],
    };

    return descMap[phase.id] ?? '';
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg transition-colors duration-200',
        phase.status === 'error' && 'bg-red-50 dark:bg-red-950/20',
        phase.status === 'completed' && 'bg-green-50/50 dark:bg-green-950/10',
        phase.status === 'active' && 'bg-violet-50/50 dark:bg-violet-950/10',
        phase.status === 'pending' && 'bg-muted/30',
        isHighlight && phase.status !== 'error' && 'ring-1 ring-violet-300 dark:ring-violet-700'
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
              phase.status === 'active' && 'text-violet-700 dark:text-violet-400',
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
      <span className="text-xs text-muted-foreground text-center">{label}</span>
    </div>
  );
});

/**
 * Insight Terminal component - console-style display
 */
interface InsightTerminalComponentProps {
  messages: InsightMessage[];
  locale: 'ru' | 'en';
}

const InsightTerminalComponent = memo<InsightTerminalComponentProps>(function InsightTerminalComponent({
  messages,
  locale,
}) {
  const t = GRAPH_TRANSLATIONS.stage4 as Record<string, { ru: string; en: string }>;

  const getTypePrefix = (type: InsightMessage['type']): string => {
    switch (type) {
      case 'decision':
        return t.insightDecision?.[locale] ?? 'Decision';
      case 'warning':
        return t.insightWarning?.[locale] ?? 'Warning';
      default:
        return t.insightInfo?.[locale] ?? 'Info';
    }
  };

  const getTypeColor = (type: InsightMessage['type']): string => {
    switch (type) {
      case 'decision':
        return 'text-violet-400';
      case 'warning':
        return 'text-amber-400';
      default:
        return 'text-emerald-400';
    }
  };

  if (messages.length === 0) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Terminal className="h-4 w-4 text-violet-500" />
          {t.insightTerminal?.[locale] ?? 'AI Decision Stream'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="bg-zinc-900 dark:bg-zinc-950 rounded-lg p-3 font-mono text-sm">
          {messages.map((msg) => (
            <div key={msg.id} className="flex gap-2 mb-1 last:mb-0">
              <span className={cn('flex-shrink-0', getTypeColor(msg.type))}>
                [{getTypePrefix(msg.type)}]
              </span>
              <span className="text-zinc-300">{msg.message}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

/**
 * Default telemetry data
 */
function getDefaultTelemetry(): Stage4TelemetryData {
  return {
    processingTimeMs: 0,
    totalTokens: 0,
    tier: 'standard',
  };
}

/**
 * Extract telemetry from output data
 */
function extractTelemetryFromOutput(outputData: unknown): Partial<Stage4TelemetryData> {
  if (!outputData || typeof outputData !== 'object') {
    return {};
  }

  const data = outputData as Partial<AnalysisResult>;
  const result: Partial<Stage4TelemetryData> = {};

  if (data.course_category?.confidence !== undefined) {
    result.confidence = Math.round(data.course_category.confidence * 100);
  }

  if (data.topic_analysis?.complexity) {
    result.complexity = data.topic_analysis.complexity;
  }

  if (data.metadata?.total_duration_ms) {
    result.processingTimeMs = data.metadata.total_duration_ms;
  }

  if (data.metadata?.total_tokens?.total) {
    result.totalTokens = data.metadata.total_tokens.total;
  }

  return result;
}

/**
 * Stage4ProcessTab Component
 *
 * Displays a "Cognitive Pipeline" showing the 7-phase analysis process
 * with telemetry metrics and an insight terminal. Split view with
 * pipeline on left (60%) and telemetry + terminal on right (40%).
 */
export const Stage4ProcessTab = memo<Stage4ProcessTabProps>(function Stage4ProcessTab({
  phases: providedPhases,
  telemetry: providedTelemetry,
  outputData,
  status = 'completed',
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage4 as Record<string, { ru: string; en: string }>;

  // Generate default phases if not provided
  const phases = providedPhases || generateDefaultPhases(status, locale);

  // Extract telemetry from output data and merge with provided
  const extractedTelemetry = useMemo(
    () => extractTelemetryFromOutput(outputData),
    [outputData]
  );
  const telemetry: Stage4TelemetryData = {
    ...getDefaultTelemetry(),
    ...providedTelemetry,
    ...extractedTelemetry,
  };

  // Generate insight messages from output data
  const insightMessages = useMemo(
    () => generateInsightMessages(outputData, locale),
    [outputData, locale]
  );

  // Check if we have any data to display
  const hasData = phases.length > 0 || telemetry.processingTimeMs > 0;

  // Empty state
  if (!hasData && status === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <GraduationCap className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground">
          {t.emptyProcess?.[locale] ?? 'Analysis not started yet'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      {/* Left Column: Cognitive Pipeline (60% = 3/5) */}
      <div className="col-span-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-violet-500" />
              {t.analysisPipeline?.[locale] ?? 'Analysis Pipeline'}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t.analysisPipelineDesc?.[locale] ?? 'Transforming materials into course blueprint'}
            </p>
          </CardHeader>
          <CardContent className="space-y-1">
            {phases.map((phase) => (
              <PhaseRow key={phase.id} phase={phase} locale={locale} />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Telemetry Grid (40% = 2/5) + InsightTerminal */}
      <div className="col-span-2 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-violet-500" />
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
                label={t.tokensUsed?.[locale] ?? 'Tokens'}
                value={
                  telemetry.totalTokens > 0
                    ? `${(telemetry.totalTokens / 1000).toFixed(1)}k`
                    : '-'
                }
                colorClass="text-violet-500"
              />
              <TelemetryItem
                icon={Target}
                label={t.confidenceLevel?.[locale] ?? 'Confidence'}
                value={
                  telemetry.confidence !== undefined
                    ? `${telemetry.confidence}%`
                    : '-'
                }
                colorClass="text-emerald-500"
              />
              <TelemetryItem
                icon={Layers}
                label={t.complexityLevel?.[locale] ?? 'Complexity'}
                value={telemetry.complexity ?? '-'}
                colorClass="text-amber-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Insight Terminal */}
        <InsightTerminalComponent messages={insightMessages} locale={locale} />
      </div>
    </div>
  );
});

export default Stage4ProcessTab;
