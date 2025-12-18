/**
 * Application-wide constants
 */

// File upload constants - re-exported from shared-types (single source of truth)
import {
  FILE_UPLOAD as _FILE_UPLOAD,
  MIME_TYPES_BY_TIER as _MIME_TYPES_BY_TIER,
  FILE_EXTENSIONS_BY_TIER as _FILE_EXTENSIONS_BY_TIER,
  FILE_COUNT_LIMITS_BY_TIER as _FILE_COUNT_LIMITS_BY_TIER,
  FILE_SIZE_LIMITS_BY_TIER as _FILE_SIZE_LIMITS_BY_TIER,
} from '@megacampus/shared-types'

export const FILE_UPLOAD = _FILE_UPLOAD
export const MIME_TYPES_BY_TIER = _MIME_TYPES_BY_TIER
export const FILE_EXTENSIONS_BY_TIER = _FILE_EXTENSIONS_BY_TIER
export const FILE_COUNT_LIMITS_BY_TIER = _FILE_COUNT_LIMITS_BY_TIER
export const FILE_SIZE_LIMITS_BY_TIER = _FILE_SIZE_LIMITS_BY_TIER

// Pagination
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  ITEMS_PER_PAGE: 10,
  MAX_ITEMS_PER_PAGE: 100,
} as const

// Course constraints
export const COURSE = {
  MIN_SECTIONS: 3,
  MAX_SECTIONS: 5,
  MIN_LESSONS_PER_SECTION: 3,
  MAX_LESSONS_PER_SECTION: 5,
  LESSON_DURATION_MINUTES: 5,
  LESSON_WORD_COUNT: {
    MIN: 1000,
    MAX: 1200,
  },
} as const

// API rate limits
export const RATE_LIMITS = {
  REQUESTS_PER_MINUTE: 60,
  REQUESTS_PER_HOUR: 1000,
} as const

// Authentication
export const AUTH = {
  SESSION_DURATION_HOURS: 24,
  REFRESH_THRESHOLD_MINUTES: 5,
} as const

// Database
export const DATABASE = {
  VECTOR_DIMENSIONS: 768,
  SIMILARITY_THRESHOLD: 0.7,
  MAX_SEARCH_RESULTS: 10,
} as const

// Error messages
export const ERROR_MESSAGES = {
  FILE_TOO_LARGE: `File exceeds maximum size of ${FILE_UPLOAD.MAX_SIZE_MB}MB`,
  INVALID_FILE_TYPE: 'File type not supported',
  AUTHENTICATION_REQUIRED: 'Please sign in to continue',
  PERMISSION_DENIED: 'You do not have permission to perform this action',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
  GENERIC_ERROR: 'An unexpected error occurred. Please try again.',
} as const

// Status values
export const COURSE_STATUS = {
  DRAFT: 'draft',
  GENERATING: 'generating',
  PROCESSING: 'processing',
  STRUCTURE_READY: 'structure_ready',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const

// User roles
export const USER_ROLES = {
  SUPER_ADMIN: 'superadmin',
  ADMIN: 'admin',
  USER: 'user',
} as const