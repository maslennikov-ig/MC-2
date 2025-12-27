/**
 * Worker Readiness Response Schemas
 *
 * Zod schemas for validating worker readiness API responses.
 * Ensures type safety and provides runtime validation.
 *
 * @module lib/schemas/worker-readiness
 */

import { z } from 'zod'

/**
 * Schema for pre-flight check result
 */
export const PreFlightCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  message: z.string().optional(),
  durationMs: z.number().optional(),
})

/**
 * Schema for worker readiness response from backend
 *
 * This matches the response structure from course-gen-platform's
 * /readiness endpoint in ui.ts
 */
export const WorkerReadinessBackendSchema = z.object({
  success: z.boolean(),
  data: z.object({
    ready: z.boolean(),
    uploadsPath: z.string().optional(),
    checks: z.array(PreFlightCheckSchema).optional(),
    startedAt: z.string().nullable().optional(),
    readyAt: z.string().nullable().optional(),
    lastCheckAt: z.string().optional(),
  }).optional(),
  timestamp: z.string().optional(),
})

/**
 * Schema for frontend response (what we return to the UI)
 */
export const WorkerReadinessResponseSchema = z.object({
  ready: z.boolean(),
  message: z.string().optional(),
  checks: z.array(PreFlightCheckSchema).optional(),
})

/**
 * Pre-flight check result type
 * @see PreFlightCheckSchema
 */
export type PreFlightCheck = z.infer<typeof PreFlightCheckSchema>

/**
 * Backend readiness response type (from course-gen-platform /readiness endpoint)
 * @see WorkerReadinessBackendSchema
 */
export type WorkerReadinessBackend = z.infer<typeof WorkerReadinessBackendSchema>

/**
 * Frontend readiness response type (returned to UI components)
 * @see WorkerReadinessResponseSchema
 */
export type WorkerReadinessResponse = z.infer<typeof WorkerReadinessResponseSchema>
