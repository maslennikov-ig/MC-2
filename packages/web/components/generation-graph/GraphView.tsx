'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Panel,
  useNodesInitialized,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useGraphData } from './hooks/useGraphData'
import { useFullscreenMode } from './hooks/useFullscreenMode'
import { useCourseDataSync } from './hooks/useCourseDataSync'
import { useRealtimeStatusData } from './hooks/useRealtimeStatusData'
import { useAutoNodeSelection } from './hooks/useAutoNodeSelection'
import { useGraphLayoutEffect } from './hooks/useGraphLayoutEffect'
import { StaticGraphProvider } from './contexts/StaticGraphContext'
import { RealtimeStatusProvider } from './contexts/RealtimeStatusContext'
import { FullscreenProvider } from './contexts/FullscreenContext'
import { GraphOperationsProvider } from './contexts/GraphOperationsContext'
import { GRAPH_STAGE_CONFIG, NODE_STYLES } from '@/lib/generation-graph/constants'
import { useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider'
import { isAwaitingApproval } from '@/lib/generation-graph/utils'
import type { Database } from '@megacampus/shared-types'
import { GraphControls } from './controls/GraphControls'
import { GraphMinimap } from './controls/GraphMinimap'
import { GraphHeader } from './GraphHeader'
import { NodeDetailsDrawer } from './panels/NodeDetailsDrawer'
import { AdminPanel } from './panels/AdminPanel'
import { useNodeSelection } from './hooks/useNodeSelection'
import { MissionControlBanner } from '@/components/generation-celestial/MissionControlBanner'
import { trpc } from '@/lib/trpc/react'
import { startGeneration, cancelGeneration, approveStage } from '@/app/actions/admin-generation'
import { toast } from 'sonner'
import { useBreakpoint } from './hooks/useBreakpoint'
import { useThemeSync } from '@/lib/hooks/use-theme-sync'
import { logger } from '@/lib/client-logger'
import { useFallbackPolling } from './hooks/useFallbackPolling'
import { useViewportPreservation } from './hooks/useViewportPreservation'
import { useGracefulDegradation } from './hooks/useGracefulDegradation'

import { useBackgroundTab } from './hooks/useBackgroundTab'
import { useSessionRecovery } from './hooks/useSessionRecovery'
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation'
import { useUserRole } from './hooks/useUserRole'
import { useDocumentsWithStatus } from './hooks/useDocumentsWithStatus'
import { useLocale } from 'next-intl'
import { useParams } from 'next/navigation'
import { setTranslationLocale } from './hooks/use-graph-data/utils/step-translations'
import { PartialGenerationProvider } from './contexts/PartialGenerationContext'
import { SelectionToolbar } from './components/SelectionToolbar'
import { useGenerationStore } from '@/stores/useGenerationStore'
import type { ClarifyingProgressData } from './hooks/use-graph-data/types'
import { nodeTypes, edgeTypes } from './GraphView.constants'
import { GraphInteractions } from './GraphInteractions'
import type { GraphViewProps } from './GraphView.types'

// Re-export GraphViewProps for backward compatibility
export type { GraphViewProps } from './GraphView.types'

/**
 * Internal GraphView component wrapped in ReactFlowProvider context.
 *
 * Renders the main course generation pipeline visualization using React Flow.
 * Provides real-time updates, interactive controls, node details, and accessibility features.
 *
 * Features:
 * - Real-time trace processing and status updates
 * - Automatic graph layout with ELK
 * - Keyboard shortcuts and touch gestures
 * - Mobile/tablet responsive design with list view fallback
 * - Graceful degradation when realtime connection fails
 * - Session recovery with viewport persistence
 * - Admin panel for debugging
 * - Accessibility support (ARIA labels, keyboard navigation)
 *
 * @param props - Component props
 */
function GraphViewInner({
  courseId,
  courseTitle,
  hasDocuments = true,
  failedAtStage,
  progressPercentage,
  generationCode,
  stage1CourseData,
  tier = 'standard',
  generationProgress,
  generationStatus,
  isRealtimeConnected,
  readOnly,
  isPaused,
  onPause,
  onResume,
  onCancelGeneration,
  onSwitchToManual,
}: GraphViewProps) {
  const { isTablet } = useBreakpoint(768)
  const nodesInitialized = useNodesInitialized()
  const { fitView, getNodes, setCenter } = useReactFlow()

  // Get courseSlug and orgSlug from URL params for navigation
  const params = useParams()
  const courseSlug = params?.courseSlug as string | undefined
  const orgSlug = params?.orgSlug as string | undefined

  // Clean up Zustand store on unmount to prevent stale data accumulation
  const resetStore = useGenerationStore((state) => state.reset)
  useEffect(() => {
    return () => {
      resetStore()
    }
  }, [resetStore])

  // Sync locale for step name translations
  const locale = useLocale()
  useEffect(() => {
    setTranslationLocale(locale)
  }, [locale])

  // Admin
  const { isAdmin } = useUserRole()
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false)

  // Banner processing state
  const [isProcessingBanner, setIsProcessingBanner] = useState(false)

  // Fullscreen mode
  const portalContainerRef = useRef<HTMLDivElement>(null)
  const { isFullscreen, containerRef, toggleFullscreen } = useFullscreenMode()

  // Pan/Selection state (FIX-018)
  const [isPanning, setIsPanning] = useState(true)

  // Theme support
  const { resolvedTheme, mounted } = useThemeSync()
  const isDark = mounted && resolvedTheme === 'dark'

  // Tablet optimizations (FIX-021)
  const flowProps = isTablet
    ? {
        minZoom: 0.3,
        maxZoom: 1.5,
        panOnDrag: true, // Force pan on tablet for touch interaction
        selectionOnDrag: false,
        zoomOnScroll: false, // Disable zoom on scroll for tablet
        zoomOnPinch: true,
        panOnScroll: false,
      }
    : {
        minZoom: 0.1,
        maxZoom: 2,
        panOnDrag: isPanning,
        selectionOnDrag: !isPanning,
      }

  // Realtime Data
  const { traces, status: pipelineStatusRaw, isConnected } = useGenerationRealtime()
  // realtime-provider returns string status; cast to GenerationStatus for type-safe comparisons
  const pipelineStatus = pipelineStatusRaw as
    | Database['public']['Enums']['generation_status']
    | null

  // Check if we're in clarifying phase (for MissionControlBanner mode)
  const isClarifyingPhase = pipelineStatus === 'stage_4_clarifying'

  // Graceful degradation
  const { degradationMode, handleRealtimeFailure, statusMessage } = useGracefulDegradation()

  // Helper to focus viewport on a specific node
  const focusOnNode = useCallback(
    (nodeId: string) => {
      const nodes = getNodes()
      const targetNode = nodes.find((n) => n.id === nodeId)
      if (targetNode?.position) {
        const width = targetNode.measured?.width || 180
        const height = targetNode.measured?.height || 80
        void setCenter(targetNode.position.x + width / 2, targetNode.position.y + height / 2, {
          zoom: 1.0,
          duration: 600,
        })
      }
    },
    [getNodes, setCenter]
  )

  // Auto-focus on error (T122)
  useEffect(() => {
    if (pipelineStatus === 'failed') {
      const nodes = getNodes()
      const errorNode = nodes.find((n) => n.data.status === 'error')

      if (errorNode && errorNode.position) {
        // Assume default dimensions if not set
        const width = errorNode.measured?.width || 180
        const height = errorNode.measured?.height || 80

        void setCenter(errorNode.position.x + width / 2, errorNode.position.y + height / 2, {
          zoom: 1.2,
          duration: 800,
        })
      }
    }
  }, [pipelineStatus, getNodes, setCenter])

  // Fallback polling when realtime disconnects
  const polledTraces = useFallbackPolling(orgSlug, courseSlug, isConnected)

  // Use realtime traces when connected, polled traces when not
  const effectiveTraces = isConnected ? traces : polledTraces

  // Viewport preservation
  const { preserveViewport, restoreViewport } = useViewportPreservation()

  // T104 [PERF] Queue updates during viewport animation
  const [isInteracting, setIsInteracting] = useState(false)

  // File catalog for document filename lookup (T014: Fix UUID display)
  // Also loads document statuses for Stage 2 graph initialization
  // Pass pipelineStatus to trigger refetch when generation starts (for deduplicated docs)
  const {
    documents: documentsWithStatus,
    getFilename,
    isLoading: isCatalogLoading,
  } = useDocumentsWithStatus(courseId, pipelineStatus)

  // Clarifying questions - two-step query pattern to avoid unnecessary API calls
  // Step 1: Check if clarifying is enabled (lightweight, cached forever - config doesn't change)
  const isAtStage4OrBeyond =
    !!courseId &&
    (pipelineStatus?.startsWith('stage_4') ||
      pipelineStatus?.startsWith('stage_5') ||
      pipelineStatus?.startsWith('stage_6') ||
      pipelineStatus === 'completed')

  const { data: clarifyingEnabled } = trpc.clarifying.isEnabled.useQuery(
    { courseId },
    {
      enabled: isAtStage4OrBeyond,
      staleTime: Infinity, // Config doesn't change, cache forever
      refetchOnWindowFocus: false,
    }
  )

  // Step 2: Only fetch progress if clarifying is actually enabled
  const { data: clarifyingProgressRaw } = trpc.clarifying.getProgress.useQuery(
    { courseId },
    {
      enabled: isAtStage4OrBeyond && clarifyingEnabled?.enabled === true,
      staleTime: 0, // Invalidation triggers immediate refetch (fixes node counter not updating)
      refetchOnWindowFocus: false,
    }
  )

  // Transform clarifying progress to expected format
  const clarifyingData: ClarifyingProgressData | undefined =
    clarifyingProgressRaw && clarifyingProgressRaw.total > 0
      ? {
          total: clarifyingProgressRaw.total,
          answered: clarifyingProgressRaw.answered,
          criticalAnswered: clarifyingProgressRaw.criticalAnswered,
          criticalTotal: clarifyingProgressRaw.criticalTotal,
          canProceed: clarifyingProgressRaw.canProceed,
          isAutomatic: clarifyingProgressRaw.isAutomatic ?? false,
        }
      : undefined
  const initializeDocumentsWithStatus = useGenerationStore(
    (state) => state.initializeDocumentsWithStatus
  )
  const areAllDocumentsComplete = useGenerationStore((state) => state.areAllDocumentsComplete)
  const setStageStatusOptimistic = useGenerationStore((state) => state.setStageStatusOptimistic)

  // Graph State
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    processTraces,
    initializeFromCourseStructure,
    initializeDocumentsFromDb,
    removeLesson,
    setNodes,
    nodePositionsRef,
  } = useGraphData({
    getFilename,
    hasDocuments,
    stage1CourseData,
    clarifyingData,
    courseStatus: pipelineStatus ?? undefined,
  })
  // Course data sync (structure, visual_style, style, analysis_result)
  const { visualStyle, courseStyle, analysisResult, courseLanguage } = useCourseDataSync({
    courseId,
    initializeFromCourseStructure,
    isConnected,
    pipelineStatus,
  })

  // Auto-layout when graph structure changes
  const { initialFitDone } = useGraphLayoutEffect({
    nodes,
    edges,
    setNodes,
    nodePositionsRef,
  })

  // Initialize Stage 2 documents from database with proper statuses
  const storeDocumentsCount = useGenerationStore((state) => state.documents.size)
  useEffect(() => {
    if (isCatalogLoading || !hasDocuments) return
    if (documentsWithStatus.length === 0) return

    initializeDocumentsWithStatus(documentsWithStatus)

    if (storeDocumentsCount === 0) {
      initializeDocumentsFromDb(documentsWithStatus)
    }
  }, [
    documentsWithStatus,
    isCatalogLoading,
    hasDocuments,
    storeDocumentsCount,
    initializeDocumentsWithStatus,
    initializeDocumentsFromDb,
  ])

  // Selection
  const { selectNode, deselectNode, selectedNodeId } = useNodeSelection()

  // Background Tab Handling (T110)
  useBackgroundTab()

  // Persist graph position to localStorage (T120)
  useSessionRecovery(courseId)

  // Keyboard navigation for accessibility (T092)
  useKeyboardNavigation()

  // Handle realtime disconnection
  useEffect(() => {
    let timeout: NodeJS.Timeout

    if (!isConnected && degradationMode === 'full') {
      // Give 5s grace period for initial connection or reconnection
      timeout = setTimeout(() => {
        handleRealtimeFailure()
      }, 5000)
    }

    return () => clearTimeout(timeout)
  }, [isConnected, degradationMode, handleRealtimeFailure])

  // Process traces with viewport preservation (T104: Only when not interacting)
  useEffect(() => {
    if (isInteracting) return

    if (effectiveTraces.length > 0) {
      preserveViewport()
      processTraces(effectiveTraces)
      restoreViewport()
    }
  }, [effectiveTraces, processTraces, preserveViewport, restoreViewport, isInteracting])

  // Initial Fit View - show all nodes with comfortable zoom level
  useEffect(() => {
    if (nodesInitialized && !initialFitDone.current && nodes.length > 0) {
      initialFitDone.current = true
      requestAnimationFrame(() => {
        void fitView({ padding: 0.15, minZoom: 0.6, maxZoom: 1.2, duration: 300 })
      })
    }
  }, [nodesInitialized, nodes.length, fitView])

  // Prepare Realtime Context
  const realtimeData = useRealtimeStatusData({
    pipelineStatus,
    isConnected,
    hasDocuments,
    failedAtStage,
    nodes,
    progressPercentage,
    lessonsCompleted: generationProgress?.lessons_completed,
    lessonsTotal: generationProgress?.lessons_total,
  })

  // Static Data (includes dynamic counts for EndNode display)
  const staticData = useMemo(() => {
    // Count modules and lessons from nodes for EndNode display
    const moduleCount = nodes.filter((n) => n.type === 'module').length
    const lessonCount = nodes.filter((n) => n.type === 'lesson').length
    const documentCount = nodes.filter((n) => n.type === 'document').length

    return {
      stageConfig: GRAPH_STAGE_CONFIG,
      nodeStyles: NODE_STYLES,
      courseInfo: {
        id: courseId,
        title: courseTitle || 'Course Generation',
        documentCount,
        moduleCount,
        lessonCount,
        tier,
        visualStyle,
        courseStyle,
        readOnly,
        analysisResult,
        courseLanguage,
      },
    }
  }, [
    courseId,
    courseTitle,
    tier,
    nodes,
    visualStyle,
    courseStyle,
    readOnly,
    analysisResult,
    courseLanguage,
  ])

  // Mobile view - show simplified graph (no separate list view)
  // Graph view works on mobile with touch gestures enabled

  const awaitingStage = isAwaitingApproval(pipelineStatus || '')

  // Auto-select Stage 3, 4, or 5 node when awaiting approval or on completion
  useAutoNodeSelection({
    courseId,
    pipelineStatus,
    awaitingStage,
    selectNode,
    deselectNode,
  })

  return (
    <RealtimeStatusProvider value={realtimeData}>
      <StaticGraphProvider {...staticData}>
        <GraphOperationsProvider removeLesson={removeLesson}>
          <FullscreenProvider portalContainerRef={portalContainerRef} isFullscreen={isFullscreen}>
            <div
              ref={containerRef}
              className={`relative flex h-full w-full flex-col ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}
            >
              {/* Portal container for dialogs in fullscreen mode */}
              <div ref={portalContainerRef} id="graph-portal-container" />
              <GraphHeader
                title={courseTitle || 'Course Generation'}
                progress={realtimeData.overallProgress}
                courseId={courseId}
                isAdmin={isAdmin}
                onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
                isDark={isDark}
                isFullscreen={isFullscreen}
                onToggleFullscreen={toggleFullscreen}
                generationCode={generationCode}
                generationProgress={generationProgress}
                generationStatus={generationStatus}
                isConnected={isRealtimeConnected ?? isConnected}
              />
              <div className="relative w-full flex-1 overflow-hidden">
                {/* Degradation Mode Indicator */}
                {statusMessage && (
                  <div
                    className={`absolute top-2 left-1/2 z-50 -translate-x-1/2 rounded-full px-3 py-1.5 text-sm font-medium shadow-md ${
                      isDark ? 'bg-yellow-900/50 text-yellow-200' : 'bg-yellow-100 text-yellow-800'
                    }`}
                    role="alert"
                    data-testid="degradation-indicator"
                  >
                    {statusMessage}
                  </div>
                )}

                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  fitView
                  defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                  onNodeDoubleClick={(_, node) => {
                    logger.devLog('[GraphView] onNodeDoubleClick', {
                      nodeId: node.id,
                      nodeType: node.type,
                    })
                    selectNode(node.id)
                  }}
                  onPaneClick={() => {
                    // Close node details panel when clicking on empty canvas area
                    deselectNode()
                  }}
                  onMoveStart={() => setIsInteracting(true)}
                  onMoveEnd={() => setIsInteracting(false)}
                  aria-label="Course generation pipeline graph"
                  role="region"
                  nodesDraggable={true}
                  nodesConnectable={false}
                  elementsSelectable={true}
                  proOptions={{ hideAttribution: true }}
                  colorMode={isDark ? 'dark' : 'light'}
                  {...flowProps}
                >
                  <Background color={isDark ? '#475569' : '#94a3b8'} gap={20} size={1} />
                  <GraphControls isDark={isDark} />
                  <GraphMinimap isDark={isDark} />
                  <GraphInteractions setIsPanning={setIsPanning} />

                  {/* Custom Attribution */}
                  <Panel position="bottom-right" className="!mr-1 !mb-0">
                    <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      MegaCampus AI
                    </span>
                  </Panel>
                </ReactFlow>

                {/* Show banner when:
                    - In automatic mode (readOnly=true) and not in terminal state
                    - OR awaiting approval in semi-automatic mode
                    - OR during clarifying phase (stage_4_clarifying) */}
                {(() => {
                  const terminalStatuses = ['completed', 'failed', 'cancelled']

                  // Show MissionControlBanner in clarifying mode during clarifying phase
                  if (isClarifyingPhase && !readOnly) {
                    return (
                      <MissionControlBanner
                        courseId={courseId}
                        awaitingStage={4}
                        isNodePanelOpen={!!selectedNodeId}
                        isAutomaticMode={false}
                        isClarifyingMode={true}
                        clarifyingProgress={clarifyingData}
                        onApprove={() => {
                          // Open clarifying panel by selecting the clarifying node
                          selectNode('stage_4_clarifying')
                        }}
                        onCancel={async () => {
                          setIsProcessingBanner(true)
                          try {
                            await cancelGeneration(courseId)
                            toast.info('Генерация отменена')
                          } catch (error) {
                            toast.error('Не удалось отменить генерацию', {
                              description:
                                error instanceof Error ? error.message : 'Неизвестная ошибка',
                            })
                          } finally {
                            setIsProcessingBanner(false)
                          }
                        }}
                        onViewResults={() => selectNode('stage_4_clarifying')}
                        isProcessing={isProcessingBanner}
                        isDark={isDark}
                      />
                    )
                  }

                  const showBanner = readOnly
                    ? !terminalStatuses.includes(pipelineStatus || '')
                    : awaitingStage !== null && (awaitingStage !== 2 || areAllDocumentsComplete())
                  return showBanner ? (
                    <MissionControlBanner
                      courseId={courseId}
                      awaitingStage={awaitingStage ?? 0}
                      isNodePanelOpen={!!selectedNodeId}
                      isAutomaticMode={readOnly}
                      isPaused={isPaused}
                      onPause={onPause}
                      onResume={onResume}
                      onSwitchToManual={onSwitchToManual}
                      onApprove={async () => {
                        // Stage 0: Start generation
                        if (awaitingStage === 0) {
                          setIsProcessingBanner(true)
                          // Optimistic update: immediately show Stage 1 as active
                          // This provides instant visual feedback before backend responds
                          setStageStatusOptimistic('stage_1', 'active')
                          try {
                            await startGeneration(courseId)
                            toast.success('Генерация запущена!')
                            // Focus on Stage 1 after starting generation
                            focusOnNode('stage_1')
                          } catch (error) {
                            // Rollback optimistic update on error
                            setStageStatusOptimistic('stage_1', 'pending')
                            toast.error('Не удалось запустить генерацию', {
                              description:
                                error instanceof Error ? error.message : 'Неизвестная ошибка',
                            })
                          } finally {
                            setIsProcessingBanner(false)
                          }
                          return
                        }
                        // For stage 3, open Stage 3 node modal for prioritization
                        if (awaitingStage === 3) {
                          selectNode('stage_3')
                          return
                        }
                        // For stage 5, open Stage 5 node modal for structure approval
                        if (awaitingStage === 5) {
                          selectNode('stage_5')
                          return
                        }
                        // For other stages (2, 4, 6): approve and continue
                        if (awaitingStage === null) return
                        setIsProcessingBanner(true)
                        try {
                          await approveStage(courseId, awaitingStage)
                          toast.success(`Стадия ${awaitingStage} подтверждена!`)
                          // Focus on next stage after approval
                          const nextStage = awaitingStage + 1
                          if (nextStage <= 7) {
                            focusOnNode(`stage_${nextStage}`)
                          }
                        } catch (error) {
                          toast.error('Не удалось подтвердить стадию', {
                            description:
                              error instanceof Error ? error.message : 'Неизвестная ошибка',
                          })
                        } finally {
                          setIsProcessingBanner(false)
                        }
                      }}
                      onCancel={
                        readOnly && onCancelGeneration
                          ? onCancelGeneration
                          : async () => {
                              // Stage 0: Just ignore cancel (no generation started)
                              if (awaitingStage === 0) return

                              setIsProcessingBanner(true)
                              try {
                                await cancelGeneration(courseId)
                                toast.info('Генерация отменена')
                              } catch (error) {
                                toast.error('Не удалось отменить генерацию', {
                                  description:
                                    error instanceof Error ? error.message : 'Неизвестная ошибка',
                                })
                              } finally {
                                setIsProcessingBanner(false)
                              }
                            }
                      }
                      onViewResults={() => {
                        // For stage 3, open Stage 3 node modal
                        if (awaitingStage === 3) {
                          selectNode('stage_3')
                        }
                      }}
                      isProcessing={isProcessingBanner}
                      isDark={isDark}
                    />
                  ) : null
                })()}

                <NodeDetailsDrawer />
                {isAdmin && (
                  <AdminPanel
                    isOpen={isAdminPanelOpen}
                    onClose={() => setIsAdminPanelOpen(false)}
                  />
                )}

                {/* Selection toolbar for Stage 6 partial generation - show when lessons exist AND Stage 5 is approved AND NOT in automatic mode */}
                {nodes.some((n) => n.type === 'lesson') && awaitingStage !== 5 && !readOnly && (
                  <SelectionToolbar
                    courseId={courseId}
                    isCompleted={pipelineStatus === 'completed'}
                    courseSlug={courseSlug}
                    orgSlug={orgSlug}
                    moduleCount={staticData.courseInfo.moduleCount}
                    lessonCount={staticData.courseInfo.lessonCount}
                    generationStatus={pipelineStatus ?? undefined}
                  />
                )}
              </div>
            </div>
          </FullscreenProvider>
        </GraphOperationsProvider>
      </StaticGraphProvider>
    </RealtimeStatusProvider>
  )
}

/**
 * Main GraphView component for visualizing course generation pipeline.
 *
 * Displays an interactive graph showing the progress of course generation through
 * multiple stages (analysis, documents, structure, modules/lessons). Updates in real-time
 * as the generation pipeline processes.
 *
 * The graph supports:
 * - Sequential stages (1, 3, 4, 5)
 * - Parallel processing (stage 2 for documents, stage 6 for modules/lessons)
 * - Real-time status updates via WebSocket
 * - Fallback polling when WebSocket disconnects
 * - Mobile/tablet responsive design
 * - Keyboard navigation and shortcuts
 * - Admin debugging panel
 *
 * @param props - Component props
 *
 * @example
 * ```tsx
 * function CoursePage({ courseId }) {
 *   return (
 *     <div className="h-screen">
 *       <GraphView
 *         courseId={courseId}
 *         courseTitle="Introduction to React"
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function GraphView(props: GraphViewProps) {
  return (
    <ReactFlowProvider>
      <PartialGenerationProvider courseId={props.courseId}>
        <GraphViewInner {...props} />
      </PartialGenerationProvider>
    </ReactFlowProvider>
  )
}
