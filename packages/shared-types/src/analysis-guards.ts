/**
 * Runtime Type Guards for AnalysisResult
 * @module analysis-guards
 *
 * Provides runtime validation for AnalysisResult data from Supabase JSONB columns.
 * This enables safe type casting from unknown data (e.g., course.analysis_result).
 *
 * Now powered by Zod schemas for comprehensive validation.
 */

import { AnalysisResultSchema, type AnalysisResult } from './analysis-schemas';

/**
 * Runtime type guard for AnalysisResult (Zod-based)
 *
 * Validates that the data conforms to the full AnalysisResultSchema.
 * Uses Zod validation for comprehensive structural and type checking.
 *
 * @param data - Unknown data from Supabase JSONB column
 * @returns True if data conforms to AnalysisResult structure
 *
 * @example
 * ```typescript
 * const course = await supabase.from('courses').select('*').single();
 * if (isAnalysisResult(course.analysis_result)) {
 *   // Safe to use as AnalysisResult
 *   const ragPlan = course.analysis_result.document_relevance_mapping;
 * }
 * ```
 */
export function isAnalysisResult(data: unknown): data is AnalysisResult {
  const result = AnalysisResultSchema.safeParse(data);
  return result.success;
}

/**
 * Parse and validate AnalysisResult from unknown data (Zod-based)
 *
 * Used to safely parse courses.analysis_result JSONB column data.
 * Returns null if validation fails (with warning logged to console).
 *
 * @param data - Unknown data from database or API
 * @returns Validated AnalysisResult or null if invalid
 *
 * @example
 * ```typescript
 * const result = parseAnalysisResult(courseData.analysis_result);
 * if (result) {
 *   console.log(result.course_category.primary); // Type-safe access
 * }
 * ```
 */
export function parseAnalysisResult(data: unknown): AnalysisResult | null {
  const result = AnalysisResultSchema.safeParse(data);
  if (!result.success) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[parseAnalysisResult] Invalid analysis result:', result.error.issues);
    }
    return null;
  }
  return result.data;
}
