/**
 * Zod schemas for validation
 * @module zod-schemas
 *
 * This module provides Zod schemas for validating API inputs across the platform.
 * All schemas are type-safe and aligned with database constraints.
 */

import { z } from 'zod';
import type { Database } from './database.types';
import { courseLevelSchema } from './common-enums';
import {
  MIME_TYPES_BY_TIER,
  FILE_EXTENSIONS_BY_TIER,
  FILE_COUNT_LIMITS_BY_TIER,
  FILE_SIZE_LIMITS_BY_TIER,
  MAX_FILE_SIZE_BYTES,
} from './file-upload-constants';

// Re-export file upload constants for backward compatibility
export {
  MIME_TYPES_BY_TIER,
  FILE_EXTENSIONS_BY_TIER,
  FILE_COUNT_LIMITS_BY_TIER,
  FILE_SIZE_LIMITS_BY_TIER,
  MAX_FILE_SIZE_BYTES,
};

// ============================================================================
// Database Enum Schemas
// ============================================================================

/**
 * Organization tier enum
 */
export const tierSchema = z.enum(['trial', 'free', 'basic', 'standard', 'premium']);

/**
 * User role enum
 * Includes all roles: superadmin (highest privilege), admin, instructor, student
 */
export const roleSchema = z.enum(['admin', 'superadmin', 'instructor', 'student']);

/**
 * Course status enum
 */
export const courseStatusSchema = z.enum(['draft', 'published', 'archived']);

/**
 * Lesson type enum
 */
export const lessonTypeSchema = z.enum(['video', 'text', 'quiz', 'interactive', 'assignment']);

/**
 * Lesson status enum
 */
export const lessonStatusSchema = z.enum(['draft', 'published', 'archived']);

/**
 * Vector status enum
 */
export const vectorStatusSchema = z.enum(['pending', 'indexing', 'indexed', 'failed']);

// ============================================================================
// Course Schemas
// ============================================================================

/**
 * Course settings schema (JSONB field)
 */
export const courseSettingsSchema = z
  .object({
    /** Enable AI-powered content generation */
    enableAI: z.boolean().default(true),
    /** Target audience level */
    level: courseLevelSchema.optional(),
    /** Estimated duration in hours */
    estimatedHours: z.number().positive().optional(),
    /** Course tags for categorization */
    tags: z.array(z.string()).optional(),
    /** Custom metadata */
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough(); // Allow additional fields

/**
 * Create course input schema
 */
export const createCourseInputSchema = z.object({
  /** Course title (1-200 characters) */
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),

  /** URL-friendly slug (3-100 characters, lowercase, alphanumeric and hyphens only) */
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(100, 'Slug must be 100 characters or less')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .transform(val => val.toLowerCase()),

  /** Initial course status */
  status: courseStatusSchema.default('draft'),

  /** Course settings (optional) */
  settings: courseSettingsSchema.optional(),
});

/**
 * Update course input schema
 */
export const updateCourseInputSchema = z.object({
  /** Course ID to update */
  id: z.string().uuid('Invalid course ID'),

  /** Updated title */
  title: z.string().min(1).max(200).optional(),

  /** Updated slug */
  slug: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .transform(val => val.toLowerCase())
    .optional(),

  /** Updated status */
  status: courseStatusSchema.optional(),

  /** Updated settings */
  settings: courseSettingsSchema.optional(),
});

/**
 * Get course by ID schema
 */
export const getCourseByIdSchema = z.object({
  id: z.string().uuid('Invalid course ID'),
});

/**
 * List courses query schema
 */
export const listCoursesSchema = z.object({
  /** Filter by status */
  status: courseStatusSchema.optional(),

  /** Pagination: limit */
  limit: z.number().int().positive().max(100).default(20),

  /** Pagination: offset */
  offset: z.number().int().nonnegative().default(0),

  /** Search query */
  search: z.string().optional(),
});

// ============================================================================
// File Upload Schemas
// ============================================================================

// NOTE: File upload constants (MIME_TYPES_BY_TIER, FILE_EXTENSIONS_BY_TIER,
// FILE_COUNT_LIMITS_BY_TIER, FILE_SIZE_LIMITS_BY_TIER, MAX_FILE_SIZE_BYTES)
// are imported from './file-upload-constants' and re-exported at the top of this file.

/**
 * File upload input schema
 */
export const fileUploadInputSchema = z.object({
  /** Course ID to attach file to */
  courseId: z.string().uuid('Invalid course ID'),

  /** Original filename */
  filename: z.string().min(1, 'Filename is required').max(255, 'Filename too long'),

  /** File size in bytes */
  fileSize: z
    .number()
    .int()
    .positive('File size must be positive')
    .max(MAX_FILE_SIZE_BYTES, `File size must not exceed ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`),

  /** MIME type */
  mimeType: z.string().min(1, 'MIME type is required'),

  /** File hash (for deduplication) */
  hash: z.string().min(1, 'File hash is required'),

  /** Base64 encoded file content (for small files) or storage path reference */
  content: z.string().optional(),
});

/**
 * Tier-specific file validation schema factory
 */
export function createTierFileValidationSchema(tier: Database['public']['Enums']['tier']) {
  const allowedMimeTypes = MIME_TYPES_BY_TIER[tier] as readonly string[];
  const allowedExtensions = FILE_EXTENSIONS_BY_TIER[tier] as readonly string[];

  if (tier === 'free') {
    return z.object({
      mimeType: z.string().refine(() => false, {
        message: `Free tier does not support file uploads. Please upgrade to Basic Plus or higher to upload files.`,
      }),
    });
  }

  return z.object({
    mimeType: z.string().refine(mime => allowedMimeTypes.includes(mime), {
      message: `File type not allowed for ${tier} tier. Allowed formats: ${allowedExtensions.join(', ')}`,
    }),
  });
}

/**
 * File deletion schema
 */
export const deleteFileSchema = z.object({
  /** File ID to delete */
  fileId: z.string().uuid('Invalid file ID'),
});

/**
 * List files query schema
 */
export const listFilesSchema = z.object({
  /** Filter by course ID */
  courseId: z.string().uuid('Invalid course ID').optional(),

  /** Filter by vector status */
  vectorStatus: vectorStatusSchema.optional(),

  /** Pagination: limit */
  limit: z.number().int().positive().max(100).default(20),

  /** Pagination: offset */
  offset: z.number().int().nonnegative().default(0),
});

// ============================================================================
// Section and Lesson Schemas
// ============================================================================

/**
 * Create section input schema
 */
export const createSectionInputSchema = z.object({
  /** Course ID to add section to */
  courseId: z.string().uuid('Invalid course ID'),

  /** Section title */
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),

  /** Section description */
  description: z.string().max(1000, 'Description must be 1000 characters or less').optional(),

  /** Order index (0-based) */
  orderIndex: z.number().int().nonnegative(),

  /** Section metadata (optional) */
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Create lesson input schema
 */
export const createLessonInputSchema = z.object({
  /** Section ID to add lesson to */
  sectionId: z.string().uuid('Invalid section ID'),

  /** Lesson title */
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),

  /** Order index (0-based) */
  orderIndex: z.number().int().nonnegative(),

  /** Estimated duration in minutes */
  durationMinutes: z.number().int().positive().optional(),

  /** Lesson type */
  lessonType: lessonTypeSchema,

  /** Lesson status */
  status: lessonStatusSchema.default('draft'),

  /** Lesson metadata (optional) */
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// User and Organization Schemas
// ============================================================================

/**
 * Create user input schema
 */
export const createUserInputSchema = z.object({
  /** User email */
  email: z.string().email('Invalid email address'),

  /** Organization ID */
  organizationId: z.string().uuid('Invalid organization ID'),

  /** User role */
  role: roleSchema.default('student'),
});

/**
 * Update user input schema
 */
export const updateUserInputSchema = z.object({
  /** User ID */
  id: z.string().uuid('Invalid user ID'),

  /** Updated email */
  email: z.string().email('Invalid email address').optional(),

  /** Updated role */
  role: roleSchema.optional(),
});

/**
 * Create organization input schema
 */
export const createOrganizationInputSchema = z.object({
  /** Organization name */
  name: z.string().min(1, 'Name is required').max(200, 'Name must be 200 characters or less'),

  /** Organization tier */
  tier: tierSchema.default('free'),
});

/**
 * Update organization input schema
 */
export const updateOrganizationInputSchema = z.object({
  /** Organization ID */
  id: z.string().uuid('Invalid organization ID'),

  /** Updated name */
  name: z.string().min(1).max(200).optional(),

  /** Updated tier */
  tier: tierSchema.optional(),
});

// ============================================================================
// Type Exports (for TypeScript inference)
// ============================================================================

export type Tier = z.infer<typeof tierSchema>;
export type Role = z.infer<typeof roleSchema>;
export type CourseStatus = z.infer<typeof courseStatusSchema>;
export type LessonType = z.infer<typeof lessonTypeSchema>;
export type LessonStatus = z.infer<typeof lessonStatusSchema>;
export type VectorStatus = z.infer<typeof vectorStatusSchema>;

export type CourseSettings = z.infer<typeof courseSettingsSchema>;
export type CreateCourseInput = z.infer<typeof createCourseInputSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseInputSchema>;
export type GetCourseByIdInput = z.infer<typeof getCourseByIdSchema>;
export type ListCoursesInput = z.infer<typeof listCoursesSchema>;

export type FileUploadInput = z.infer<typeof fileUploadInputSchema>;
export type DeleteFileInput = z.infer<typeof deleteFileSchema>;
export type ListFilesInput = z.infer<typeof listFilesSchema>;

export type CreateSectionInput = z.infer<typeof createSectionInputSchema>;
export type CreateLessonInput = z.infer<typeof createLessonInputSchema>;

export type CreateUserInput = z.infer<typeof createUserInputSchema>;
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationInputSchema>;
