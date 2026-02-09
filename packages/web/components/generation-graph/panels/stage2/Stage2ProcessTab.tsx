'use client'

import React, { memo, useCallback, useEffect, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
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
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { formatDuration } from '@megacampus/shared-utils'
import { useGenerationStore } from '@/stores/useGenerationStore'
import type {
  Stage2ProcessTabProps,
  ProcessingPhase,
  ProcessingPhaseId,
  ProcessingPhaseStatus,
  TerminalLogEntry,
} from './types'

/**
 * Phase configuration with icons and progress ranges
 */
const PHASE_CONFIG: Record<
  ProcessingPhaseId,
  { icon: LucideIcon; progressRange: [number, number] }
> = {
  docling: { icon: ScanLine, progressRange: [10, 25] },
  markdown: { icon: Eraser, progressRange: [25, 30] },
  images: { icon: Image, progressRange: [30, 35] },
  chunking: { icon: Scissors, progressRange: [35, 50] },
  embedding: { icon: BrainCircuit, progressRange: [50, 70] },
  qdrant: { icon: Database, progressRange: [70, 80] },
  summarization: { icon: Sparkles, progressRange: [80, 90] },
}

/**
 * Status icon configuration with colors
 */
const STATUS_CONFIG: Record<
  ProcessingPhaseStatus,
  {
    icon: React.ElementType
    colorClass: string
    bgClass: string
    animate?: boolean
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
}

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
]

/**
 * Map Zustand store stage names/phases to ProcessingPhaseId
 * Zustand uses: init, start, processing, chunking, embedding, indexing, summarization, complete, finish
 * ProcessTab uses: docling, markdown, images, chunking, embedding, qdrant, summarization
 */
const ZUSTAND_PHASE_TO_PROCESSING_PHASE: Record<string, ProcessingPhaseId> = {
  // Phase 1: Digitization (Docling)
  init: 'docling',
  start: 'docling',
  docling: 'docling',
  // Phase 2: Cleanup (Markdown)
  processing: 'markdown',
  markdown: 'markdown',
  cleanup: 'markdown',
  // Phase 3: Visual Analysis (Images)
  images: 'images',
  visual: 'images',
  ocr: 'images',
  // Phase 4: Segmentation (Chunking)
  chunking: 'chunking',
  segmentation: 'chunking',
  // Phase 5: AI Encoding (Embedding)
  embedding: 'embedding',
  vectorization: 'embedding',
  // Phase 6: Knowledge Save (Qdrant)
  indexing: 'qdrant',
  qdrant: 'qdrant',
  index: 'qdrant',
  // Phase 7: Insight Generation (Summarization)
  summarization: 'summarization',
  summary: 'summarization',
  complete: 'summarization',
  finish: 'summarization',
}

/** Phase translation keys */
type PhaseNameKey =
  | 'phaseDocling'
  | 'phaseMarkdown'
  | 'phaseImages'
  | 'phaseChunking'
  | 'phaseEmbedding'
  | 'phaseQdrant'
  | 'phaseSummarization'
type PhaseDescKey =
  | 'phaseDoclingDesc'
  | 'phaseMarkdownDesc'
  | 'phaseImagesDesc'
  | 'phaseChunkingDesc'
  | 'phaseEmbeddingDesc'
  | 'phaseQdrantDesc'
  | 'phaseSummarizationDesc'

/** Phase translation key mapping */
const PHASE_TRANSLATIONS: Record<
  ProcessingPhaseId,
  { nameKey: PhaseNameKey; descKey: PhaseDescKey }
> = {
  docling: { nameKey: 'phaseDocling', descKey: 'phaseDoclingDesc' },
  markdown: { nameKey: 'phaseMarkdown', descKey: 'phaseMarkdownDesc' },
  images: { nameKey: 'phaseImages', descKey: 'phaseImagesDesc' },
  chunking: { nameKey: 'phaseChunking', descKey: 'phaseChunkingDesc' },
  embedding: { nameKey: 'phaseEmbedding', descKey: 'phaseEmbeddingDesc' },
  qdrant: { nameKey: 'phaseQdrant', descKey: 'phaseQdrantDesc' },
  summarization: { nameKey: 'phaseSummarization', descKey: 'phaseSummarizationDesc' },
}

/**
 * Generates default phases (all pending) when not provided
 * Note: This function needs access to the translation function from the component
 */
function generateDefaultPhases(t: (key: PhaseNameKey | PhaseDescKey) => string): ProcessingPhase[] {
  return PHASE_ORDER.map((id) => ({
    id,
    name: t(PHASE_TRANSLATIONS[id].nameKey),
    description: t(PHASE_TRANSLATIONS[id].descKey),
    status: 'pending' as const,
  }))
}

/**
 * Get phase description from translations
 */
function getPhaseDescription(
  phaseId: ProcessingPhaseId,
  phase: ProcessingPhase,
  t: (key: PhaseDescKey) => string
): string {
  // If phase has a custom description (e.g., live status), use it
  if (phase.description) return phase.description

  return t(PHASE_TRANSLATIONS[phaseId].descKey)
}

/**
 * Get phase name from translations
 */
function getPhaseName(
  phaseId: ProcessingPhaseId,
  phase: ProcessingPhase,
  t: (key: PhaseNameKey) => string
): string {
  // If phase has a custom name, use it
  if (phase.name) return phase.name

  return t(PHASE_TRANSLATIONS[phaseId].nameKey)
}

/**
 * Format metrics for display
 */
function formatMetrics(metrics: Record<string, number | string> | undefined): string {
  if (!metrics) return ''

  const parts: string[] = []
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === 'number') {
      parts.push(`${key}: ${value.toLocaleString()}`)
    } else {
      parts.push(`${key}: ${value}`)
    }
  }
  return parts.join(' | ')
}

/**
 * Individual phase row component
 */
interface PhaseRowProps {
  phase: ProcessingPhase
}

const PhaseRow = memo<PhaseRowProps>(function PhaseRow({ phase }) {
  const t = useTranslations('generation.stage2')
  const config = PHASE_CONFIG[phase.id]
  const statusConfig = STATUS_CONFIG[phase.status]
  const PhaseIcon = config?.icon ?? Circle
  const StatusIcon = statusConfig?.icon ?? Circle

  const phaseName = getPhaseName(phase.id, phase, t)
  const phaseDesc = getPhaseDescription(phase.id, phase, t)
  const metricsText = formatMetrics(phase.metrics)

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg p-3 transition-all duration-300',
        statusConfig.bgClass,
        phase.status === 'active' && 'animate-pulse'
      )}
    >
      {/* Status Icon */}
      <div className="mt-0.5 flex-shrink-0" role="status" aria-live="polite">
        {statusConfig.animate ? (
          <StatusIcon
            className={cn('h-5 w-5 animate-spin', statusConfig.colorClass)}
            aria-label={t('statusActive')}
          />
        ) : (
          <StatusIcon className={cn('h-5 w-5', statusConfig.colorClass)} />
        )}
      </div>

      {/* Phase Icon + Details */}
      <div className="min-w-0 flex-1">
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
                'text-sm font-medium',
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
          <div className="flex flex-shrink-0 items-center gap-2">
            {metricsText && (
              <span className="text-muted-foreground font-mono text-xs">{metricsText}</span>
            )}
            {phase.durationMs !== undefined && phase.durationMs > 0 && (
              <span className="text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 font-mono text-xs">
                {formatDuration(phase.durationMs)}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-muted-foreground mt-0.5 text-sm">{phaseDesc}</p>

        {/* Progress bar for active phase */}
        {phase.status === 'active' && phase.progress !== undefined && (
          <div className="mt-2">
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300 dark:bg-blue-400"
                style={{ width: `${Math.max(0, Math.min(100, phase.progress))}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {phase.status === 'error' && phase.errorMessage && (
          <div className="mt-2 rounded-md bg-red-100 p-2 dark:bg-red-900/30">
            <p className="font-mono text-sm text-red-700 dark:text-red-300">{phase.errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  )
})

/**
 * Terminal log level color mapping
 */
const LOG_LEVEL_COLORS: Record<TerminalLogEntry['level'], string> = {
  info: 'text-blue-400',
  success: 'text-green-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
}

/**
 * Terminal footer component showing live logs
 */
interface TerminalFooterProps {
  logs: TerminalLogEntry[]
}

const TerminalFooter = memo<TerminalFooterProps>(function TerminalFooter({ logs }) {
  const t = useTranslations('generation.stage2')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  // Get display name for phase (memoized to avoid recreation on each render)
  const getPhaseDisplayName = useCallback(
    (phaseId: ProcessingPhaseId): string => {
      return t(PHASE_TRANSLATIONS[phaseId].nameKey)
    },
    [t]
  )

  return (
    <div className="overflow-hidden rounded-b-lg border-t bg-zinc-900 dark:bg-zinc-950">
      {/* Terminal header */}
      <div className="flex items-center gap-2 border-b border-zinc-700 bg-zinc-800 px-3 py-1.5 dark:bg-zinc-900">
        <Terminal className="h-3.5 w-3.5 text-zinc-400" />
        <span className="text-xs font-medium text-zinc-400">{t('terminal')}</span>
      </div>

      {/* Terminal content */}
      <div ref={scrollRef} className="h-24 overflow-y-auto p-2 font-mono text-xs leading-relaxed">
        {logs.length === 0 ? (
          <div className="text-zinc-500 italic">{`> ${t('waitingForEvents')}`}</div>
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
  )
})

/**
 * Stage2ProcessTab Component
 *
 * Visualizes the 7-phase document processing pipeline with a vertical layout.
 * Shows phase status, progress, metrics, and a terminal footer with live logs.
 *
 * Data sources (priority order):
 * 1. providedPhases prop (if explicitly passed)
 * 2. Zustand store document stages (via documentId)
 * 3. Default pending phases (fallback)
 */
export const Stage2ProcessTab = memo<Stage2ProcessTabProps>(function Stage2ProcessTab({
  documentId,
  phases: providedPhases,
  terminalLogs = [],
  status = 'pending',
  totalProgress,
  locale: _locale = 'ru',
}) {
  const t = useTranslations('generation.stage2')

  // Get document stages from Zustand store - SINGLE SOURCE OF TRUTH
  const documentStages = useGenerationStore((state) =>
    documentId ? state.getDocumentStages(documentId) : []
  )
  const documentStatus = useGenerationStore((state) =>
    documentId ? state.getDocumentStatus(documentId) : 'pending'
  )

  // Transform Zustand stages to ProcessingPhase format
  const phasesFromStore = useMemo((): ProcessingPhase[] => {
    if (!documentStages || documentStages.length === 0) {
      return []
    }

    // Create a map of completed phases from Zustand stages
    const phaseStatusMap = new Map<
      ProcessingPhaseId,
      {
        status: ProcessingPhaseStatus
        durationMs?: number
        metrics?: Record<string, number | string>
      }
    >()

    for (const stage of documentStages) {
      // Extract phase name from stageName or stageId
      const phaseName = stage.stageId?.split('_').pop()?.toLowerCase() || ''
      const mappedPhaseId = ZUSTAND_PHASE_TO_PROCESSING_PHASE[phaseName]

      if (mappedPhaseId) {
        // Map Zustand status to ProcessingPhaseStatus
        let phaseStatus: ProcessingPhaseStatus = 'pending'
        if (stage.status === 'completed') phaseStatus = 'completed'
        else if (stage.status === 'active') phaseStatus = 'active'
        else if (stage.status === 'error') phaseStatus = 'error'
        else if (stage.status === 'skipped') phaseStatus = 'skipped'

        // Only update if this stage has a more advanced status
        const existing = phaseStatusMap.get(mappedPhaseId)
        const statusPriority = { error: 4, active: 3, completed: 2, skipped: 1, pending: 0 }
        if (!existing || statusPriority[phaseStatus] > statusPriority[existing.status]) {
          phaseStatusMap.set(mappedPhaseId, {
            status: phaseStatus,
            durationMs: stage.attempts?.[0]?.processMetrics?.duration,
            metrics: stage.outputData ? { items: Object.keys(stage.outputData).length } : undefined,
          })
        }
      }
    }

    // Use the shared PHASE_TRANSLATIONS constant (already defined above)

    // Determine which phases should be marked as completed based on overall document status
    const isDocumentCompleted = documentStatus === 'completed'
    const isDocumentError = documentStatus === 'error'
    // Check docling phase status (images/markdown are processed within docling)
    const doclingStatus = phaseStatusMap.get('docling')?.status
    const isDoclingCompleted = doclingStatus === 'completed' || isDocumentCompleted
    const isDoclingError = doclingStatus === 'error'

    return PHASE_ORDER.map((phaseId) => {
      const storeData = phaseStatusMap.get(phaseId)

      // If document is completed but phase wasn't explicitly tracked, mark as completed
      let phaseStatus: ProcessingPhaseStatus = storeData?.status || 'pending'
      if (isDocumentCompleted && phaseStatus === 'pending') {
        // All phases are completed when document processing finishes
        // Images and markdown phases are processed within the Docling conversion phase
        phaseStatus = 'completed'
      } else if (isDocumentError && phaseStatus === 'pending') {
        // If document errored, mark untracked phases as error too
        phaseStatus = 'error'
      } else if (phaseStatus === 'pending' && isDoclingCompleted) {
        // Images and markdown phases complete together with Docling
        // They are sub-phases of Docling conversion, not separate steps
        if (phaseId === 'images' || phaseId === 'markdown') {
          phaseStatus = 'completed'
        }
      } else if (phaseStatus === 'pending' && isDoclingError) {
        // If Docling errored, mark its sub-phases as error too
        if (phaseId === 'images' || phaseId === 'markdown') {
          phaseStatus = 'error'
        }
      }

      return {
        id: phaseId,
        name: t(PHASE_TRANSLATIONS[phaseId].nameKey),
        description: t(PHASE_TRANSLATIONS[phaseId].descKey),
        status: phaseStatus,
        durationMs: storeData?.durationMs,
        metrics: storeData?.metrics,
      }
    })
  }, [documentStages, documentStatus, t])

  // Determine which phases to use: provided > store > default
  const phases =
    providedPhases || (phasesFromStore.length > 0 ? phasesFromStore : generateDefaultPhases(t))

  // Calculate effective status from phases
  const effectiveStatus = useMemo(() => {
    if (status !== 'pending') return status
    if (documentStatus !== 'pending') return documentStatus as 'active' | 'completed' | 'error'
    return 'pending'
  }, [status, documentStatus])

  // Calculate total progress from phases
  const effectiveProgress = useMemo(() => {
    if (totalProgress !== undefined) return totalProgress
    const completedCount = phases.filter(
      (p) => p.status === 'completed' || p.status === 'skipped'
    ).length
    return Math.round((completedCount / phases.length) * 100)
  }, [totalProgress, phases])

  // Safety check for terminalLogs in case null is passed instead of undefined
  const safeLogs = Array.isArray(terminalLogs) ? terminalLogs : []

  return (
    <div className="space-y-4">
      {/* Pipeline Card */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Database className="text-primary h-4 w-4" />
            {t('pipeline')}
          </CardTitle>
          <p className="text-muted-foreground text-sm">{t('pipelineDesc')}</p>

          {/* Total progress bar - show for active and completed states */}
          {(effectiveStatus === 'active' || effectiveStatus === 'completed') && (
            <div className="mt-3">
              <div className="text-muted-foreground mb-1 flex items-center justify-between text-xs">
                <span>
                  {effectiveStatus === 'completed' ? t('statusCompleted') : t('statusActive')}
                </span>
                <span className="font-mono">{effectiveProgress}%</span>
              </div>
              <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    effectiveStatus === 'completed' ? 'bg-green-500' : 'bg-primary'
                  )}
                  style={{ width: `${Math.min(100, effectiveProgress)}%` }}
                />
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-1 pb-0">
          <ScrollArea className="max-h-[400px]">
            {phases.map((phase) => (
              <PhaseRow key={phase.id} phase={phase} />
            ))}
          </ScrollArea>
        </CardContent>

        {/* Terminal Footer */}
        <TerminalFooter logs={safeLogs} />
      </Card>
    </div>
  )
})

export default Stage2ProcessTab
