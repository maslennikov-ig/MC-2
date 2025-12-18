/**
 * Shared type definitions for course generation router
 */

/**
 * Course configuration settings for generation
 */
export interface CourseSettings {
  /** Main topic of the course */
  topic?: string;
  /** User-provided answers to questionnaire */
  answers?: Record<string, unknown>;
  /** Duration of each lesson in minutes */
  lesson_duration_minutes?: number;
  /** Target audience description */
  target_audience?: string;
  /** Desired number of lessons in the course */
  desired_lessons_count?: number;
  /** Desired number of modules in the course */
  desired_modules_count?: number;
  /** Expected learning outcomes */
  learning_outcomes?: string[];
}

/**
 * Result of concurrency limit check for course generation jobs
 */
export interface ConcurrencyCheckResult {
  /** Whether the job is allowed to proceed */
  allowed: boolean;
  /** Reason for rejection if not allowed, or 'success' if allowed */
  reason?: 'user_limit' | 'global_limit' | 'success';
  /** Current number of jobs for this user */
  current_user_jobs?: number;
  /** Maximum allowed jobs per user */
  user_limit?: number;
  /** Current total number of jobs across all users */
  current_global_jobs?: number;
  /** Maximum allowed jobs globally */
  global_limit?: number;
}
