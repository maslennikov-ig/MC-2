/**
 * Stage 5 "Generation" Types
 *
 * Stage 5 is "The Builder's Workshop" - where blueprints
 * become tangible course structures.
 *
 * Color scheme: Orange/Amber (energy, creativity, transformation)
 */

import type {
  CourseStructure,
  Section,
  Lesson,
} from '@megacampus/shared-types';

// Re-export for convenience
export type { CourseStructure, Section, Lesson };

// ============================================================================
// INPUT DATA
// ============================================================================

export interface Stage5InputData {
  /** Analysis result from Stage 4 */
  analysisResult: {
    courseCategory: string;
    confidence: number;
    totalLessons: number;
    lessonsRange: { min: number; max: number };
    teachingStyle: string;
    topicAnalysis?: {
      complexity: string;
      prerequisites: string[];
    };
  };
  /** Frontend parameters */
  frontendParameters: {
    courseTitle: string;
    language: string;
    userInstructions?: string;
  };
  /** Generation parameters */
  generationParams?: {
    batchSize?: number;
    qualityThreshold?: number;
    minLessons?: number;
  };
}

// ============================================================================
// PROCESS TAB
// ============================================================================

export type Stage5PhaseId =
  | 'validate_input'      // Phase 1: Schema validation
  | 'generate_metadata'   // Phase 2: Course metadata
  | 'generate_sections'   // Phase 3: Sections + lessons
  | 'validate_quality'    // Phase 4: Embedding validation
  | 'validate_lessons';   // Phase 5: Minimum count

export type Stage5PhaseStatus = 'pending' | 'active' | 'completed' | 'error' | 'skipped';

export interface Stage5Phase {
  id: Stage5PhaseId;
  name: string;
  description: string;
  status: Stage5PhaseStatus;
  durationMs?: number;
  message?: string; // Error message for error status
  progress?: number; // 0-100 for generate_sections phase
  batchInfo?: {
    current: number;
    total: number;
    sectionsGenerated: number;
  };
}

export interface Stage5TelemetryData {
  processingTimeMs: number;
  totalTokens: number;
  tier?: string; // Organization tier for model naming
  costUsd?: number;
  qualityScore?: number;
  batchCount?: number;
  sectionsCount?: number;
  lessonsCount?: number;
}

// ============================================================================
// ACTIVITY TAB
// ============================================================================

export type Stage5ActivityPhaseGroup =
  | 'validation'     // Phase 1
  | 'metadata'       // Phase 2
  | 'sections'       // Phase 3
  | 'quality'        // Phase 4
  | 'finalization';  // Phase 5

export type ActivityActor = 'system' | 'ai' | 'user';

export interface Stage5ActivityEvent {
  id: string;
  timestamp: Date;
  actor: ActivityActor;
  type: 'info' | 'success' | 'warning' | 'error' | 'progress';
  message: string;
  phase: Stage5ActivityPhaseGroup;
  details?: Record<string, unknown>;
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface Stage5InputTabProps {
  courseId?: string;
  inputData?: Stage5InputData | unknown;
  locale?: 'ru' | 'en';
}

export interface Stage5ProcessTabProps {
  courseId?: string;
  phases?: Stage5Phase[];
  telemetry?: Stage5TelemetryData;
  status?: 'pending' | 'active' | 'completed' | 'error';
  locale?: 'ru' | 'en';
  /** Output data for calculating telemetry (sectionsCount, lessonsCount) */
  outputData?: CourseStructure | unknown;
  /** Processing time from trace for telemetry */
  processingTimeMs?: number;
  /** Total tokens from trace for telemetry */
  totalTokens?: number;
}

export interface Stage5OutputTabProps {
  /**
   * Output data - can be CourseStructure directly (real data)
   * or unknown for validation
   */
  outputData?: CourseStructure | unknown;
  courseId?: string;
  editable?: boolean;
  locale?: 'ru' | 'en';
}

export interface Stage5ActivityTabProps {
  nodeId: string | null;
  courseId?: string;
  locale?: 'ru' | 'en';
}

// ============================================================================
// HELPER COMPONENT PROPS
// ============================================================================

export interface BlueprintPreviewProps {
  analysisResult: Stage5InputData['analysisResult'];
  frontendParams: Stage5InputData['frontendParameters'];
  locale?: 'ru' | 'en';
}

export interface BatchWorkerStatus {
  workerId: number; // 1-4
  status: 'idle' | 'working' | 'completed' | 'failed';
  currentSectionTitle?: string;
}

export interface BatchProgressProps {
  workers: BatchWorkerStatus[];
  locale?: 'ru' | 'en';
}

export interface StructureTreeProps {
  sections: Section[];
  expandedSections?: string[];
  onToggleSection?: (sectionId: string) => void;
  locale?: 'ru' | 'en';
}
