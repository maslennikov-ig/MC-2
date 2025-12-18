import { z } from 'zod'
import { FILE_UPLOAD } from '@/lib/constants'
import { MIME_TYPES_BY_TIER, COURSE_STYLES, languageSchema } from '@megacampus/shared-types'

// Course creation validation schema
export const createCourseSchema = z.object({
  topic: z.string()
    .min(3, 'Topic must be at least 3 characters')
    .max(200, 'Topic must be less than 200 characters')
    .regex(/^[^<>]*$/, 'Topic cannot contain HTML tags'),
  
  description: z.string()
    .max(2000, 'Description must be less than 2000 characters')
    .regex(/^[^<>]*$/, 'Description cannot contain HTML tags')
    .optional(),
  
  targetAudience: z.string()
    .max(500, 'Target audience must be less than 500 characters')
    .regex(/^[^<>]*$/, 'Target audience cannot contain HTML tags')
    .optional(),

  language: languageSchema,
  
  email: z.string()
    .email('Invalid email format')
    .optional()
    .or(z.literal('')),
  
  writingStyle: z.enum(COURSE_STYLES).optional(),
  
  prerequisites: z.string()
    .max(1000, 'Prerequisites must be less than 1000 characters')
    .regex(/^[^<>]*$/, 'Prerequisites cannot contain HTML tags')
    .optional(),
  
  learningOutcomes: z.string()
    .max(1000, 'Learning outcomes must be less than 1000 characters')
    .regex(/^[^<>]*$/, 'Learning outcomes cannot contain HTML tags')
    .optional(),
  
  estimatedLessons: z.string()
    .regex(/^\d+$/, 'Estimated lessons must be a number')
    .transform(val => parseInt(val, 10))
    .refine(val => val >= 3 && val <= 50, {
      message: 'Estimated lessons must be between 3 and 50'
    })
    .optional()
})

// File validation
export const fileValidationSchema = z.object({
  name: z.string(),
  size: z.number()
    .max(FILE_UPLOAD.MAX_SIZE_BYTES, `File size must be less than ${FILE_UPLOAD.MAX_SIZE_MB}MB`),
  type: z.string()
})

// Use premium tier MIME types (most permissive for backward compatibility)
export const ALLOWED_FILE_TYPES = MIME_TYPES_BY_TIER.premium

export const validateFile = (file: File) => {
  // Check file size
  if (file.size > FILE_UPLOAD.MAX_SIZE_BYTES) {
    return { success: false, error: `File "${file.name}" exceeds maximum size of ${FILE_UPLOAD.MAX_SIZE_MB}MB` }
  }
  
  // Check file type
  if (!(ALLOWED_FILE_TYPES as readonly string[]).includes(file.type)) {
    return { success: false, error: `File type "${file.type}" is not allowed` }
  }
  
  // Check file name for potential security issues
  const dangerousPatterns = [
    /\.\./,  // Directory traversal
    /[<>:"|?*]/,  // Invalid characters
    /^\./, // Hidden files
    /\0/,  // Null bytes
  ]
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(file.name)) {
      return { success: false, error: `File name "${file.name}" contains invalid characters` }
    }
  }
  
  return { success: true }
}

export type CreateCourseInput = z.infer<typeof createCourseSchema>