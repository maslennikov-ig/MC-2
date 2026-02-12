/**
 * StageDetailSheet Component
 *
 * Slide-over panel showing detailed information about a pipeline stage.
 * Includes tabs for Overview, Models, and Prompts with edit capabilities.
 *
 * Models tab shows database-driven model configurations grouped by language and tier.
 *
 * @module app/admin/pipeline/components/stage-detail-sheet
 */

'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Clock,
  DollarSign,
  Cpu,
  FileText,
  Settings2,
  ChevronRight,
  Thermometer,
  Hash,
  Layers,
  Sparkles,
  Zap,
  Shield,
  Database,
  ImageIcon,
  Video,
  Headphones,
  HelpCircle,
  Presentation,
  LayoutGrid,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDuration } from '@megacampus/shared-utils'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc/react'
import type { PipelineStage, ModelConfigWithVersion, JudgeConfig } from '@megacampus/shared-types'
import {
  calculateContextThreshold,
  DEFAULT_CONTEXT_RESERVE,
  MAX_RESERVE_PERCENT,
} from '@megacampus/shared-types'
import { JudgeEditorDialog } from './judge-editor-dialog'

interface PromptTemplate {
  id: string
  stage: string
  promptKey: string
  promptName: string
  promptDescription: string | null
  promptTemplate: string
  variables: Array<{
    name: string
    description: string
    required: boolean
    example?: string
  }>
  version: number
}

interface StageDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stage: PipelineStage | null
  onEditModel?: (model: ModelConfigWithVersion) => void
  onEditPrompt?: (prompt: PromptTemplate) => void
  /** Key to trigger data refresh (increment after external saves) */
  refreshKey?: number
}

/**
 * Clickable tooltip component - shows on hover and click
 */
function ClickableTooltip({ content, children }: { content: string; children?: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center"
          onClick={(e) => e.stopPropagation()}
        >
          {children || (
            <HelpCircle className="text-muted-foreground hover:text-foreground h-3.5 w-3.5 cursor-help transition-colors" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="max-w-[350px] text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <p>{content}</p>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Stage color mapping for visual distinction
 */
const stageColors: Record<number, { bg: string; text: string; border: string; gradient: string }> =
  {
    1: {
      bg: 'bg-sky-500/10',
      text: 'text-sky-400',
      border: 'border-sky-500/30',
      gradient: 'from-sky-500 to-sky-600',
    },
    2: {
      bg: 'bg-violet-500/10',
      text: 'text-violet-400',
      border: 'border-violet-500/30',
      gradient: 'from-violet-500 to-violet-600',
    },
    3: {
      bg: 'bg-blue-500/10',
      text: 'text-blue-400',
      border: 'border-blue-500/30',
      gradient: 'from-blue-500 to-blue-600',
    },
    4: {
      bg: 'bg-purple-500/10',
      text: 'text-purple-400',
      border: 'border-purple-500/30',
      gradient: 'from-purple-500 to-purple-600',
    },
    5: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      gradient: 'from-emerald-500 to-emerald-600',
    },
    6: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      gradient: 'from-amber-500 to-amber-600',
    },
    7: {
      bg: 'bg-rose-500/10',
      text: 'text-rose-400',
      border: 'border-rose-500/30',
      gradient: 'from-rose-500 to-rose-600',
    },
  }

/**
 * Stage 7 Enrichment activity types with their configurations
 */
const ENRICHMENT_ACTIVITIES = [
  { key: 'cover', icon: ImageIcon, label: 'Cover', labelRu: 'Обложка', color: 'text-cyan-500' },
  {
    key: 'card',
    icon: LayoutGrid,
    label: 'Visual Card',
    labelRu: 'Карточка',
    color: 'text-pink-500',
  },
  { key: 'video', icon: Video, label: 'Video', labelRu: 'Видео', color: 'text-red-500' },
  { key: 'audio', icon: Headphones, label: 'Audio', labelRu: 'Аудио', color: 'text-purple-500' },
  { key: 'quiz', icon: HelpCircle, label: 'Quiz', labelRu: 'Тест', color: 'text-green-500' },
  {
    key: 'presentation',
    icon: Presentation,
    label: 'Presentation',
    labelRu: 'Презентация',
    color: 'text-orange-500',
  },
  // { key: 'document', icon: FileText, label: 'Document', labelRu: 'Документ', color: 'text-blue-500' }, // TODO: Handler not implemented
] as const

/**
 * Map stage number to stage key for filtering
 */
function getStageKey(stageNumber: number): string {
  return `stage_${stageNumber}`
}

/**
 * Format context size for display (e.g., 128K, 1M)
 */
function formatContextSize(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`
  }
  return `${(tokens / 1_000).toFixed(0)}K`
}

/**
 * Calculate threshold label for tier display
 * @param tier - 'standard' or 'extended'
 * @param maxContext - Model's max context tokens (default 128000)
 * @param reservePercent - Language-specific reserve percentage
 * @returns Formatted label like "Standard Tier (<109K tokens)"
 */
function getTierLabel(
  tier: 'standard' | 'extended',
  maxContext: number = 128000,
  reservePercent: number = DEFAULT_CONTEXT_RESERVE.any
): string {
  // Validate maxContext - must be a positive finite number
  if (!Number.isFinite(maxContext) || maxContext <= 0) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[getTierLabel] Invalid maxContext:', {
        maxContext,
        action: 'using default 128000',
      })
    }
    maxContext = 128000
  }

  // Validate and clamp reservePercent
  if (reservePercent < 0 || reservePercent > MAX_RESERVE_PERCENT) {
    // Log warning with structured context
    if (process.env.NODE_ENV === 'development') {
      console.warn('[getTierLabel] Invalid reservePercent:', {
        reservePercent,
        maxAllowed: MAX_RESERVE_PERCENT,
        action: 'clamping',
      })
    }
    reservePercent = Math.max(0, Math.min(reservePercent, MAX_RESERVE_PERCENT))
  }

  const threshold = calculateContextThreshold(maxContext, reservePercent)
  const thresholdK = Math.round(threshold / 1000)

  if (tier === 'standard') {
    return `Standard Tier (<${thresholdK}K tokens)`
  }
  return `Extended Tier (>${thresholdK}K tokens)`
}

/**
 * Group models by language and tier for organized display
 * Supports 'any' language which appears in a dedicated section
 */
function groupModelsByLanguageAndTier(models: ModelConfigWithVersion[]) {
  const grouped: {
    any: { standard: ModelConfigWithVersion[]; extended: ModelConfigWithVersion[] }
    ru: { standard: ModelConfigWithVersion[]; extended: ModelConfigWithVersion[] }
    en: { standard: ModelConfigWithVersion[]; extended: ModelConfigWithVersion[] }
  } = {
    any: { standard: [], extended: [] },
    ru: { standard: [], extended: [] },
    en: { standard: [], extended: [] },
  }

  models.forEach((model) => {
    const lang = (model.language || 'any') as 'any' | 'ru' | 'en'
    const tier = (model.contextTier || 'standard') as 'standard' | 'extended'
    if (grouped[lang]?.[tier]) {
      grouped[lang][tier].push(model)
    }
  })

  return grouped
}

/**
 * Stage detail sheet with tabs for overview, models, and prompts
 */
export function StageDetailSheet({
  open,
  onOpenChange,
  stage,
  onEditModel,
  onEditPrompt,
  refreshKey,
}: StageDetailSheetProps) {
  const t = useTranslations('admin')
  const [activeTab, setActiveTab] = useState('overview')
  const [activeEnrichmentTab, setActiveEnrichmentTab] = useState<string>('cover')
  const [judgeEditorOpen, setJudgeEditorOpen] = useState(false)
  const [selectedJudge, setSelectedJudge] = useState<JudgeConfig | null>(null)

  // Click handler for judge cells
  const handleJudgeClick = (judge: JudgeConfig) => {
    setSelectedJudge(judge)
    setJudgeEditorOpen(true)
  }

  // tRPC queries - enabled when sheet is open
  const isQueryEnabled = open && !!stage

  const { data: allModels = [], isLoading: isLoadingModels } =
    trpc.pipelineAdmin.listModelConfigs.useQuery(undefined, { enabled: isQueryEnabled })

  const { data: allPrompts = {}, isLoading: isLoadingPrompts } =
    trpc.pipelineAdmin.listPromptTemplates.useQuery(undefined, { enabled: isQueryEnabled })

  const { data: reserveData = [], isLoading: isLoadingReserve } =
    trpc.pipelineAdmin.listContextReserveSettings.useQuery(undefined, { enabled: isQueryEnabled })

  const { data: judgeConfigs = [] } = trpc.pipelineAdmin.listJudgeConfigs.useQuery(undefined, {
    enabled: isQueryEnabled && stage?.number === 6,
  })

  const isLoading = isLoadingModels || isLoadingPrompts || isLoadingReserve

  // Derive filtered models for this stage
  const models = useMemo(() => {
    if (!stage) return []
    return allModels.filter((m) => m.phaseName.startsWith(`stage_${stage.number}_`))
  }, [allModels, stage])

  // Derive prompts for this stage
  const prompts = useMemo(() => {
    if (!stage) return [] as PromptTemplate[]
    const stagePrefix = getStageKey(stage.number)
    return (allPrompts[stagePrefix] || []) as PromptTemplate[]
  }, [allPrompts, stage])

  // Derive reserve settings map
  const reserveSettings = useMemo(() => {
    const settingsMap: Record<string, number> = { ...DEFAULT_CONTEXT_RESERVE }
    if (Array.isArray(reserveData)) {
      reserveData.forEach((setting) => {
        settingsMap[setting.language] = setting.reservePercent
      })
    }
    return settingsMap
  }, [reserveData])

  // Invalidate queries when refreshKey changes
  const utils = trpc.useUtils()
  const loadStageData = useCallback(() => {
    void utils.pipelineAdmin.listModelConfigs.invalidate()
    void utils.pipelineAdmin.listPromptTemplates.invalidate()
    void utils.pipelineAdmin.listContextReserveSettings.invalidate()
    if (stage?.number === 6) {
      void utils.pipelineAdmin.listJudgeConfigs.invalidate()
    }
  }, [utils, stage])

  // Reset active tab when stage changes
  useEffect(() => {
    if (open && stage) {
      setActiveTab('overview')
    }
  }, [open, stage])

  // Refresh data when refreshKey changes (after external model/prompt saves)
  useEffect(() => {
    if (open && stage && refreshKey !== undefined && refreshKey > 0) {
      loadStageData()
    }
  }, [refreshKey, open, stage, loadStageData])

  if (!stage) return null

  const colors = stageColors[stage.number] || stageColors[1]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col border-gray-200 bg-white p-0 sm:max-w-xl md:max-w-2xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        {/* Header */}
        <SheetHeader className="border-b border-gray-200 p-6 pb-4 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl',
                'bg-gradient-to-br',
                colors.gradient
              )}
            >
              <span className="text-xl font-bold text-white">{stage.number}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-xl font-semibold text-gray-900 dark:text-zinc-100">
                  {stage.name}
                </SheetTitle>
                <ClickableTooltip
                  content={t(
                    `pipeline.stages.tooltips.stage${stage.number}` as Parameters<typeof t>[0]
                  )}
                >
                  <HelpCircle className="text-muted-foreground hover:text-foreground h-4 w-4 cursor-help transition-colors" />
                </ClickableTooltip>
              </div>
              <SheetDescription className="mt-1 text-gray-600 dark:text-zinc-400">
                {stage.description}
              </SheetDescription>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'px-3 py-1 font-medium',
                stage.status === 'active'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'
              )}
            >
              {stage.status === 'active' ? 'Active' : stage.status}
            </Badge>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-3 border border-gray-200 bg-gray-100 dark:border-zinc-800 dark:bg-zinc-900">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:bg-gray-200 data-[state=active]:text-purple-500 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-cyan-400"
              >
                <Layers className="mr-2 h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="models"
                className="data-[state=active]:bg-gray-200 data-[state=active]:text-purple-500 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-cyan-400"
              >
                <Cpu className="mr-2 h-4 w-4" />
                Models
                {models.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-2 bg-gray-200 text-xs text-gray-700 dark:bg-zinc-700 dark:text-zinc-300"
                  >
                    {models.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="prompts"
                className="data-[state=active]:bg-gray-200 data-[state=active]:text-purple-500 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-cyan-400"
              >
                <FileText className="mr-2 h-4 w-4" />
                Prompts
                {prompts.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-2 bg-gray-200 text-xs text-gray-700 dark:bg-zinc-700 dark:text-zinc-300"
                  >
                    {prompts.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 px-6 py-4">
            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-0 space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-purple-500/10 p-2">
                        <Clock className="h-5 w-5 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-xs tracking-wide text-gray-500 uppercase dark:text-zinc-500">
                          Avg Time
                        </p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
                          {stage.avgExecutionTime ? formatDuration(stage.avgExecutionTime) : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-amber-500/10 p-2">
                        <DollarSign className="h-5 w-5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs tracking-wide text-gray-500 uppercase dark:text-zinc-500">
                          Avg Cost
                        </p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
                          {stage.avgCost !== null ? `$${stage.avgCost.toFixed(4)}` : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Stage Info */}
              <Card className="border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/50">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-zinc-300">
                    <Settings2 className="h-4 w-4 text-gray-500 dark:text-zinc-500" />
                    Stage Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-zinc-800">
                    <span className="text-sm text-gray-600 dark:text-zinc-400">Linked Models</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">
                      {stage.linkedModels.length} phases
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-gray-200 py-2 dark:border-zinc-800">
                    <span className="text-sm text-gray-600 dark:text-zinc-400">Linked Prompts</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">
                      {stage.linkedPrompts.length} templates
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-600 dark:text-zinc-400">Status</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs',
                        stage.status === 'active'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border-red-500/30 bg-red-500/10 text-red-400'
                      )}
                    >
                      {stage.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Linked Phases */}
              {stage.linkedModels.length > 0 && (
                <Card className="border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-zinc-300">
                      <Cpu className="h-4 w-4 text-gray-500 dark:text-zinc-500" />
                      LLM Phases
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {stage.linkedModels.map((phase) => (
                        <Badge
                          key={phase}
                          variant="outline"
                          className="border-purple-500/30 bg-purple-500/10 font-mono text-xs text-purple-500 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-400"
                        >
                          {phase}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Models Tab */}
            <TabsContent value="models" className="mt-0 space-y-6">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full bg-gray-200 dark:bg-zinc-800" />
                  ))}
                </div>
              ) : models.length === 0 ? (
                <Card className="border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <CardContent className="p-8 text-center">
                    <Cpu className="mx-auto mb-3 h-12 w-12 text-gray-400 dark:text-zinc-600" />
                    <p className="text-gray-600 dark:text-zinc-400">
                      No models configured for this stage
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-zinc-500">
                      This stage may not use LLM calls
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Stage 7: Show Enrichment Activity Tabs first */}
                  {stage.number === 7 && (
                    <Card className="border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-zinc-300">
                          <Sparkles className="h-4 w-4 text-rose-400" />
                          Enrichment Activities Configuration
                          <Badge
                            variant="outline"
                            className="border-rose-500/30 bg-rose-500/10 text-xs text-rose-400"
                          >
                            Database
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-xs text-gray-500 dark:text-zinc-500">
                          Configure LLM models for each enrichment activity type. Each activity can
                          have its own model and prompt settings.
                        </p>

                        {/* Activity Tabs */}
                        <Tabs value={activeEnrichmentTab} onValueChange={setActiveEnrichmentTab}>
                          <TabsList className="grid h-auto w-full grid-cols-6 border border-gray-200 bg-gray-100 p-1 dark:border-zinc-800 dark:bg-zinc-900">
                            {ENRICHMENT_ACTIVITIES.map((activity) => {
                              const ActivityIcon = activity.icon
                              const activityModels = models.filter(
                                (m) => m.phaseName === `stage_7_${activity.key}`
                              )
                              return (
                                <TabsTrigger
                                  key={activity.key}
                                  value={activity.key}
                                  className="flex flex-col items-center gap-1 px-1 py-2 data-[state=active]:bg-gray-200 dark:data-[state=active]:bg-zinc-800"
                                >
                                  <ActivityIcon className={cn('h-4 w-4', activity.color)} />
                                  <span className="text-xs">{activity.label}</span>
                                  {activityModels.length > 0 && (
                                    <Badge variant="secondary" className="h-4 px-1 text-xs">
                                      {activityModels.length}
                                    </Badge>
                                  )}
                                </TabsTrigger>
                              )
                            })}
                          </TabsList>

                          {ENRICHMENT_ACTIVITIES.map((activity) => {
                            const activityModels = models.filter(
                              (m) => m.phaseName === `stage_7_${activity.key}`
                            )
                            const ActivityIcon = activity.icon

                            return (
                              <TabsContent key={activity.key} value={activity.key} className="mt-4">
                                {activityModels.length === 0 ? (
                                  <div className="py-8 text-center text-gray-500 dark:text-zinc-500">
                                    <ActivityIcon
                                      className={cn(
                                        'mx-auto mb-2 h-8 w-8',
                                        activity.color,
                                        'opacity-50'
                                      )}
                                    />
                                    <p className="text-sm">
                                      No model configured for {activity.label}
                                    </p>
                                    <p className="mt-1 text-xs">
                                      Add a model for stage_7_{activity.key} phase
                                    </p>
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {activityModels.map((model) => (
                                      <div
                                        key={model.id}
                                        onClick={() => onEditModel?.(model)}
                                        className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-gray-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                                      >
                                        <div className="flex items-center gap-3">
                                          <ActivityIcon className={cn('h-5 w-5', activity.color)} />
                                          <div>
                                            <div className="flex items-center gap-2">
                                              <code className="font-mono text-sm text-purple-500 dark:text-cyan-400">
                                                {model.modelId.split('/').pop()}
                                              </code>
                                              <ClickableTooltip
                                                content={t(
                                                  `pipeline.stages.tooltips.phases.${model.phaseName}` as Parameters<
                                                    typeof t
                                                  >[0]
                                                )}
                                              />
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-500">
                                              <span className="flex items-center gap-1">
                                                <Thermometer className="h-3 w-3" />
                                                {model.temperature ?? 0.7}
                                              </span>
                                              <span>•</span>
                                              <span className="flex items-center gap-1">
                                                <Hash className="h-3 w-3" />
                                                {model.maxTokens ?? 4096}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-gray-400 dark:text-zinc-600" />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </TabsContent>
                            )
                          })}
                        </Tabs>
                      </CardContent>
                    </Card>
                  )}

                  {/* Stage 6: Show CLEV Judge Configurations first */}
                  {stage.number === 6 && judgeConfigs.length > 0 && (
                    <Card className="border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-zinc-300">
                          <Shield className="h-4 w-4 text-amber-400" />
                          CLEV Judges Configuration
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-400"
                          >
                            Database
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="mb-4 text-xs text-gray-500 dark:text-zinc-500">
                          Three-judge voting system for lesson quality evaluation. Each language
                          uses primary/secondary/tiebreaker judges with weighted votes.
                        </p>

                        {/* Judge Configs Table */}
                        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-zinc-800">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-gray-100 hover:bg-gray-100 dark:bg-zinc-900/50 dark:hover:bg-zinc-900/50">
                                <TableHead className="w-24 font-medium text-gray-600 dark:text-zinc-400">
                                  Language
                                </TableHead>
                                <TableHead className="font-medium text-gray-600 dark:text-zinc-400">
                                  Primary Judge
                                </TableHead>
                                <TableHead className="font-medium text-gray-600 dark:text-zinc-400">
                                  Secondary Judge
                                </TableHead>
                                <TableHead className="font-medium text-gray-600 dark:text-zinc-400">
                                  Tiebreaker
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {judgeConfigs.map((langConfig) => {
                                const languageLabels: Record<
                                  string,
                                  { emoji: string; name: string }
                                > = {
                                  ru: { emoji: '🇷🇺', name: 'Russian' },
                                  en: { emoji: '🇺🇸', name: 'English' },
                                  any: { emoji: '🌐', name: 'Any' },
                                }
                                const langLabel = languageLabels[langConfig.language] || {
                                  emoji: '🌐',
                                  name: langConfig.language,
                                }

                                return (
                                  <TableRow
                                    key={langConfig.language}
                                    className="border-gray-200 dark:border-zinc-800"
                                  >
                                    <TableCell className="font-medium text-gray-700 dark:text-zinc-300">
                                      <div className="flex items-center gap-2">
                                        <span className="text-lg">{langLabel.emoji}</span>
                                        <span className="text-sm">{langLabel.name}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell
                                      onClick={() => handleJudgeClick(langConfig.primary)}
                                      className="cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800/50"
                                    >
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-purple-500 dark:bg-zinc-800/50 dark:text-cyan-400">
                                            {langConfig.primary.displayName}
                                          </code>
                                          <Badge
                                            variant="outline"
                                            className="border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400"
                                          >
                                            {langConfig.primary.weight.toFixed(2)}
                                          </Badge>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-500">
                                          <span>T: {langConfig.primary.temperature}</span>
                                          <span>•</span>
                                          <span>Max: {langConfig.primary.maxTokens}</span>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell
                                      onClick={() => handleJudgeClick(langConfig.secondary)}
                                      className="cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800/50"
                                    >
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-purple-500 dark:bg-zinc-800/50 dark:text-cyan-400">
                                            {langConfig.secondary.displayName}
                                          </code>
                                          <Badge
                                            variant="outline"
                                            className="border-blue-500/30 bg-blue-500/10 text-xs text-blue-400"
                                          >
                                            {langConfig.secondary.weight.toFixed(2)}
                                          </Badge>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-500">
                                          <span>T: {langConfig.secondary.temperature}</span>
                                          <span>•</span>
                                          <span>Max: {langConfig.secondary.maxTokens}</span>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell
                                      onClick={() => handleJudgeClick(langConfig.tiebreaker)}
                                      className="cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800/50"
                                    >
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-purple-500 dark:bg-zinc-800/50 dark:text-cyan-400">
                                            {langConfig.tiebreaker.displayName}
                                          </code>
                                          <Badge
                                            variant="outline"
                                            className="border-purple-500/30 bg-purple-500/10 text-xs text-purple-400"
                                          >
                                            {langConfig.tiebreaker.weight.toFixed(2)}
                                          </Badge>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-500">
                                          <span>T: {langConfig.tiebreaker.temperature}</span>
                                          <span>•</span>
                                          <span>Max: {langConfig.tiebreaker.maxTokens}</span>
                                        </div>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Header */}
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-purple-500 dark:text-cyan-400" />
                    <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                      Model Configurations
                    </h3>
                    <Badge
                      variant="outline"
                      className="border-purple-500/30 bg-purple-500/10 text-xs text-purple-500 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-400"
                    >
                      Database
                    </Badge>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-zinc-500">
                    Models are automatically selected based on content language and document size.
                    All configurations are editable and stored in the database.
                  </p>

                  {/* Group models by language and tier (exclude special configs shown above) */}
                  {(() => {
                    // Filter out judge models (Stage 6) and enrichment activity models (Stage 7)
                    const nonJudgeModels = models.filter((m) => {
                      if (m.judgeRole) return false
                      if (
                        stage.number === 7 &&
                        ENRICHMENT_ACTIVITIES.some((a) => m.phaseName === `stage_7_${a.key}`)
                      )
                        return false
                      return true
                    })
                    const grouped = groupModelsByLanguageAndTier(nonJudgeModels)
                    const languages: Array<'any' | 'ru' | 'en'> = ['any', 'ru', 'en']
                    const tiers: Array<'standard' | 'extended'> = ['standard', 'extended']

                    const languageLabels: Record<
                      'any' | 'ru' | 'en',
                      { emoji: string; name: string }
                    > = {
                      any: { emoji: '🌐', name: 'All Languages' },
                      ru: { emoji: '🇷🇺', name: 'Russian' },
                      en: { emoji: '🇺🇸', name: 'English' },
                    }

                    return (
                      <div className="grid grid-cols-1 gap-6">
                        {languages.map((lang) => {
                          const hasModels =
                            grouped[lang].standard.length > 0 || grouped[lang].extended.length > 0
                          if (!hasModels) return null

                          return (
                            <Card
                              key={lang}
                              className="border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/50"
                            >
                              <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-zinc-300">
                                  <span className="text-lg">{languageLabels[lang].emoji}</span>
                                  {languageLabels[lang].name}
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {tiers.map((tier) => {
                                  const tierModels = grouped[lang][tier]
                                  if (tierModels.length === 0) return null

                                  return (
                                    <div key={tier} className="space-y-3">
                                      {/* Tier header */}
                                      <div className="flex items-center gap-2">
                                        {tier === 'standard' ? (
                                          <Zap className="h-3.5 w-3.5 text-emerald-400" />
                                        ) : (
                                          <Cpu className="h-3.5 w-3.5 text-purple-400" />
                                        )}
                                        <span
                                          className={cn(
                                            'text-xs font-medium',
                                            tier === 'standard'
                                              ? 'text-emerald-400'
                                              : 'text-purple-400'
                                          )}
                                        >
                                          {getTierLabel(
                                            tier,
                                            tierModels[0]?.maxContextTokens || 128000,
                                            reserveSettings[lang] || reserveSettings.any || 0.2
                                          )}
                                        </span>
                                      </div>

                                      {/* Model cards for this tier */}
                                      {tierModels.map((model) => (
                                        <div
                                          key={model.id}
                                          className={cn(
                                            'group cursor-pointer rounded-lg border p-3 transition-colors',
                                            tier === 'standard'
                                              ? 'border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40'
                                              : 'border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40'
                                          )}
                                          onClick={() => onEditModel?.(model)}
                                        >
                                          <div className="flex items-start justify-between">
                                            <div className="min-w-0 flex-1 space-y-2">
                                              {/* Phase name and version */}
                                              <div className="flex items-center gap-2">
                                                <Badge
                                                  variant="outline"
                                                  className="border-gray-300 bg-gray-100 font-mono text-xs text-gray-700 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300"
                                                >
                                                  {model.phaseName}
                                                </Badge>
                                                <ClickableTooltip
                                                  content={t(
                                                    `pipeline.stages.tooltips.phases.${model.phaseName}` as Parameters<
                                                      typeof t
                                                    >[0]
                                                  )}
                                                />
                                                <Badge
                                                  variant="secondary"
                                                  className="bg-gray-200 text-xs text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"
                                                >
                                                  v{model.version}
                                                </Badge>
                                                {model.isActive && (
                                                  <Badge
                                                    variant="outline"
                                                    className="border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400"
                                                  >
                                                    Active
                                                  </Badge>
                                                )}
                                              </div>

                                              {/* Primary and fallback models */}
                                              <div className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                  <span className="w-16 text-xs text-gray-500 dark:text-zinc-500">
                                                    Primary:
                                                  </span>
                                                  <code className="truncate rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-purple-500 dark:bg-zinc-800/50 dark:text-cyan-400">
                                                    {model.modelId}
                                                  </code>
                                                </div>
                                                {model.fallbackModelId && (
                                                  <div className="flex items-center gap-2">
                                                    <span className="w-16 text-xs text-gray-500 dark:text-zinc-500">
                                                      Fallback:
                                                    </span>
                                                    <code className="truncate rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-amber-500 dark:bg-zinc-800/50 dark:text-amber-400/80">
                                                      {model.fallbackModelId}
                                                    </code>
                                                  </div>
                                                )}
                                              </div>

                                              {/* Model parameters */}
                                              <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-zinc-500">
                                                {model.maxContextTokens && (
                                                  <div className="flex items-center gap-1">
                                                    <Layers className="h-3.5 w-3.5" />
                                                    <span>
                                                      {formatContextSize(model.maxContextTokens)}{' '}
                                                      ctx
                                                    </span>
                                                  </div>
                                                )}
                                                <div className="flex items-center gap-1">
                                                  <Thermometer className="h-3.5 w-3.5" />
                                                  <span>Temp: {model.temperature}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  <Hash className="h-3.5 w-3.5" />
                                                  <span>
                                                    Max: {model.maxTokens.toLocaleString()}
                                                  </span>
                                                </div>
                                                {model.cacheReadEnabled && (
                                                  <div className="flex items-center gap-1 text-green-400">
                                                    <Shield className="h-3.5 w-3.5" />
                                                    <span>Cache enabled</span>
                                                  </div>
                                                )}
                                              </div>
                                            </div>

                                            {/* Chevron indicator */}
                                            <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-400 transition-colors group-hover:text-purple-500 dark:text-zinc-600 dark:group-hover:text-cyan-400" />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )
                                })}
                              </CardContent>
                            </Card>
                          )
                        })}
                      </div>
                    )
                  })()}
                </>
              )}
            </TabsContent>

            {/* Prompts Tab */}
            <TabsContent value="prompts" className="mt-0 space-y-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full bg-gray-200 dark:bg-zinc-800" />
                  ))}
                </div>
              ) : prompts.length === 0 ? (
                <Card className="border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <CardContent className="p-8 text-center">
                    <FileText className="mx-auto mb-3 h-12 w-12 text-gray-400 dark:text-zinc-600" />
                    <p className="text-gray-600 dark:text-zinc-400">
                      No prompts configured for this stage
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-zinc-500">
                      This stage may not use prompt templates
                    </p>
                  </CardContent>
                </Card>
              ) : (
                prompts.map((prompt) => (
                  <Card
                    key={prompt.id}
                    className="group cursor-pointer border-gray-200 bg-gray-50 transition-colors hover:border-gray-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700"
                    onClick={() => onEditPrompt?.(prompt)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="border-purple-500/30 bg-purple-500/10 font-mono text-xs text-purple-400"
                            >
                              {prompt.promptKey}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="bg-gray-200 text-xs text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"
                            >
                              v{prompt.version}
                            </Badge>
                          </div>
                          <p className="mb-1 font-medium text-gray-800 dark:text-zinc-200">
                            {prompt.promptName}
                          </p>
                          {prompt.promptDescription && (
                            <p className="line-clamp-2 text-xs text-gray-500 dark:text-zinc-500">
                              {prompt.promptDescription}
                            </p>
                          )}
                          {prompt.variables && prompt.variables.length > 0 && (
                            <div className="mt-2 flex items-center gap-2">
                              <Sparkles className="h-3 w-3 text-purple-500 dark:text-cyan-400" />
                              <span className="text-xs text-gray-500 dark:text-zinc-500">
                                {prompt.variables.length} variables
                              </span>
                            </div>
                          )}
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400 transition-colors group-hover:text-purple-500 dark:text-zinc-600 dark:group-hover:text-cyan-400" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Judge Editor Dialog */}
        <JudgeEditorDialog
          open={judgeEditorOpen}
          onOpenChange={setJudgeEditorOpen}
          judge={selectedJudge}
          onSaved={() => void loadStageData()}
        />
      </SheetContent>
    </Sheet>
  )
}
