/**
 * Cover Image Prompt Templates
 * @module stages/stage7-enrichments/prompts/cover-prompt
 *
 * Builds optimized prompts for lesson cover image generation.
 * Two-phase approach: LLM generates detailed image prompt,
 * then image model creates the visual.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CoverPromptParams {
  /** Lesson title */
  lessonTitle: string;
  /** Lesson keywords/key concepts */
  keywords: string[];
  /** Course subject area */
  courseSubject: string;
  /** Target language (for text considerations) */
  language: 'en' | 'ru';
  /** Optional custom style preference */
  styleHint?: string;
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

/**
 * System prompt for LLM to generate image prompts
 */
export function buildCoverPromptSystemPrompt(): string {
  return `# Role
You are an expert prompt engineer specializing in AI image generation for educational content.
Your task is to create optimized prompts for generating lesson cover images (hero banners).

# Output Requirements
Generate a single, detailed image prompt that will produce:
- A visually striking hero banner suitable for educational content
- Professional, clean aesthetic appropriate for online learning
- Abstract or symbolic representation of the lesson topic
- NO text, logos, watermarks, or human faces in the image
- Modern, high-quality digital art style

# Style Guidelines
- Use rich, vibrant colors that convey the subject matter
- Create depth and visual interest through composition
- Avoid literal depictions - prefer abstract/conceptual representations
- Ensure the image works well as a wide banner (16:9 aspect ratio)
- Consider how a title might be overlaid (leave visual breathing room)
- Use clean geometric shapes, gradients, and modern design elements

# Format
Return ONLY the image prompt text (1-3 sentences, 50-100 words).
Do not include any explanation, preamble, or commentary - just the prompt itself.`;
}

/**
 * Build user message for cover prompt generation
 */
export function buildCoverPromptUserMessage(params: CoverPromptParams): string {
  const { lessonTitle, keywords, courseSubject, language, styleHint } = params;

  const keywordsStr = keywords.length > 0 ? keywords.join(', ') : 'general concepts';

  return `Generate an image prompt for a lesson cover with the following context:

Lesson Title: ${lessonTitle}
Course Subject: ${courseSubject}
Key Topics: ${keywordsStr}
Language Context: ${language === 'ru' ? 'Russian educational content' : 'English educational content'}
${styleHint ? `Style Preference: ${styleHint}` : ''}

Create a prompt for a 16:9 hero banner image that visually represents this lesson topic.`;
}

/**
 * Default fallback prompt if LLM fails to generate one
 */
export function getDefaultImagePrompt(lessonTitle: string, courseSubject: string): string {
  return `A stunning abstract visualization representing "${lessonTitle}" in the context of ${courseSubject}. Modern digital art style with flowing gradients in professional blue and purple tones. Clean geometric shapes creating depth and movement. Ultra-wide 16:9 format, suitable as an educational hero banner. No text, no faces, clean professional aesthetic.`;
}
