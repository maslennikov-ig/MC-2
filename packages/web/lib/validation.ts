import { z } from 'zod'
import DOMPurify from 'isomorphic-dompurify'
import { FILE_UPLOAD } from '@/lib/constants'
import {
  difficultySchema,
  languageSchema,
  RICH_TEXT_ALLOWED_TAGS,
  RICH_TEXT_ALLOWED_ATTR,
} from '@megacampus/shared-types'

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F-\u009F]/g

const PATTERNS = {
  // Sanitization
  INVALID_FILENAME_CHARS: /[^a-zA-Z0-9.\-_]/g,
  CONSECUTIVE_DOTS: /\.{2,}/g,
  LEADING_DOTS: /^\.+/,
  TRAILING_DOTS: /\.+$/,
  SQL_DANGEROUS_CHARS: /[';"\\\n\r]/g,
  WHITESPACE_NORMALIZE: /\s+/g,

  // Validation
  PASSWORD_STRENGTH: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
  USERNAME_CHARS: /^[a-zA-Z0-9_-]+$/,
  MONGO_ID: /^[0-9a-fA-F]{24}$/,

  // XSS Detection (no /g flag — used with .test(), must be stateless)
  XSS_SCRIPT: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
  XSS_JAVASCRIPT: /javascript:/i,
  XSS_EVENT_HANDLER: /on\w+\s*=/i,
  XSS_IFRAME: /<iframe\b[^>]*>/i,

  // SQL Injection Detection (no /g flag — used with .test(), must be stateless)
  SQL_KEYWORDS: /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/i,
  SQL_OPERATORS: /(;|--|\/\*|\*\/)/,
  SQL_CONDITION: /(\b(or|and)\b\s+\w+\s*=\s*\w+)/i,

  // Path Traversal Detection (no /g flag — used with .test(), must be stateless)
  PATH_TRAVERSAL_SLASH: /\.\.\//,
  PATH_TRAVERSAL_BACKSLASH: /\.\.\\/,
  PATH_TRAVERSAL_ENCODED_SLASH: /%2e%2e%2f/i,
  PATH_TRAVERSAL_ENCODED_BACKSLASH: /%2e%2e%5c/i,
}

/**
 * Input sanitization utilities
 */
export const sanitize = {
  /**
   * Sanitize HTML content to prevent XSS attacks
   */
  html: (input: string): string => {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [...RICH_TEXT_ALLOWED_TAGS],
      ALLOWED_ATTR: [...RICH_TEXT_ALLOWED_ATTR],
    })
  },

  /**
   * Strip all HTML tags from input
   */
  stripHtml: (input: string): string => {
    return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] })
  },

  /**
   * Sanitize plain text input
   */
  text: (input: string): string => {
    return input
      .trim()
      .replace(CONTROL_CHAR_REGEX, '') // Remove control characters
      .replace(PATTERNS.WHITESPACE_NORMALIZE, ' ') // Normalize whitespace
  },

  /**
   * Sanitize email addresses
   */
  email: (input: string): string => {
    return input.toLowerCase().trim()
  },

  /**
   * Sanitize URLs
   */
  url: (input: string): string => {
    try {
      const url = new URL(input)
      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol')
      }
      return url.toString()
    } catch {
      // Invalid URL format, return empty string as fallback
      return ''
    }
  },

  /**
   * Sanitize file names
   */
  fileName: (input: string): string => {
    return input
      .replace(PATTERNS.INVALID_FILENAME_CHARS, '_') // Replace invalid characters with underscore
      .replace(PATTERNS.CONSECUTIVE_DOTS, '_') // Collapse consecutive dots (path traversal defense)
      .replace(PATTERNS.LEADING_DOTS, '') // Remove leading dots
      .replace(PATTERNS.TRAILING_DOTS, '') // Remove trailing dots
      .substring(0, 255) // Limit length
  },

  /**
   * Sanitize SQL-like input (basic protection)
   */
  sqlSafe: (input: string): string => {
    return input
      .replace(CONTROL_CHAR_REGEX, '') // Remove control characters
      .replace(PATTERNS.SQL_DANGEROUS_CHARS, '') // Remove dangerous SQL characters
      .trim()
  },
}

/**
 * Common validation schemas using Zod.
 *
 * SSOT schemas (re-exported from @megacampus/shared-types — do NOT duplicate):
 * - difficulty, language
 *
 * Web-specific schemas (use DOMPurify sanitization — cannot be shared):
 * - courseTitle, courseDescription, email, password, username, fileName, etc.
 */
export const schemas = {
  // User input schemas
  email: z.string().email().max(254).transform(sanitize.email),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(
      PATTERNS.PASSWORD_STRENGTH,
      'Password must contain at least one lowercase letter, one uppercase letter, and one digit'
    ),

  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be less than 30 characters')
    .regex(
      PATTERNS.USERNAME_CHARS,
      'Username can only contain letters, numbers, underscores, and hyphens'
    )
    .transform(sanitize.text),

  // Course-related schemas
  courseTitle: z
    .string()
    .min(3, 'Course title must be at least 3 characters')
    .max(200, 'Course title must be less than 200 characters')
    .transform(sanitize.text),

  courseDescription: z
    .string()
    .max(2000, 'Description must be less than 2000 characters')
    .transform(sanitize.html),

  // Re-exported from @megacampus/shared-types (single source of truth)
  difficulty: difficultySchema,

  // Re-exported from @megacampus/shared-types (single source of truth - 19 languages)
  language: languageSchema,

  // File schemas
  fileName: z
    .string()
    .min(1, 'File name is required')
    .max(255, 'File name is too long')
    .transform(sanitize.fileName),

  fileSize: z
    .number()
    .positive('File size must be positive')
    .max(FILE_UPLOAD.MAX_SIZE_BYTES, `File size must be less than ${FILE_UPLOAD.MAX_SIZE_MB}MB`),

  // URL schemas
  url: z.string().url().transform(sanitize.url),

  // ID schemas (uuidSchema is also exported standalone below)
  uuid: z.string().uuid(),

  mongoId: z.string().regex(PATTERNS.MONGO_ID, 'Invalid MongoDB ObjectId'),

  // Pagination schemas
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(10),

  // Search schema
  searchQuery: z
    .string()
    .min(1, 'Search query cannot be empty')
    .max(100, 'Search query is too long')
    .transform(sanitize.text),

  // Text content schemas
  plainText: z.string().transform(sanitize.stripHtml),

  richText: z.string().transform(sanitize.html),

  // Numeric schemas
  positiveInteger: z.coerce.number().int().positive(),

  percentage: z.coerce.number().min(0).max(100),
}

/**
 * Validation result type
 */
export type ValidationResult<T> =
  | {
      success: true
      data: T
    }
  | {
      success: false
      errors: string[]
    }

/**
 * Validate input against a schema
 */
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): ValidationResult<T> {
  try {
    const result = schema.parse(input)
    return { success: true, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.issues.map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`),
      }
    }
    return {
      success: false,
      errors: ['Validation failed'],
    }
  }
}

/**
 * Validate and sanitize form data
 */
export function validateFormData<T extends Record<string, z.ZodSchema>>(
  schemas: T,
  formData: FormData
): ValidationResult<{ [K in keyof T]: z.infer<T[K]> }> {
  const errors: string[] = []
  const result: Record<string, unknown> = {}

  for (const [key, schema] of Object.entries(schemas)) {
    const value = formData.get(key)
    const validation = validateInput(schema, value)

    if (validation.success) {
      result[key] = validation.data
    } else {
      errors.push(...validation.errors)
    }
  }

  if (errors.length > 0) {
    return { success: false, errors }
  }

  return { success: true, data: result as { [K in keyof T]: z.infer<T[K]> } }
}

/**
 * Create a validation middleware for API routes
 */
export function withValidation<T>(
  schema: z.ZodSchema<T>,
  handler: (validatedData: T, req: Request) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    try {
      let input: unknown

      const contentType = req.headers.get('content-type') || ''

      if (contentType.includes('application/json')) {
        input = await req.json()
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await req.formData()
        input = Object.fromEntries(formData.entries())
      } else {
        return new Response(JSON.stringify({ error: 'Unsupported content type' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const validation = validateInput(schema, input)

      if (!validation.success) {
        return new Response(
          JSON.stringify({
            error: 'Validation failed',
            details: validation.errors,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      return handler(validation.data, req)
    } catch {
      // Request parsing failed, return validation error
      return new Response(JSON.stringify({ error: 'Invalid request format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }
}

/**
 * File validation utilities
 */
export const fileValidation = {
  /**
   * Validate file type
   */
  validateFileType: (file: File, allowedTypes: string[]): boolean => {
    return allowedTypes.includes(file.type)
  },

  /**
   * Validate file size
   */
  validateFileSize: (file: File, maxSizeBytes: number): boolean => {
    return file.size <= maxSizeBytes
  },

  /**
   * Validate file name
   */
  validateFileName: (fileName: string): boolean => {
    const validation = validateInput(schemas.fileName, fileName)
    return validation.success
  },

  /**
   * Get safe file name
   */
  getSafeFileName: (fileName: string): string => {
    return sanitize.fileName(fileName)
  },

  /**
   * Common file type groups
   */
  fileTypes: {
    documents: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ],
    images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    videos: ['video/mp4', 'video/quicktime', 'video/x-msvideo'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  },
}

/**
 * Security validation utilities
 */
export const securityValidation = {
  /**
   * Check for potential XSS in input
   */
  hasXSS: (input: string): boolean => {
    const xssPatterns = [
      PATTERNS.XSS_SCRIPT,
      PATTERNS.XSS_JAVASCRIPT,
      PATTERNS.XSS_EVENT_HANDLER,
      PATTERNS.XSS_IFRAME,
    ]

    return xssPatterns.some((pattern) => pattern.test(input))
  },

  /**
   * Check for potential SQL injection
   */
  hasSQLInjection: (input: string): boolean => {
    const sqlPatterns = [PATTERNS.SQL_KEYWORDS, PATTERNS.SQL_OPERATORS, PATTERNS.SQL_CONDITION]

    return sqlPatterns.some((pattern) => pattern.test(input))
  },

  /**
   * Check for path traversal attempts
   */
  hasPathTraversal: (input: string): boolean => {
    const pathPatterns = [
      PATTERNS.PATH_TRAVERSAL_SLASH,
      PATTERNS.PATH_TRAVERSAL_BACKSLASH,
      PATTERNS.PATH_TRAVERSAL_ENCODED_SLASH,
      PATTERNS.PATH_TRAVERSAL_ENCODED_BACKSLASH,
    ]

    return pathPatterns.some((pattern) => pattern.test(input))
  },
}

// ============================================================================
// UUID VALIDATION
// ============================================================================

/** Cached UUID regex pattern (RFC 4122) */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** UUID validation schema (standalone export, same as schemas.uuid) */
export const uuidSchema = schemas.uuid

interface UuidValidationResult {
  valid: boolean
  error?: string
}

/** Check if a string is a valid UUID using cached regex */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value)
}

/** Validate UUID format with detailed error message */
export function validateUUID(value: string, fieldName = 'ID'): UuidValidationResult {
  const result = uuidSchema.safeParse(value)
  if (!result.success) {
    return { valid: false, error: `Invalid ${fieldName} format` }
  }
  return { valid: true }
}

/** Validate multiple UUIDs at once */
export function validateMultipleUUIDs(values: Record<string, string>): UuidValidationResult {
  for (const [fieldName, value] of Object.entries(values)) {
    if (!isValidUUID(value)) {
      return { valid: false, error: `Invalid ${fieldName} format` }
    }
  }
  return { valid: true }
}
