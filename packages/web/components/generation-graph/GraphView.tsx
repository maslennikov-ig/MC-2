'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Panel,
  NodeTypes,
  EdgeTypes,
  useNodesInitialized,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphData } from './hooks/useGraphData';
import { useGraphLayout } from './hooks/useGraphLayout';
import StageNode from './nodes/StageNode';
import MergeNode from './nodes/MergeNode';
import EndNode from './nodes/EndNode';
import DocumentNode from './nodes/DocumentNode';
import LessonNode from './nodes/LessonNode';
import ModuleGroup from './nodes/ModuleGroup';
import Stage2Group from './nodes/Stage2Group';
import AnimatedEdge from './edges/AnimatedEdge';
import DataFlowEdge from './edges/DataFlowEdge';
import { StaticGraphProvider } from './contexts/StaticGraphContext';
import { RealtimeStatusProvider } from './contexts/RealtimeStatusContext';
import { FullscreenProvider } from './contexts/FullscreenContext';
import { GRAPH_STAGE_CONFIG, NODE_STYLES, ACTIVE_STATUSES } from '@/lib/generation-graph/constants';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider';
import { RealtimeStatusData, NodeStatusEntry } from '@megacampus/shared-types';
import { mapStatusToNodeStatus, getStageFromStatus, isAwaitingApproval, calculateProgress } from '@/lib/generation-graph/utils';
import { GraphControls } from './controls/GraphControls';
import { GraphMinimap } from './controls/GraphMinimap';
import { GraphHeader } from './GraphHeader';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTouchGestures } from './hooks/useTouchGestures';
import { NodeDetailsDrawer } from './panels/NodeDetailsDrawer';
import { AdminPanel } from './panels/AdminPanel';
import { useNodeSelection } from './hooks/useNodeSelection';
import { MissionControlBanner } from '@/components/generation-celestial/MissionControlBanner';
import { startGeneration, cancelGeneration, approveStage } from '@/app/actions/admin-generation';
import { toast } from 'sonner';
// MobileProgressList removed - maintaining two view modes adds complexity
import { useBreakpoint } from './hooks/useBreakpoint';
import { useTheme } from 'next-themes';
import { useFallbackPolling } from './hooks/useFallbackPolling';
import { useViewportPreservation } from './hooks/useViewportPreservation';
import { useGracefulDegradation } from './hooks/useGracefulDegradation';
import { LongRunningIndicator } from './controls/LongRunningIndicator';
import { useBackgroundTab } from './hooks/useBackgroundTab';
import { useSessionRecovery } from './hooks/useSessionRecovery';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
// ViewToggle removed - maintaining two view modes adds complexity without significant benefit
import { useUserRole } from './hooks/useUserRole';
import { useFileCatalog } from './hooks/useFileCatalog';
import { createClient } from '@/lib/supabase/client';
import { useLocale } from 'next-intl';
import { setTranslationLocale } from './hooks/use-graph-data/utils/step-translations';
import type { CourseStructure } from '@megacampus/shared-types';
import { PartialGenerationProvider } from './contexts/PartialGenerationContext';
import { SelectionToolbar } from './components/SelectionToolbar';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { AppNode, AppEdge } from './types';

// Define node and edge types OUTSIDE component to prevent re-creation on each render
const nodeTypes: NodeTypes = {
  stage: StageNode,
  merge: MergeNode,
  end: EndNode,
  document: DocumentNode,
  lesson: LessonNode,
  module: ModuleGroup,
  stage2group: Stage2Group,
};

const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge,
  dataflow: DataFlowEdge,
};

/**
 * Props for the GraphView component.
 */
export interface GraphViewProps {
  /** Unique identifier for the course being generated */
  courseId: string;
  /** Optional display title for the course (defaults to 'Course Generation') */
  courseTitle?: string;
  /**
   * Whether the course has documents.
   * When false, Stage 2 (Document Processing) and Stage 3 (Classification)
   * are marked as 'skipped' in the graph visualization.
   * @default true
   */
  hasDocuments?: boolean;
  /** Stage number where generation failed (from courses.failed_at_stage) */
  failedAtStage?: number | null;
  /**
   * Actual progress percentage from the database (0-100).
   * When provided, this is used instead of calculating from status.
   * Ensures consistency with CelestialHeader progress display.
   */
  progressPercentage?: number;
  /** Human-readable generation code (e.g., "ABC-1234") for debugging */
  generationCode?: string | null;
  /**
   * Pre-loaded Stage 1 course data.
   * When provided, Stage 1 node displays this data immediately
   * instead of waiting for traces from generation.
   */
  stage1CourseData?: {
    inputData: Record<string, unknown>;
    outputData: Record<string, unknown>;
  };
}

/**
 * Props for the GraphInteractions component.
 */
interface GraphInteractionsProps {
  /** Callback to update panning mode state */
  setIsPanning: (isPanning: boolean) => void;
}

/**
 * Internal component that manages graph interactions (keyboard shortcuts, touch gestures).
 * Renders nothing but sets up interaction event handlers.
 *
 * @param props - Component props
 */
function GraphInteractions({ setIsPanning }: GraphInteractionsProps) {
  useKeyboardShortcuts(setIsPanning);
  useTouchGestures();
  return null;
}

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
function GraphViewInner({ courseId, courseTitle, hasDocuments = true, failedAtStage, progressPercentage, generationCode, stage1CourseData }: GraphViewProps) {
  const { isTablet } = useBreakpoint(768);
  const nodesInitialized = useNodesInitialized();
  const { fitView, getNodes, setCenter } = useReactFlow();
  const initialFitDone = useRef(false);

  // Sync locale for step name translations
  const locale = useLocale();
  useEffect(() => {
    setTranslationLocale(locale);
  }, [locale]);

  // Admin
  const { isAdmin } = useUserRole();
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);

  // Banner processing state
  const [isProcessingBanner, setIsProcessingBanner] = useState(false);

  // Fullscreen mode
  const containerRef = useRef<HTMLDivElement>(null);
  const portalContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Sync fullscreen state with browser
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // View mode toggle removed (T096) - maintaining two views adds complexity without significant benefit

  // Pan/Selection state (FIX-018)
  // Default to Pan Mode (n8n style), Space to Select
  const [isPanning, setIsPanning] = useState(true);

  // Theme support
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Tablet optimizations (FIX-021)
  const flowProps = isTablet ? {
      minZoom: 0.3,
      maxZoom: 1.5,
      panOnDrag: true, // Force pan on tablet for touch interaction
      selectionOnDrag: false,
      zoomOnScroll: false, // Disable zoom on scroll for tablet
      zoomOnPinch: true,
      panOnScroll: false,
  } : {
      minZoom: 0.1,
      maxZoom: 2,
      panOnDrag: isPanning,
      selectionOnDrag: !isPanning,
  };

  // Realtime Data
  const { traces, status: pipelineStatus, isConnected } = useGenerationRealtime();

  // Graceful degradation
  const {
    degradationMode,
    handleRealtimeFailure,
    statusMessage
  } = useGracefulDegradation();

  // Auto-focus on error (T122)
  useEffect(() => {
    if (pipelineStatus === 'failed') {
        const nodes = getNodes();
        const errorNode = nodes.find(n => n.data.status === 'error');
        
        if (errorNode && errorNode.position) {
            // Assume default dimensions if not set
            const width = errorNode.measured?.width || 180;
            const height = errorNode.measured?.height || 80;
            
            setCenter(
                errorNode.position.x + width / 2, 
                errorNode.position.y + height / 2, 
                { zoom: 1.2, duration: 800 }
            );
        }
    }
  }, [pipelineStatus, getNodes, setCenter]);

  // Fallback polling when realtime disconnects
  const polledTraces = useFallbackPolling(courseId, isConnected);

  // Use realtime traces when connected, polled traces when not
  const effectiveTraces = isConnected ? traces : polledTraces;

  // Viewport preservation
  const { preserveViewport, restoreViewport } = useViewportPreservation();
  
  // T104 [PERF] Queue updates during viewport animation
  const [isInteracting, setIsInteracting] = useState(false);

  // File catalog for document filename lookup (T014: Fix UUID display)
  const { getFilename, filenameMap, isLoading: isCatalogLoading } = useFileCatalog(courseId);
  const initializeDocuments = useGenerationStore(state => state.initializeDocuments);
  const areAllDocumentsComplete = useGenerationStore(state => state.areAllDocumentsComplete);

  // Graph State
  const { nodes, edges, onNodesChange, onEdgesChange, processTraces, initializeFromCourseStructure, setNodes, nodePositionsRef } = useGraphData({ getFilename, hasDocuments, stage1CourseData });
  const { layoutNodes, layoutError: _layoutError } = useGraphLayout();
  // Layout generation counter to prevent stale layout results (Fix #6: Race condition)
  const layoutGenerationRef = useRef(0);

  // Ref to access latest nodes without adding to effect dependencies
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Fetch course structure on mount to initialize modules/lessons (Task 1: Stage 6 UI/UX)
  // This ensures the structure appears immediately even on page refresh
  const courseStructureInitialized = useRef(false);
  useEffect(() => {
    // Prevent double-fetch in strict mode
    if (courseStructureInitialized.current) return;
    courseStructureInitialized.current = true;

    const fetchCourseStructure = async () => {
      const supabase = createClient();

      // Fetch course structure and completed lessons in parallel
      const [courseResult, lessonsResult] = await Promise.all([
        supabase
          .from('courses')
          .select('course_structure')
          .eq('id', courseId)
          .single(),
        supabase
          .from('generation_trace')
          .select('input_data')
          .eq('course_id', courseId)
          .eq('stage', 'stage_6')
          .eq('step_name', 'finish')
          .not('input_data->lessonLabel', 'is', null)
      ]);

      if (courseResult.error) {
        console.error('[GraphView] Failed to fetch course structure:', courseResult.error);
        // Reset flag on error to allow retry on remount
        courseStructureInitialized.current = false;
        return;
      }

      if (courseResult.data?.course_structure) {
        // Extract unique lessonLabels from completed traces
        const completedLabels = lessonsResult.data && lessonsResult.data.length > 0
          ? [...new Set(
              lessonsResult.data
                .map(t => (t.input_data as Record<string, unknown>)?.lessonLabel as string)
                .filter(Boolean)
            )]
          : [];

        // Initialize structure with completed statuses in one call
        initializeFromCourseStructure(courseResult.data.course_structure as CourseStructure, completedLabels);
      } else {
        // Reset flag if no structure found (might be added later)
        courseStructureInitialized.current = false;
      }
    };

    fetchCourseStructure();
  }, [courseId, initializeFromCourseStructure]);

  // Re-fetch course structure when Stage 5 becomes complete
  // This ensures lesson nodes appear immediately after Stage 5 approval
  const prevPipelineStatus = useRef<string | null>(null);
  useEffect(() => {
    // Only trigger on transition TO stage_5_complete
    const wasNotComplete = prevPipelineStatus.current !== 'stage_5_complete';
    const isNowComplete = pipelineStatus === 'stage_5_complete';
    prevPipelineStatus.current = pipelineStatus ?? null;

    if (wasNotComplete && isNowComplete) {
      // Reset the initialization flag to allow re-fetch
      courseStructureInitialized.current = false;

      // Fetch fresh course structure
      const fetchCourseStructure = async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('courses')
          .select('course_structure')
          .eq('id', courseId)
          .single();

        if (error) {
          console.error('[GraphView] Failed to fetch course structure after Stage 5:', error);
          return;
        }

        if (data?.course_structure) {
          initializeFromCourseStructure(data.course_structure as CourseStructure, []);
          courseStructureInitialized.current = true;
        }
      };

      fetchCourseStructure();
    }
  }, [pipelineStatus, courseId, initializeFromCourseStructure]);

  // Initialize documents from file catalog (prevents premature stage completion)
  const documentsInitialized = useRef(false);
  useEffect(() => {
    if (documentsInitialized.current || isCatalogLoading || !hasDocuments) return;
    if (filenameMap.size === 0) return;

    documentsInitialized.current = true;

    // Convert Map to array format for store
    const files = Array.from(filenameMap.entries()).map(([id, name]) => ({ id, name }));
    initializeDocuments(files);
  }, [filenameMap, isCatalogLoading, hasDocuments, initializeDocuments]);

  // Track module and stage2group collapse states for relayout trigger
  const collapseSignature = useMemo(() =>
    nodes
      .filter(n => n.type === 'module' || n.type === 'stage2group')
      .map(n => `${n.id}:${n.data?.isCollapsed}`)
      .join(','),
    [nodes]
  );

  // Create stable layout trigger based on structure, not content
  // This prevents the effect from running on every node status update
  const layoutTrigger = useMemo(() => ({
    nodeCount: nodes.length,
    containerIds: nodes.filter(n => n.type === 'module' || n.type === 'stage2group').map(n => n.id).join(','),
    collapseSignature
  }), [nodes, collapseSignature]);

  // Use ref to track previous trigger for comparison
  const prevLayoutTrigger = useRef(layoutTrigger);

  // Debounced layout function to prevent rapid layout calculations
  const debouncedLayout = useDebouncedCallback(
    async (
      nodesToLayout: AppNode[],
      edgesToLayout: AppEdge[],
      generation: number,
      wasCollapseChange: boolean
    ) => {
      if (layoutGenerationRef.current !== generation) {
        return; // Stale request
      }

      try {
        const layoutedNodes = await layoutNodes(nodesToLayout, edgesToLayout);

        if (layoutGenerationRef.current !== generation) {
          return; // Another layout started
        }

        // CRITICAL: Save positions BEFORE setNodes to prevent race condition
        // This ensures next graph rebuild has correct positions
        // Save ALL node positions including lessons (with parentId)
        // Lessons need their positions saved because graph rebuild in useGraphData
        // uses nodePositionsRef to restore positions, and without saved positions
        // lessons would get {x: 0, y: 0} on every rebuild
        layoutedNodes.forEach(n => {
          if (n.position) {
            nodePositionsRef.current.set(n.id, n.position);
          }
        });

        setNodes(layoutedNodes);

        // Fit view after layout - comfortable zoom to see all nodes
        if (!initialFitDone.current) {
          initialFitDone.current = true;
          requestAnimationFrame(() => {
            fitView({ padding: 0.15, minZoom: 0.6, maxZoom: 1.2, duration: 400 });
          });
        } else if (wasCollapseChange) {
          // Restore viewport after layout when collapse changed
          restoreViewport();
        }
      } catch (error) {
        console.error('[GraphView] Layout calculation failed:', error);
        // Layout failed, but don't crash - nodes will stay at current positions
      }
    },
    50, // 50ms debounce
    { leading: true, trailing: true }
  );

  // Auto-layout when structure changes (node count, container IDs, or collapse state)
  useEffect(() => {
      const structureChanged =
          layoutTrigger.nodeCount !== prevLayoutTrigger.current.nodeCount ||
          layoutTrigger.containerIds !== prevLayoutTrigger.current.containerIds;
      const collapseChanged =
          layoutTrigger.collapseSignature !== prevLayoutTrigger.current.collapseSignature;
      const isInitialLoad = !initialFitDone.current;

      // Update ref for next comparison
      prevLayoutTrigger.current = layoutTrigger;

      // Only layout if structure changes, collapse state changes, or initial load
      if (nodesRef.current.length > 0 && (structureChanged || isInitialLoad || collapseChanged)) {
          // Preserve viewport when collapse state changes (avoid scroll jump)
          if (collapseChanged && !isInitialLoad) {
              preserveViewport();
          }

          // Increment generation to track this layout request
          const currentGeneration = ++layoutGenerationRef.current;

          // Use debounced layout to prevent rapid layout calculations
          debouncedLayout(nodesRef.current, edges, currentGeneration, collapseChanged && !isInitialLoad);
      }

      // Cleanup: cancel pending debounced calls on unmount or re-run
      return () => {
        debouncedLayout.cancel();
      };
  }, [layoutTrigger, edges, preserveViewport, debouncedLayout]);
  
  // Selection
  const { selectNode, deselectNode } = useNodeSelection();

  // Background Tab Handling (T110)
  useBackgroundTab();

  // Persist graph position to localStorage (T120)
  useSessionRecovery(courseId);

  // Keyboard navigation for accessibility (T092)
  useKeyboardNavigation();

  // Handle realtime disconnection
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    if (!isConnected && degradationMode === 'full') {
      // Give 5s grace period for initial connection or reconnection
      timeout = setTimeout(() => {
        handleRealtimeFailure();
      }, 5000);
    }

    return () => clearTimeout(timeout);
  }, [isConnected, degradationMode, handleRealtimeFailure]);

  // Process traces with viewport preservation (T104: Only when not interacting)
  useEffect(() => {
    if (isInteracting) return;

    if (effectiveTraces.length > 0) {
      preserveViewport();
      processTraces(effectiveTraces);
      restoreViewport();
    }
  }, [effectiveTraces, processTraces, preserveViewport, restoreViewport, isInteracting]);

  // Initial Fit View - show all nodes with comfortable zoom level
  useEffect(() => {
    if (nodesInitialized && !initialFitDone.current && nodes.length > 0) {
      initialFitDone.current = true;
      requestAnimationFrame(() => {
        fitView({ padding: 0.15, minZoom: 0.6, maxZoom: 1.2, duration: 300 });
      });
    }
  }, [nodesInitialized, nodes.length, fitView]);

  // Prepare Realtime Context
  const realtimeData: RealtimeStatusData = useMemo(() => {
    const nodeStatuses = new Map<string, NodeStatusEntry>();
    const currentStage = getStageFromStatus(pipelineStatus || '');
    const awaitingStage = isAwaitingApproval(pipelineStatus || '');
    const hasError = pipelineStatus === 'failed';

    Object.values(GRAPH_STAGE_CONFIG).forEach((stage) => {
      const status = mapStatusToNodeStatus(
        stage.number,
        currentStage,
        pipelineStatus || 'draft',
        hasError,
        awaitingStage,
        failedAtStage,  // Pass failedAtStage from props
        hasDocuments    // Pass hasDocuments to mark stages 2,3 as skipped when no documents
      );

      nodeStatuses.set(stage.id, {
        status,
        lastUpdated: new Date(),
      });
    });

    // Calculate Stage 6 progress from lesson completion
    const stage6Nodes = nodes.filter(n => n.type === 'lesson' || n.type === 'module');
    const stage6Lessons = stage6Nodes.filter(n => n.type === 'lesson');
    const stage6Completed = stage6Lessons.filter(l => l.data.status === 'completed').length;
    const stage6Progress = stage6Lessons.length > 0
      ? Math.round((stage6Completed / stage6Lessons.length) * 100)
      : 0;

    // Update Stage 6 status entry with progress
    const stage6Status = nodeStatuses.get('stage_6');
    if (stage6Status) {
      nodeStatuses.set('stage_6', {
        ...stage6Status,
        progress: stage6Progress,
      });
    }

    let mappedStatus: 'idle' | 'running' | 'completed' | 'failed' | 'paused' = 'idle';
    if (pipelineStatus && ACTIVE_STATUSES.includes(pipelineStatus)) {
      mappedStatus = 'running';
    } else if (pipelineStatus === 'completed') {
      mappedStatus = 'completed';
    } else if (pipelineStatus === 'failed') {
      mappedStatus = 'failed';
    }

    // Use progressPercentage from database when available (ensures consistency with CelestialHeader)
    // Fall back to calculated progress from status for backward compatibility
    const overallProgress = progressPercentage !== undefined
      ? progressPercentage
      : calculateProgress(pipelineStatus, hasDocuments);

    return {
      nodeStatuses,
      activeNodeId: null,
      pipelineStatus: mappedStatus,
      overallProgress,
      elapsedTime: 0,
      totalCost: 0,
      isConnected,
      lastUpdated: new Date(),
    };
  }, [pipelineStatus, isConnected, hasDocuments, failedAtStage, nodes, progressPercentage]);

  // Static Data
  const staticData = useMemo(
    () => ({
      stageConfig: GRAPH_STAGE_CONFIG,
      translations: GRAPH_TRANSLATIONS,
      nodeStyles: NODE_STYLES,
      courseInfo: {
        id: courseId,
        title: courseTitle || 'Course Generation',
        documentCount: 0,
        moduleCount: 0,
        lessonCount: 0,
      },
    }),
    [courseId, courseTitle]
  );

  // Mobile view - show simplified graph (no separate list view)
  // Graph view works on mobile with touch gestures enabled

  const awaitingStage = isAwaitingApproval(pipelineStatus || '');

  // Track which stages have been auto-opened to prevent reopening on page reload
  const getAutoOpenedKey = useCallback(
    (stage: string) => `graphview_auto_opened_${courseId}_${stage}`,
    [courseId]
  );

  const hasBeenAutoOpened = useCallback(
    (stage: string) => {
      if (typeof window === 'undefined') return false;
      return sessionStorage.getItem(getAutoOpenedKey(stage)) === 'true';
    },
    [getAutoOpenedKey]
  );

  const markAsAutoOpened = useCallback(
    (stage: string) => {
      if (typeof window === 'undefined') return;
      sessionStorage.setItem(getAutoOpenedKey(stage), 'true');
    },
    [getAutoOpenedKey]
  );

  // Auto-select Stage 3, 4, or 5 node when awaiting approval (always) or completed (only once per session)
  useEffect(() => {
    let selectedStage: string | null = null;
    let isAwaitingState = false;

    // Check awaiting approval states - ALWAYS open for awaiting (user needs to take action)
    if (awaitingStage === 3) {
      selectedStage = 'stage_3';
      isAwaitingState = true;
    } else if (awaitingStage === 4) {
      selectedStage = 'stage_4';
      isAwaitingState = true;
    } else if (awaitingStage === 5) {
      selectedStage = 'stage_5';
      isAwaitingState = true;
    }
    // Check completion states - only open ONCE per session (not on reload)
    else if (pipelineStatus === 'stage_4_complete' && !hasBeenAutoOpened('stage_4_complete')) {
      selectedStage = 'stage_4';
    } else if (pipelineStatus === 'stage_5_complete' && !hasBeenAutoOpened('stage_5_complete')) {
      selectedStage = 'stage_5';
    }

    // Select the node if a stage is determined (mark as auto-opened)
    if (selectedStage) {
      selectNode(selectedStage, { autoOpened: true });
      // Mark completion states as opened (awaiting states always reopen)
      if (!isAwaitingState && pipelineStatus) {
        markAsAutoOpened(pipelineStatus);
      }
    }

    // Cleanup: deselect when stage changes
    return () => {
      if (selectedStage) {
        deselectNode();
      }
    };
  }, [awaitingStage, pipelineStatus, selectNode, deselectNode, hasBeenAutoOpened, markAsAutoOpened]);

  return (
    <RealtimeStatusProvider value={realtimeData}>
      <StaticGraphProvider {...staticData}>
        <FullscreenProvider portalContainerRef={portalContainerRef} isFullscreen={isFullscreen}>
        <div ref={containerRef} className={`h-full w-full relative flex flex-col ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
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
          />
          <div className="relative flex-1 w-full overflow-hidden">
            {/* Degradation Mode Indicator */}
            {statusMessage && (
                <div
                className={`absolute top-2 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full text-sm font-medium shadow-md ${
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
                  console.log('[GraphView] onNodeDoubleClick', { nodeId: node.id, nodeType: node.type });
                  selectNode(node.id);
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
                <LongRunningIndicator />
                {/* Custom Attribution */}
                <Panel position="bottom-right" className="!mb-0 !mr-1">
                  <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    MegaCampus AI
                  </span>
                </Panel>
            </ReactFlow>

            {/* Show banner when awaiting approval, but for Stage 2 also require all documents to be complete */}
            {awaitingStage !== null && (awaitingStage !== 2 || areAllDocumentsComplete()) && (
                <div className="absolute bottom-6 left-0 w-full z-50 pointer-events-none flex justify-center">
                    <div className="pointer-events-auto w-full max-w-4xl px-4">
                        <MissionControlBanner
                            courseId={courseId}
                            awaitingStage={awaitingStage}
                            onApprove={async () => {
                                // Stage 0: Start generation
                                if (awaitingStage === 0) {
                                    setIsProcessingBanner(true);
                                    try {
                                        await startGeneration(courseId);
                                        toast.success('Генерация запущена!');
                                    } catch (error) {
                                        toast.error('Не удалось запустить генерацию', {
                                            description: error instanceof Error ? error.message : 'Неизвестная ошибка'
                                        });
                                    } finally {
                                        setIsProcessingBanner(false);
                                    }
                                    return;
                                }
                                // For stage 3, open Stage 3 node modal for prioritization
                                if (awaitingStage === 3) {
                                    selectNode('stage_3');
                                    return;
                                }
                                // For stage 5, open Stage 5 node modal for structure approval
                                if (awaitingStage === 5) {
                                    selectNode('stage_5');
                                    return;
                                }
                                // For other stages (2, 4, 6): approve and continue
                                setIsProcessingBanner(true);
                                try {
                                    await approveStage(courseId, awaitingStage);
                                    toast.success(`Стадия ${awaitingStage} подтверждена!`);
                                } catch (error) {
                                    toast.error('Не удалось подтвердить стадию', {
                                        description: error instanceof Error ? error.message : 'Неизвестная ошибка'
                                    });
                                } finally {
                                    setIsProcessingBanner(false);
                                }
                            }}
                            onCancel={async () => {
                                // Stage 0: Just ignore cancel (no generation started)
                                if (awaitingStage === 0) return;

                                setIsProcessingBanner(true);
                                try {
                                    await cancelGeneration(courseId);
                                    toast.info('Генерация отменена');
                                } catch (error) {
                                    toast.error('Не удалось отменить генерацию', {
                                        description: error instanceof Error ? error.message : 'Неизвестная ошибка'
                                    });
                                } finally {
                                    setIsProcessingBanner(false);
                                }
                            }}
                            onViewResults={() => {
                                // For stage 3, open Stage 3 node modal
                                if (awaitingStage === 3) {
                                    selectNode('stage_3');
                                }
                            }}
                            isProcessing={isProcessingBanner}
                            isDark={isDark}
                        />
                    </div>
                </div>
            )}

            <NodeDetailsDrawer />
            {isAdmin && <AdminPanel isOpen={isAdminPanelOpen} onClose={() => setIsAdminPanelOpen(false)} />}

            {/* Selection toolbar for Stage 6 partial generation - show when lessons exist AND Stage 5 is approved */}
            {nodes.some(n => n.type === 'lesson') && awaitingStage !== 5 && <SelectionToolbar courseId={courseId} />}
          </div>
        </div>
        </FullscreenProvider>
      </StaticGraphProvider>
    </RealtimeStatusProvider>
  );
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
  );
}