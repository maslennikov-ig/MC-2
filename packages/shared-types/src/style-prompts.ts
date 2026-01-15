/**
 * Course Style Definitions and Prompts
 * @module @megacampus/shared-types/style-prompts
 *
 * Defines available course content styles and their corresponding prompt templates.
 * Used in Stage 5 generation to control lesson writing tone and approach.
 */

import { z } from 'zod';

// ============================================================================
// COURSE STYLES ENUM
// ============================================================================

export const COURSE_STYLES = [
  // Top 4 - B2B focused, shown first in UI
  'professional',
  'practical',
  'problem_based',
  'analytical',
  // Popular styles
  'conversational',
  'storytelling',
  'interactive',
  'motivational',
  // Specialized styles
  'academic',
  'technical',
  'research',
  'gamified',
] as const;

export type CourseStyle = (typeof COURSE_STYLES)[number];

export const CourseStyleSchema = z.enum(COURSE_STYLES);

/**
 * Default course style used when none specified
 * Used as fallback in Stage 6 content generation
 */
export const DEFAULT_COURSE_STYLE: CourseStyle = 'professional';

// ============================================================================
// STYLE PROMPT DEFINITIONS (ported from workflows n8n/style.js)
// ============================================================================

export const STYLE_PROMPTS: Record<CourseStyle, string> = {
  professional:
    'Adopt corporate tone focusing on business value, ROI, and measurable outcomes. Emphasize industry best practices with real case studies from leading companies. Use executive language: strategic advantages, core competencies, value propositions, KPIs. Structure with executive summaries, key takeaways, and actionable implementation steps. Include metrics and benchmarks where relevant. Address common business challenges and their solutions.',

  practical:
    "Focus entirely on actionable implementation with immediate business applicability. Provide step-by-step instructions, numbered procedures, and clear checklists. Use imperative mood: 'Open the file', 'Click here', 'Run this command'. Include troubleshooting sections for common problems and edge cases. Minimize theory, maximize hands-on application. Add 'Quick Win' boxes for immediate results and 'Pro Tips' for efficiency gains.",

  problem_based:
    'Start every section with real-world business problem scenario that readers recognize from their work. Present symptoms and context first, then guide through diagnostic process. Explore multiple solution paths with clear trade-offs (cost, time, complexity). Use case study format: situation, complication, resolution, lessons learned. Include decision points where readers evaluate options. End with actionable recommendations and success metrics.',

  analytical:
    'Approach topics through data-driven analysis and logical reasoning. Present statistics, metrics, benchmarks, and quantifiable evidence from industry research. Build arguments through systematic reasoning and cause-effect relationships. Use structured analytical frameworks (SWOT, root cause analysis, decision matrices). Break complex systems into components. Include data visualizations descriptions, comparison tables, and evidence-based conclusions.',

  conversational:
    "Write as friendly dialogue with the reader. Use personal pronouns 'you' and 'we' throughout. Include relatable everyday analogies and real-life examples. Ask rhetorical questions to engage. Keep sentences short and paragraphs scannable. Maintain warm, approachable tone like explaining to a curious friend.",

  storytelling:
    'Structure lessons as compelling narratives with characters facing real challenges. Begin with intriguing hooks, build tension through conflict, resolve with learning moments. Weave theoretical concepts naturally into story progression. Create emotional connections that make abstract concepts memorable through concrete scenarios.',

  interactive:
    "Demand constant reader participation and engagement. Embed exercises directly in text: 'Before reading further, write down...'. Include self-assessments, reflection prompts, and hands-on activities. Never let reader be passive consumer. Create dialogue through anticipated questions and responses.",

  motivational:
    "Write with infectious enthusiasm and empowering energy. Include success stories and transformation examples. Frame challenges as exciting opportunities for growth. Use phrases like 'You're capable of amazing things', 'Every expert started here'. Build confidence through positive reinforcement and celebration of small wins.",

  academic:
    'Write with scholarly rigor and theoretical depth. Present multiple perspectives with critical analysis. Use formal academic language, define terminology precisely, include theoretical frameworks. Structure arguments with clear thesis statements supported by evidence. Maintain objective tone through passive voice constructions.',

  technical:
    'Prioritize precision and technical accuracy above all. Include exact specifications, code snippets, mathematical formulas. Use proper technical terminology without simplification. Focus on system architecture, algorithms, and implementation details. Assume reader comfort with technical complexity.',

  research:
    "Guide learning through strategic inquiry and investigation. Start with thought-provoking questions: 'What would happen if...?', 'Why do you think...?'. Present hypotheses to test, experiments to try. Encourage critical thinking by challenging assumptions. Balance open-ended exploration with evidence-based conclusions.",

  gamified:
    "Transform learning into an adventure game. Frame content as quests, missions, and challenges to complete. Use gaming language: 'Level up your skills', 'Achievement unlocked', 'Boss battle ahead'. Create sense of progression with experience points and skill trees. Make failure fun with 'Game Over - Try Again!' attitude.",
};

// ============================================================================
// STYLE HELPER FUNCTIONS
// ============================================================================

/**
 * Get the prompt text for a given course style with validation
 *
 * Validates the input style and returns the corresponding prompt.
 * If the style is invalid or null, silently defaults to 'professional'.
 * Use isValidCourseStyle() to validate before calling if explicit error handling is needed.
 *
 * @param style - Course style identifier (optional, nullable)
 * @returns Full prompt text for the style
 *
 * @example
 * // Valid style
 * const prompt = getStylePrompt('academic');
 * // Returns: "Write with scholarly rigor..."
 *
 * @example
 * // Invalid style - silently defaults to professional
 * const prompt = getStylePrompt('invalid-style');
 * // Returns: "Adopt corporate tone..."
 *
 * @example
 * // Null/undefined - defaults to professional
 * const prompt = getStylePrompt(null);
 * // Returns: "Adopt corporate tone..."
 */
export function getStylePrompt(style?: string | null): string {
  // Validate and normalize style
  const result = CourseStyleSchema.safeParse(style);

  if (!result.success) {
    // Invalid style - silently default to professional (first in B2B-focused order)
    // Callers should validate with isValidCourseStyle() if they need to handle invalid styles explicitly
    return STYLE_PROMPTS.professional;
  }

  return STYLE_PROMPTS[result.data];
}

/**
 * Get all available course styles
 * @returns Array of all valid course style values
 */
export function getAllStyles(): CourseStyle[] {
  return [...COURSE_STYLES];
}

/**
 * Type guard to check if a string is a valid CourseStyle
 * @param style - The string to check
 * @returns True if the string is a valid CourseStyle
 */
export function isValidStyle(style: string): style is CourseStyle {
  return CourseStyleSchema.safeParse(style).success;
}
