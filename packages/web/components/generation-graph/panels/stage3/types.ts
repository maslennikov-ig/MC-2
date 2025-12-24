/**
 * Stage 3 "Document Classification" Types
 *
 * Stage 3 is the "Council Chamber" - AI acts as chief editor,
 * weighing document value relative to course objectives.
 */

// ============================================================================
// INPUT DATA
// ============================================================================

/**
 * Stage 3 input data structure
 * Contains course context and documents to classify
 */
export interface Stage3InputData {
  /** Course ID being classified */
  courseId: string;
  /** Organization ID */
  organizationId: string;
  /** Course context for classification */
  courseContext: {
    title: string;
    description: string;
  };
  /** Documents to classify */
  documents: Stage3DocumentCandidate[];
  /** Total summary tokens across all documents */
  totalSummaryTokens: number;
  /** Token budget threshold */
  tokenBudget: number;
  /** Classification strategy */
  strategy: 'single_pass' | 'tournament';
}

/**
 * Document candidate for classification
 */
export interface Stage3DocumentCandidate {
  /** Document ID */
  id: string;
  /** Filename */
  filename: string;
  /** Original name (if available) */
  originalName?: string;
  /** File size in bytes */
  fileSize: number;
  /** MIME type */
  mimeType: string;
  /** Summary from Stage 2 */
  summary: string;
  /** Summary token count */
  summaryTokens: number;
}

// ============================================================================
// OUTPUT DATA
// ============================================================================

/**
 * Stage 3 output data structure
 * Contains classification results
 */
export interface Stage3OutputData {
  /** Classification success */
  success: boolean;
  /** Course ID */
  courseId: string;
  /** Classified documents */
  classifications: Stage3Classification[];
  /** Totals */
  totalDocuments: number;
  coreCount: number;
  importantCount: number;
  supplementaryCount: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * Single document classification result
 */
export interface Stage3Classification {
  /** File ID */
  fileId: string;
  /** Filename */
  filename: string;
  /** Assigned priority */
  priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  /** AI rationale for classification */
  rationale: string;
  /** Importance score (0.0 to 1.0) */
  importanceScore: number;
  /** Rank order (1, 2, 3...) */
  order: number;
}

// ============================================================================
// PROCESS TAB
// ============================================================================

/**
 * Classification phase IDs
 */
export type ClassificationPhaseId =
  | 'context_loading'       // Load course context
  | 'strategy_selection'    // Choose single_pass or tournament
  | 'comparative_analysis'  // Main LLM classification
  | 'rationale_generation'  // Generate explanations
  | 'hierarchy_finalization'; // Enforce CORE constraint

/**
 * Classification phase status
 */
export type ClassificationPhaseStatus = 'pending' | 'active' | 'completed' | 'error';

/**
 * Single classification phase
 */
export interface ClassificationPhase {
  /** Phase identifier */
  id: ClassificationPhaseId;
  /** Phase display name (translated) */
  name: string;
  /** Phase description */
  description?: string;
  /** Phase status */
  status: ClassificationPhaseStatus;
  /** Execution time in milliseconds */
  durationMs?: number;
  /** Status message or error */
  message?: string;
}

/**
 * Telemetry data for the classification process
 */
export interface TelemetryData {
  /** Total processing time in ms */
  processingTimeMs: number;
  /** Total tokens used */
  totalTokens: number;
  /** Number of documents processed */
  documentsProcessed: number;
  /** Model used for classification (deprecated - use tier) */
  model?: string;
  /** Organization tier for tier-based model naming */
  tier?: string;
}

// ============================================================================
// ACTIVITY TAB
// ============================================================================

/**
 * Activity phase groups for accordion
 */
export type ActivityPhaseGroup = 'setup' | 'judgment' | 'overrides';

/**
 * Actor type for activity events
 */
export type ActivityActor = 'system' | 'ai' | 'user';

/**
 * Activity event for Stage 3 timeline
 */
export interface Stage3ActivityEvent {
  /** Event UUID */
  id: string;
  /** Event timestamp */
  timestamp: Date;
  /** Who performed the action */
  actor: ActivityActor;
  /** Event type for styling */
  type: 'info' | 'success' | 'warning' | 'error';
  /** Event message */
  message: string;
  /** Phase group for accordion */
  phase: ActivityPhaseGroup;
  /** For document-related events */
  documentId?: string;
  /** For priority changes */
  oldPriority?: string;
  newPriority?: string;
  /** Delta time from previous event */
  deltaMs?: number;
  /** Additional details */
  details?: Record<string, unknown>;
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface Stage3InputTabProps {
  /** Course ID to fetch data */
  courseId?: string;
  /** Input data from trace (fallback) */
  inputData?: Stage3InputData | unknown;
  /** Locale */
  locale?: 'ru' | 'en';
}

export interface Stage3ProcessTabProps {
  /** Course ID to fetch traces */
  courseId?: string;
  /** Processing phases (override) */
  phases?: ClassificationPhase[];
  /** Telemetry data */
  telemetry?: TelemetryData;
  /** Current status */
  status?: 'pending' | 'active' | 'completed' | 'error';
  /** Locale */
  locale?: 'ru' | 'en';
}

export interface Stage3OutputTabProps {
  /** Course ID */
  courseId?: string;
  /** Output data from trace */
  outputData?: Stage3OutputData | unknown;
  /** Whether user can edit priorities */
  isEditable?: boolean;
  /** Whether data is currently loading */
  isLoading?: boolean;
  /** Callback when structure is approved */
  onApprove?: () => void;
  /** Locale */
  locale?: 'ru' | 'en';
}

export interface Stage3ActivityTabProps {
  /** Node ID for filtering traces */
  nodeId: string | null;
  /** Course ID */
  courseId?: string;
  /** Locale */
  locale?: 'ru' | 'en';
}
