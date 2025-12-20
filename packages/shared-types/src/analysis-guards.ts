/**
 * Runtime Type Guards for AnalysisResult
 * @module analysis-guards
 *
 * Provides runtime validation for AnalysisResult data from Supabase JSONB columns.
 * This enables safe type casting from unknown data (e.g., course.analysis_result).
 */

import type { AnalysisResult } from './analysis-result';

/**
 * Runtime type guard for AnalysisResult
 *
 * Validates that the data has the minimum required structure for safe usage.
 * This is a minimal check focusing on what's actually used in the codebase.
 *
 * Key validation points:
 * - Checks for presence of core top-level properties
 * - Validates document_relevance_mapping structure (used for RAG planning)
 * - Does NOT validate every nested field (performance optimization)
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
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  // Check for required top-level properties
  // These are the core fields that should always exist in a valid AnalysisResult
  const hasRequiredFields =
    'course_category' in obj &&
    'topic_analysis' in obj &&
    'recommended_structure' in obj &&
    'metadata' in obj;

  if (!hasRequiredFields) return false;

  // Validate document_relevance_mapping structure if present
  // This is critical for RAG planning in buildMinimalLessonSpec
  if ('document_relevance_mapping' in obj) {
    const drm = obj.document_relevance_mapping;
    // Can be an empty object {} or null/undefined in some cases
    if (drm !== null && drm !== undefined && typeof drm !== 'object') {
      return false; // Invalid type
    }
  }

  return true;
}

/**
 * Safely extracts AnalysisResult from unknown data
 *
 * Combines type guard validation with safe extraction.
 * Returns undefined if data is not a valid AnalysisResult.
 *
 * This is the recommended function for most use cases as it provides
 * a clean API: `const result = parseAnalysisResult(data);`
 *
 * @param data - Unknown data from Supabase JSONB column
 * @returns AnalysisResult if valid, undefined otherwise
 *
 * @example
 * ```typescript
 * const analysisResult = parseAnalysisResult(course.analysis_result);
 * const spec = buildMinimalLessonSpec(lessonId, lesson, sectionNum, requestId, analysisResult);
 * ```
 */
export function parseAnalysisResult(data: unknown): AnalysisResult | undefined {
  return isAnalysisResult(data) ? data : undefined;
}
