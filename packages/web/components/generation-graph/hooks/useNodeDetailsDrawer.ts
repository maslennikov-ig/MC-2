'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { z } from 'zod'
import { trpc } from '@/lib/trpc/react'
import { useNodeSelection } from './useNodeSelection'
import { useUserRole } from './useUserRole'
import { useStage2DashboardData } from './useStage2DashboardData'
import { useRefinement } from './useRefinement'
import { useStaticGraph } from '../contexts/StaticGraphContext'
import { useGraphOperations } from '../contexts/GraphOperationsContext'
import { useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider'
import { useLessonContent } from './useLessonContent'
import { useNodeStatus } from './useNodeStatus'
import { useModuleDashboardData } from './useModuleDashboardData'
import { useLessonInspectorData } from './useLessonInspectorData'
import { useEnrichmentInspectorStore } from '../stores/enrichment-inspector-store'
import { PAUSABLE_STATUSES, type TraceAttempt } from '@megacampus/shared-types'
import type { AppNode, AppNodeData } from '../types'
import { getDocumentId, getStagePhases } from '../types'
import type { PhaseData } from './use-graph-data/types'
import { isAwaitingApproval as getAwaitingStageNumber } from '@/lib/generation-graph/utils'
import {
  approveLesson,
  retryLessonGeneration,
  deleteLesson,
  approveLessons,
  retryMultipleLessons,
  updateLessonContent,
} from '@/app/actions/lesson-actions'
import { retryFailedDocuments } from '@/app/actions/document-actions'
import type { ParsedLessonContent } from '@/lib/markdown-content-parser'
import { parsedLessonContentSchema } from '@/lib/markdown-content-parser'
import {
  extractModuleNumber,
  getQualityScoreFromMetadata,
} from '../panels/NodeDetailsDrawer.helpers'
import type { DisplayData } from '../panels/NodeDetailsDrawer.helpers'

/**
 * Custom hook for managing NodeDetailsDrawer state, effects, and actions
 *
 * Consolidates all drawer logic including:
 * - Node selection and data fetching
 * - Lesson/module actions (approve, retry, delete, export)
 * - Stage 2 document handling
 * - Refinement chat integration
 * - Display data computation
 *
 * @example
 * ```tsx
 * const { nodes, handlers, state } = useNodeDetailsDrawer()
 * ```
 */
export function useNodeDetailsDrawer() {
  const { selectedNodeId, deselectNode, focusRefinement, clearRefinementFocus, autoOpened } =
    useNodeSelection()
  const t = useTranslations('generation')
  const { getNode } = useReactFlow()
  const { courseInfo } = useStaticGraph()
  const { removeLesson: removeLessonFromGraph } = useGraphOperations()
  const { isAdmin } = useUserRole()
  const params = useParams()
  const courseSlug = params?.courseSlug as string | undefined
  const orgSlug = params?.orgSlug as string | undefined

  // State: UI toggles
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLessonMaximized, setIsLessonMaximized] = useState(false)
  const [showRestartDialog, setShowRestartDialog] = useState(false)
  const [selectedAttemptNum, setSelectedAttemptNum] = useState<number | null>(null)
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null)

  // State: Loading flags
  const [isApproving, setIsApproving] = useState(false)
  const [isApprovingAll, setIsApprovingAll] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isEditingLesson, setIsEditingLesson] = useState(false)
  const [isSavingLesson, setIsSavingLesson] = useState(false)

  // Refs
  const refinementChatRef = useRef<HTMLDivElement>(null)

  // tRPC utils for imperative query calls (e.g., export)
  const utils = trpc.useUtils()

  // Refinement chat integration
  const {
    refine,
    isRefining,
    chatHistory,
    clearConversation,
    latestProposal,
    isApplying,
    acceptProposal,
    proposalError,
    retryProposal,
    rejectProposal,
    acceptedProposal,
  } = useRefinement(courseInfo.id)

  // Check if there's a pending enrichment create from toolbar
  const pendingCreateType = useEnrichmentInspectorStore((state) => state.pendingCreateType)

  // Node data extraction
  const selectedNode = selectedNodeId ? (getNode(selectedNodeId) as AppNode) : null
  const data = selectedNode?.data

  // Detect node types
  const isLessonNode = selectedNode?.type === 'lesson'
  const isModuleNode = selectedNode?.type === 'module'
  const isStage2Group = selectedNode?.type === 'stage2group'
  const isStage6Module = isModuleNode
  const isStage6Lesson = isLessonNode

  // Detect if this node has phases (stages 4, 5)
  const hasPhases = !!(data?.stageNumber && (data.stageNumber === 4 || data.stageNumber === 5))
  const phases = useMemo(() => getStagePhases(data as AppNodeData | undefined) || [], [data])

  // Get realtime status from context
  const realtimeStatus = useNodeStatus(selectedNodeId || '')
  const { status: generationStatus, fetchTraceDetails, traces } = useGenerationRealtime()

  // Check if THIS stage is awaiting approval
  const awaitingStageNumber = getAwaitingStageNumber(generationStatus || '')
  const isThisStageAwaiting =
    awaitingStageNumber !== null && data?.stageNumber === awaitingStageNumber
  const isAwaitingApproval = isThisStageAwaiting
  const canEdit = !courseInfo.readOnly && (isAwaitingApproval || !isAdmin)

  // Check if generation is currently active
  const isGenerationActive = useMemo(() => {
    if (!generationStatus) return false
    return (PAUSABLE_STATUSES as readonly string[]).includes(generationStatus)
  }, [generationStatus])

  // Extract document ID for Stage 2
  const documentId = useMemo(() => {
    return getDocumentId(data as AppNodeData | undefined)
  }, [data])

  // Extract module ID for module dashboard
  const moduleIdForDashboard = useMemo(() => {
    if (!isStage6Module || !selectedNodeId) return null
    return selectedNodeId // Already in format like "module_1"
  }, [isStage6Module, selectedNodeId])

  // Extract lesson info for lesson inspector
  const lessonInfoForInspector = useMemo(() => {
    if (!isStage6Lesson || !selectedNodeId) return null
    const match = selectedNodeId.match(/^lesson_(\d+)_(\d+)$/)
    if (match) {
      return {
        lessonId: `${match[1]}.${match[2]}`,
        moduleNumber: parseInt(match[1], 10),
        lessonNumber: parseInt(match[2], 10),
      }
    }
    return null
  }, [isStage6Lesson, selectedNodeId])

  // Lesson ID for content fetching
  const lessonIdForFetch = useMemo(() => {
    if (!isLessonNode || !selectedNodeId) return null
    const match = selectedNodeId.match(/^lesson_(\d+)_(\d+)$/)
    if (match) {
      return `${match[1]}.${match[2]}`
    }
    return null
  }, [isLessonNode, selectedNodeId])

  // Data fetching hooks
  const { data: lessonContentData } = useLessonContent({
    courseId: courseInfo.id,
    lessonId: lessonIdForFetch,
    enabled: isLessonNode && !!lessonIdForFetch,
  })

  const {
    data: moduleDashboardData,
    isLoading: isLoadingModuleDashboard,
    error: moduleDashboardError,
    refetch: refetchModuleDashboard,
  } = useModuleDashboardData({
    courseId: courseInfo.id,
    moduleId: moduleIdForDashboard,
    enabled: isStage6Module && !!moduleIdForDashboard,
  })

  const {
    data: stage2DashboardData,
    isLoading: isLoadingStage2Dashboard,
    error: stage2DashboardError,
    refetch: refetchStage2Dashboard,
  } = useStage2DashboardData({
    courseId: courseInfo.id || '',
    enabled: isStage2Group && !!courseInfo.id,
  })

  const {
    data: lessonInspectorData,
    isLoading: isLoadingLessonInspector,
    error: lessonInspectorError,
    refetch: refetchLessonInspector,
  } = useLessonInspectorData({
    courseId: courseInfo.id,
    lessonId: lessonInfoForInspector?.lessonId ?? null,
    enabled: isStage6Lesson && !!lessonInfoForInspector,
  })

  // Computed display data
  const displayData = useMemo((): DisplayData | undefined => {
    // If phases exist and a phase is selected, show phase data
    if (hasPhases && selectedPhaseId && phases.length > 0) {
      const phase = phases.find((p: PhaseData) => p.phaseId === selectedPhaseId)
      if (phase) {
        let outputData = phase.outputData
        let inputData = phase.inputData
        if (
          (outputData === undefined || inputData === undefined) &&
          phase.traceId &&
          traces.length > 0
        ) {
          const trace = traces.find((t) => t.id === phase.traceId)
          if (trace) {
            if (outputData === undefined && trace.output_data !== undefined) {
              outputData = trace.output_data
            }
            if (inputData === undefined && trace.input_data !== undefined) {
              inputData = trace.input_data
            }
          }
        }
        return {
          label: `${data?.label} - ${phase.phaseName}`,
          inputData,
          outputData,
          duration: phase.processMetrics?.duration,
          tokens: phase.processMetrics?.tokens,
          model: phase.processMetrics?.model,
          qualityScore: phase.processMetrics?.qualityScore,
          status: phase.status,
          attempts: phase.attempts || [],
          attemptNumber: 1,
          retryCount: phase.attempts?.filter((a) => a.status === 'failed').length || 0,
          traceId: phase.traceId,
        }
      }
    }

    // Otherwise, show attempt data
    if (selectedAttemptNum && data?.attempts) {
      const attempt = data.attempts.find(
        (a: TraceAttempt) => a.attemptNumber === selectedAttemptNum
      )
      if (attempt) {
        const outputData =
          isLessonNode && lessonContentData
            ? {
                ...attempt.outputData,
                content: lessonContentData.content,
                lessonContent: lessonContentData.content,
                status: lessonContentData.status,
                metadata: lessonContentData.metadata,
                qualityScore: getQualityScoreFromMetadata(lessonContentData.metadata),
              }
            : attempt.outputData

        return {
          label: data.label,
          inputData: attempt.inputData,
          outputData,
          duration: attempt.processMetrics?.duration,
          tokens: attempt.processMetrics?.tokens,
          model: attempt.processMetrics?.model,
          qualityScore: attempt.processMetrics?.qualityScore,
          status: attempt.status,
          attempts: data.attempts,
          attemptNumber: attempt.attemptNumber,
          retryCount: data.retryCount,
        }
      }
    }

    // For lesson nodes without attempts but with fetched content
    if (isLessonNode && lessonContentData) {
      return {
        ...data,
        outputData: {
          content: lessonContentData.content,
          lessonContent: lessonContentData.content,
          status: lessonContentData.status,
          metadata: lessonContentData.metadata,
          qualityScore: getQualityScoreFromMetadata(lessonContentData.metadata),
        },
        qualityScore: getQualityScoreFromMetadata(lessonContentData.metadata),
        status: lessonContentData.status === 'completed' ? 'completed' : data?.status,
      }
    }

    return data
  }, [
    data,
    selectedAttemptNum,
    hasPhases,
    selectedPhaseId,
    phases,
    isLessonNode,
    lessonContentData,
    traces,
  ])

  // Computed flags
  const isAIStage = !!(data?.stageNumber && [5, 6].includes(data.stageNumber))
  const canRestart = !!(
    data?.stageNumber &&
    data.stageNumber >= 2 &&
    displayData?.status &&
    ['completed', 'error', 'awaiting'].includes(displayData.status)
  )

  // Callbacks: UI toggles
  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  const handleEditLesson = useCallback(() => {
    setIsEditingLesson(true)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setIsEditingLesson(false)
  }, [])

  // Callbacks: Stage approval
  const handleStageApproved = useCallback(() => {
    if (data?.stageNumber && typeof window !== 'undefined') {
      const key = `graphview_auto_opened_${courseInfo.id}_stage_${data.stageNumber}_complete`
      sessionStorage.setItem(key, 'true')
    }
    deselectNode()
  }, [data?.stageNumber, courseInfo.id, deselectNode])

  // Callbacks: Lesson actions
  const handleRegenerateLesson = useCallback(async () => {
    if (!lessonInfoForInspector) return

    setIsRetrying(true)
    try {
      const result = await retryLessonGeneration(courseInfo.id, lessonInfoForInspector.lessonId, 8)
      if (result.success) {
        toast.success('Урок поставлен в очередь на перегенерацию')
      } else {
        toast.error('Не удалось запустить перегенерацию')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка перегенерации')
    } finally {
      setIsRetrying(false)
    }
  }, [lessonInfoForInspector, courseInfo.id])

  const handleRetryNode = useCallback(
    async (_nodeName: string) => {
      if (!lessonInfoForInspector) return

      setIsRetrying(true)
      try {
        const result = await retryLessonGeneration(
          courseInfo.id,
          lessonInfoForInspector.lessonId,
          9
        )
        if (result.success) {
          toast.success('Урок поставлен в очередь на повторную генерацию')
        } else {
          toast.error('Не удалось запустить повторную генерацию')
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Ошибка повторной генерации')
      } finally {
        setIsRetrying(false)
      }
    },
    [lessonInfoForInspector, courseInfo.id]
  )

  const handleDeleteLesson = useCallback(async () => {
    if (!lessonInfoForInspector) return

    setIsDeleting(true)
    try {
      const result = await deleteLesson(courseInfo.id, lessonInfoForInspector.lessonId)
      if (result.success) {
        toast.success('Урок удалён')
        removeLessonFromGraph(lessonInfoForInspector.lessonId)
        deselectNode()
      } else {
        toast.error('Не удалось удалить урок')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка удаления урока')
    } finally {
      setIsDeleting(false)
    }
  }, [lessonInfoForInspector, courseInfo.id, removeLessonFromGraph, deselectNode])

  const handleSaveEdit = useCallback(
    async (content: ParsedLessonContent) => {
      if (!lessonInfoForInspector || isSavingLesson) return
      setIsSavingLesson(true)
      try {
        const validated = parsedLessonContentSchema.parse(content)
        await updateLessonContent(
          courseInfo.id,
          lessonInfoForInspector.lessonId,
          validated as Record<string, unknown>
        )
        toast.success('Урок сохранён')
        setIsEditingLesson(false)
        refetchLessonInspector()
      } catch (error) {
        if (error instanceof z.ZodError) {
          toast.error(`Ошибка валидации: ${error.errors[0]?.message || 'Некорректные данные'}`)
        } else {
          toast.error(error instanceof Error ? error.message : 'Ошибка сохранения')
        }
      } finally {
        setIsSavingLesson(false)
      }
    },
    [lessonInfoForInspector, courseInfo.id, refetchLessonInspector, isSavingLesson]
  )

  const handleApproveLesson = useCallback(async () => {
    if (!lessonInfoForInspector) return

    setIsApproving(true)
    try {
      await approveLesson(courseInfo.id, lessonInfoForInspector.lessonId)
      toast.success('Урок одобрен')
      refetchLessonInspector()
    } catch (error) {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Не удалось одобрить урок'}`)
    } finally {
      setIsApproving(false)
    }
  }, [lessonInfoForInspector, courseInfo.id, refetchLessonInspector])

  // Callbacks: Module actions
  const handleApproveAllLessons = useCallback(async () => {
    if (!moduleIdForDashboard) return

    const moduleNumber = extractModuleNumber(moduleIdForDashboard)

    setIsApprovingAll(true)
    try {
      const result = await approveLessons(courseInfo.id, moduleNumber)
      if (result.success) {
        const message =
          result.approvedCount > 0
            ? `${t('actions.lessonsApproved')}: ${result.approvedCount}`
            : t('actions.noLessonsToApprove')
        if (result.skippedCount > 0) {
          toast.success(`${message} (${t('actions.skipped')}: ${result.skippedCount})`)
        } else {
          toast.success(message)
        }
        refetchModuleDashboard()
      } else {
        toast.error(t('actions.failedToApproveLessons'))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('actions.approvalError'))
    } finally {
      setIsApprovingAll(false)
    }
  }, [moduleIdForDashboard, courseInfo.id, refetchModuleDashboard, t])

  const handleExportAll = useCallback(async () => {
    if (!moduleIdForDashboard) return
    if (isExporting) return

    const moduleNumber = extractModuleNumber(moduleIdForDashboard)
    if (!moduleNumber) {
      toast.error('Invalid module ID')
      return
    }

    setIsExporting(true)
    let blobUrl: string | null = null

    try {
      const result = await utils.lessonContent.exportLessons.fetch({
        courseId: courseInfo.id,
        moduleNumber,
      })

      if (result.content) {
        const blob = new Blob([result.content], { type: 'text/markdown;charset=utf-8' })
        blobUrl = URL.createObjectURL(blob)

        try {
          const link = document.createElement('a')
          link.href = blobUrl
          link.download = result.filename
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        } finally {
          URL.revokeObjectURL(blobUrl)
          blobUrl = null
        }

        toast.success(
          `${t('actions.exported') || 'Exported'}: ${result.lessonsCount} ${t('actions.lessons') || 'lessons'}`
        )
      } else {
        toast.error(t('actions.noContentToExport') || 'No content to export')
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('actions.exportError') || 'Export failed'
      )
    } finally {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      setIsExporting(false)
    }
  }, [moduleIdForDashboard, courseInfo.id, isExporting, t, utils])

  const handleRegenerateFailedLessons = useCallback(async () => {
    if (!moduleDashboardData) return

    const failedLessons = moduleDashboardData.lessons.filter((l) => l.status === 'error')
    if (failedLessons.length === 0) {
      toast.info('Нет уроков с ошибками')
      return
    }

    setIsRegenerating(true)
    try {
      const result = await retryMultipleLessons(
        courseInfo.id,
        failedLessons.map((l) => l.lessonId),
        8
      )
      if (result.success) {
        toast.success(`${result.jobCount} уроков поставлены на перегенерацию`)
        refetchModuleDashboard()
      } else {
        toast.error('Не удалось запустить перегенерацию')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка перегенерации')
    } finally {
      setIsRegenerating(false)
    }
  }, [moduleDashboardData, courseInfo.id, refetchModuleDashboard])

  const handleImproveQuality = useCallback(async () => {
    if (!moduleDashboardData) return

    const lowQualityLessons = moduleDashboardData.lessons.filter(
      (l) => l.qualityScore !== null && l.qualityScore < 0.75 && l.status === 'completed'
    )
    if (lowQualityLessons.length === 0) {
      toast.info('Нет уроков с низким качеством')
      return
    }

    setIsRegenerating(true)
    try {
      const result = await retryMultipleLessons(
        courseInfo.id,
        lowQualityLessons.map((l) => l.lessonId),
        7
      )
      if (result.success) {
        toast.success(`${result.jobCount} уроков поставлены на улучшение`)
        refetchModuleDashboard()
      } else {
        toast.error('Не удалось запустить улучшение')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка улучшения')
    } finally {
      setIsRegenerating(false)
    }
  }, [moduleDashboardData, courseInfo.id, refetchModuleDashboard])

  // Callbacks: Stage 2 actions
  const handleRetryFailedDocs = useCallback(async () => {
    if (!stage2DashboardData) return

    const failedDocs = stage2DashboardData.documents.filter((d) => d.status === 'error')
    if (failedDocs.length === 0) {
      toast.info('Нет документов с ошибками')
      return
    }

    try {
      const result = await retryFailedDocuments(
        courseInfo.id,
        failedDocs.map((d) => d.documentId)
      )
      if (result.successCount > 0) {
        toast.success(`${result.successCount} документов поставлены в очередь`)
        refetchStage2Dashboard()
      }
      if (result.failCount > 0) {
        toast.error(`${result.failCount} документов не удалось поставить в очередь`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка ретрая документов')
    }
  }, [stage2DashboardData, courseInfo.id, refetchStage2Dashboard])

  // Callbacks: Refinement
  const handleRefine = useCallback(
    async (message: string, intent?: 'refine' | 'regenerate') => {
      if (!data) return

      const currentOutput = JSON.stringify(displayData?.outputData || {})

      await refine(
        `stage_${data.stageNumber}`,
        selectedNodeId || undefined,
        message,
        currentOutput,
        intent
      )
    },
    [data, displayData, refine, selectedNodeId]
  )

  const handleRefineForLesson = useCallback(
    async (message: string, intent?: 'refine' | 'regenerate') => {
      if (!lessonInspectorData) return
      const currentOutput = JSON.stringify({
        lessonId: lessonInfoForInspector?.lessonId,
        title: lessonInspectorData.title,
        content: lessonInspectorData.rawMarkdown || '',
      })
      await refine('stage_6', selectedNodeId || undefined, message, currentOutput, intent)
    },
    [lessonInspectorData, lessonInfoForInspector, refine, selectedNodeId]
  )

  // Effects: Reset chat conversation when switching between nodes
  useEffect(() => {
    clearConversation()
  }, [selectedNodeId, clearConversation])

  // Effects: Reset phase and attempt selection when node changes
  useEffect(() => {
    if (hasPhases && phases.length > 0) {
      const completePhase = phases.find((p: PhaseData) => p.phaseId === 'complete')
      if (completePhase && (data?.stageNumber === 4 || data?.stageNumber === 5)) {
        setSelectedPhaseId('complete')
      } else {
        const latestPhase = phases[phases.length - 1]
        setSelectedPhaseId(latestPhase.phaseId)
      }
      setSelectedAttemptNum(null)
    } else if (data?.attempts && data.attempts.length > 0) {
      const latest = data.attempts[data.attempts.length - 1]
      setSelectedAttemptNum(latest.attemptNumber)
      setSelectedPhaseId(null)
    } else {
      setSelectedAttemptNum(null)
      setSelectedPhaseId(null)
    }
  }, [selectedNodeId, data?.attempts, data?.stageNumber, hasPhases, phases])

  // Effects: Reset lesson maximization and editing when drawer closes
  useEffect(() => {
    if (!selectedNodeId) {
      setIsLessonMaximized(false)
    }
    if (!isSavingLesson) {
      setIsEditingLesson(false)
    }
  }, [selectedNodeId, isSavingLesson])

  // Effects: Auto-scroll to RefinementChat
  useEffect(() => {
    if (!focusRefinement || !selectedNodeId || !refinementChatRef.current) {
      return
    }

    const timer = setTimeout(() => {
      refinementChatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const input = refinementChatRef.current?.querySelector('textarea, input')
      if (input instanceof HTMLElement) input.focus()
      clearRefinementFocus()
    }, 300)
    return () => clearTimeout(timer)
  }, [focusRefinement, selectedNodeId, clearRefinementFocus])

  // Effects: Lazy load full trace details
  useEffect(() => {
    let cancelled = false

    const loadTraceDetails = async () => {
      if (!selectedNodeId || !displayData) return

      const needsOutputData =
        displayData.outputData === undefined &&
        displayData.status === 'completed' &&
        displayData.traceId

      if (needsOutputData && displayData.traceId) {
        await fetchTraceDetails(displayData.traceId)
        if (cancelled) return
      }
    }

    void loadTraceDetails()

    return () => {
      cancelled = true
    }
  }, [
    selectedNodeId,
    displayData?.traceId,
    displayData?.outputData,
    displayData?.status,
    fetchTraceDetails,
  ])

  return {
    // Node data
    nodes: {
      selectedNodeId,
      selectedNode,
      data,
      displayData,
      isLessonNode,
      isModuleNode,
      isStage2Group,
      isStage6Module,
      isStage6Lesson,
      hasPhases,
      phases,
      documentId,
      lessonInfoForInspector,
      moduleIdForDashboard,
    },
    // State
    state: {
      isExpanded,
      isLessonMaximized,
      showRestartDialog,
      selectedAttemptNum,
      selectedPhaseId,
      isApproving,
      isApprovingAll,
      isExporting,
      isRetrying,
      isDeleting,
      isRegenerating,
      isEditingLesson,
      isSavingLesson,
      isAwaitingApproval,
      canEdit,
      isGenerationActive,
      isAIStage,
      canRestart,
      autoOpened: autoOpened || false,
    },
    // Data
    dashboard: {
      lessonContentData,
      moduleDashboardData,
      isLoadingModuleDashboard,
      moduleDashboardError,
      stage2DashboardData,
      isLoadingStage2Dashboard,
      stage2DashboardError,
      lessonInspectorData,
      isLoadingLessonInspector,
      lessonInspectorError,
    },
    // Refinement
    refinement: {
      refinementChatRef,
      chatHistory,
      isRefining,
      latestProposal,
      isApplying,
      acceptedProposal,
      proposalError,
    },
    // Handlers
    handlers: {
      // UI toggles
      toggleExpand,
      setIsLessonMaximized,
      setShowRestartDialog,
      setSelectedPhaseId,
      setSelectedAttemptNum,
      deselectNode,
      // Lesson actions
      handleEditLesson,
      handleCancelEdit,
      handleStageApproved,
      handleRegenerateLesson,
      handleRetryNode,
      handleDeleteLesson,
      handleSaveEdit,
      handleApproveLesson,
      // Module actions
      handleApproveAllLessons,
      handleExportAll,
      handleRegenerateFailedLessons,
      handleImproveQuality,
      refetchModuleDashboard,
      // Stage 2 actions
      handleRetryFailedDocs,
      // Refinement
      handleRefine,
      handleRefineForLesson,
      acceptProposal,
      retryProposal,
      rejectProposal,
    },
    // Misc
    courseInfo,
    courseSlug,
    orgSlug,
    isAdmin,
    realtimeStatus,
    generationStatus,
    pendingCreateType,
    t,
  }
}
