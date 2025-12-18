/**
 * Generation Metadata Helpers
 * @module @megacampus/shared-types/generation-metadata
 *
 * Helper functions for working with GenerationMetadata JSONB structure.
 * The schemas are defined in generation-result.ts to avoid duplication.
 *
 * Based on:
 * - spec.md FR-025 (generation metadata tracking)
 * - data-model.md lines 181-229 (schema structure)
 * - tasks.md T005 (implementation requirements)
 */

import {
  GenerationMetadata,
  ModelUsage,
  TokenUsage,
  Duration,
  QualityScores,
  RetryCount,
} from './generation-result';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates an empty GenerationMetadata object with zero/empty values.
 * Use this to initialize the generation_metadata column before starting generation.
 *
 * @returns Empty GenerationMetadata with current timestamp
 *
 * @example
 * const metadata = getEmptyMetadata();
 * // Save to courses.generation_metadata JSONB column
 * await supabase
 *   .from('courses')
 *   .update({ generation_metadata: metadata })
 *   .eq('id', courseId);
 */
export function getEmptyMetadata(): GenerationMetadata {
  return {
    model_used: {
      metadata: '',
      sections: '',
      validation: undefined,
    },
    total_tokens: {
      metadata: 0,
      sections: 0,
      validation: 0,
      total: 0,
    },
    cost_usd: 0,
    duration_ms: {
      metadata: 0,
      sections: 0,
      validation: 0,
      total: 0,
    },
    quality_scores: {
      metadata_similarity: 0,
      sections_similarity: [],
      overall: 0,
    },
    batch_count: 0,
    retry_count: {
      metadata: 0,
      sections: [],
    },
    created_at: new Date().toISOString(),
  };
}

/**
 * Phase type for generation workflow.
 * Based on T002-R architecture (5-phase workflow).
 */
export type Phase = 'metadata' | 'sections' | 'validation';

/**
 * Metrics for a single phase completion.
 */
export interface PhaseMetrics {
  modelUsed: string;
  tokensUsed: number;
  durationMs: number;
  qualityScore?: number;
  retryCount?: number;
  batchIndex?: number; // For sections phase batching
}

/**
 * Updates GenerationMetadata after a phase completes.
 * Immutably updates the metadata object and recalculates totals.
 *
 * @param metadata - Current GenerationMetadata object
 * @param phase - Which phase completed ('metadata' | 'sections' | 'validation')
 * @param metrics - Metrics from the completed phase
 * @returns Updated GenerationMetadata object
 *
 * @example
 * // After metadata phase completes
 * let metadata = getEmptyMetadata();
 * metadata = updatePhaseMetrics(metadata, 'metadata', {
 *   modelUsed: 'qwen/qwen-3-max-latest',
 *   tokensUsed: 5234,
 *   durationMs: 12000,
 *   qualityScore: 0.87,
 *   retryCount: 1,
 * });
 *
 * // After sections phase batch completes
 * metadata = updatePhaseMetrics(metadata, 'sections', {
 *   modelUsed: 'qwen/qwen-3-max-latest',
 *   tokensUsed: 15000,
 *   durationMs: 30000,
 *   qualityScore: 0.82,
 *   retryCount: 0,
 *   batchIndex: 0,
 * });
 */
export function updatePhaseMetrics(
  metadata: GenerationMetadata,
  phase: Phase,
  metrics: PhaseMetrics
): GenerationMetadata {
  const updated = { ...metadata };

  // Update model used
  updated.model_used = {
    ...updated.model_used,
    [phase]: metrics.modelUsed,
  };

  // Update tokens
  updated.total_tokens = {
    ...updated.total_tokens,
    [phase]: (updated.total_tokens[phase] || 0) + metrics.tokensUsed,
  };
  updated.total_tokens.total =
    updated.total_tokens.metadata +
    updated.total_tokens.sections +
    (updated.total_tokens.validation || 0);

  // Update duration
  updated.duration_ms = {
    ...updated.duration_ms,
    [phase]: (updated.duration_ms[phase] || 0) + metrics.durationMs,
  };
  updated.duration_ms.total =
    updated.duration_ms.metadata +
    updated.duration_ms.sections +
    (updated.duration_ms.validation || 0);

  // Update quality scores
  if (metrics.qualityScore !== undefined) {
    if (phase === 'metadata') {
      updated.quality_scores.metadata_similarity = metrics.qualityScore;
    } else if (phase === 'sections') {
      // Handle batch processing for sections
      if (metrics.batchIndex !== undefined) {
        const sections = [...updated.quality_scores.sections_similarity];
        sections[metrics.batchIndex] = metrics.qualityScore;
        updated.quality_scores.sections_similarity = sections;
      } else {
        updated.quality_scores.sections_similarity.push(metrics.qualityScore);
      }
    }

    // Recalculate overall quality score (weighted: metadata 20%, sections 80%)
    const metadataWeight = 0.2;
    const sectionsWeight = 0.8;
    const avgSectionsQuality =
      updated.quality_scores.sections_similarity.length > 0
        ? updated.quality_scores.sections_similarity.reduce((sum, score) => sum + score, 0) /
          updated.quality_scores.sections_similarity.length
        : 0;

    updated.quality_scores.overall =
      updated.quality_scores.metadata_similarity * metadataWeight +
      avgSectionsQuality * sectionsWeight;
  }

  // Update retry count
  if (metrics.retryCount !== undefined) {
    if (phase === 'metadata') {
      updated.retry_count.metadata = metrics.retryCount;
    } else if (phase === 'sections') {
      if (metrics.batchIndex !== undefined) {
        const sections = [...updated.retry_count.sections];
        sections[metrics.batchIndex] = metrics.retryCount;
        updated.retry_count.sections = sections;
      } else {
        updated.retry_count.sections.push(metrics.retryCount);
      }
    }
  }

  // Update batch count for sections phase
  if (phase === 'sections' && metrics.batchIndex !== undefined) {
    updated.batch_count = Math.max(updated.batch_count, metrics.batchIndex + 1);
  }

  return updated;
}

/**
 * Type guard to check if a value is a valid GenerationMetadata object.
 *
 * @param value - Value to check
 * @returns True if value is GenerationMetadata
 *
 * @example
 * const data = JSON.parse(jsonbColumn);
 * if (isGenerationMetadata(data)) {
 *   // TypeScript knows data is GenerationMetadata
 *   console.log(data.total_tokens.total);
 * }
 */
export function isGenerationMetadata(value: unknown): value is GenerationMetadata {
  if (typeof value !== 'object' || value === null) return false;

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.model_used === 'object' &&
    typeof obj.total_tokens === 'object' &&
    typeof obj.cost_usd === 'number' &&
    typeof obj.duration_ms === 'object' &&
    typeof obj.quality_scores === 'object' &&
    typeof obj.batch_count === 'number' &&
    typeof obj.retry_count === 'object' &&
    typeof obj.created_at === 'string'
  );
}

// Re-export types for convenience
export type {
  GenerationMetadata,
  ModelUsage,
  TokenUsage,
  Duration,
  QualityScores,
  RetryCount,
};
