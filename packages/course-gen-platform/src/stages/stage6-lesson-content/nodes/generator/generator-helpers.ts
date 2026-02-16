/**
 * Generator Helper Functions
 * @module stages/stage6-lesson-content/nodes/generator/generator-helpers
 *
 * Utility functions for token extraction, context window management,
 * and prompt formatting.
 */

import { ChatOpenAI } from '@langchain/openai';
import { getTokenMultiplier } from '@megacampus/shared-types';
import type {
  SectionSpecV2,
  LessonSpecificationV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import {
  CONTEXT_WINDOW_CHARS,
  DEPTH_TOKEN_LIMITS,
  DEPTH_SCALE_FACTORS,
} from './generator-constants';

// ============================================================================
// KEY POINTS FORMATTING
// ============================================================================

/**
 * Format key points as numbered list for prompt inclusion
 *
 * @param keyPoints - Array of key point strings from section spec
 * @returns Formatted numbered list (e.g., "1. Point A\n2. Point B") or empty string
 *
 * @example
 * formatKeyPointsList(['Learn TypeScript', 'Use generics'])
 * // Returns: "1. Learn TypeScript\n2. Use generics"
 */
export function formatKeyPointsList(keyPoints: string[]): string {
  if (!keyPoints || keyPoints.length === 0) {
    return '';
  }
  return keyPoints.map((point, index) => `${index + 1}. ${point}`).join('\n');
}

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

/**
 * Estimate tokens from text based on language
 *
 * Uses language-specific character-to-token ratios:
 * - English: 4.0 chars/token
 * - Russian: 3.2 chars/token (Cyrillic is denser)
 *
 * @param text - Text to estimate tokens for
 * @param language - ISO language code ('en', 'ru')
 * @returns Estimated token count
 */
export function estimateTokensFromText(text: string, language: string): number {
  const multiplier = getTokenMultiplier(language);
  // Base: 4 chars per token for English, adjusted by language multiplier
  // Russian multiplier is ~1.3, so: 4 / 1.3 ≈ 3.1 chars/token
  const charsPerToken = 4 / multiplier;
  return Math.ceil(text.length / charsPerToken);
}

// ============================================================================
// TOKEN EXTRACTION FROM LLM RESPONSES
// ============================================================================

/**
 * Parse token usage from ChatOpenAI response metadata
 *
 * Extracts total_tokens from OpenRouter/OpenAI response metadata.
 * Returns both the token count and a flag indicating if metadata was present.
 *
 * @param response - ChatOpenAI invoke response with response_metadata
 * @returns Object with tokens count and hasMeta flag for validation
 *
 * @example
 * const result = extractTokenUsage(response);
 * if (!result.hasMeta) {
 *   logger.warn('Token metadata missing');
 * }
 * totalTokens += result.tokens;
 */
export function extractTokenUsage(response: Awaited<ReturnType<ChatOpenAI['invoke']>>): {
  tokens: number;
  hasMeta: boolean;
} {
  const metadata = response.response_metadata;
  if (metadata && typeof metadata === 'object') {
    const usage = (metadata as Record<string, unknown>).usage;
    if (usage && typeof usage === 'object') {
      const totalTokens = (usage as Record<string, unknown>).total_tokens;
      if (typeof totalTokens === 'number') {
        return { tokens: totalTokens, hasMeta: true };
      }
    }
  }
  return { tokens: 0, hasMeta: false };
}

/**
 * Extract token usage with fallback estimation
 *
 * First tries to get actual token count from model response metadata.
 * If not available (free models often don't report), estimates based on
 * prompt + response length using language-specific char/token ratios.
 *
 * @param response - ChatOpenAI invoke response
 * @param prompt - Original prompt sent to model
 * @param language - ISO language code for estimation
 * @returns Token count (actual or estimated)
 */
export function extractTokenUsageWithFallback(
  response: Awaited<ReturnType<ChatOpenAI['invoke']>>,
  prompt: string,
  language: string
): { tokens: number; isEstimated: boolean } {
  const result = extractTokenUsage(response);

  if (result.hasMeta) {
    return { tokens: result.tokens, isEstimated: false };
  }

  // Fallback: estimate from prompt + response content
  const responseContent =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

  const estimatedTokens = estimateTokensFromText(prompt + responseContent, language);

  return { tokens: estimatedTokens, isEstimated: true };
}

// ============================================================================
// INTER-LESSON CONTEXT FORMATTING
// ============================================================================

/**
 * Format inter-lesson context as XML string for prompt inclusion
 *
 * Converts the lesson_context object into an XML block that can be
 * included in prompts. Returns empty string if no context available.
 *
 * @param lessonContext - Lesson context from LessonSpecificationV2
 * @returns XML string or empty string
 */
export function formatInterLessonContextXML(
  lessonContext: LessonSpecificationV2['lesson_context']
): string {
  if (!lessonContext) {
    return '';
  }

  const parts: string[] = ['<inter_lesson_context>'];

  // Previous lesson
  if (lessonContext.previous_lesson) {
    parts.push('  <previous_lesson>');
    parts.push(`    <title>${lessonContext.previous_lesson.title}</title>`);
    const prevKeyConcepts = lessonContext.previous_lesson.key_concepts ?? [];
    if (prevKeyConcepts.length > 0) {
      parts.push(`    <key_concepts>${prevKeyConcepts.join(', ')}</key_concepts>`);
    }
    if (lessonContext.previous_lesson.summary_preview) {
      parts.push(
        `    <summary_preview>${lessonContext.previous_lesson.summary_preview}</summary_preview>`
      );
    }
    parts.push('  </previous_lesson>');
  }

  // Next lesson
  if (lessonContext.next_lesson) {
    parts.push('  <next_lesson>');
    parts.push(`    <title>${lessonContext.next_lesson.title}</title>`);
    const nextKeyConcepts = lessonContext.next_lesson.key_concepts ?? [];
    if (nextKeyConcepts.length > 0) {
      parts.push(`    <preview_concepts>${nextKeyConcepts.join(', ')}</preview_concepts>`);
    }
    parts.push('  </next_lesson>');
  }

  // Concepts already covered
  const conceptsCovered = lessonContext.concepts_already_covered ?? [];
  if (conceptsCovered.length > 0) {
    parts.push(
      `  <concepts_already_covered>${conceptsCovered.join(', ')}</concepts_already_covered>`
    );
  }

  // Terms already defined
  const termsDefined = lessonContext.terms_already_defined ?? [];
  if (termsDefined.length > 0) {
    parts.push(`  <terms_already_defined>${termsDefined.join(', ')}</terms_already_defined>`);
  }

  // Course position
  if (lessonContext.course_position) {
    const pos = lessonContext.course_position;
    const isFirstInCourse = pos.lesson_index_in_course === 1;
    const isLastInCourse = pos.lesson_index_in_course === pos.total_lessons_in_course;
    const isFirstInModule = pos.lesson_index_in_module === 1;
    const isLastInModule = pos.lesson_index_in_module === pos.total_lessons_in_module;

    parts.push('  <course_position>');
    parts.push(
      `    <current>Lesson ${pos.lesson_index_in_module} of ${pos.total_lessons_in_module} in Module "${pos.module_title}" (module ${pos.module_index} of ${pos.total_modules})</current>`
    );
    parts.push(
      `    <global>Lesson ${pos.lesson_index_in_course} of ${pos.total_lessons_in_course} in the entire course</global>`
    );
    parts.push(`    <is_first_in_course>${isFirstInCourse}</is_first_in_course>`);
    parts.push(`    <is_last_in_course>${isLastInCourse}</is_last_in_course>`);
    parts.push(`    <is_first_in_module>${isFirstInModule}</is_first_in_module>`);
    parts.push(`    <is_last_in_module>${isLastInModule}</is_last_in_module>`);
    parts.push('  </course_position>');
  }

  parts.push('</inter_lesson_context>');

  return parts.join('\n');
}

// ============================================================================
// CONTEXT WINDOW EXTRACTION
// ============================================================================

/**
 * Extract last N characters from text for context window
 *
 * Used to provide previous content context to each section generation,
 * enabling natural transitions without a separate Smoother node.
 *
 * Smart truncation: Attempts to start at a paragraph boundary (double newline)
 * to avoid mid-sentence or mid-code-block truncation.
 *
 * @param text - Full accumulated content from previous sections
 * @param maxChars - Maximum characters to return (default: 5000)
 * @returns Context string: empty for first section, full text if short, or truncated with "..."
 *
 * @example
 * extractContextWindow('') // Returns: ''
 * extractContextWindow('Short text') // Returns: 'Short text'
 * extractContextWindow(longText, 5000) // Returns: '...\n\n[last ~5000 chars from paragraph boundary]'
 */
export function extractContextWindow(
  text: string,
  maxChars: number = CONTEXT_WINDOW_CHARS
): string {
  // First section has no context - return empty string explicitly
  if (text.length === 0) {
    return '';
  }

  // Short content - return as-is
  if (text.length <= maxChars) {
    return text;
  }

  // Long content - smart truncation at paragraph boundary
  const truncated = text.slice(-maxChars);

  // Try to find a paragraph boundary (double newline) in the first 500 chars
  // to avoid starting mid-sentence or mid-code-block
  const firstParagraphBreak = truncated.indexOf('\n\n');

  if (firstParagraphBreak > 0 && firstParagraphBreak < 500) {
    // Start from paragraph boundary for cleaner context
    return '...\n\n' + truncated.slice(firstParagraphBreak + 2);
  }

  // No suitable paragraph break found - use simple truncation
  return '...' + truncated;
}

// ============================================================================
// DYNAMIC TOKEN CALCULATION
// ============================================================================

/**
 * Calculate dynamic max tokens for section based on lesson duration and depth
 *
 * Formula: (duration × 250 × 1.5 × langMultiplier) / sectionCount × depthScale
 *
 * Factors:
 * - 250: Base words per minute of educational content consumption
 * - 1.5: Overhead multiplier accounting for:
 *   - Markdown formatting (headers, lists, code blocks)
 *   - Examples and explanations beyond core content
 *   - Buffer for LLM token estimation variance
 * - languageMultiplier: 1.0 for English, 1.3 for Russian (Cyrillic requires more tokens)
 * - depthScale: 0.25 (summary), 0.5 (detailed), 1.0 (comprehensive)
 *
 * The result is clamped to a minimum based on depth level to ensure adequate content.
 *
 * @param lessonSpec - Full lesson specification with duration and section count
 * @param section - Section with depth constraint
 * @param language - ISO language code ('en', 'ru')
 * @returns Maximum tokens to request from LLM
 *
 * @example
 * // 30-min Russian lesson with 6 sections, detailed_analysis depth
 * // Base: (30 * 250 * 1.5 * 1.3) / 6 = 2437 tokens
 * // With depth scale 0.5: 1218 tokens
 * // Min for detailed_analysis in Russian: 3000 * 1.3 = 3900
 * // Result: max(1218, 3900) = 3900 tokens
 */
export function calculateMaxTokensForSection(
  lessonSpec: LessonSpecificationV2,
  section: SectionSpecV2,
  language: string
): number {
  const depth = section.constraints?.depth || 'detailed_analysis';
  const languageMultiplier = getTokenMultiplier(language);
  const sectionCount = lessonSpec.sections.length || 1;
  const durationMinutes = lessonSpec.estimated_duration_minutes || 15;

  // Base tokens per section = (duration × 250 × 1.5 × langMultiplier) / sectionCount
  // 250 = words/min for educational content, 1.5 = formatting/examples overhead
  const baseTokensPerSection = Math.ceil(
    (durationMinutes * 250 * 1.5 * languageMultiplier) / sectionCount
  );

  // Apply depth scaling
  const scaleFactor = DEPTH_SCALE_FACTORS[depth];
  const depthScaledTokens = Math.round(baseTokensPerSection * scaleFactor);

  // Take maximum of calculated and minimum required for depth
  const languageAdjustedMin = Math.ceil(DEPTH_TOKEN_LIMITS[depth] * languageMultiplier);
  const maxTokens = Math.max(depthScaledTokens, languageAdjustedMin);

  return maxTokens;
}

// ============================================================================
// GENERATION GUIDANCE FORMATTING
// ============================================================================

/**
 * Format generation guidance from Stage 4 analysis as XML for prompt inclusion
 *
 * Extracts actionable guidance from AnalysisResult.generation_guidance:
 * - specific_analogies: Domain-specific analogies to use
 * - real_world_examples: Concrete examples from the field
 * - assessment_approach: How to design exercises
 * - tone: Writing tone guidance
 *
 * @param analysisResult - AnalysisResult from Stage 4 with generation_guidance
 * @returns XML string for prompt inclusion or empty string if no guidance
 */
export function formatGenerationGuidanceXML(
  analysisResult:
    | {
        generation_guidance?: {
          specific_analogies?: string[];
          real_world_examples?: string[];
          assessment_approach?: string;
          tone?: string;
          pedagogical_strategy?: {
            teaching_style?: string;
            progression_logic?: string;
          };
        };
      }
    | null
    | undefined
): string {
  if (!analysisResult?.generation_guidance) {
    return '';
  }

  const guidance = analysisResult.generation_guidance;
  const parts: string[] = ['<generation_guidance>'];

  // Specific analogies to use in explanations
  if (guidance.specific_analogies && guidance.specific_analogies.length > 0) {
    parts.push('  <specific_analogies>');
    parts.push('    <!-- Use these domain-specific analogies to explain complex concepts -->');
    for (const analogy of guidance.specific_analogies) {
      parts.push(`    <analogy>${analogy}</analogy>`);
    }
    parts.push('  </specific_analogies>');
  }

  // Real-world examples
  if (guidance.real_world_examples && guidance.real_world_examples.length > 0) {
    parts.push('  <real_world_examples>');
    parts.push('    <!-- Incorporate these practical examples from the field -->');
    for (const example of guidance.real_world_examples) {
      parts.push(`    <example>${example}</example>`);
    }
    parts.push('  </real_world_examples>');
  }

  // Assessment approach
  if (guidance.assessment_approach) {
    parts.push(`  <assessment_approach>${guidance.assessment_approach}</assessment_approach>`);
  }

  // Tone guidance
  if (guidance.tone) {
    parts.push(`  <tone_guidance>${guidance.tone}</tone_guidance>`);
  }

  // Pedagogical strategy
  if (guidance.pedagogical_strategy) {
    const strategy = guidance.pedagogical_strategy;
    if (strategy.teaching_style || strategy.progression_logic) {
      parts.push('  <pedagogical_strategy>');
      if (strategy.teaching_style) {
        parts.push(`    <teaching_style>${strategy.teaching_style}</teaching_style>`);
      }
      if (strategy.progression_logic) {
        parts.push(`    <progression_logic>${strategy.progression_logic}</progression_logic>`);
      }
      parts.push('  </pedagogical_strategy>');
    }
  }

  parts.push('</generation_guidance>');

  // Return empty if only opening/closing tags (no actual content)
  if (parts.length <= 2) {
    return '';
  }

  return parts.join('\n');
}
