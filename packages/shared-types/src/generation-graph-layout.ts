/**
 * Layout and presentation for the generation graph.
 * @module generation-graph-layout
 *
 * Split out of `generation-graph.ts` at 545 lines of code against a limit of
 * 500. The seam is real rather than arithmetic: everything here describes how
 * the graph is DRAWN — ElkJS input structures, layout options, colour schemes,
 * node styling and the React Flow type registries — and nothing above it does.
 * The data model no longer changes when a colour does.
 *
 * Re-exported by `generation-graph.ts`, so every existing import is unaffected.
 */

/**
 * ElkJS graph structure
 */
export interface ElkGraph {
  id: string;
  layoutOptions?: Record<string, string>;
  children: ElkNode[];
  edges: ElkEdge[];
}

/**
 * ElkJS node structure
 */
export interface ElkNode {
  id: string;
  width: number;
  height: number;
  x?: number; // Set after layout
  y?: number; // Set after layout
  layoutOptions?: Record<string, string>;
  children?: ElkNode[]; // For hierarchical grouping
}

/**
 * ElkJS edge structure
 */
export interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
}

/**
 * Layout options for pipeline graphs
 */
export const LAYOUT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '50',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.layered.mergeEdges': 'true',
};

/**
 * Node color scheme
 */
export interface NodeColorScheme {
  background: string;
  border: string;
  text: string;
  header: string;
}

/**
 * Node styles by status
 */
export interface NodeStyles {
  pending: NodeColorScheme;
  active: NodeColorScheme;
  completed: NodeColorScheme;
  approved: NodeColorScheme;
  error: NodeColorScheme;
  awaiting: NodeColorScheme;
  skipped: NodeColorScheme;
}

/**
 * Default node styles (WCAG AA compliant)
 */
export const NODE_STYLES: NodeStyles = {
  pending: {
    background: '#F9FAFB',
    border: '#D1D5DB',
    text: '#6B7280',
    header: '#9CA3AF',
  },
  active: {
    background: '#DBEAFE',
    border: '#3B82F6',
    text: '#1E40AF',
    header: '#3B82F6',
  },
  completed: {
    background: '#D1FAE5',
    border: '#10B981',
    text: '#065F46',
    header: '#10B981',
  },
  approved: {
    background: '#C7F9E2', // Slightly more saturated green than completed
    border: '#059669', // Darker green for approved
    text: '#064E3B',
    header: '#059669',
  },
  error: {
    background: '#FEE2E2',
    border: '#EF4444',
    text: '#991B1B',
    header: '#EF4444',
  },
  awaiting: {
    background: '#FEF3C7',
    border: '#F59E0B',
    text: '#92400E',
    header: '#F59E0B',
  },
  skipped: {
    background: '#F1F5F9',
    border: '#94A3B8',
    text: '#64748B',
    header: '#94A3B8',
  },
};

/**
 * Node type registry
 */
export const NODE_TYPES_REGISTRY = {
  stage: 'stage',
  document: 'document',
  lesson: 'lesson',
  module: 'module',
  stage2group: 'stage2group',
  merge: 'merge',
  end: 'end',
} as const;

/**
 * Edge type registry
 */
export const EDGE_TYPES_REGISTRY = {
  default: 'default',
  animated: 'animated',
  dataflow: 'dataflow',
} as const;
