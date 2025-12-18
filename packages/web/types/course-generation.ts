/**
 * Course Generation Types
 * Types for the new course generation system with real-time progress tracking
 */

// Status types for course generation
export type CourseStatus = 
  | 'initializing'
  | 'processing_documents'
  | 'analyzing_task'
  | 'generating_structure'
  | 'generating_content'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'pending'
  | 'stage_2_init'
  | 'stage_2_processing'
  | 'stage_2_complete'
  | 'stage_2_awaiting_approval'
  | 'stage_3_init'
  | 'stage_3_classifying'
  | 'stage_3_complete'
  | 'stage_3_awaiting_approval'
  | 'stage_4_init'
  | 'stage_4_analyzing'
  | 'stage_4_complete'
  | 'stage_4_awaiting_approval'
  | 'stage_5_init'
  | 'stage_5_generating'
  | 'stage_5_complete'
  | 'stage_5_awaiting_approval'
  | 'stage_6_init'
  | 'stage_6_generating'
  | 'stage_6_complete'
  | 'stage_6_awaiting_approval';

// Step status for generation progress
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

// Individual generation step
export interface GenerationStep {
  id: number;
  name: string;
  status: StepStatus;
  optional?: boolean;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number;
  error_message?: string | null;
  retry_count?: number;
  substeps?: SubStep[];
}

// Substep for detailed progress
export interface SubStep {
  id: string;
  name: string;
  status: StepStatus;
  message?: string;
}

// Generation progress structure
export interface GenerationProgress {
  steps: GenerationStep[];
  message: string;
  percentage: number;
  current_step: number;
  total_steps: number;
  has_documents: boolean;
  lessons_completed: number;
  lessons_total: number;
  modules_total?: number; // Added: real module count from Stage 4 analysis_result
  current_stage?: string | null;
  document_size?: number | null;
  estimated_completion?: Date;
  started_at: Date;
}

// Course creation form data
export interface CourseFormData {
  topic: string;
  course_description: string;
  target_audience?: string;
  style?: string;
  output_formats: Array<'text' | 'audio' | 'video' | 'presentation' | 'test'>;
  estimated_lessons?: number;
  content_strategy: 'auto' | 'create_from_scratch' | 'expand_and_enhance';
  prerequisites?: string;
  learning_outcomes?: string;
  has_files?: boolean;
  files?: File[];
}

// Extended Course type with generation fields
export interface CourseWithGeneration {
  id: string;
  title: string;
  slug: string;
  status: CourseStatus;
  course_description?: string;
  target_audience?: string;
  difficulty: string;
  style?: string;
  output_formats?: string[];
  estimated_lessons?: number;
  content_strategy?: string;
  has_files: boolean;
  user_id: string;
  generation_progress: GenerationProgress;
  generation_started_at?: string;
  generation_completed_at?: string;
  last_progress_update?: string;
  error_message?: string;
  error_details?: Record<string, unknown>;
  estimated_completion_minutes?: number;
  raw_data?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}


// Rate limit info
export interface RateLimitInfo {
  blocked: boolean;
  until?: string;
  attempts?: number;
  window_start?: string;
}

// Server action response types
export interface CreateCourseResponse {
  id: string;
  courseId: string;
  slug: string;
}

export interface CreateCourseError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

// Realtime subscription payload
export interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: CourseWithGeneration;
  old?: CourseWithGeneration;
}

// Component props types
export interface GenerationProgressProps {
  courseId: string;
  initialProgress: GenerationProgress;
  initialStatus: CourseStatus;
  slug: string;
  onComplete?: (courseId: string) => void;
  onError?: (error: Error) => void;
  showDebugInfo?: boolean;
  autoRedirect?: boolean;
  redirectDelay?: number;
}

export interface CreateCourseFormProps {
  onSuccess?: (courseId: string, slug: string) => void;
  onError?: (error: CreateCourseError) => void;
}

// Activity log entry
export interface ActivityEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: Record<string, unknown>;
}

// State management types
export interface ProgressState {
  progress: GenerationProgress;
  status: CourseStatus;
  error: Error | null;
  isConnected: boolean;
  activeTab: 'overview' | 'steps' | 'activity';
  activityLog: ActivityEntry[];
  retryAttempts: number;
  estimatedTime: number; // seconds
}

export type ProgressAction =
  | { type: 'UPDATE_PROGRESS'; payload: GenerationProgress }
  | { type: 'SET_STATUS'; payload: CourseStatus }
  | { type: 'SET_ERROR'; payload: Error | null }
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'ADD_ACTIVITY'; payload: ActivityEntry }
  | { type: 'RETRY_STEP'; payload: number }
  | { type: 'UPDATE_ESTIMATE'; payload: number }
  | { type: 'CHANGE_TAB'; payload: 'overview' | 'steps' | 'activity' };