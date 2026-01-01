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

/**
 * Single cover prompt variant
 */
export interface CoverPromptVariant {
  /** Variant index (1-3) */
  id: number;
  /** Image generation prompt in English */
  prompt_en: string;
  /** Localized description of the visual approach */
  description_localized: string;
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
- Modern, high-quality digital art style

# CRITICAL: No Text Requirement
IMPORTANT: The image MUST NOT contain ANY text, words, letters, numbers, characters, typography, writing, or inscriptions in ANY language.
Always include in your prompt: "absolutely no text, no letters, no words, no numbers, no writing, no typography, no inscriptions, text-free image"
Also avoid: logos, watermarks, signatures, labels, captions, titles, and human faces.

# Style Guidelines
- Use rich, vibrant colors that convey the subject matter
- Create depth and visual interest through composition
- Avoid literal depictions - prefer abstract/conceptual representations
- Ensure the image works well as a wide banner (16:9 aspect ratio)
- Consider how a title might be overlaid (leave visual breathing room)
- Use clean geometric shapes, gradients, and modern design elements

# Format
Return ONLY the image prompt text (1-3 sentences, 50-100 words).
Do not include any explanation, preamble, or commentary - just the prompt itself.
ALWAYS end your prompt with: ", absolutely no text, no letters, no words, no typography, text-free image"`;
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
 * System prompt for LLM to generate 3 different image prompt variants (draft phase)
 */
export function buildCoverPromptVariantsSystemPrompt(language: 'en' | 'ru'): string {
  const descriptionLanguage = language === 'ru' ? 'Russian' : 'English';
  const descriptionExample = language === 'ru'
    ? 'Абстрактная визуализация с геометрическими формами'
    : 'Abstract visualization with geometric shapes';

  return `# Role
You are an expert prompt engineer specializing in AI image generation for educational content.
Your task is to create 3 different image prompt variants for a lesson cover image (hero banner).

# Output Requirements
Generate exactly 3 distinct image prompts, each with a unique visual approach:
1. **Abstract/Conceptual**: Focus on abstract shapes, gradients, and symbolic representation
2. **Illustrative**: Use metaphorical imagery and visual storytelling
3. **Minimalist/Modern**: Clean, simple design with bold colors and minimal elements

Each prompt should produce:
- A visually striking hero banner suitable for educational content
- Professional, clean aesthetic appropriate for online learning
- Different visual style from other variants
- Modern, high-quality digital art style

# CRITICAL: No Text Requirement
IMPORTANT: All images MUST NOT contain ANY text, words, letters, numbers, characters, typography, writing, or inscriptions in ANY language.
Every prompt MUST end with: ", absolutely no text, no letters, no words, no numbers, no writing, no typography, no inscriptions, text-free image"
Also avoid: logos, watermarks, signatures, labels, captions, titles, and human faces.

# Style Guidelines
- Use rich, vibrant colors that convey the subject matter
- Create depth and visual interest through composition
- Avoid literal depictions - prefer abstract/conceptual representations
- Ensure the image works well as a wide banner (16:9 aspect ratio)
- Consider how a title might be overlaid (leave visual breathing room)
- Each variant should have a distinctly different mood and visual approach

# Format
Return ONLY valid JSON. No markdown code blocks.
Start with { and end with }.

{
  "variants": [
    {
      "id": 1,
      "prompt_en": "First image prompt here (50-100 words), absolutely no text, no letters, no words, no typography, text-free image",
      "description_localized": "${descriptionExample}"
    },
    {
      "id": 2,
      "prompt_en": "Second image prompt here (50-100 words), absolutely no text, no letters, no words, no typography, text-free image",
      "description_localized": "${descriptionExample}"
    },
    {
      "id": 3,
      "prompt_en": "Third image prompt here (50-100 words), absolutely no text, no letters, no words, no typography, text-free image",
      "description_localized": "${descriptionExample}"
    }
  ]
}

# Critical Rules
- Generate EXACTLY 3 variants
- Each prompt must be unique with different visual approach
- All prompts in English (prompt_en)
- All descriptions in ${descriptionLanguage} (description_localized)
- Each prompt must end with the no-text requirement
- Each description should be 5-15 words explaining the visual style
- Return ONLY raw JSON (no markdown code blocks)`;
}

/**
 * Build user message for cover prompt variants generation (draft phase)
 */
export function buildCoverPromptVariantsUserMessage(params: CoverPromptParams): string {
  const { lessonTitle, keywords, courseSubject, language, styleHint } = params;

  const keywordsStr = keywords.length > 0 ? keywords.join(', ') : 'general concepts';

  return `Generate 3 different image prompt variants for a lesson cover with the following context:

Lesson Title: ${lessonTitle}
Course Subject: ${courseSubject}
Key Topics: ${keywordsStr}
Language Context: ${language === 'ru' ? 'Russian educational content' : 'English educational content'}
${styleHint ? `Style Preference: ${styleHint}` : ''}

Create 3 distinct prompts for 16:9 hero banner images, each with a unique visual approach.`;
}

/**
 * Default fallback prompt if LLM fails to generate one
 */
export function getDefaultImagePrompt(lessonTitle: string, courseSubject: string): string {
  return `A stunning abstract visualization representing "${lessonTitle}" in the context of ${courseSubject}. Modern digital art style with flowing gradients in professional blue and purple tones. Clean geometric shapes creating depth and movement. Ultra-wide 16:9 format, suitable as an educational hero banner. Clean professional aesthetic, absolutely no text, no letters, no words, no numbers, no writing, no typography, no inscriptions, text-free image.`;
}
