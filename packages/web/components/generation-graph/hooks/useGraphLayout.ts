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

// Two-Phase Layout Configuration for Stage 6 Modules
const LAYOUT_CONFIG = {
  MODULE_WIDTH: 300,
  MODULE_COLLAPSED_HEIGHT: 90, // Matches min-h-[90px] in ModuleGroup collapsed state (single-line title)
  MODULE_HEADER_HEIGHT: 60,
  LESSON_HEIGHT: 50,
  LESSON_GAP: 10,
  MODULE_PADDING: 15,
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
    childrenByParent.forEach((children) => {
      children.forEach((child, index) => {
        layoutedNodes.push({
          ...child,
          position: {
            x: LAYOUT_CONFIG.MODULE_PADDING,
            y: LAYOUT_CONFIG.MODULE_HEADER_HEIGHT +
               (index * (LAYOUT_CONFIG.LESSON_HEIGHT + LAYOUT_CONFIG.LESSON_GAP)),
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
      return getNodeDimensions(node);
    };

    // 1. Create ELK nodes (top-level only) with priority for ordering
    topLevelNodes.forEach((node, index) => {
      const elkNode: ElkNode = {
        id: node.id,
        ...getModuleDimensions(node),
        children: [], // Children will be positioned in Phase 2
        // Set priority based on order in sorted array (higher = placed first/top)
        layoutOptions: node.type === 'module' ? {
          'elk.layered.priority': String(1000 - index), // Higher priority = higher position
        } : undefined,
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
        // Spacing between layers (horizontal) and nodes (vertical)
        'elk.layered.spacing.nodeNodeBetweenLayers': '120',
        'elk.spacing.nodeNode': '40',
        // CRITICAL: Preserve model order from children array
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        // Use LINEAR_SEGMENTS for better vertical ordering based on priority
        'elk.layered.nodePlacement.strategy': 'LINEAR_SEGMENTS',
        // Center alignment for nodes within each layer
        'elk.contentAlignment': 'V_CENTER',
        // Minimize edge crossings while respecting model order
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.crossingMinimization.semiInteractive': 'true',
        // Port constraints help with edge routing
        'elk.portConstraints': 'FIXED_ORDER',
        // Edge routing for smooth curves
        'elk.edgeRouting': 'SPLINES',
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
    const layoutedTopLevel = topLevelNodes.map(node => {
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

    // Lessons already have correct positions from buildGraph
    // Just merge: parents first (required by React Flow), then lessons
    return [...layoutedTopLevel, ...lessonNodes];
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