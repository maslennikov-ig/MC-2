import { z } from 'zod';

/**
 * Zod schema for generation_progress JSONB field
 *
 * Used in courses.generation_progress column to track course generation progress.
 * Uses .passthrough() to allow additional fields from different stages.
 *
 * @see packages/web/types/course-generation.ts GenerationProgress interface
 * @see packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts
 */
export const GenerationProgressSchema = z
  .object({
    percentage: z.number().min(0).max(100),
    message: z.string(),
    lessons_completed: z.number().int().min(0),
    lessons_total: z.number().int().min(0).optional(),
  })
  .passthrough(); // Allow additional fields from other stages

/**
 * TypeScript type inferred from GenerationProgressSchema
 */
export type GenerationProgressData = z.infer<typeof GenerationProgressSchema>;

/**
 * Validates generation_progress data safely
 *
 * @param data - Unknown data to validate
 * @returns Parsed data or null if invalid
 */
export function parseGenerationProgress(data: unknown): GenerationProgressData | null {
  const result = GenerationProgressSchema.safeParse(data);
  return result.success ? result.data : null;
}
