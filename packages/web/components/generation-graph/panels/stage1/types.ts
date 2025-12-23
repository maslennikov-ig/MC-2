/**
 * Stage 1 "Course Passport" Types
 *
 * Stage 1 is unique: user is the AUTHOR (not reviewer).
 * UI must be authoritative, static, and "contractual".
 */

// ============================================================================
// INPUT DATA
// ============================================================================

/**
 * Stage 1 input data structure
 * Contains all user-provided course configuration
 */
export interface Stage1InputData {
  /** Course topic/title */
  topic: string;
  /** Detailed course description */
  course_description: string;
  /** Target audience description */
  target_audience?: string;
  /** Learning style (academic, conversational, etc.) */
  style?: string;
  /** Output formats for course content */
  output_formats: Array<'text' | 'audio' | 'video' | 'presentation' | 'test'>;
  /** Expected number of lessons */
  estimated_lessons?: number;
  /** Content generation strategy */
  content_strategy: 'auto' | 'create_from_scratch' | 'expand_and_enhance';
  /** Prerequisites for the course */
  prerequisites?: string;
  /** Expected learning outcomes */
  learning_outcomes?: string;
  /** Whether files were uploaded */
  has_files?: boolean;
  /** Uploaded documents metadata */
  files?: Stage1FileMetadata[];
}

/**
 * File metadata for uploaded documents
 */
export interface Stage1FileMetadata {
  /** File UUID */
  id: string;
  /** Original filename */
  name: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  type: string;
}

// ============================================================================
// OUTPUT DATA
// ============================================================================

/**
 * Stage 1 output data structure
 * Confirms course is registered in the system
 */
export interface Stage1OutputData {
  /** Course UUID (e.g., crs_88291-ab) */
  courseId: string;
  /** Owner user ID */
  ownerId: string;
  /** Creation timestamp (ISO string) */
  createdAt: string;
  /** Initialization status */
  status: 'ready' | 'error';
  /** Error message if status is 'error' */
  errorMessage?: string;
  /** S3/MinIO file storage paths */
  storagePaths?: StoragePath[];
}

/**
 * Storage path for uploaded file
 */
export interface StoragePath {
  /** Original file ID */
  fileId: string;
  /** S3/MinIO path (e.g., s3://bucket/crs_XXX/source/file.pdf) */
  path: string;
  /** File size in bytes */
  size?: number;
}

// ============================================================================
// PROCESS TAB (VALIDATION RECEIPT)
// ============================================================================

/**
 * Validation step status
 */
export type ValidationStepStatus = 'pending' | 'success' | 'warning' | 'error';

/**
 * Single validation step in the checklist
 */
export interface ValidationStep {
  /** Step identifier */
  id: 'validation' | 'security' | 'storage' | 'registry';
  /** Step name (translated) */
  name: string;
  /** Step status */
  status: ValidationStepStatus;
  /** Execution time in milliseconds */
  durationMs?: number;
  /** Error or warning message */
  message?: string;
}

// ============================================================================
// ACTIVITY TAB
// ============================================================================

/**
 * Actor type for activity events
 */
export type ActivityActor = 'user' | 'system';

/**
 * Activity event for the timeline
 */
export interface ActivityEvent {
  /** Event UUID */
  id: string;
  /** Event timestamp */
  timestamp: Date;
  /** Who performed the action */
  actor: ActivityActor;
  /** Event type for styling */
  type: 'info' | 'success' | 'warning' | 'error';
  /** Event description */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface Stage1InputTabProps {
  inputData?: Stage1InputData | unknown;
  locale?: 'ru' | 'en';
}

export interface Stage1ProcessTabProps {
  /** Pre-calculated validation steps (if available) */
  steps?: ValidationStep[];
  /** Total duration in milliseconds */
  totalDurationMs?: number;
  /** Current status */
  status?: 'pending' | 'completed' | 'error';
  locale?: 'ru' | 'en';
}

export interface Stage1OutputTabProps {
  outputData?: Stage1OutputData | unknown;
  /** Course ID for copy functionality */
  courseId?: string;
  locale?: 'ru' | 'en';
}

export interface Stage1ActivityTabProps {
  /** Node ID for filtering traces */
  nodeId: string | null;
  /** Course ID for context */
  courseId?: string;
  locale?: 'ru' | 'en';
  /** Stage 1 input data for generating synthetic activity events */
  inputData?: Stage1InputData | unknown;
  /** Stage 1 output data for generating synthetic activity events */
  outputData?: Stage1OutputData | unknown;
}
