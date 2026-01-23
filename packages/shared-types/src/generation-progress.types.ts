/**
 * Generation progress step status
 */
export type GenerationProgressStepStatus = 'pending' | 'in_progress' | 'completed';

/**
 * Single step in generation progress
 * Uses index signature to be compatible with Supabase Json type
 */
export interface GenerationProgressStep {
  name: string;
  status: GenerationProgressStepStatus;
  started_at?: string;
  completed_at?: string;
  [key: string]: string | undefined;
}

/**
 * Course generation progress structure stored in courses.generation_progress
 *
 * This is the backend schema used in the database JSONB column.
 * Uses index signature to be compatible with Supabase Json type.
 * For the frontend UI types with more complex step structures, see:
 * @see packages/web/types/course-generation.ts GenerationProgress interface
 */
export interface GenerationProgress {
  percentage: number;
  message: string;
  lessons_completed?: number;
  lessons_total?: number;
  steps?: GenerationProgressStep[];
  [key: string]: number | string | GenerationProgressStep[] | undefined;
}
