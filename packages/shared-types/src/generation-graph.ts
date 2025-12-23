/**
 * Graph Node Types and Interfaces
 * Based on n8n-style graph visualization data model
 */

/**
 * Node type enumeration
 */
export type GraphNodeType =
  | 'stage'       // Main pipeline stage (1-6)
  | 'document'    // Parallel document in Stage 2
  | 'lesson'      // Parallel lesson in Stage 6
  | 'module'      // Collapsible module group for Stage 6
  | 'stage2group' // Collapsible document group for Stage 2
  | 'merge'       // Convergence point after parallel
  | 'end';        // Pipeline completion node

/**
 * Node status enumeration
 */
export type NodeStatus =
  | 'pending'   // Not yet started
  | 'active'    // Currently processing
  | 'completed' // Successfully finished
  | 'error'     // Failed with error
  | 'awaiting'  // Waiting for user approval
  | 'skipped';  // Optional step was skipped (FR-SS01)

/**
 * Stage number type (1-6 for current stages, null for utility nodes)
 */
export type StageNumber = 1 | 2 | 3 | 4 | 5 | 6 | null;

/**
 * Base interface for all graph nodes
 */
export interface GraphNode {
  /** Unique node identifier (e.g., "stage_1", "stage_2_doc_abc123") */
  id: string;

  /** Node classification */
  type: GraphNodeType;

  /** Stage number (null for utility nodes like merge, end) */
  stageNumber: StageNumber;

  // === Display Properties ===

  /** Human-readable label */
  label: string;

  /** Lucide icon name */
  icon: string;

  /** Header color (hex) */
  color: string;

  // === State Properties ===

  /** Current processing status */
  status: NodeStatus;

  /** Progress percentage (0-100) for active nodes */
  progress?: number;

  // === Metrics ===

  /** Processing duration in milliseconds */
  duration?: number;

  /** Tokens used (LLM stages) */
  tokens?: number;

  /** Cost in USD */
  cost?: number;

  // === Data (from traces) ===

  /** Input data for this node */
  inputData?: Record<string, unknown>;

  /** Output data from this node */
  outputData?: Record<string, unknown>;

  /** Error data if status === 'error' */
  errorData?: Record<string, unknown>;

  // === Grouping ===

  /** Parent node ID (for lessons in modules) */
  parentId?: string;

  /** Whether this group node is collapsed */
  isCollapsed?: boolean;

  // === Retry History ===

  /** All processing attempts */
  attempts?: TraceAttempt[];

  /** Current retry count */
  retryCount?: number;

  /** Current active step name (for granular progress) */
  currentStep?: string;
}

/**
 * Stage node (main pipeline stages 1-6)
 */
export interface StageNode extends GraphNode {
  type: 'stage';
  stageNumber: 1 | 2 | 3 | 4 | 5 | 6;

  /** Stage category for future grouping */
  category?: 'core' | 'content' | 'assessment' | 'media';

  /** Phases for multi-phase stages (stages 4, 5) */
  phases?: PhaseData[];
}

/**
 * Document processing stage data
 */
export interface DocumentStageData {
  /** Stage identifier (e.g., "upload", "parse", "analyze") */
  stageId: string;

  /** Human-readable stage name */
  stageName: string;

  /** Stage number in processing sequence */
  stageNumber: number;

  /** Stage processing status */
  status: NodeStatus;

  /** All attempts for this stage */
  attempts: TraceAttempt[];

  /** Input data for this stage */
  inputData?: Record<string, unknown>;

  /** Output data from this stage */
  outputData?: Record<string, unknown>;
}

/**
 * Document node (parallel processing in Stage 2)
 */
export interface DocumentNode extends GraphNode {
  type: 'document';
  stageNumber: 2;

  /** Document identifier (UUID) */
  documentId: string;

  /** Original filename */
  filename: string;

  /** File size in bytes */
  fileSize?: number;

  /** Processing priority level */
  priority?: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';

  /** All processing stages for this document */
  stages: DocumentStageData[];

  /** Number of completed stages */
  completedStages: number;

  /** Total number of stages */
  totalStages: number;
}

/**
 * Lesson node (parallel generation in Stage 6)
 */
export interface LessonNode extends GraphNode {
  type: 'lesson';
  stageNumber: 6;

  /** Lesson ID from database */
  lessonId: string;

  /** Lesson title */
  title: string;

  /** Number of learning objectives */
  objectivesCount?: number;

  /** Parent module ID */
  moduleId: string;
}

/**
 * Module group node (collapsible container for lessons)
 */
export interface ModuleNode extends GraphNode {
  type: 'module';
  stageNumber: 6;

  /** Module ID from database */
  moduleId: string;

  /** Module title */
  title: string;

  /** Total lessons in module */
  totalLessons: number;

  /** Completed lessons count */
  completedLessons: number;

  /** Whether module is collapsed */
  isCollapsed: boolean;

  /** Child lesson node IDs */
  childIds: string[];
}

/**
 * Stage 2 Document Processing group node (collapsible container for documents)
 */
export interface Stage2GroupNode extends GraphNode {
  type: 'stage2group';
  stageNumber: 2;

  /** Total documents in container */
  totalDocuments: number;

  /** Completed documents count */
  completedDocuments: number;

  /** Currently processing documents count */
  processingDocuments: number;

  /** Failed documents count */
  failedDocuments: number;

  /** Whether container is collapsed */
  isCollapsed: boolean;

  /** Child document node IDs */
  childIds?: string[];
}

/**
 * Merge node (convergence after parallel processing)
 */
export interface MergeNode extends GraphNode {
  type: 'merge';
  stageNumber: null;

  /** IDs of converging nodes */
  sourceIds: string[];
}

/**
 * End node (pipeline completion)
 */
export interface EndNode extends GraphNode {
  type: 'end';
  stageNumber: null;

  /** Total pipeline duration */
  totalDuration?: number;

  /** Total cost */
  totalCost?: number;
}

/**
 * Edge status enumeration
 */
export type EdgeStatus =
  | 'idle'      // No activity
  | 'active'    // Data flowing
  | 'completed' // Transfer complete
  | 'error';    // Error occurred

/**
 * Graph edge interface
 */
export interface GraphEdge {
  /** Unique edge identifier */
  id: string;

  /** Source node ID */
  source: string;

  /** Target node ID */
  target: string;

  /** Source handle position */
  sourceHandle?: string;

  /** Target handle position */
  targetHandle?: string;

  /** Current edge status */
  status: EdgeStatus;

  /** Whether to show animation */
  animated: boolean;

  /** Edge type for styling */
  type?: 'default' | 'animated' | 'dataflow';
}

/**
 * Single processing attempt
 */
export interface TraceAttempt {
  /** Attempt number (1, 2, 3...) */
  attemptNumber: number;

  /** When attempt started */
  timestamp: Date;

  /** Input data for this attempt */
  inputData: Record<string, unknown>;

  /** Output data from this attempt */
  outputData: Record<string, unknown>;

  /** Processing metrics */
  processMetrics: ProcessMetrics;

  /** Attempt result */
  status: 'success' | 'failed';

  /** Error message if failed */
  errorMessage?: string;

  /** User refinement message (if refinement attempt) */
  refinementMessage?: string;
}

/**
 * Phase data for multi-phase stages (stages 4, 5)
 * Phases are sequential steps within a stage, NOT retries.
 */
export interface PhaseData {
  /** Phase identifier (e.g., 'phase_0', 'phase_1') */
  phaseId: string;

  /** Translated phase name for display */
  phaseName: string;

  /** Current phase status */
  status: NodeStatus;

  /** Phase start timestamp */
  timestamp: Date;

  /** Input data for this phase */
  inputData?: Record<string, unknown>;

  /** Output data from this phase */
  outputData?: Record<string, unknown>;

  /** Processing metrics for this phase */
  processMetrics?: {
    model: string;
    tokens: number;
    duration: number;
    cost: number;
  };

  /** Actual retry attempts within THIS phase (only if retry_attempt > 0) */
  attempts?: TraceAttempt[];
}

/**
 * Processing metrics for a single attempt
 */
export interface ProcessMetrics {
  /** LLM model used */
  model: string;

  /** Tokens consumed */
  tokens: number;

  /** Duration in milliseconds */
  duration: number;

  /** Cost in USD */
  cost: number;

  /** Quality score (0-100) */
  qualityScore?: number;

  /** Whether result was cached */
  wasCached?: boolean;

  /** Temperature setting */
  temperature?: number;
}

/**
 * Stage type classification
 */
export type StageType =
  | 'trigger'     // Start nodes (Stage 1)
  | 'document'    // File processing (Stage 2)
  | 'ai'          // LLM operations (Stage 4)
  | 'structure'   // Structure generation (Stage 5)
  | 'content'     // Content output (Stage 6)
  | 'assessment'  // Quiz/homework (FUTURE)
  | 'media';      // Video/audio (FUTURE)

/**
 * Stage configuration entry
 */
export interface StageConfig {
  /** Stage identifier */
  id: string;

  /** Stage number */
  number: number;

  /** Display name (use translation key in production) */
  name: string;

  /** Lucide icon name */
  icon: string;

  /** Header color (hex) */
  color: string;

  /** Stage type */
  type: StageType;

  /** Category for grouping */
  category?: 'core' | 'content' | 'assessment' | 'media';

  /** Whether stage can run items in parallel */
  parallelizable?: boolean;

  /** Whether stage is optional */
  optional?: boolean;

  /** Stage IDs this depends on */
  dependencies?: string[];
}

/**
 * Default stage configuration
 */
export const STAGE_CONFIG: Record<string, StageConfig> = {
  stage_1: {
    id: 'stage_1',
    number: 1,
    name: 'stages.stage_1', // Translation key
    icon: 'Play',
    color: '#6B7280', // Gray
    type: 'trigger',
    category: 'core',
    parallelizable: false,
  },
  stage_2: {
    id: 'stage_2',
    number: 2,
    name: 'stages.stage_2',
    icon: 'FileText',
    color: '#3B82F6', // Blue
    type: 'document',
    category: 'core',
    parallelizable: true, // Multiple documents
  },
  stage_3: {
    id: 'stage_3',
    number: 3,
    name: 'stages.stage_3',
    icon: 'Tag',
    color: '#8B5CF6', // Purple
    type: 'ai',
    category: 'core',
    parallelizable: false,
  },
  stage_4: {
    id: 'stage_4',
    number: 4,
    name: 'stages.stage_4',
    icon: 'Brain',
    color: '#8B5CF6', // Purple
    type: 'ai',
    category: 'core',
    parallelizable: false,
  },
  stage_5: {
    id: 'stage_5',
    number: 5,
    name: 'stages.stage_5',
    icon: 'GitBranch',
    color: '#F59E0B', // Orange
    type: 'structure',
    category: 'core',
    parallelizable: false,
  },
  stage_6: {
    id: 'stage_6',
    number: 6,
    name: 'stages.stage_6',
    icon: 'PenTool',
    color: '#10B981', // Green
    type: 'content',
    category: 'content',
    parallelizable: true, // Multiple lessons
  },
};

/**
 * Graph translations interface
 */
export interface GraphTranslations {
  stages: {
    stage_1: { ru: string; en: string };
    stage_2: { ru: string; en: string };
    stage_3: { ru: string; en: string };
    stage_4: { ru: string; en: string };
    stage_5: { ru: string; en: string };
    stage_6: { ru: string; en: string };
  };
  status: {
    pending: { ru: string; en: string };
    active: { ru: string; en: string };
    completed: { ru: string; en: string };
    error: { ru: string; en: string };
    awaiting: { ru: string; en: string };
    skipped: { ru: string; en: string };
    skippedDescription: { ru: string; en: string };
  };
  actions: {
    approve: { ru: string; en: string };
    reject: { ru: string; en: string };
    retry: { ru: string; en: string };
    viewDetails: { ru: string; en: string };
    fitView: { ru: string; en: string };
    zoomIn: { ru: string; en: string };
    zoomOut: { ru: string; en: string };
    approveAndContinue: { ru: string; en: string };
    approvalFailed: { ru: string; en: string };
    regenerate: { ru: string; en: string };
    regenerating: { ru: string; en: string };
    regenerationStarted: { ru: string; en: string };
    regenerationFailed: { ru: string; en: string };
  };
  drawer: {
    input: { ru: string; en: string };
    process: { ru: string; en: string };
    output: { ru: string; en: string };
    attempts: { ru: string; en: string };
    awaitingMessage: { ru: string; en: string };
    activity: { ru: string; en: string };
    expand: { ru: string; en: string };
    collapse: { ru: string; en: string };
  };
  refinementChat: {
    buttonTooltip: { ru: string; en: string };
    panelTitle: { ru: string; en: string };
    placeholder: { ru: string; en: string };
    send: { ru: string; en: string };
    history: { ru: string; en: string };
    thinking: { ru: string; en: string };
    quickActions: {
      shorter: { ru: string; en: string };
      moreExamples: { ru: string; en: string };
      simplify: { ru: string; en: string };
      moreDetail: { ru: string; en: string };
    };
  };
  errors: {
    connectionLost: { ru: string; en: string };
    reconnecting: { ru: string; en: string };
    retryFailed: { ru: string; en: string };
  };
  retry: {
    confirmTitle: { ru: string; en: string };
    confirmDescription: { ru: string; en: string };
    retryButton: { ru: string; en: string };
    cancelButton: { ru: string; en: string };
  };
  mobile: {
    title: { ru: string; en: string };
    noStages: { ru: string; en: string };
    stageProgress: { ru: string; en: string };
  };
  viewToggle: {
    graphView: { ru: string; en: string };
    listView: { ru: string; en: string };
  };
  longRunning: {
    message: { ru: string; en: string };
    emailNotify: { ru: string; en: string };
    emailPlaceholder: { ru: string; en: string };
    subscribe: { ru: string; en: string };
  };
  metrics: {
    duration: { ru: string; en: string };
    tokens: { ru: string; en: string };
    cost: { ru: string; en: string };
    processing: { ru: string; en: string };
  };
  completionMessages: {
    stage_1: { ru: string; en: string };
    stage_2: { ru: string; en: string };
    stage_3: { ru: string; en: string };
    stage_4: { ru: string; en: string };
    stage_5: { ru: string; en: string };
    stage_6: { ru: string; en: string };
  };
}

/**
 * Static data that changes rarely
 */
export interface StaticGraphData {
  /** Stage configuration */
  stageConfig: Record<string, StageConfig>;

  /** Translation strings */
  translations: GraphTranslations;

  /** Node styling */
  nodeStyles: NodeStyles;

  /** Course metadata */
  courseInfo: {
    id: string;
    title: string;
    documentCount: number;
    moduleCount: number;
    lessonCount: number;
  };
}

/**
 * Node status entry
 */
export interface NodeStatusEntry {
  status: NodeStatus;
  progress?: number;
  duration?: number;
  errorMessage?: string;
  lastUpdated: Date;
}

/**
 * Realtime data that changes frequently
 */
export interface RealtimeStatusData {
  /** Status map: nodeId -> status */
  nodeStatuses: Map<string, NodeStatusEntry>;

  /** Currently active node ID */
  activeNodeId: string | null;

  /** Overall pipeline status */
  pipelineStatus: 'idle' | 'running' | 'completed' | 'failed' | 'paused';

  /** Overall progress percentage */
  overallProgress: number;

  /** Elapsed time in milliseconds */
  elapsedTime: number;

  /** Total cost accumulated */
  totalCost: number;

  /** Realtime connection status */
  isConnected: boolean;

  /** Last status update timestamp */
  lastUpdated: Date;
}

/**
 * Refinement API request body
 */
export interface RefinementRequest {
  /** Course ID */
  courseId: string;

  /** Stage identifier */
  stageId: string;

  /** Optional specific node ID (for parallel nodes) */
  nodeId?: string;

  /** Previous output to refine */
  previousOutput: string;

  /** User's refinement instruction */
  userMessage: string;

  /** Current attempt number */
  attemptNumber: number;
}

/**
 * Refinement API response
 */
export interface RefinementResponse {
  /** New trace ID */
  traceId: string;

  /** Processing status */
  status: 'queued' | 'processing' | 'completed' | 'failed';

  /** Error message if failed */
  error?: string;
}

/**
 * Retry API request body
 */
export interface RetryRequest {
  /** Course ID */
  courseId: string;

  /** Node ID to retry */
  nodeId: string;

  /** Stage ID */
  stageId: string;

  /** Optional modified input */
  modifiedInput?: Record<string, unknown>;
}

/**
 * Retry API response
 */
export interface RetryResponse {
  /** Whether retry was accepted */
  success: boolean;

  /** New trace ID if accepted */
  traceId?: string;

  /** Error message if rejected */
  error?: string;
}

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
