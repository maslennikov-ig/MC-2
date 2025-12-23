import { NodeStatus, TraceAttempt } from '@megacampus/shared-types';
import { GenerationTrace } from '@/components/generation-celestial/utils';
import { DocumentStepData, ModuleStructure } from '../types';

/**
 * Calculate overall document status from all stages.
 * Priority: failed > active > completed > pending
 */
export function calculateDocumentStatus(steps: DocumentStepData[]): NodeStatus {
  if (steps.length === 0) return 'pending';

  if (steps.some(s => s.status === 'error')) return 'error';
  if (steps.some(s => s.status === 'active')) return 'active';
  if (steps.every(s => s.status === 'completed')) return 'completed';

  return 'pending';
}

/**
 * Convert GenerationTrace to TraceAttempt for node.data.attempts.
 * Maps flat trace structure to structured attempt with metrics.
 * Uses retry_attempt from trace, NOT sequential numbering.
 */
export function traceToAttempt(trace: GenerationTrace): TraceAttempt {
  return {
    attemptNumber: (trace.retry_attempt ?? 0) + 1, // retry_attempt is 0-based, attemptNumber is 1-based
    timestamp: new Date(trace.created_at),
    inputData: trace.input_data || {},
    outputData: trace.output_data || {},
    processMetrics: {
      model: trace.model_used || 'unknown',
      tokens: trace.tokens_used || 0,
      duration: trace.duration_ms || 0,
      cost: trace.cost_usd || 0,
      wasCached: trace.was_cached,
      temperature: trace.temperature,
      qualityScore: trace.quality_score
    },
    status: trace.error_data ? 'failed' : 'success',
    errorMessage: trace.error_data?.message || (trace.error_data ? JSON.stringify(trace.error_data) : undefined),
    // DO NOT set refinementMessage from prompt_text - that's the LLM prompt, not user refinement
    refinementMessage: undefined
  };
}

/**
 * Type guard to validate that data conforms to ModuleStructure array format.
 * Ensures data from trace.output_data.modules is properly shaped before use.
 */
export function isValidModuleStructure(data: unknown): data is ModuleStructure[] {
  if (!Array.isArray(data)) return false;
  return data.every(mod =>
    typeof mod === 'object' &&
    mod !== null &&
    typeof mod.title === 'string' &&
    (mod.id === undefined || typeof mod.id === 'string') &&
    (mod.lessons === undefined || Array.isArray(mod.lessons))
  );
}
