import { z } from 'zod';

/**
 * Input schema for course generation initiation
 *
 * This schema validates the input for initiating a course generation workflow.
 */
export const initiateGenerationInputSchema = z.object({
  /** Course ID to generate content for */
  courseId: z.string().uuid('Invalid course ID'),

  /** Optional webhook URL for status notifications */
  webhookUrl: z.string().url().nullable().optional(),
});

/**
 * Input schema for file upload
 *
 * This schema validates file upload inputs with size and MIME type constraints.
 * File content is expected to be base64 encoded.
 */
export const uploadFileInputSchema = z.object({
  /** Course ID to associate the file with */
  courseId: z.string().uuid('Invalid course ID'),

  /** Original filename */
  filename: z.string().min(1, 'Filename is required').max(255, 'Filename too long'),

  /** File size in bytes */
  fileSize: z
    .number()
    .int('File size must be an integer')
    .positive('File size must be positive')
    .max(104857600, 'File size exceeds 100MB limit'), // 100MB max

  /** MIME type of the file */
  mimeType: z.string().min(1, 'MIME type is required'),

  /** Base64 encoded file content */
  fileContent: z.string().min(1, 'File content is required'),
});
