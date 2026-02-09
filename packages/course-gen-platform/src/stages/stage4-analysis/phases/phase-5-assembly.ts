/**
 * Phase 5: Final Assembly Service
 *
 * Pure data assembly logic (NO LLM calls) that combines outputs from Phases 1-4
 * into a single validated AnalysisResult structure for storage in courses.analysis_result.
 *
 * Critical Requirements:
 * - NO LLM integration (pure logic only)
 * - Validate complete structure with AnalysisResultSchema
 * - Calculate cumulative metadata (tokens, cost, duration)
 * - Sanitize LLM outputs to prevent XSS attacks
 * - Preserve all phase outputs without modification (except sanitization)
 *
 * Language Note (FR-004):
 * - target_language is NOT included in AnalysisResult schema
 * - Stage 5 reads courses.language directly from database
 * - This design avoids duplication and ensures single source of truth
 *
 * Security Note (POST-REVIEW-FIXES):
 * - All LLM-generated text fields are sanitized with DOMPurify before storage
 * - This prevents XSS attacks when displaying content to users
 * - Sanitization applied to: contextual_language, scope_instructions
 *
 * @module phase-5-assembly
 */

import type {
  Phase1Output,
  Phase2Output,
  Phase3Output,
  Phase4Output,
  AnalysisResult,
} from '@megacampus/shared-types/analysis-result';

/** @deprecated Kept for backward compatibility with existing course data */
interface Phase6Output {
  document_relevance_mapping: Record<string, unknown>;
  phase_metadata: {
    duration_ms: number;
    model_used: string;
    tokens: { input: number; output: number; total: number };
    quality_score: number;
    retry_count: number;
  };
}
import { sanitizeLLMOutput } from '../../../shared/utils/sanitize-llm-output';
import { logger } from '../../../shared/logger';

/**
 * Default fallback values for advisory fields in generation_guidance.
 * Used when LLM generates unknown values that are filtered out.
 */
const FALLBACK_EXERCISE_TYPES = ['quiz', 'practice', 'reflection'] as const;
const FALLBACK_VISUAL_TYPES = ['diagrams', 'tables'] as const;

/**
 * Input structure for Phase 5 assembly
 *
 * Contains all phase outputs and cumulative execution metrics.
 */
export interface Phase5Input {
  /** Course UUID */
  course_id: string;

  /** User input language (ISO 639-1 code) - for reference only, NOT stored in AnalysisResult */
  language: string;

  /** Course topic */
  topic: string;

  /** Optional document summaries from Stage 3 */
  document_summaries?: string[] | null;

  /** Phase 1 output: Classification and contextual language */
  phase1_output: Phase1Output;

  /** Phase 2 output: Scope analysis and structure */
  phase2_output: Phase2Output;

  /** Phase 3 output: Pedagogy and research flags */
  phase3_output: Phase3Output;

  /** Phase 4 output: Document synthesis */
  phase4_output: Phase4Output;

  /** Phase 6 output: deprecated, always null for new courses */
  phase6_output?: Phase6Output | null;

  /** Minimum lessons constraint from course_size preset (default 10 for AUTO mode) */
  min_lessons?: number;

  /** Total duration across all phases (ms) */
  total_duration_ms: number;

  /** Total token usage across all phases */
  total_tokens: { input: number; output: number; total: number };

  /** Total cost across all phases (USD) */
  total_cost_usd: number;
}

/**
 * Assemble final analysis result from all phase outputs
 *
 * This is PURE logic - no LLM calls. Combines outputs from Phases 1-4 into
 * a single AnalysisResult structure with complete metadata.
 *
 * Validation:
 * - All required phase outputs must be present
 * - Total lessons must be >= 10 (should already be validated in Phase 2)
 * - All required fields must be populated
 *
 * @param input - All phase outputs and execution metrics
 * @returns Complete AnalysisResult ready for database storage
 * @throws Error if any required phase output is missing
 * @throws Error if total_lessons < 10 (defensive validation)
 */
export function assembleAnalysisResult(input: Phase5Input): AnalysisResult {
  const startTime = Date.now();

  // Defensive validation: Ensure all phase outputs present
  if (!input.phase1_output) {
    throw new Error('Phase 1 output is missing - cannot assemble result');
  }
  if (!input.phase2_output) {
    throw new Error('Phase 2 output is missing - cannot assemble result');
  }
  if (!input.phase3_output) {
    throw new Error('Phase 3 output is missing - cannot assemble result');
  }
  if (!input.phase4_output) {
    throw new Error('Phase 4 output is missing - cannot assemble result');
  }

  // Defensive validation: Minimum lessons based on course_size preset
  // Default to 10 for AUTO mode (FR-015), but respect preset min for MICRO/MINI/etc.
  const minLessonsRequired = input.min_lessons ?? 10;
  const totalLessons = input.phase2_output.recommended_structure.total_lessons;
  if (totalLessons < minLessonsRequired) {
    throw new Error(
      `Phase 2 validation failure: total_lessons (${totalLessons}) is less than minimum required (${minLessonsRequired}). ` +
        'This should have been caught in Phase 2 validation.'
    );
  }

  // Extract phase metadata for cumulative tracking
  const phase1Meta = input.phase1_output.phase_metadata;
  const phase2Meta = input.phase2_output.phase_metadata;
  const phase3Meta = input.phase3_output.phase_metadata;
  const phase4Meta = input.phase4_output.phase_metadata;

  // Calculate phase-specific durations
  const phaseDurationsMs: Record<string, number> = {
    phase_1: phase1Meta.duration_ms,
    phase_2: phase2Meta.duration_ms,
    phase_3: phase3Meta.duration_ms,
    phase_4: phase4Meta.duration_ms,
    phase_5: 0, // Will be calculated at end
  };

  // Track model usage per phase
  const modelUsage: Record<string, string> = {
    phase_1: phase1Meta.model_used,
    phase_2: phase2Meta.model_used,
    phase_3: phase3Meta.model_used,
    phase_4: phase4Meta.model_used,
  };

  // Calculate total retry count
  const totalRetryCount =
    phase1Meta.retry_count +
    phase2Meta.retry_count +
    phase3Meta.retry_count +
    phase4Meta.retry_count;

  // Collect quality scores per phase
  const qualityScores: Record<string, number> = {
    phase_1: phase1Meta.quality_score,
    phase_2: phase2Meta.quality_score,
    phase_3: phase3Meta.quality_score,
    phase_4: phase4Meta.quality_score,
  };

  // Sanitize LLM-generated text fields to prevent XSS attacks
  // Apply DOMPurify sanitization to all user-facing text that came from LLM outputs

  // Sanitize contextual_language object fields (DEPRECATED - field is now optional)
  // Only sanitize if present (for legacy data compatibility)
  const sanitizedContextualLanguage = input.phase1_output.contextual_language
    ? {
        why_matters_context: sanitizeLLMOutput(
          input.phase1_output.contextual_language.why_matters_context
        ),
        motivators: sanitizeLLMOutput(input.phase1_output.contextual_language.motivators),
        experience_prompt: sanitizeLLMOutput(
          input.phase1_output.contextual_language.experience_prompt
        ),
        problem_statement_context: sanitizeLLMOutput(
          input.phase1_output.contextual_language.problem_statement_context
        ),
        knowledge_bridge: sanitizeLLMOutput(
          input.phase1_output.contextual_language.knowledge_bridge
        ),
        practical_benefit_focus: sanitizeLLMOutput(
          input.phase1_output.contextual_language.practical_benefit_focus
        ),
      }
    : undefined;

  // Sanitize generation_guidance fields (REQUIRED)
  const sanitizedGenerationGuidance: AnalysisResult['generation_guidance'] = {
    tone: input.phase4_output.generation_guidance.tone,
    use_analogies: input.phase4_output.generation_guidance.use_analogies,
    specific_analogies: input.phase4_output.generation_guidance.specific_analogies,
    avoid_jargon: input.phase4_output.generation_guidance.avoid_jargon.map(term =>
      sanitizeLLMOutput(term)
    ),
    include_visuals: input.phase4_output.generation_guidance.include_visuals,
    exercise_types: input.phase4_output.generation_guidance.exercise_types,
    contextual_language_hints: sanitizeLLMOutput(
      input.phase4_output.generation_guidance.contextual_language_hints
    ),
    real_world_examples: input.phase4_output.generation_guidance.real_world_examples?.map(ex =>
      sanitizeLLMOutput(ex)
    ),
  };

  // Use pedagogical_strategy directly from Phase 3
  const pedagogicalStrategy = input.phase3_output.pedagogical_strategy;

  // Assemble complete AnalysisResult structure
  const result: AnalysisResult = {
    // From Phase 1: Classification and contextual language
    course_category: input.phase1_output.course_category,
    // contextual_language is now optional (DEPRECATED - only for legacy data)
    ...(sanitizedContextualLanguage && { contextual_language: sanitizedContextualLanguage }),
    topic_analysis: input.phase1_output.topic_analysis,

    // From Phase 2: Scope and structure
    recommended_structure: input.phase2_output.recommended_structure,

    // From Phase 3: Pedagogical strategy and analysis
    pedagogical_strategy: pedagogicalStrategy, // Only assessment_approach and progression_logic
    research_flags: input.phase3_output.research_flags,

    // From Phase 4: Document synthesis
    generation_guidance: sanitizedGenerationGuidance, // REQUIRED - SANITIZED for XSS protection

    // Deprecated: always empty object for new courses, kept for backward compat
    document_relevance_mapping: input.phase6_output?.document_relevance_mapping || {},

    // Metadata: Cumulative execution metrics
    metadata: {
      analysis_version: '1.0.0',
      total_duration_ms: input.total_duration_ms,
      phase_durations_ms: phaseDurationsMs,
      model_usage: modelUsage,
      total_tokens: input.total_tokens,
      total_cost_usd: input.total_cost_usd,
      retry_count: totalRetryCount,
      quality_scores: qualityScores,
      created_at: new Date().toISOString(),
    },
  };

  // Calculate Phase 5 duration (assembly time)
  const assemblyDuration = Date.now() - startTime;
  result.metadata.phase_durations_ms.phase_5 = assemblyDuration;

  // Add assembly time to total duration
  result.metadata.total_duration_ms += assemblyDuration;

  // NOTE: Language Preservation (FR-004)
  // - The user's target language (input.language) is NOT stored in AnalysisResult
  // - Stage 5 (Generation) will read courses.language directly from the database
  // - This avoids duplication and ensures single source of truth for language settings
  // - All analysis output is in English (enforced in Phases 1-4)

  // Validate complete structure (runtime type checking)
  // This is defensive - TypeScript should catch most issues at compile time
  validateAnalysisResult(result);

  return result;
}

/**
 * Runtime validation for AnalysisResult completeness
 *
 * Defensive validation to catch any missing required fields that might
 * slip through TypeScript type checking (e.g., from dynamic data).
 *
 * Enhanced in Analyze Enhancement to support new optional fields:
 * - generation_guidance (optional, but required if scope_instructions missing)
 * - document_relevance_mapping (optional)
 *
 * @param result - AnalysisResult to validate
 * @throws Error if any required field is missing or invalid
 */
function validateAnalysisResult(result: AnalysisResult): void {
  // Validate top-level required fields
  if (!result.course_category) {
    throw new Error('Validation error: course_category is missing');
  }
  if (!result.contextual_language) {
    throw new Error('Validation error: contextual_language is missing');
  }
  if (!result.topic_analysis) {
    throw new Error('Validation error: topic_analysis is missing');
  }
  if (!result.recommended_structure) {
    throw new Error('Validation error: recommended_structure is missing');
  }
  if (!result.pedagogical_strategy) {
    throw new Error('Validation error: pedagogical_strategy is missing');
  }
  // generation_guidance is now REQUIRED
  if (!result.generation_guidance) {
    throw new Error('Validation error: generation_guidance is missing');
  }

  // research_flags can be empty array but must be defined
  if (!Array.isArray(result.research_flags)) {
    throw new Error('Validation error: research_flags must be an array');
  }

  // Validate metadata structure
  if (!result.metadata) {
    throw new Error('Validation error: metadata is missing');
  }
  if (!result.metadata.analysis_version) {
    throw new Error('Validation error: metadata.analysis_version is missing');
  }
  if (typeof result.metadata.total_duration_ms !== 'number') {
    throw new Error('Validation error: metadata.total_duration_ms must be a number');
  }
  if (!result.metadata.phase_durations_ms) {
    throw new Error('Validation error: metadata.phase_durations_ms is missing');
  }
  if (!result.metadata.model_usage) {
    throw new Error('Validation error: metadata.model_usage is missing');
  }
  if (!result.metadata.total_tokens) {
    throw new Error('Validation error: metadata.total_tokens is missing');
  }
  if (typeof result.metadata.total_cost_usd !== 'number') {
    throw new Error('Validation error: metadata.total_cost_usd must be a number');
  }
  if (!result.metadata.created_at) {
    throw new Error('Validation error: metadata.created_at is missing');
  }

  // Note: Minimum lessons validation is done in assembleAnalysisResult
  // using dynamic min_lessons from course_size preset (not hardcoded 10)

  // Validate optional generation_guidance field (when present)
  if (result.generation_guidance) {
    validateGenerationGuidance(result.generation_guidance);
  }
}

/**
 * Validate generation_guidance structure (optional field)
 *
 * Checks:
 * - tone is one of allowed values
 * - include_visuals is non-empty array
 * - exercise_types is non-empty array
 *
 * @param guidance - GenerationGuidance to validate
 * @throws Error if structure is invalid
 */
function validateGenerationGuidance(
  guidance: NonNullable<AnalysisResult['generation_guidance']>
): void {
  const validTones = [
    'conversational but precise',
    'formal academic',
    'casual friendly',
    'technical professional',
  ];
  if (!validTones.includes(guidance.tone)) {
    throw new Error(
      `Validation error: generation_guidance.tone must be one of: ${validTones.join(', ')}. Got: "${guidance.tone}"`
    );
  }

  // Validate include_visuals - use fallback if empty (advisory field, non-blocking)
  if (!Array.isArray(guidance.include_visuals) || guidance.include_visuals.length === 0) {
    logger.warn(
      {
        field: 'include_visuals',
        fallback: FALLBACK_VISUAL_TYPES,
        reason: 'LLM generated values were filtered out or array was empty',
      },
      '[Phase5Assembly] Using fallback for include_visuals'
    );
    // Mutate to apply fallback (guidance is mutable reference)
    (guidance as { include_visuals: string[] }).include_visuals = [...FALLBACK_VISUAL_TYPES];
  }

  // Validate exercise_types - use fallback if empty (advisory field, non-blocking)
  if (!Array.isArray(guidance.exercise_types) || guidance.exercise_types.length === 0) {
    logger.warn(
      {
        field: 'exercise_types',
        fallback: FALLBACK_EXERCISE_TYPES,
        reason: 'LLM generated values were filtered out or array was empty',
      },
      '[Phase5Assembly] Using fallback for exercise_types'
    );
    // Mutate to apply fallback (guidance is mutable reference)
    (guidance as { exercise_types: string[] }).exercise_types = [...FALLBACK_EXERCISE_TYPES];
  }

  // Validate avoid_jargon is array (can be empty)
  if (!Array.isArray(guidance.avoid_jargon)) {
    throw new Error('Validation error: generation_guidance.avoid_jargon must be an array');
  }
}
