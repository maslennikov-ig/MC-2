/**
 * Analysis Formatters for Stage 5 Generation
 *
 * Helper functions to format nested AnalysisResult fields for LLM prompts.
 * All enhancement fields (pedagogical_patterns, generation_guidance) are REQUIRED
 * as Analyze (Stage 4) always generates them.
 *
 * @module analysis-formatters
 */

import type { AnalysisResult } from '@megacampus/shared-types/generation-job';

/**
 * Format course_category object for LLM prompt
 *
 * @param category - Course category object from AnalysisResult
 * @returns Formatted string with category, confidence, and reasoning
 *
 * @example
 * ```typescript
 * const formatted = formatCourseCategoryForPrompt(analysis.course_category);
 * // Output: "Professional (95% confidence)\nReasoning: This course teaches..."
 * ```
 */
export function formatCourseCategoryForPrompt(
  category: AnalysisResult['course_category']
): string {
  const primaryLine = `${capitalize(category.primary)} (${Math.round(category.confidence * 100)}% confidence)`;
  const reasoningLine = `Reasoning: ${category.reasoning}`;

  if (category.secondary) {
    const secondaryLine = `Secondary category: ${capitalize(category.secondary)}`;
    return `${primaryLine}\n${secondaryLine}\n${reasoningLine}`;
  }

  return `${primaryLine}\n${reasoningLine}`;
}

/**
 * Format contextual_language object for LLM prompt
 *
 * Supports 3 strategies:
 * - 'full': All 6 fields with headers (most verbose)
 * - 'summary': Concatenated single paragraph (most concise)
 * - 'specific': Only requested fields (targeted)
 *
 * @param contextual - Contextual language object from AnalysisResult
 * @param strategy - Formatting strategy (default: 'full')
 * @param specificFields - Fields to include when strategy='specific'
 * @returns Formatted contextual language string
 *
 * @example
 * ```typescript
 * // Full format
 * const full = formatContextualLanguageForPrompt(analysis.contextual_language);
 *
 * // Summary format
 * const summary = formatContextualLanguageForPrompt(analysis.contextual_language, 'summary');
 *
 * // Specific fields
 * const specific = formatContextualLanguageForPrompt(
 *   analysis.contextual_language,
 *   'specific',
 *   ['why_matters_context', 'motivators']
 * );
 * ```
 */
export function formatContextualLanguageForPrompt(
  contextual: AnalysisResult['contextual_language'],
  strategy: 'full' | 'summary' | 'specific' = 'full',
  specificFields?: Array<keyof AnalysisResult['contextual_language']>
): string {
  if (strategy === 'summary') {
    // Concatenate all fields into single paragraph
    return [
      contextual.why_matters_context,
      contextual.motivators,
      contextual.experience_prompt,
      contextual.problem_statement_context,
      contextual.knowledge_bridge,
      contextual.practical_benefit_focus,
    ].join(' ');
  }

  if (strategy === 'specific' && specificFields && specificFields.length > 0) {
    // Only include requested fields
    return specificFields
      .map((field) => {
        const label = String(field).replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
        return `${label}: ${contextual[field]}`;
      })
      .join('\n\n');
  }

  // Full format with headers
  return `Why This Matters: ${contextual.why_matters_context}

Motivators: ${contextual.motivators}

Experience Prompt: ${contextual.experience_prompt}

Problem Statement Context: ${contextual.problem_statement_context}

Knowledge Bridge: ${contextual.knowledge_bridge}

Practical Benefit Focus: ${contextual.practical_benefit_focus}`;
}

/**
 * Format pedagogical_strategy object for LLM prompt
 *
 * @param strategy - Pedagogical strategy object from AnalysisResult
 * @returns Formatted string with all 5 strategy fields
 *
 * @example
 * ```typescript
 * const formatted = formatPedagogicalStrategyForPrompt(analysis.pedagogical_strategy);
 * // Output: "Teaching Style: hands-on\nAssessment Approach: ..."
 * ```
 */
export function formatPedagogicalStrategyForPrompt(
  strategy: AnalysisResult['pedagogical_strategy']
): string {
  return `Teaching Style: ${strategy.teaching_style}
Assessment Approach: ${strategy.assessment_approach}
Practical Focus: ${strategy.practical_focus}
Progression Logic: ${strategy.progression_logic}
Interactivity Level: ${strategy.interactivity_level}`;
}

/**
 * Format pedagogical_patterns object for LLM prompt
 *
 * Field is REQUIRED (Analyze always generates this enhancement field)
 *
 * @param patterns - Pedagogical patterns object from AnalysisResult
 * @returns Formatted string with strategy, ratio, assessment types, and key patterns
 *
 * @example
 * ```typescript
 * const formatted = formatPedagogicalPatternsForPrompt(analysis.pedagogical_patterns);
 * // Output: "Primary Strategy: problem-based learning\nTheory:Practice Ratio: 30:70..."
 * ```
 */
export function formatPedagogicalPatternsForPrompt(
  patterns: NonNullable<AnalysisResult['pedagogical_patterns']>
): string {
  return `Primary Strategy: ${patterns.primary_strategy}
Theory:Practice Ratio: ${patterns.theory_practice_ratio}
Assessment Types: ${patterns.assessment_types.join(', ')}
Key Patterns:
${patterns.key_patterns.map((pattern: string) => `  - ${pattern}`).join('\n')}`;
}

/**
 * Format generation_guidance object for LLM prompt
 *
 * Field is REQUIRED (Analyze always generates this enhancement field)
 * All nested fields (specific_analogies, real_world_examples) are also REQUIRED
 *
 * @param guidance - Generation guidance object from AnalysisResult
 * @returns Formatted string with tone, analogies, jargon, visuals, exercises, and examples
 *
 * @example
 * ```typescript
 * const formatted = formatGenerationGuidanceForPrompt(analysis.generation_guidance);
 * // Output: "Tone: conversational but precise\nUse Analogies: true..."
 * ```
 */
export function formatGenerationGuidanceForPrompt(
  guidance: NonNullable<AnalysisResult['generation_guidance']>
): string {
  const lines = [
    `Tone: ${guidance.tone}`,
    `Use Analogies: ${guidance.use_analogies ? 'Yes' : 'No'}`,
  ];

  // Specific analogies (REQUIRED field)
  if (guidance.specific_analogies && guidance.specific_analogies.length > 0) {
    lines.push(`Specific Analogies:\n${guidance.specific_analogies.map((a: string) => `  - ${a}`).join('\n')}`);
  } else {
    lines.push('Specific Analogies: None provided');
  }

  lines.push(`Avoid Jargon: ${guidance.avoid_jargon.join(', ')}`);
  lines.push(`Include Visuals: ${guidance.include_visuals.join(', ')}`);
  lines.push(`Exercise Types: ${guidance.exercise_types.join(', ')}`);
  lines.push(`Contextual Language Hints: ${guidance.contextual_language_hints}`);

  // Real world examples (REQUIRED field)
  if (guidance.real_world_examples && guidance.real_world_examples.length > 0) {
    lines.push(`Real World Examples:\n${guidance.real_world_examples.map((ex: string) => `  - ${ex}`).join('\n')}`);
  } else {
    lines.push('Real World Examples: None provided');
  }

  return lines.join('\n');
}

/**
 * Extract difficulty level from AnalysisResult
 *
 * Maps topic_analysis.target_audience to CourseStructure difficulty enum.
 * Falls back to 'beginner' if target_audience is 'mixed' OR if analysis_result is null/undefined.
 *
 * Handles title-only generation scenarios (FR-003) where analysis_result is null
 * and no document analysis has been performed.
 *
 * @param analysis - Full AnalysisResult object (or null for title-only generation)
 * @returns Difficulty level enum value
 *
 * @example
 * ```typescript
 * // Normal scenario with analysis
 * const difficulty = getDifficultyFromAnalysis(analysis);
 * // Returns: 'beginner' | 'intermediate' | 'advanced'
 *
 * // Title-only scenario (analysis is null)
 * const difficulty = getDifficultyFromAnalysis(null);
 * // Returns: 'beginner' (safe default)
 * ```
 */
export function getDifficultyFromAnalysis(
  analysis: AnalysisResult | null
): 'beginner' | 'intermediate' | 'advanced' {
  // Defensive: Handle title-only scenarios (analysis_result: null)
  // This prevents TypeError when accessing nested properties on null
  if (!analysis || !analysis.topic_analysis) {
    return 'beginner'; // Safe default for title-only generation (FR-003)
  }

  const audience = analysis.topic_analysis.target_audience;

  if (audience === 'mixed') {
    // Default to beginner for mixed audiences
    return 'beginner';
  }

  // Direct mapping for beginner/intermediate/advanced
  return audience;
}

/**
 * Extract primary category string from AnalysisResult
 *
 * @param analysis - Full AnalysisResult object
 * @returns Primary category string (e.g., 'professional', 'personal')
 *
 * @example
 * ```typescript
 * const category = getCategoryFromAnalysis(analysis);
 * // Returns: 'professional'
 * ```
 */
export function getCategoryFromAnalysis(analysis: AnalysisResult): string {
  return analysis.course_category.primary;
}

/**
 * Helper: Capitalize first letter of string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
