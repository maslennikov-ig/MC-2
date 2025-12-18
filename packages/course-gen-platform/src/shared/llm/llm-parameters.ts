/**
 * LLM Parameters Selector with Archetype-Based Temperature Routing
 * @module llm-parameters
 *
 * Provides optimal LLM parameters based on content archetype for Stage 6
 * lesson content generation. Temperature routing follows pedagogical best
 * practices from research on AI-generated educational content.
 *
 * Temperature ranges by archetype:
 * - code_tutorial: 0.2-0.3 (precise, deterministic)
 * - concept_explainer: 0.6-0.7 (balanced creativity)
 * - case_study: 0.5-0.6 (narrative flexibility)
 * - legal_warning: 0.0-0.1 (maximum precision)
 *
 * @see specs/010-stages-456-pipeline/data-model.md (lines 244-248)
 * @see docs/research/008-generation/Optimizing AI Lesson Content Prompts.md
 */

import type { ContentArchetype } from '@megacampus/shared-types';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * LLM parameters for content generation
 *
 * Controls model behavior for lesson content generation. Parameters are
 * tuned per archetype for optimal quality and consistency.
 */
export interface LLMParameters {
  /**
   * Temperature controls randomness in token selection.
   * Lower values = more deterministic, higher = more creative.
   * Range: 0.0-2.0, typical: 0.0-1.0
   */
  temperature: number;

  /**
   * Top-P (nucleus sampling) controls diversity.
   * Lower values = more focused, higher = more diverse.
   * Range: 0.0-1.0, typical: 0.9-1.0
   */
  topP: number;

  /**
   * Maximum tokens to generate in response.
   * Should accommodate 3-5K words + formatting overhead.
   */
  maxTokens: number;

  /**
   * Presence penalty reduces topic repetition.
   * Positive values encourage new topics.
   * Range: -2.0 to 2.0, typical: 0.0-0.6
   */
  presencePenalty: number;

  /**
   * Frequency penalty reduces word repetition.
   * Positive values discourage repeated tokens.
   * Range: -2.0 to 2.0, typical: 0.0-0.6
   */
  frequencyPenalty: number;
}

/**
 * Temperature range configuration for an archetype
 */
export interface TemperatureRange {
  /** Minimum temperature for this archetype */
  min: number;
  /** Maximum temperature for this archetype */
  max: number;
  /** Default temperature for this archetype */
  default: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Temperature ranges by content archetype
 *
 * Derived from pedagogical research on AI-generated educational content:
 * - Code tutorials need precision for correct syntax and logic
 * - Concept explanations benefit from varied examples and analogies
 * - Case studies require narrative flexibility for storytelling
 * - Legal warnings demand maximum accuracy and consistency
 *
 * @see specs/010-stages-456-pipeline/data-model.md (lines 244-248)
 */
export const ARCHETYPE_TEMPERATURE_RANGES: Record<ContentArchetype, TemperatureRange> = {
  code_tutorial: { min: 0.2, max: 0.3, default: 0.25 },
  concept_explainer: { min: 0.6, max: 0.7, default: 0.65 },
  case_study: { min: 0.5, max: 0.6, default: 0.55 },
  legal_warning: { min: 0.0, max: 0.1, default: 0.05 },
};

/**
 * Default LLM parameters for lesson content generation
 *
 * These values are optimized for educational content:
 * - topP: 0.95 for balanced diversity
 * - maxTokens: 8192 for ~5K words with overhead
 * - presencePenalty: 0.1 for slight topic variety
 * - frequencyPenalty: 0.1 for natural repetition avoidance
 */
export const DEFAULT_LLM_PARAMETERS: Omit<LLMParameters, 'temperature'> = {
  topP: 0.95,
  maxTokens: 8192,
  presencePenalty: 0.1,
  frequencyPenalty: 0.1,
};

/**
 * Temperature increment for retry attempts
 *
 * When generation fails or produces low-quality output, increasing
 * temperature can help break out of repetitive patterns.
 */
export const RETRY_TEMPERATURE_INCREMENT = 0.1;

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * Get optimal temperature for a content archetype
 *
 * Returns the default temperature value for the given archetype.
 * Use this when you need only the temperature without other parameters.
 *
 * @param archetype - Content archetype (code_tutorial, concept_explainer, etc.)
 * @returns Optimal temperature value for the archetype
 *
 * @example
 * ```typescript
 * const temp = getTemperatureForArchetype('code_tutorial');
 * // Returns: 0.25
 *
 * const temp2 = getTemperatureForArchetype('case_study');
 * // Returns: 0.55
 * ```
 */
export function getTemperatureForArchetype(archetype: ContentArchetype): number {
  const range = ARCHETYPE_TEMPERATURE_RANGES[archetype];
  return range.default;
}

/**
 * Get complete LLM parameters for a content archetype
 *
 * Returns all LLM parameters optimized for the given archetype.
 * Supports retry logic with progressive temperature increase.
 *
 * Retry behavior:
 * - Each retry increases temperature by 0.1 (configurable via RETRY_TEMPERATURE_INCREMENT)
 * - Temperature is capped at the archetype's maximum value
 * - Other parameters remain constant across retries
 *
 * @param archetype - Content archetype (code_tutorial, concept_explainer, etc.)
 * @param retryAttempt - Optional retry attempt number (0-based, default: 0)
 * @returns Complete LLM parameters for generation
 *
 * @example
 * ```typescript
 * // First attempt
 * const params = getLLMParameters('code_tutorial');
 * // Returns: { temperature: 0.25, topP: 0.95, maxTokens: 8192, ... }
 *
 * // Second attempt (retry 1)
 * const retryParams = getLLMParameters('code_tutorial', 1);
 * // Returns: { temperature: 0.30, topP: 0.95, maxTokens: 8192, ... }
 *
 * // Third attempt (retry 2) - capped at max
 * const retry2Params = getLLMParameters('code_tutorial', 2);
 * // Returns: { temperature: 0.30, topP: 0.95, maxTokens: 8192, ... }
 * // (capped at 0.30, the max for code_tutorial)
 * ```
 */
export function getLLMParameters(
  archetype: ContentArchetype,
  retryAttempt: number = 0
): LLMParameters {
  const range = ARCHETYPE_TEMPERATURE_RANGES[archetype];

  // Calculate temperature with retry increment
  const baseTemperature = range.default;
  const retryIncrement = retryAttempt * RETRY_TEMPERATURE_INCREMENT;
  const adjustedTemperature = baseTemperature + retryIncrement;

  // Cap at archetype's maximum temperature
  const finalTemperature = Math.min(adjustedTemperature, range.max);

  return {
    temperature: finalTemperature,
    ...DEFAULT_LLM_PARAMETERS,
  };
}

/**
 * Get temperature range for a content archetype
 *
 * Returns the full temperature range configuration for the given archetype.
 * Useful for validation or displaying range information.
 *
 * @param archetype - Content archetype
 * @returns Temperature range with min, max, and default values
 *
 * @example
 * ```typescript
 * const range = getTemperatureRange('concept_explainer');
 * // Returns: { min: 0.6, max: 0.7, default: 0.65 }
 * ```
 */
export function getTemperatureRange(archetype: ContentArchetype): TemperatureRange {
  return ARCHETYPE_TEMPERATURE_RANGES[archetype];
}

/**
 * Validate if a temperature is within the acceptable range for an archetype
 *
 * Useful for validating user-provided or external temperature values.
 *
 * @param temperature - Temperature value to validate
 * @param archetype - Content archetype to validate against
 * @returns True if temperature is within the archetype's range
 *
 * @example
 * ```typescript
 * isTemperatureValid(0.25, 'code_tutorial'); // true
 * isTemperatureValid(0.5, 'code_tutorial');  // false (above max 0.3)
 * isTemperatureValid(0.65, 'concept_explainer'); // true
 * ```
 */
export function isTemperatureValid(
  temperature: number,
  archetype: ContentArchetype
): boolean {
  const range = ARCHETYPE_TEMPERATURE_RANGES[archetype];
  return temperature >= range.min && temperature <= range.max;
}

/**
 * Calculate the maximum number of retries available for an archetype
 *
 * Based on the temperature range and retry increment, calculates how many
 * retries can be made before hitting the temperature ceiling.
 *
 * @param archetype - Content archetype
 * @returns Maximum number of retries (0-based count of additional attempts)
 *
 * @example
 * ```typescript
 * getMaxRetries('code_tutorial');
 * // Returns: 0 (only 0.05 range: 0.25 to 0.30)
 *
 * getMaxRetries('concept_explainer');
 * // Returns: 0 (only 0.05 range: 0.65 to 0.70)
 *
 * getMaxRetries('legal_warning');
 * // Returns: 0 (only 0.05 range: 0.05 to 0.10)
 * ```
 */
export function getMaxRetries(archetype: ContentArchetype): number {
  const range = ARCHETYPE_TEMPERATURE_RANGES[archetype];
  const availableRange = range.max - range.default;
  return Math.floor(availableRange / RETRY_TEMPERATURE_INCREMENT);
}
