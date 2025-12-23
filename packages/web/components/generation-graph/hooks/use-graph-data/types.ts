import { NodeStatus, TraceAttempt } from '@megacampus/shared-types';

/**
 * Represents a phase within a multi-phase stage (stages 4, 5).
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
 * Represents a lesson within a module structure from trace output data.
 */
export interface LessonStructure {
  /** Unique identifier for the lesson */
  id: string;
  /** Display title of the lesson */
  title: string;
}

/**
 * Represents a module structure from trace output data.
 * Contains module metadata and nested lessons.
 */
export interface ModuleStructure {
  /** Unique identifier for the module */
  id: string;
  /** Display title of the module */
  title: string;
  /** Optional array of lessons within this module */
  lessons?: LessonStructure[];
}

/**
 * Represents a step in document processing pipeline (for grouping).
 */
export interface DocumentStepData {
  /** Unique step ID (docId_stepName) */
  id: string;
  /** Step name for display (e.g., "Docling Conversion") */
  stepName: string;
  /** Processing status */
  status: NodeStatus;
  /** Original trace ID */
  traceId: string;
  /** Timestamp for ordering */
  timestamp: number;
  /** All attempts for this step */
  attempts: TraceAttempt[];
  /** Input data */
  inputData?: unknown;
  /** Output data */
  outputData?: unknown;
}

/**
 * Represents a document with all its processing steps (internal grouping structure).
 */
export interface DocumentWithSteps {
  /** Document UUID */
  id: string;
  /** Human-readable filename */
  name: string;
  /** Ordered list of processing steps */
  steps: DocumentStepData[];
  /** Processing priority */
  priority?: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
}

/**
 * Represents a parallelizable item in the graph (document, module, or lesson).
 * Used to track items that can be processed concurrently in specific stages.
 */
export interface ParallelItem {
  /** Unique identifier for the item */
  id: string;
  /** Display label for the item */
  label: string;
  /** Current processing status of the item */
  status: NodeStatus;
  /** Type of item (document for stage 2, module/lesson for stage 6) */
  type: 'document' | 'module' | 'lesson' | 'document-step';
  /** Parent item ID (used for lessons within modules, or steps within documents) */
  parentId?: string;
  /** Additional data specific to the item type */
  data?: Record<string, unknown>;
}

/**
 * Pre-loaded Stage 1 course data from database.
 * Used to display course info BEFORE generation starts (no traces yet).
 */
export interface Stage1CourseData {
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
}

/**
 * Options for the useGraphData hook.
 */
export interface UseGraphDataOptions {
  /**
   * Function to look up filename by fileId from file_catalog.
   * Used to display original filenames instead of UUIDs for document nodes.
   */
  getFilename?: (fileId: string) => string | undefined;
  /**
   * Whether the course has documents.
   * When false, Stage 2 (Document Processing) and Stage 3 (Classification)
   * are marked as 'skipped' in the graph visualization.
   * @default true
   */
  hasDocuments?: boolean;
  /**
   * Pre-loaded Stage 1 course data.
   * When provided, Stage 1 node displays this data immediately
   * instead of waiting for traces from generation.
   */
  stage1CourseData?: Stage1CourseData;
}
