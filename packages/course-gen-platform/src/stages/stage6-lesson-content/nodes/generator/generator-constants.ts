/**
 * Generator Constants and Configuration
 * @module stages/stage6-lesson-content/nodes/generator/generator-constants
 *
 * Centralized constants for depth-based token limits, context windows,
 * and prompt guidance for content generation.
 */

import { getTokenMultiplier } from '@megacampus/shared-types';
import type { SectionDepthV2 } from '@megacampus/shared-types/lesson-specification-v2';
export {
  STAGE6_TIER_FALLBACKS,
  STAGE6_TIER_MODELS,
} from '@megacampus/shared-types/stage6-model-config';

// ============================================================================
// DEPTH-BASED TOKEN LIMITS
// ============================================================================

/**
 * Minimum token limits per depth level (fallback/floor values)
 */
export const DEPTH_TOKEN_LIMITS: Record<SectionDepthV2, number> = {
  summary: 1500,
  detailed_analysis: 3000,
  comprehensive: 6000,
};

/**
 * Scale factors for dynamic token calculation per depth level
 */
export const DEPTH_SCALE_FACTORS: Record<SectionDepthV2, number> = {
  summary: 0.25,
  detailed_analysis: 0.5,
  comprehensive: 1.0,
};

/**
 * Depth-specific prompt guidance for content generation
 */
export const DEPTH_PROMPT_GUIDANCE: Record<SectionDepthV2, string> = {
  summary:
    'Keep content concise and focused. Use bullet points where appropriate. Aim for 200-400 words.',
  detailed_analysis:
    'Provide thorough coverage with examples. Include explanations and context. Aim for 500-1000 words.',
  comprehensive:
    'Create exhaustive content with multiple examples, detailed explanations, and edge cases. Aim for 1000+ words.',
};

/**
 * Valid depth values for runtime validation
 */
export const VALID_DEPTHS: readonly SectionDepthV2[] = [
  'summary',
  'detailed_analysis',
  'comprehensive',
];

// ============================================================================
// SINGLE-CALL GENERATION CONSTANTS
// ============================================================================

/**
 * Words per minute for educational content reading speed.
 * Used to calculate target word count: durationMinutes × WORDS_PER_MINUTE
 */
export const WORDS_PER_MINUTE = 150;

/**
 * Token-to-word ratio for LLM output estimation.
 * Russian/Cyrillic text typically needs ~1.8 tokens per word.
 */
export const TOKENS_PER_WORD_RATIO = 1.8;

/**
 * Minimum maxTokens for single-call generation.
 * Floor value to ensure even the shortest lessons (5 min) have enough
 * generation space for intro + sections + exercises + digest.
 * A 5-min Russian lesson with 4 sections needs ~2600 tokens;
 * 4096 provides comfortable headroom to avoid truncation.
 */
export const SINGLE_CALL_MIN_TOKENS = 4096;

/**
 * Maximum maxTokens for single-call generation.
 * Cap to prevent excessive token usage on very long lessons.
 */
export const SINGLE_CALL_MAX_TOKENS = 16384;

/**
 * Structural overhead multiplier applied to the raw duration-based token budget.
 * Accounts for markdown formatting, section headers, exercises block,
 * lesson digest, and callout markup that are not covered by the
 * word-count-only estimate.  1.35 = 35% headroom.
 */
export const SINGLE_CALL_OVERHEAD_MULTIPLIER = 1.35;

/**
 * Total character budget for RAG context in single-call generation.
 * All RAG chunks are deduplicated and included up to this limit.
 * In serial mode each section got up to 15K chars; single-call sees
 * all sections at once, so we provide 20K total for the entire lesson.
 */
export const SINGLE_CALL_RAG_BUDGET_CHARS = 20000;

/**
 * Tail window (chars) passed to truncation continuation repair prompt.
 * Keeps continuation prompts cheap and focused on the broken tail.
 */
export const TRUNCATION_CONTINUATION_TAIL_CHARS = 2200;

/**
 * Max tokens for truncation continuation repair calls.
 */
export const TRUNCATION_CONTINUATION_MAX_TOKENS = 1400;

/**
 * Prompt template for truncation continuation repair.
 *
 * Placeholders: {{outputLanguage}}, {{sectionsList}}, {{lessonTitle}}, {{tailContext}}
 */
export const TRUNCATION_CONTINUATION_PROMPT_TEMPLATE = `<task>
You are repairing a lesson markdown that was truncated.
Return ONLY the continuation text that should be appended to the existing lesson.
</task>

<hard_requirements>
- Keep output in {{outputLanguage}} only.
- Do NOT repeat existing text verbatim.
- Continue naturally from the tail and finish incomplete sentence/paragraph/code block if needed.
- Preserve markdown structure and heading style.
- Output ONLY markdown continuation, no explanations.
</hard_requirements>

<lesson>
<title>{{lessonTitle}}</title>
<sections>
{{sectionsList}}
</sections>
</lesson>

<tail_context>
{{tailContext}}
</tail_context>`;

// ============================================================================
// CONTEXT WINDOW CONFIGURATION
// ============================================================================

/**
 * Context window size in characters (last ~5000 chars)
 * Provides enough context for transitions without overwhelming the prompt
 */
export const CONTEXT_WINDOW_CHARS = 5000;

/**
 * Dynamic context window calculation constants
 * @see calculateDynamicContextWindow
 */
export const DYNAMIC_CONTEXT_BASE_CHARS = 3000; // Base for 15-min lesson
export const DYNAMIC_CONTEXT_CHARS_PER_MINUTE = 150; // Extra chars per minute over 15
export const DYNAMIC_CONTEXT_MAX_CHARS = 8000; // Maximum cap
export const DYNAMIC_CONTEXT_MIN_DURATION = 5; // Minimum lesson duration (minutes)

// ============================================================================
// DYNAMIC CONTEXT CALCULATION
// ============================================================================

/**
 * Calculate dynamic context window based on lesson duration and language
 *
 * Formula: (BASE_CHARS + extraMinutes × CHARS_PER_MINUTE) × languageMultiplier
 * Capped at MAX_CHARS to prevent excessive context.
 *
 * Rationale:
 * - Longer lessons need more context for coherence across sections
 * - Language multiplier accounts for token density (e.g., Russian needs more chars)
 * - Cap prevents context from growing unbounded
 *
 * @param durationMinutes - Estimated lesson duration in minutes (minimum 5, defaults to 15)
 * @param language - ISO language code ('en', 'ru', etc.)
 * @returns Dynamic context window size in characters
 *
 * @example
 * // 15-min English lesson: 3000 chars
 * calculateDynamicContextWindow(15, 'en') // 3000
 *
 * // 30-min English lesson: 3000 + (15 × 150) = 5250 chars
 * calculateDynamicContextWindow(30, 'en') // 5250
 *
 * // 60-min Russian lesson: (3000 + 45 × 150) × 1.3 = 12675 → capped to 8000
 * calculateDynamicContextWindow(60, 'ru') // 8000
 */
export function calculateDynamicContextWindow(durationMinutes: number, language: string): number {
  // Input validation: ensure duration is at least MIN_DURATION
  const validDuration = Math.max(DYNAMIC_CONTEXT_MIN_DURATION, durationMinutes || 15);
  const extraMinutes = validDuration > 15 ? validDuration - 15 : 0;
  const languageMultiplier = getTokenMultiplier(language);

  const calculated =
    (DYNAMIC_CONTEXT_BASE_CHARS + extraMinutes * DYNAMIC_CONTEXT_CHARS_PER_MINUTE) *
    languageMultiplier;
  return Math.min(DYNAMIC_CONTEXT_MAX_CHARS, Math.ceil(calculated));
}

// ============================================================================
// STAGE 6 3-TIER MODEL ROUTING
// ============================================================================
