import type { GenerationProgress, CourseStatus } from '@/types/course-generation'

/**
 * Props for the GraphView component.
 */
export interface GraphViewProps {
  /** Unique identifier for the course being generated */
  courseId: string
  /** Optional display title for the course (defaults to 'Course Generation') */
  courseTitle?: string
  /**
   * Whether the course has documents.
   * When false, Stage 2 (Document Processing) and Stage 3 (Classification)
   * are marked as 'skipped' in the graph visualization.
   * @default true
   */
  hasDocuments?: boolean
  /** Stage number where generation failed (from courses.failed_at_stage) */
  failedAtStage?: number | null
  /**
   * Actual progress percentage from the database (0-100).
   * When provided, this is used instead of calculating from status.
   * Ensures consistency with CelestialHeader progress display.
   */
  progressPercentage?: number
  /** Human-readable generation code (e.g., "ABC-1234") for debugging */
  generationCode?: string | null
  /**
   * Pre-loaded Stage 1 course data.
   * When provided, Stage 1 node displays this data immediately
   * instead of waiting for traces from generation.
   */
  stage1CourseData?: {
    inputData: Record<string, unknown>
    outputData: Record<string, unknown>
  }
  /**
   * User subscription tier for model display.
   * Determines which model name is shown (e.g., "Premium Model" for 'premium').
   * @default 'standard'
   */
  tier?: 'trial' | 'free' | 'basic' | 'standard' | 'premium'
  /**
   * Full generation progress data for header stats display.
   * Contains started_at, modules_total, lessons_total, lessons_completed, etc.
   */
  generationProgress?: GenerationProgress
  /**
   * Current generation status for header stats display.
   */
  generationStatus?: CourseStatus
  /**
   * Whether realtime connection is active.
   * Used for connection indicator in header.
   */
  isRealtimeConnected?: boolean
  /**
   * Read-only mode for automatic generation.
   * Hides edit, regenerate, and approve buttons.
   */
  readOnly?: boolean
  /**
   * NEW: Automatic mode handlers for MissionControlBanner
   */
  isPaused?: boolean
  onPause?: () => Promise<void>
  onResume?: () => Promise<void>
  onCancelGeneration?: () => Promise<void>
  onSwitchToManual?: () => Promise<void>
}

/**
 * Props for the GraphInteractions component.
 */
export interface GraphInteractionsProps {
  /** Callback to update panning mode state */
  setIsPanning: (isPanning: boolean) => void
}
