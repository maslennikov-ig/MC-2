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
  'academic',
  'conversational',
  'storytelling',
  'practical',
  'motivational',
  'visual',
  'gamified',
  'minimalist',
  'research',
  'engaging',
  'professional',
  'socratic',
  'problem_based',
  'collaborative',
  'technical',
  'microlearning',
  'inspirational',
  'interactive',
  'analytical',
] as const;

export type CourseStyle = typeof COURSE_STYLES[number];

export const CourseStyleSchema = z.enum(COURSE_STYLES);

// ============================================================================
// STYLE PROMPT DEFINITIONS (ported from workflows n8n/style.js)
// ============================================================================

export const STYLE_PROMPTS: Record<CourseStyle, string> = {
  academic: "Write with scholarly rigor and theoretical depth. Present multiple perspectives with critical analysis. Use formal academic language, define terminology precisely, include theoretical frameworks. Structure arguments with clear thesis statements supported by evidence. Maintain objective tone through passive voice constructions.",

  conversational: "Write as friendly dialogue with the reader. Use personal pronouns 'you' and 'we' throughout. Include relatable everyday analogies and real-life examples. Ask rhetorical questions to engage. Keep sentences short and paragraphs scannable. Maintain warm, approachable tone like explaining to a curious friend.",

  storytelling: "Structure lessons as compelling narratives with characters facing real challenges. Begin with intriguing hooks, build tension through conflict, resolve with learning moments. Weave theoretical concepts naturally into story progression. Create emotional connections that make abstract concepts memorable through concrete scenarios.",

  practical: "Focus entirely on actionable implementation. Provide step-by-step instructions, numbered procedures, and clear checklists. Use imperative mood: 'Open the file', 'Click here', 'Run this command'. Include troubleshooting sections for common problems. Minimize theory, maximize hands-on application with immediate results.",

  motivational: "Write with infectious enthusiasm and empowering energy. Include success stories and transformation examples. Frame challenges as exciting opportunities for growth. Use phrases like 'You're capable of amazing things', 'Every expert started here'. Build confidence through positive reinforcement and celebration of small wins.",

  visual: "Create vivid mental images through rich descriptive language. Use spatial metaphors and visual analogies: 'Think of memory as a filing cabinet'. Paint detailed word pictures that help readers see concepts. Describe abstract ideas through concrete visual scenes, diagrams, and spatial relationships.",

  gamified: "Transform learning into an adventure game. Frame content as quests, missions, and challenges to complete. Use gaming language: 'Level up your skills', 'Achievement unlocked', 'Boss battle ahead'. Create sense of progression with experience points and skill trees. Make failure fun with 'Game Over - Try Again!' attitude.",

  minimalist: "Strip content to absolute essentials. Short declarative sentences. Core concepts only. No elaboration unless critical. Direct statements without qualification. Each paragraph delivers one complete idea. Eliminate adjectives, adverbs, and filler words. Maximum clarity through minimum complexity.",

  research: "Guide learning through strategic inquiry and investigation. Start with thought-provoking questions: 'What would happen if...?', 'Why do you think...?'. Present hypotheses to test, experiments to try. Encourage critical thinking by challenging assumptions. Balance open-ended exploration with evidence-based conclusions.",

  engaging: "Hook readers instantly with surprising facts, paradoxes, or 'Did you know?' moments. Create curiosity gaps that demand resolution. Use cliffhangers between sections: 'But there's a catch...'. Make content personally relevant: 'This could save you hours'. Include interactive moments: 'Stop and try this before reading on'.",

  professional: "Adopt corporate tone focusing on business value and ROI. Emphasize industry best practices, case studies from Fortune 500 companies. Use executive language: strategic advantages, core competencies, value propositions. Structure with executive summaries and actionable takeaways for implementation.",

  socratic: "Never give direct answers, guide discovery through questions. Use progressive questioning to lead learners to insights. 'What do you notice about...?', 'How might this relate to...?'. Let students uncover principles themselves. Build understanding layer by layer through guided inquiry.",

  problem_based: "Start every section with real-world problem scenario. Present symptoms and context first, then guide through diagnostic process. Explore multiple solution paths with trade-offs. Use case study format: situation, complication, resolution. Include decision points where readers choose approach.",

  collaborative: "Write for group learning contexts. Include instructions for peer discussions: 'Share with your partner', 'Debate in groups'. Suggest team exercises and collaborative projects. Create opportunities for knowledge exchange. Use inclusive language that assumes multiple learners working together.",

  technical: "Prioritize precision and technical accuracy above all. Include exact specifications, code snippets, mathematical formulas. Use proper technical terminology without simplification. Focus on system architecture, algorithms, and implementation details. Assume reader comfort with technical complexity.",

  microlearning: "Deliver ultra-focused micro-lessons on single concepts. Each lesson standalone and immediately applicable. Use memorable mnemonics and rules of thumb. Create quick wins and instant value. Design for 2-3 minute consumption during coffee breaks.",

  inspirational: "Ignite passion for learning and transformation. Paint vivid pictures of future possibilities: 'Imagine yourself in one year...'. Share stories of ordinary people achieving extraordinary results. Use uplifting language that sparks dreams and ambitions. Focus on unlimited potential and life-changing outcomes.",

  interactive: "Demand constant reader participation and engagement. Embed exercises directly in text: 'Before reading further, write down...'. Include self-assessments, reflection prompts, and hands-on activities. Never let reader be passive consumer. Create dialogue through anticipated questions and responses.",

  analytical: "Approach topics through data and logical analysis. Present statistics, metrics, and quantifiable evidence. Build arguments through systematic reasoning and cause-effect relationships. Use structured analytical frameworks. Break complex systems into components for detailed examination.",
};

// ============================================================================
// STYLE HELPER FUNCTIONS
// ============================================================================

/**
 * Get the prompt text for a given course style with validation
 *
 * Validates the input style and returns the corresponding prompt.
 * If the style is invalid or null, silently defaults to 'conversational'.
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
 * // Invalid style - silently defaults to conversational
 * const prompt = getStylePrompt('invalid-style');
 * // Returns: "Write as friendly dialogue..."
 *
 * @example
 * // Null/undefined - defaults to conversational
 * const prompt = getStylePrompt(null);
 * // Returns: "Write as friendly dialogue..."
 */
export function getStylePrompt(style?: string | null): string {
  // Validate and normalize style
  const result = CourseStyleSchema.safeParse(style);

  if (!result.success) {
    // Invalid style - silently default to conversational
    // Callers should validate with isValidCourseStyle() if they need to handle invalid styles explicitly
    return STYLE_PROMPTS.conversational;
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
