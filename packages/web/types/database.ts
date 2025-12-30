import type { GenerationProgress } from './course-generation'
import type { Database } from '@megacampus/shared-types/database.types'

// User role type - sourced from database enum
export type UserRole = Database['public']['Enums']['role']

// Course visibility type
export type CourseVisibility = 'private' | 'organization' | 'public'

export interface Course {
  id: string
  title: string
  slug?: string
  course_description?: string | null
  course_structure?: {
    course_tags?: string[]
    [key: string]: unknown
  } | null
  status: 'draft' | 'published' | 'archived'  // Publication lifecycle (separate from generation)
  language: string
  difficulty: string
  style: string
  user_id?: string | null
  visibility?: CourseVisibility  // Who can see this course: private, organization, public
  is_published?: boolean  // @deprecated - use visibility instead
  share_token?: string | null
  total_lessons_count?: number | null
  total_sections_count?: number | null
  learning_outcomes?: string[] | string | null
  prerequisites?: string[] | string | null
  target_audience?: string | null
  estimated_lessons?: number | null
  estimated_sections?: number | null
  estimated_completion_minutes?: number | null
  request_data?: Record<string, unknown>
  // Generation-specific fields
  generation_status?: 'pending' | 'initializing' | 'processing_documents' | 'analyzing_task' | 'generating_structure' | 'generating_content' | 'finalizing' | 'completed' | 'failed' | 'cancelled' | null
  generation_progress?: GenerationProgress | null
  generation_started_at?: string | null
  generation_completed_at?: string | null
  generation_code?: string | null
  last_progress_update?: string | null
  error_message?: string | null
  error_details?: Record<string, unknown> | null
  output_formats?: string[] | null
  content_strategy?: string | null
  has_files?: boolean
  raw_data?: Record<string, unknown> | null
  webhook_url?: string | null
  created_at: string
  updated_at: string
  // Computed fields for components
  actual_sections_count?: number
  actual_lessons_count?: number
  description?: string
  isFavorite?: boolean
  sections?: Section[]
}

export interface LessonActivity {
  exercise_type: 'case_study' | 'hands_on' | 'quiz' | 'reflection'
  exercise_title: string
  exercise_description: string
}

export interface Section {
  id: string
  course_id: string
  title: string
  description: string
  order_number: number
  section_number?: string | number  // Legacy field
  duration_minutes?: number
  created_at: string
  updated_at: string
  lessons?: Lesson[]
}

export interface Lesson {
  id: string
  section_id: string
  course_id: string
  title: string
  content?: string
  content_text?: string | null  // Legacy field
  summary?: string
  order_number: number
  lesson_number?: string | number  // Legacy field
  duration_minutes?: number
  objectives?: string[] | null  // Legacy field
  key_topics?: string[] | null  // Legacy field
  activities?: (string | LessonActivity)[] | null  // Supports both legacy (string[]) and new (LessonActivity[]) formats
  // Media assets from the assets table
  video_asset?: Asset
  audio_asset?: Asset
  presentation_asset?: Asset
  // Generation status for each media type
  video_status?: 'pending' | 'generating' | 'completed' | 'failed'
  audio_status?: 'pending' | 'generating' | 'completed' | 'failed'
  presentation_status?: 'pending' | 'generating' | 'completed' | 'failed'
  metadata?: {
    generated_content?: Record<string, unknown>
    processing_status?: 'pending' | 'generating' | 'completed' | 'error'
    generation_errors?: string[]
    [key: string]: unknown
  }
  created_at: string
  updated_at: string
}

export interface Asset {
  id: string
  lesson_id?: string
  course_id?: string
  asset_type?: string  // Changed from 'type' to match database column
  download_url?: string  // Added to match database column
  google_drive_file_id?: string  // Added to match database column
  file_path?: string  // Added to match database column
  mime_type?: string  // Added to match database column
  file_size_bytes?: number  // Added to match database column
  type?: 'audio' | 'video' | 'presentation' | 'document'  // Keep for backward compatibility
  url?: string  // Keep for backward compatibility
  file_id?: string
  filename?: string
  duration_seconds?: number
  size_bytes?: number
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export interface User {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  email?: string
  full_name?: string
  avatar_url?: string
  role: UserRole
  created_at?: string
  updated_at?: string
}

// Asset type is already defined above

// Enhanced Lesson type from legacy supabase.ts with additional media fields
export interface LessonWithAssets extends Lesson {
  // Media assets from the assets table
  video_asset?: Asset
  audio_asset?: Asset
  presentation_asset?: Asset
  // Generation status for each media type
  video_status?: 'pending' | 'generating' | 'completed' | 'failed'
  audio_status?: 'pending' | 'generating' | 'completed' | 'failed'
  presentation_status?: 'pending' | 'generating' | 'completed' | 'failed'
  metadata?: {
    generated_content?: Record<string, unknown>
    processing_status?: 'pending' | 'generating' | 'completed' | 'error'
    generation_errors?: string[]
    [key: string]: unknown
  }
}

// Legacy Course type from supabase.ts with extended request_data
export interface CourseWithLegacyFields extends Course {
  lesson_number?: string  // For backward compatibility
  section_number?: string  // For backward compatibility
  content_text?: string | null
  objectives?: string[] | null
  key_topics?: string[] | null
  activities?: string[] | null
  request_data?: {
    language?: string
    style?: string
    audience?: string
    document_summary?: {
      summary_text?: string
      key_topics?: string[]
    }
    [key: string]: unknown
  }
}

// Filter types
export interface CourseFilters {
  search?: string
  status?: string
  difficulty?: string
  favorites?: boolean
  sort?: string
  page?: number
  limit?: number
}

// Statistics types
export interface CoursesStatistics {
  totalCount: number
  completedCount: number
  inProgressCount: number
  structureReadyCount: number
  draftCount: number
  totalLessons: number
  totalHours: number
}

// Server action response types
export interface ServerActionResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface DeleteCourseResponse {
  success: boolean
  deletedTitle: string
}

export interface GetCoursesResponse {
  courses: Course[]
  totalCount: number
  currentPage: number
  totalPages: number
  hasMore: boolean
}

// Course structure types for JSON fields
export interface CourseStructureData {
  course_description?: string
  learning_outcomes?: string[] | string
  prerequisites?: string[] | string
  target_audience?: string
  sections?: Array<{
    title: string
    description?: string
    lessons?: Array<{
      title: string
      content?: string
    }>
  }>
}

// Re-export enrichment types from shared-types (Stage 7)
export type {
  EnrichmentType,
  EnrichmentStatus,
  LessonEnrichmentBase,
  EnrichmentSummary,
  EnrichmentWithPlaybackUrl,
  CreateEnrichmentInput,
} from '@megacampus/shared-types';

export type {
  EnrichmentContent,
  QuizEnrichmentContent,
  PresentationEnrichmentContent,
  AudioEnrichmentContent,
  VideoEnrichmentContent,
  DocumentEnrichmentContent,
  EnrichmentMetadata,
  QuizQuestion,
  PresentationSlide,
} from '@megacampus/shared-types';