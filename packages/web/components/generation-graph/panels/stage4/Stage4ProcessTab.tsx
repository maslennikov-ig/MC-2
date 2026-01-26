'use client'

import React, { memo, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
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
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { formatDuration } from '@/lib/generation-graph/format-utils'
import type {
  Stage4ProcessTabProps,
  Stage4Phase,
  Stage4PhaseId,
  Stage4PhaseStatus,
  Stage4TelemetryData,
  InsightMessage,
} from './types'
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result'

/**
 * Status icon mapping with colors for phase status
 */
const statusConfig: Record<
  Stage4PhaseStatus,
  {
    icon: React.ElementType
    colorClass: string
    animate?: boolean
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
}

/**
 * Phase configuration with icons and colors - Violet theme
 */
const phaseConfig: Record<
  Stage4PhaseId,
  {
    icon: React.ElementType
    colorClass: string
    bgClass: string
    isHighlight?: boolean
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
}

/** Phase definition structure */
const PHASE_DEFINITIONS: Array<{
  id: Stage4PhaseId
  nameKey: string
  descKey: string
  mockDuration: number
}> = [
  { id: 'phase_0', nameKey: 'phaseAudit', descKey: 'phaseAuditDesc', mockDuration: 150 },
  { id: 'phase_1', nameKey: 'phaseClassify', descKey: 'phaseClassifyDesc', mockDuration: 2500 },
  { id: 'phase_2', nameKey: 'phaseScoping', descKey: 'phaseScopingDesc', mockDuration: 1800 },
  { id: 'phase_3', nameKey: 'phaseStrategy', descKey: 'phaseStrategyDesc', mockDuration: 4500 },
  { id: 'phase_4', nameKey: 'phaseSynthesis', descKey: 'phaseSynthesisDesc', mockDuration: 3200 },
  { id: 'phase_5', nameKey: 'phaseBlueprint', descKey: 'phaseBlueprintDesc', mockDuration: 1200 },
  { id: 'phase_6', nameKey: 'phaseMapping', descKey: 'phaseMappingDesc', mockDuration: 800 },
]

/** Translation function type for helper functions */
type TranslatorFn = (key: string, params?: Record<string, string | number>) => string

/**
 * Generates default phases based on overall status
 */
function generateDefaultPhases(
  status: 'pending' | 'active' | 'completed' | 'error',
  t: TranslatorFn
): Stage4Phase[] {
  if (status === 'completed') {
    return PHASE_DEFINITIONS.map((def) => ({
      id: def.id,
      name: t(def.nameKey),
      description: t(def.descKey),
      status: 'completed' as const,
      durationMs: def.mockDuration,
    }))
  }

  if (status === 'error') {
    return PHASE_DEFINITIONS.map((def, index) => ({
      id: def.id,
      name: t(def.nameKey),
      description: t(def.descKey),
      status: index === PHASE_DEFINITIONS.length - 1 ? ('error' as const) : ('completed' as const),
      durationMs: index === PHASE_DEFINITIONS.length - 1 ? undefined : def.mockDuration,
      message: index === PHASE_DEFINITIONS.length - 1 ? 'Analysis validation failed' : undefined,
    }))
  }

  if (status === 'active') {
    // First phase is active, rest are pending
    return PHASE_DEFINITIONS.map((def, index) => ({
      id: def.id,
      name: t(def.nameKey),
      description: t(def.descKey),
      status: index === 0 ? ('active' as const) : ('pending' as const),
      durationMs: undefined,
    }))
  }

  // Pending: all phases are pending
  return PHASE_DEFINITIONS.map((def) => ({
    id: def.id,
    name: t(def.nameKey),
    description: t(def.descKey),
    status: 'pending' as const,
    durationMs: undefined,
  }))
}

/**
 * Generate synthetic insight messages from AnalysisResult
 */
function generateInsightMessages(outputData: unknown, t: TranslatorFn): InsightMessage[] {
  const messages: InsightMessage[] = []

  if (!outputData || typeof outputData !== 'object') {
    return messages
  }

  const data = outputData as Partial<AnalysisResult>

  // Category decision
  if (data.course_category?.primary && data.course_category?.confidence !== undefined) {
    const categoryKey = `category${data.course_category.primary.charAt(0).toUpperCase()}${data.course_category.primary.slice(1)}`
    const categoryName = t(categoryKey)
    const confidence = Math.round(data.course_category.confidence * 100)

    messages.push({
      id: 'category-decision',
      timestamp: new Date(),
      type: 'decision',
      message: t('insightCategorySelected', { category: categoryName, confidence }),
      phase: 'phase_1',
    })
  }

  // Strategy selection - now based on assessment_approach
  if (data.pedagogical_strategy?.assessment_approach) {
    const assessmentPreview = data.pedagogical_strategy.assessment_approach.substring(0, 50) + '...'
    messages.push({
      id: 'strategy-decision',
      timestamp: new Date(),
      type: 'decision',
      message: t('insightStrategySelected', { strategy: assessmentPreview }),
      phase: 'phase_3',
    })
  }

  // Structure recommendation
  if (data.recommended_structure?.total_sections && data.recommended_structure?.total_lessons) {
    messages.push({
      id: 'structure-decision',
      timestamp: new Date(),
      type: 'info',
      message: t('insightStructureRecommended', {
        sections: data.recommended_structure.total_sections,
        lessons: data.recommended_structure.total_lessons,
      }),
      phase: 'phase_5',
    })
  }

  return messages
}

/**
 * Individual phase row component
 */
interface PhaseRowProps {
  phase: Stage4Phase
}

const PhaseRow = memo<PhaseRowProps>(function PhaseRow({ phase }) {
  const t = useTranslations('generation.stage4')
  const config = phaseConfig[phase.id]
  const statusCfg = statusConfig[phase.status]
  const PhaseIcon = config?.icon ?? Circle
  const StatusIcon = statusCfg.icon
  const isHighlight = config?.isHighlight ?? false

  // Get description from translations if not in phase
  const getDescription = (): string => {
    if (phase.description) return phase.description

    const descMap: Record<Stage4PhaseId, string> = {
      phase_0: t('phaseAuditDesc'),
      phase_1: t('phaseClassifyDesc'),
      phase_2: t('phaseScopingDesc'),
      phase_3: t('phaseStrategyDesc'),
      phase_4: t('phaseSynthesisDesc'),
      phase_5: t('phaseBlueprintDesc'),
      phase_6: t('phaseMappingDesc'),
    }

    return descMap[phase.id] ?? ''
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg p-3 transition-colors duration-200',
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
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'text-sm font-medium',
              isHighlight && 'text-base',
              phase.status === 'error' && 'text-red-700 dark:text-red-400',
              phase.status === 'completed' && 'text-foreground',
              phase.status === 'active' && 'text-violet-700 dark:text-violet-400',
              phase.status === 'pending' && 'text-muted-foreground'
            )}
          >
            {phase.name}
          </span>

          <div className="flex flex-shrink-0 items-center gap-2">
            {/* Duration badge */}
            {phase.durationMs !== undefined && phase.durationMs > 0 && (
              <span className="text-muted-foreground font-mono text-xs">
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

        <p className="text-muted-foreground mt-0.5 text-sm">{getDescription()}</p>

        {/* Error message */}
        {phase.status === 'error' && phase.message && (
          <div className="mt-2 rounded-md bg-red-100 p-2 dark:bg-red-900/30">
            <p className="font-mono text-sm text-red-700 dark:text-red-300">{phase.message}</p>
          </div>
        )}
      </div>
    </div>
  )
})

/**
 * Telemetry metric item component
 */
interface TelemetryItemProps {
  icon: React.ElementType
  label: string
  value: string
  colorClass?: string
}

const TelemetryItem = memo<TelemetryItemProps>(function TelemetryItem({
  icon: Icon,
  label,
  value,
  colorClass = 'text-muted-foreground',
}) {
  return (
    <div className="bg-muted/50 flex flex-col items-center rounded-lg p-3">
      <Icon className={cn('mb-1 h-5 w-5', colorClass)} />
      <span className="text-foreground font-mono text-lg font-semibold">{value}</span>
      <span className="text-muted-foreground text-center text-xs">{label}</span>
    </div>
  )
})

/**
 * Insight Terminal component - console-style display
 */
interface InsightTerminalComponentProps {
  messages: InsightMessage[]
}

const InsightTerminalComponent = memo<InsightTerminalComponentProps>(
  function InsightTerminalComponent({ messages }) {
    const t = useTranslations('generation.stage4')

    const getTypePrefix = (type: InsightMessage['type']): string => {
      switch (type) {
        case 'decision':
          return t('insightDecision')
        case 'warning':
          return t('insightWarning')
        default:
          return t('insightInfo')
      }
    }

    const getTypeColor = (type: InsightMessage['type']): string => {
      switch (type) {
        case 'decision':
          return 'text-violet-400'
        case 'warning':
          return 'text-amber-400'
        default:
          return 'text-emerald-400'
      }
    }

    if (messages.length === 0) {
      return null
    }

    return (
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Terminal className="h-4 w-4 text-violet-500" />
            {t('insightTerminal')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-zinc-900 p-3 font-mono text-sm dark:bg-zinc-950">
            {messages.map((msg) => (
              <div key={msg.id} className="mb-1 flex gap-2 last:mb-0">
                <span className={cn('flex-shrink-0', getTypeColor(msg.type))}>
                  [{getTypePrefix(msg.type)}]
                </span>
                <span className="text-zinc-300">{msg.message}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }
)

/**
 * Default telemetry data
 */
function getDefaultTelemetry(): Stage4TelemetryData {
  return {
    processingTimeMs: 0,
    totalTokens: 0,
    tier: 'standard',
  }
}

/**
 * Extract telemetry from output data
 */
function extractTelemetryFromOutput(outputData: unknown): Partial<Stage4TelemetryData> {
  if (!outputData || typeof outputData !== 'object') {
    return {}
  }

  const data = outputData as Partial<AnalysisResult>
  const result: Partial<Stage4TelemetryData> = {}

  if (data.course_category?.confidence !== undefined) {
    result.confidence = Math.round(data.course_category.confidence * 100)
  }

  if (data.topic_analysis?.complexity) {
    result.complexity = data.topic_analysis.complexity
  }

  if (data.metadata?.total_duration_ms) {
    result.processingTimeMs = data.metadata.total_duration_ms
  }

  if (data.metadata?.total_tokens?.total) {
    result.totalTokens = data.metadata.total_tokens.total
  }

  return result
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
  locale: _locale = 'ru',
}) {
  const t = useTranslations('generation.stage4')

  // Generate default phases if not provided
  const phases = providedPhases || generateDefaultPhases(status, t as TranslatorFn)

  // Extract telemetry from output data and merge with provided
  const extractedTelemetry = useMemo(() => extractTelemetryFromOutput(outputData), [outputData])
  const telemetry: Stage4TelemetryData = {
    ...getDefaultTelemetry(),
    ...providedTelemetry,
    ...extractedTelemetry,
  }

  // Generate insight messages from output data
  const insightMessages = useMemo(
    () => generateInsightMessages(outputData, t as TranslatorFn),
    [outputData, t]
  )

  // Check if we have any data to display
  const hasData = phases.length > 0 || telemetry.processingTimeMs > 0

  // Empty state
  if (!hasData && status === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <GraduationCap className="text-muted-foreground/50 mb-4 h-12 w-12" />
        <p className="text-muted-foreground text-sm">{t('emptyProcess')}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      {/* Left Column: Cognitive Pipeline (60% = 3/5) */}
      <div className="col-span-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <GraduationCap className="h-4 w-4 text-violet-500" />
              {t('analysisPipeline')}
            </CardTitle>
            <p className="text-muted-foreground text-sm">{t('analysisPipelineDesc')}</p>
          </CardHeader>
          <CardContent className="space-y-1">
            {phases.map((phase) => (
              <PhaseRow key={phase.id} phase={phase} />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Telemetry Grid (40% = 2/5) + InsightTerminal */}
      <div className="col-span-2 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <BrainCircuit className="h-4 w-4 text-violet-500" />
              {t('telemetry')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* 2x2 Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <TelemetryItem
                icon={Clock}
                label={t('processingTime')}
                value={
                  telemetry.processingTimeMs > 0
                    ? `${(telemetry.processingTimeMs / 1000).toFixed(1)}s`
                    : '-'
                }
                colorClass="text-blue-500"
              />
              <TelemetryItem
                icon={BrainCircuit}
                label={t('tokensUsed')}
                value={
                  telemetry.totalTokens > 0 ? `${(telemetry.totalTokens / 1000).toFixed(1)}k` : '-'
                }
                colorClass="text-violet-500"
              />
              <TelemetryItem
                icon={Target}
                label={t('confidenceLevel')}
                value={telemetry.confidence !== undefined ? `${telemetry.confidence}%` : '-'}
                colorClass="text-emerald-500"
              />
              <TelemetryItem
                icon={Layers}
                label={t('complexityLevel')}
                value={telemetry.complexity ?? '-'}
                colorClass="text-amber-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Insight Terminal */}
        <InsightTerminalComponent messages={insightMessages} />
      </div>
    </div>
  )
})

export default Stage4ProcessTab
