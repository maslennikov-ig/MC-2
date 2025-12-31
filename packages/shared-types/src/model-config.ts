/**
 * Stage 4 Analysis - Model Configuration Types
 *
 * TypeScript interfaces for llm_model_config table
 * Supports per-phase LLM model configuration with global defaults + per-course overrides
 *
 * @module model-config
 */

/**
 * Analysis phase identifiers
 * Must match database CHECK constraint in llm_model_config.phase_name
 * Extended with Stage 3, 5, and 6 phases for Admin Pipeline Dashboard
 */
export type PhaseName =
  // Global default (admin-configurable fallback)
  | 'global_default'
  // Stage 2: Document Processing (Summarization)
  | 'stage_2_summarization'
  | 'stage_2_standard_ru'
  | 'stage_2_standard_en'
  | 'stage_2_extended_ru'
  | 'stage_2_extended_en'
  // Stage 3: Classification
  | 'stage_3_classification'
  // Stage 4: Analysis
  | 'stage_4_classification'
  | 'stage_4_scope'
  | 'stage_4_expert'
  | 'stage_4_synthesis'
  | 'stage_4_standard_ru'
  | 'stage_4_standard_en'
  | 'stage_4_extended_ru'
  | 'stage_4_extended_en'
  // Stage 5: Structure Generation
  | 'stage_5_metadata'
  | 'stage_5_sections'
  | 'stage_5_standard_ru'
  | 'stage_5_standard_en'
  | 'stage_5_extended_ru'
  | 'stage_5_extended_en'
  // Stage 6: Lesson Content
  | 'stage_6_rag_planning'
  | 'stage_6_judge'
  | 'stage_6_refinement'
  | 'stage_6_standard_ru'
  | 'stage_6_standard_en'
  | 'stage_6_extended_ru'
  | 'stage_6_extended_en'
  // Stage 6: Targeted Refinement
  | 'stage_6_arbiter'
  | 'stage_6_patcher'
  | 'stage_6_section_expander'
  | 'stage_6_delta_judge'
  // Stage 7: Enrichments (Activities)
  | 'stage_7_cover'
  | 'stage_7_video'
  | 'stage_7_audio'
  | 'stage_7_quiz'
  | 'stage_7_presentation'
  | 'stage_7_document'
  // Special
  | 'emergency'
  | 'quality_fallback';

/**
 * Model configuration for a specific analysis phase
 * Maps to llm_model_config table in database
 *
 * @example
 * // Global configuration
 * {
 *   config_type: 'global',
 *   course_id: null,
 *   phase_name: 'stage_4_classification',
 *   model_id: 'openai/gpt-oss-20b',
 *   fallback_model_id: 'openai/gpt-oss-120b',
 *   temperature: 0.7,
 *   max_tokens: 4096
 * }
 *
 * @example
 * // Course-specific override
 * {
 *   config_type: 'course_override',
 *   course_id: '550e8400-e29b-41d4-a716-446655440000',
 *   phase_name: 'stage_4_expert',
 *   model_id: 'openai/gpt-oss-120b',
 *   fallback_model_id: 'google/gemini-2.5-flash',
 *   temperature: 0.5,
 *   max_tokens: 8000
 * }
 */
export interface ModelConfig {
  /**
   * Configuration scope
   * - 'global': Default configuration for all courses
   * - 'course_override': Course-specific override for troubleshooting
   */
  config_type: 'global' | 'course_override';

  /**
   * Course UUID for course-specific overrides
   * - Required when config_type = 'course_override'
   * - Must be null when config_type = 'global'
   */
  course_id?: string | null;

  /**
   * Analysis phase identifier
   * Determines which stage of the analysis pipeline this config applies to
   */
  phase_name: PhaseName;

  /**
   * Primary OpenRouter model identifier
   *
   * @example 'openai/gpt-oss-20b'
   * @example 'openai/gpt-oss-120b'
   * @example 'google/gemini-2.5-flash'
   */
  model_id: string;

  /**
   * Fallback model for quality-based escalation
   * Used if primary model fails or produces low-quality output
   *
   * @example 'openai/gpt-oss-120b'
   * @example 'google/gemini-2.5-flash'
   */
  fallback_model_id?: string | null;

  /**
   * Model temperature (0-2)
   * Controls randomness in model output
   * - 0: Deterministic
   * - 0.7: Balanced (default)
   * - 2: Maximum creativity
   */
  temperature: number;

  /**
   * Maximum output tokens (1-200000)
   * Limits the length of model-generated responses
   */
  max_tokens: number;
}
