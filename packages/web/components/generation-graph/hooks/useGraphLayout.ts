import { useState, useCallback } from 'react';
import { useReactFlow, useNodesInitialized } from '@xyflow/react';
import { ElkGraph, ElkNode } from '@megacampus/shared-types';
import { AppNode, AppEdge } from '../types';

// Default dimensions for nodes before measurement
const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 120;

// Spacing for fallback grid layout
const FALLBACK_HORIZONTAL_SPACING = 350;
const FALLBACK_VERTICAL_SPACING = 150;

/**
 * Two-Phase Layout Configuration for Stage 6 Modules.
 * Used by ELK layout algorithm and node dimension calculations.
 *
 * @remarks
 * Phase 1: Calculate module heights based on lesson count
 * Phase 2: ELK positions modules, then lessons are positioned within
 *
 * These values MUST match graph-builders.ts LAYOUT_CONFIG for consistent rendering.
 * CSS styles in ModuleGroup.tsx should use min-h matching these values.
 */
const LAYOUT_CONFIG = {
  /** Width of module container node */
  MODULE_WIDTH: 300,
  /** Height when collapsed - matches min-h-[90px] in ModuleGroup CSS */
  MODULE_COLLAPSED_HEIGHT: 90,
  /** Height of header area (title + expand button) */
  MODULE_HEADER_HEIGHT: 60,
  /** Height of each lesson node inside module (64px to accommodate AssetDock) */
  LESSON_HEIGHT: 64,
  /** Vertical gap between lesson nodes */
  LESSON_GAP: 10,
  /** Internal padding inside module container */
  MODULE_PADDING: 15,
} as const;

/**
 * Layout Configuration for Stage 2 Document Processing Container.
 * Used by ELK layout algorithm and node dimension calculations.
 *
 * @remarks
 * Stage 2 uses different dimensions than Stage 6 modules:
 * - CONTAINER_WIDTH: 320 (vs 300) - wider for long filenames
 * - CONTAINER_COLLAPSED_HEIGHT: 100 (vs 90) - taller for document count/progress
 * - DOCUMENT_HEIGHT: 55 (vs 50) - slightly taller for status indicators
 * - DOCUMENT_GAP: 8 (vs 10) - tighter spacing for compact list
 * - CONTAINER_PADDING: 12 (vs 15) - less padding for more document space
 *
 * These values MUST match graph-builders.ts STAGE2_LAYOUT_CONFIG for consistent rendering.
 */
const STAGE2_LAYOUT_CONFIG = {
  /** Width of stage2group container node */
  CONTAINER_WIDTH: 320,
  /** Height when collapsed - shows summary with document count */
  CONTAINER_COLLAPSED_HEIGHT: 100,
  /** Height of header area (title + progress bar) */
  CONTAINER_HEADER_HEIGHT: 70,
  /** Height of each document node inside container */
  DOCUMENT_HEIGHT: 55,
  /** Vertical gap between document nodes */
  DOCUMENT_GAP: 8,
  /** Internal padding inside container */
  CONTAINER_PADDING: 12,
} as const;

/**
 * Hook for calculating and applying graph layouts using ELK (Eclipse Layout Kernel).
 *
 * Provides automatic graph layout with hierarchical support (parent-child relationships)
 * and graceful fallback to grid layout when ELK fails. Handles both top-level nodes
 * and nested structures (modules containing lessons).
 *
 * Features:
 * - ELK-based hierarchical layout with configurable algorithms
 * - Fallback grid layout for reliability
 * - Node dimension measurement and propagation
 * - Viewport fitting with smooth animations
 * - Support for parent-child node relationships
 *
 * @returns Object containing:
 * - `calculateLayout` - Async function to compute ELK layout for a graph
 * - `layoutNodes` - Main layout function that applies ELK or fallback layout to nodes
 * - `isLayouting` - Boolean indicating if layout calculation is in progress
 * - `layoutError` - Error message if layout calculation failed
 * - `nodesInitialized` - Boolean from React Flow indicating if nodes are ready
 * - `getNodeDimensions` - Helper to get node width/height with fallbacks
 * - `toElkGraph` - Convert React Flow nodes/edges to ELK graph format
 * - `applyFitView` - Apply viewport fit with animation
 * - `applyFallbackLayout` - Apply simple grid layout when ELK fails
 *
 * @example
 * ```tsx
 * function GraphView() {
 *   const { nodes, edges } = useGraphData();
 *   const { layoutNodes, isLayouting } = useGraphLayout();
 *
 *   useEffect(() => {
 *     if (nodes.length > 0) {
 *       layoutNodes(nodes, edges).then(layoutedNodes => {
 *         setNodes(layoutedNodes);
 *       });
 *     }
 *   }, [nodes.length, edges.length]);
 *
 *   if (isLayouting) return <div>Calculating layout...</div>;
 *
 *   return <ReactFlow nodes={nodes} edges={edges} />;
 * }
 * ```
 */
export function useGraphLayout() {
  const [isLayouting, setIsLayouting] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  /**
   * Applies a simple fallback grid layout when ELK fails.
   * Places parent nodes (no parentId) in columns by stage number, with rows for parallel items.
   * Child nodes (with parentId) are positioned RELATIVE to their parent.
   *
   * @param nodes - Array of nodes to layout
   * @returns Array of nodes with updated positions
   */
  const applyFallbackLayout = useCallback((nodes: AppNode[]): AppNode[] => {
    const layoutedNodes: AppNode[] = [];

    // Separate parent nodes (no parentId) from child nodes (have parentId)
    const parentNodes = nodes.filter(n => !n.parentId);
    const childNodes = nodes.filter(n => n.parentId);

    // Group parent nodes by stage
    const stageGroups = new Map<number, AppNode[]>();
    parentNodes.forEach(node => {
      const stage = node.data?.stageNumber ?? 0;
      if (!stageGroups.has(stage)) {
        stageGroups.set(stage, []);
      }
      stageGroups.get(stage)!.push(node);
    });

    // Position parent nodes in columns by stage
    const sortedStages = Array.from(stageGroups.keys()).sort((a, b) => a - b);

    sortedStages.forEach((stage, colIndex) => {
      const stageNodes = stageGroups.get(stage) || [];
      stageNodes.forEach((node, rowIndex) => {
        layoutedNodes.push({
          ...node,
          position: {
            x: colIndex * FALLBACK_HORIZONTAL_SPACING,
            y: rowIndex * FALLBACK_VERTICAL_SPACING,
          },
        });
      });
    });

    // Group child nodes by parent
    const childrenByParent = new Map<string, AppNode[]>();
    childNodes.forEach(child => {
      if (!child.parentId) return;
      if (!childrenByParent.has(child.parentId)) {
        childrenByParent.set(child.parentId, []);
      }
      childrenByParent.get(child.parentId)!.push(child);
    });

    // Position child nodes RELATIVE to their parents (0,0 = parent's top-left)
    childrenByParent.forEach((children, parentId) => {
      // Find parent node to determine type
      const parent = layoutedNodes.find(n => n.id === parentId);
      const isStage2Group = parent?.type === 'stage2group';

      // Use appropriate config based on parent type
      const config = isStage2Group ? {
        headerHeight: STAGE2_LAYOUT_CONFIG.CONTAINER_HEADER_HEIGHT,
        itemHeight: STAGE2_LAYOUT_CONFIG.DOCUMENT_HEIGHT,
        itemGap: STAGE2_LAYOUT_CONFIG.DOCUMENT_GAP,
        padding: STAGE2_LAYOUT_CONFIG.CONTAINER_PADDING,
      } : {
        headerHeight: LAYOUT_CONFIG.MODULE_HEADER_HEIGHT,
        itemHeight: LAYOUT_CONFIG.LESSON_HEIGHT,
        itemGap: LAYOUT_CONFIG.LESSON_GAP,
        padding: LAYOUT_CONFIG.MODULE_PADDING,
      };

      children.forEach((child, index) => {
        layoutedNodes.push({
          ...child,
          position: {
            x: config.padding,
            y: config.headerHeight + (index * (config.itemHeight + config.itemGap)),
          },
        });
      });
    });

    return layoutedNodes;
  }, []);

  /**
   * Calculates graph layout using ELK (Eclipse Layout Kernel).
   * Dynamically imports ELK to avoid Worker build issues.
   *
   * @param graph - ELK graph structure to layout
   * @returns Promise resolving to layouted graph with node positions
   */
  const calculateLayout = useCallback(async (graph: ElkGraph): Promise<ElkGraph> => {
    setIsLayouting(true);
    setLayoutError(null);

    try {
      const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
      const elk = new ELK();
      const layout = await elk.layout(graph);
      setIsLayouting(false);
      return layout as ElkGraph;
    } catch (error) {
      setIsLayouting(false);
      const errorMessage = error instanceof Error ? error.message : 'Unknown layout error';
      setLayoutError(errorMessage);
      console.error('[useGraphLayout] ELK layout failed, will use fallback:', errorMessage);
      return graph; // Return original graph, fallback will be applied in layoutNodes
    }
  }, []);

  /**
   * Gets node dimensions using React Flow v12 measurement pattern.
   * Tries measured dimensions first, then explicit width/height, finally defaults.
   *
   * @param node - Node with optional measured or explicit dimensions
   * @returns Object with width and height in pixels
   */
  const getNodeDimensions = useCallback((node: {
    measured?: { width?: number; height?: number };
    width?: number;
    height?: number;
  }) => {
    return {
      width: node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH,
      height: node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT,
    };
  }, []);

  /**
   * Converts React Flow nodes and edges to ELK graph format.
   *
   * PHASE 1 (MACRO LAYOUT):
   * - Filters out lessons (nodes with parentId) - they're NOT sent to ELK
   * - Calculates dynamic module dimensions based on isCollapsed state
   * - Only layouts top-level nodes (Stages, Modules, Splitter/Merger, End)
   *
   * Lessons will be positioned in Phase 2 (MICRO LAYOUT) using deterministic math.
   *
   * @param nodes - Array of React Flow nodes
   * @param edges - Array of React Flow edges
   * @returns ELK graph structure ready for layout calculation
   */
  const toElkGraph = useCallback((nodes: AppNode[], edges: AppEdge[]): ElkGraph => {
    const elkNodesMap = new Map<string, ElkNode>();
    const rootChildren: ElkNode[] = [];

    // Helper to extract number from ID for sorting (e.g., "module_7" -> 7)
    const extractSortKey = (id: string): number => {
      const numbers = id.match(/\d+/g);
      if (!numbers) return 0;
      return parseInt(numbers[0]);
    };

    // PHASE 1 (MACRO): Filter to top-level nodes only (exclude lessons with parentId)
    // Separate modules from other nodes for proper sorting
    const allTopLevel = nodes.filter(node => !node.parentId);
    const moduleNodes = allTopLevel.filter(n => n.type === 'module');
    const otherNodes = allTopLevel.filter(n => n.type !== 'module');

    // Sort modules by moduleOrder > title (alphabetically as fallback for legacy data)
    const sortedModules = [...moduleNodes].sort((a, b) => {
      const aOrder = (a.data as Record<string, unknown>)?.moduleOrder as number | undefined;
      const bOrder = (b.data as Record<string, unknown>)?.moduleOrder as number | undefined;

      // If both have moduleOrder, use it
      if (aOrder !== undefined && bOrder !== undefined) {
        return aOrder - bOrder;
      }

      // Fallback: sort by title for legacy data without moduleOrder
      const aTitle = a.data?.title as string || '';
      const bTitle = b.data?.title as string || '';
      return aTitle.localeCompare(bTitle, 'ru', { numeric: true });
    });

    // Sort other nodes by stage number
    const sortedOthers = [...otherNodes].sort((a, b) => {
      const aStage = a.data?.stageNumber ?? extractSortKey(a.id);
      const bStage = b.data?.stageNumber ?? extractSortKey(b.id);
      return (aStage ?? 0) - (bStage ?? 0);
    });

    // Combine: stages first (in order), then sorted modules
    const topLevelNodes = [...sortedOthers, ...sortedModules].sort((a, b) => {
      // Stages come before modules
      if (a.type !== 'module' && b.type === 'module') return -1;
      if (a.type === 'module' && b.type !== 'module') return 1;
      // Same type - preserve previous sorting
      return 0;
    });

    // Helper to calculate module dimensions based on expansion state
    const getModuleDimensions = (node: AppNode) => {
      if (node.type === 'module' && node.data) {
        const isCollapsed = node.data.isCollapsed ?? false;
        const totalLessons = (node.data.totalLessons as number) || 0;

        if (isCollapsed) {
          return {
            width: LAYOUT_CONFIG.MODULE_WIDTH,
            height: LAYOUT_CONFIG.MODULE_COLLAPSED_HEIGHT,
          };
        } else {
          // Expanded: Header + (Lessons × RowHeight) + Padding
          const height = LAYOUT_CONFIG.MODULE_HEADER_HEIGHT +
                        (totalLessons * (LAYOUT_CONFIG.LESSON_HEIGHT + LAYOUT_CONFIG.LESSON_GAP)) +
                        LAYOUT_CONFIG.MODULE_PADDING;
          return {
            width: LAYOUT_CONFIG.MODULE_WIDTH,
            height: Math.max(height, 150), // Minimum height for visual balance
          };
        }
      }

      // Handle Stage 2 group container dimensions
      if (node.type === 'stage2group' && node.data) {
        const isCollapsed = node.data.isCollapsed ?? false;
        const totalDocuments = (node.data.totalDocuments as number) || 0;

        if (isCollapsed) {
          return {
            width: STAGE2_LAYOUT_CONFIG.CONTAINER_WIDTH,
            height: STAGE2_LAYOUT_CONFIG.CONTAINER_COLLAPSED_HEIGHT,
          };
        } else {
          // Expanded: Header + (Documents × RowHeight) + Padding
          const height = STAGE2_LAYOUT_CONFIG.CONTAINER_HEADER_HEIGHT +
                        (totalDocuments * (STAGE2_LAYOUT_CONFIG.DOCUMENT_HEIGHT + STAGE2_LAYOUT_CONFIG.DOCUMENT_GAP)) +
                        STAGE2_LAYOUT_CONFIG.CONTAINER_PADDING;
          return {
            width: STAGE2_LAYOUT_CONFIG.CONTAINER_WIDTH,
            height: Math.max(height, 180), // Minimum height for visual balance
          };
        }
      }

      return getNodeDimensions(node);
    };

    // 1. Create ELK nodes (top-level only) with layout options per node type
    topLevelNodes.forEach((node, index) => {
      // Determine per-node layout options for optimal alignment
      let nodeLayoutOptions: Record<string, string> | undefined;

      if (node.type === 'stage' || node.type === 'stage2group') {
        // Stage nodes: high priority to stay centered in the main flow
        // Use alignment CENTER to keep the main pipeline horizontal
        nodeLayoutOptions = {
          'elk.alignment': 'CENTER',
          'elk.layered.priority': '2000', // Highest priority for main pipeline
        };
      } else if (node.type === 'module') {
        // Modules: stack vertically, will be aligned in post-processing
        nodeLayoutOptions = {
          'elk.alignment': 'TOP', // Align from top for consistent vertical stacking
          'elk.layered.priority': String(1000 - index), // Preserve module order
        };
      } else if (node.type === 'merge' || node.type === 'end') {
        // Merge/End nodes: center alignment to match main flow
        nodeLayoutOptions = {
          'elk.alignment': 'CENTER',
          'elk.layered.priority': '1500',
        };
      }

      const elkNode: ElkNode = {
        id: node.id,
        ...getModuleDimensions(node),
        children: [], // Children will be positioned in Phase 2
        layoutOptions: nodeLayoutOptions,
      };
      elkNodesMap.set(node.id, elkNode);
    });

    // 2. Build hierarchy (should be flat since we filtered lessons)
    topLevelNodes.forEach((node) => {
      const elkNode = elkNodesMap.get(node.id);
      if (!elkNode) return;
      rootChildren.push(elkNode);
    });

    // 3. Filter edges to only include edges between top-level nodes
    const topLevelNodeIds = new Set(topLevelNodes.map(n => n.id));
    const topLevelEdges = edges.filter(edge =>
      topLevelNodeIds.has(edge.source) && topLevelNodeIds.has(edge.target)
    );

    return {
      id: 'root',
      children: rootChildren,
      edges: topLevelEdges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
      // Global layout options for horizontal flow (like n8n)
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',

        // === SPACING ===
        // Horizontal spacing between layers (stages)
        'elk.layered.spacing.nodeNodeBetweenLayers': '100',
        // Vertical spacing between nodes in same layer (modules)
        'elk.spacing.nodeNode': '30',
        // Edge spacing for cleaner routing
        'elk.layered.spacing.edgeNodeBetweenLayers': '30',
        'elk.layered.spacing.edgeEdgeBetweenLayers': '20',

        // === NODE PLACEMENT (Critical for alignment!) ===
        // BRANDES_KOEPF produces cleaner, more balanced layouts
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
        // Improve edge straightness - keeps main pipeline horizontal
        'elk.layered.nodePlacement.bk.edgeStraightening': 'IMPROVE_STRAIGHTNESS',
        // Favor straight edges over balanced placement
        'elk.layered.nodePlacement.favorStraightEdges': 'true',

        // === LAYER ASSIGNMENT ===
        // Network simplex produces better layer assignments
        'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',

        // === CROSSING MINIMIZATION ===
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        // Respect model order for consistent layout
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',

        // === ALIGNMENT ===
        // Center nodes vertically within each layer
        'elk.alignment': 'CENTER',
        'elk.contentAlignment': 'V_CENTER H_CENTER',

        // === EDGE ROUTING ===
        'elk.edgeRouting': 'SPLINES',
        // Better spline routing
        'elk.layered.edgeRouting.splines.mode': 'CONSERVATIVE',

        // === COMPACTION ===
        // Reduce wasted space
        'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
      },
    };
  }, [getNodeDimensions]);

  /**
   * Calculates layout for nodes using Two-Phase Layout Architecture.
   *
   * PHASE 1 (MACRO): ELK layouts top-level nodes (Stages, Modules, Splitter/Merger, End)
   * PHASE 2 (MICRO): Deterministic positioning of lessons inside expanded modules
   *
   * @param nodes - Array of nodes to layout
   * @param edges - Array of edges connecting the nodes
   * @param _options - Optional configuration (currently unused)
   * @returns Promise resolving to array of nodes with updated positions and dimensions
   */
  const layoutNodes = useCallback(async (nodes: AppNode[], edges: AppEdge[], _options?: { newNodeIds?: string[] }): Promise<AppNode[]> => {
    if (nodes.length === 0) return nodes;

    // Separate top-level nodes (for ELK) and lessons
    // Lessons are now positioned in buildGraph, not here
    const topLevelNodes = nodes.filter(n => !n.parentId);
    const lessonNodes = nodes.filter(n => n.parentId);

    // PHASE 1: MACRO LAYOUT (ELK) - only top-level nodes
    const graph = toElkGraph(topLevelNodes, edges);
    const layoutedGraph = await calculateLayout(graph);

    // Check if any node got positioned (ELK succeeded)
    const hasPositions = layoutedGraph.children?.some(c => c.x !== undefined && c.y !== undefined);

    // If ELK failed or didn't position nodes, use fallback
    if (!hasPositions) {
      console.warn('[useGraphLayout] Using fallback layout');
      return applyFallbackLayout(nodes);
    }

    // Map ELK results back to AppNodes (top-level only)
    const layoutedTopLevelRaw = topLevelNodes.map(node => {
      const findNode = (g: ElkGraph | ElkNode): ElkNode | null => {
        if (g.id === node.id) return g as ElkNode;
        if ('children' in g && g.children) {
          for (const c of g.children) {
            const found = findNode(c);
            if (found) return found;
          }
        }
        return null;
      };

      const elkNode = findNode(layoutedGraph);

      if (elkNode && elkNode.x !== undefined && elkNode.y !== undefined) {
        return {
          ...node,
          position: { x: elkNode.x, y: elkNode.y },
          style: { ...node.style, width: elkNode.width, height: elkNode.height }
        };
      }
      return node;
    });

    // POST-PROCESSING PHASE 1: Align stage nodes horizontally (same Y center)
    // This ensures the main pipeline (Stages 1-6) forms a straight horizontal line
    const stageNodes = layoutedTopLevelRaw.filter(n => n.type === 'stage' || n.type === 'stage2group');
    const otherNodes = layoutedTopLevelRaw.filter(n => n.type !== 'stage' && n.type !== 'stage2group');

    let alignedStages = stageNodes;
    if (stageNodes.length > 1) {
      // Calculate the center Y of each stage node (position.y + height/2)
      const stageCenters = stageNodes.map(s => {
        const height = (s.style?.height as number) || DEFAULT_NODE_HEIGHT;
        return s.position.y + height / 2;
      });

      // Find the median center Y for alignment (more robust than average)
      const sortedCenters = [...stageCenters].sort((a, b) => a - b);
      const medianCenterY = sortedCenters[Math.floor(sortedCenters.length / 2)];

      // Align all stages so their centers are at the median Y
      alignedStages = stageNodes.map(stage => {
        const height = (stage.style?.height as number) || DEFAULT_NODE_HEIGHT;
        const newY = medianCenterY - height / 2;
        return {
          ...stage,
          position: { ...stage.position, y: newY },
        };
      });
    }

    // Merge aligned stages with other nodes
    const afterStageAlignment = [...alignedStages, ...otherNodes];

    // POST-PROCESSING PHASE 2: Align all modules to the same X coordinate
    // This ensures modules form a clean vertical column instead of a fan pattern
    const moduleNodes = afterStageAlignment.filter(n => n.type === 'module');
    const nonModuleNodes = afterStageAlignment.filter(n => n.type !== 'module');

    let layoutedTopLevel = afterStageAlignment;

    if (moduleNodes.length > 1) {
      // Find the maximum X among modules (rightmost position)
      const maxModuleX = Math.max(...moduleNodes.map(m => m.position.x));

      // Align all modules to the same X coordinate
      // Also redistribute Y positions evenly for consistent spacing
      const sortedModules = [...moduleNodes].sort((a, b) => a.position.y - b.position.y);
      const moduleSpacing = 20; // Vertical gap between modules
      const firstModuleY = sortedModules[0]?.position.y ?? 0;

      const alignedModules = sortedModules.map((module, index) => {
        // Calculate cumulative height for proper spacing
        const prevModulesHeight = sortedModules
          .slice(0, index)
          .reduce((sum, m) => {
            const height = (m.style?.height as number) || LAYOUT_CONFIG.MODULE_COLLAPSED_HEIGHT;
            return sum + height + moduleSpacing;
          }, 0);

        return {
          ...module,
          position: {
            x: maxModuleX, // Align to rightmost module X
            y: firstModuleY + prevModulesHeight, // Stack with consistent spacing
          },
        };
      });

      layoutedTopLevel = [...nonModuleNodes, ...alignedModules];
    }

    // PHASE 2 (MICRO): Recalculate child positions relative to their parents
    // This is critical for auto-arrange button to work correctly
    // Group children by parent
    const childrenByParent = new Map<string, AppNode[]>();
    lessonNodes.forEach(child => {
      if (!child.parentId) return;
      if (!childrenByParent.has(child.parentId)) {
        childrenByParent.set(child.parentId, []);
      }
      childrenByParent.get(child.parentId)!.push(child);
    });

    // Position child nodes relative to their parents
    const layoutedChildren: AppNode[] = [];
    childrenByParent.forEach((children, parentId) => {
      const parent = layoutedTopLevel.find(n => n.id === parentId);
      if (!parent) {
        // Parent not found, keep children as-is
        layoutedChildren.push(...children);
        return;
      }

      // Determine layout config based on parent type
      const isStage2Group = parent.type === 'stage2group';
      const config = isStage2Group ? {
        headerHeight: STAGE2_LAYOUT_CONFIG.CONTAINER_HEADER_HEIGHT,
        itemHeight: STAGE2_LAYOUT_CONFIG.DOCUMENT_HEIGHT,
        itemGap: STAGE2_LAYOUT_CONFIG.DOCUMENT_GAP,
        padding: STAGE2_LAYOUT_CONFIG.CONTAINER_PADDING,
      } : {
        headerHeight: LAYOUT_CONFIG.MODULE_HEADER_HEIGHT,
        itemHeight: LAYOUT_CONFIG.LESSON_HEIGHT,
        itemGap: LAYOUT_CONFIG.LESSON_GAP,
        padding: LAYOUT_CONFIG.MODULE_PADDING,
      };

      // Sort children by their order (lessonOrder for lessons, index in array for documents)
      const sortedChildren = [...children].sort((a, b) => {
        const aOrder = (a.data as Record<string, unknown>)?.lessonOrder as number | undefined;
        const bOrder = (b.data as Record<string, unknown>)?.lessonOrder as number | undefined;
        if (aOrder !== undefined && bOrder !== undefined) {
          return aOrder - bOrder;
        }
        // Fallback: extract numbers from ID for ordering
        const aNum = parseInt(a.id.match(/\d+$/)?.[0] || '0');
        const bNum = parseInt(b.id.match(/\d+$/)?.[0] || '0');
        return aNum - bNum;
      });

      // Calculate positions relative to parent (0,0 = parent's top-left corner)
      sortedChildren.forEach((child, index) => {
        layoutedChildren.push({
          ...child,
          position: {
            x: config.padding,
            y: config.headerHeight + (index * (config.itemHeight + config.itemGap)),
          },
        });
      });
    });

    // Merge: parents first (required by React Flow), then children
    return [...layoutedTopLevel, ...layoutedChildren];
  }, [toElkGraph, calculateLayout, applyFallbackLayout]);

  /**
   * Applies viewport fitting with smooth animation using requestAnimationFrame.
   * Prevents visual glitches by ensuring DOM updates complete before fitting.
   * Must be called after layout changes are applied to the DOM.
   *
   * @param options - Optional configuration
   * @param options.padding - Padding around viewport (0-1 for percentage, default 0.1)
   * @param options.duration - Animation duration in milliseconds (default 200)
   */
  const applyFitView = useCallback((options?: { padding?: number; duration?: number }) => {
    requestAnimationFrame(() => {
      fitView({
        padding: options?.padding ?? 0.1,
        duration: options?.duration ?? 200,
      });
    });
  }, [fitView]);

  return {
    calculateLayout,
    layoutNodes,
    isLayouting,
    layoutError,
    nodesInitialized,
    getNodeDimensions,
    toElkGraph,
    applyFitView,
    applyFallbackLayout,
  };
}