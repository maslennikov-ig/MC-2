/**
 * Cover Handler Prompt Templates
 * @module stages/stage7-enrichments/handlers/cover-handler-prompts
 *
 * Long-form prompt templates used for cover image generation.
 * Separated to keep cover-handler-helpers.ts within the max-lines limit.
 */

import { DEFAULT_COVER_VISUAL_STYLE, type VisualStyle } from '../services/enrichment-utils';

// ============================================================================
// TYPES
// ============================================================================

export interface CoverPromptParams {
  lessonTitle: string;
  keywords: string[];
  courseSubject: string;
  language: 'en' | 'ru';
  styleHint?: string;
  visualStyle?: VisualStyle;
  /** Custom prompt additions from user (regeneration or initial generation) */
  customPrompt?: string;
}

// ============================================================================
// STYLE PRESETS
// ============================================================================

/**
 * Style presets for user-selectable image styles
 * Maps UI style options to visual style parameters
 */
export const STYLE_PRESETS: Record<string, VisualStyle> = {
  premium3d: {
    colorScheme: 'rich gradients with deep shadows and luminous highlights, vibrant accent colors',
    aesthetic: 'premium 3D render, cinematic lighting, sophisticated and polished',
    visualElements:
      'glossy 3D objects, volumetric light rays, soft reflections, depth of field blur, floating elements',
    mood: 'inspiring, professional, cutting-edge, premium quality',
  },
  realistic: {
    colorScheme: 'natural colors with realistic lighting and shadows',
    aesthetic: 'photorealistic, high-detail rendering, lifelike textures',
    visualElements:
      'realistic objects, natural materials, detailed surfaces, environmental lighting',
    mood: 'authentic, trustworthy, grounded, professional',
  },
  abstract: {
    colorScheme: 'bold gradients with contrasting accent colors',
    aesthetic: 'modern abstract art, flowing shapes, artistic interpretation',
    visualElements: 'geometric patterns, flowing curves, color blends, artistic compositions',
    mood: 'creative, innovative, conceptual, artistic',
  },
  minimalist: {
    colorScheme: 'clean monochromatic or duo-tone palette with subtle gradients',
    aesthetic: 'minimal design, clean lines, elegant simplicity',
    visualElements: 'simple shapes, negative space, subtle shadows, refined details',
    mood: 'calm, focused, sophisticated, clean',
  },
  dramatic: {
    colorScheme: 'high contrast with deep darks and bright highlights, dramatic color accents',
    aesthetic: 'cinematic drama, moody lighting, intense atmosphere',
    visualElements: 'dramatic shadows, rim lighting, atmospheric effects, bold contrasts',
    mood: 'powerful, intense, captivating, bold',
  },
};

// ============================================================================
// DEFAULT PROMPTS
// ============================================================================

/**
 * Default system prompt for cover generation (inline fallback)
 */
export function getDefaultCoverSystemPrompt(): string {
  return `# Role
You are an expert prompt engineer specializing in AI image generation for premium educational content.
Your task is to create optimized prompts for generating stunning lesson cover images (hero banners).

# Output Requirements
Generate a single, detailed image prompt that will produce:
- A visually striking, premium-quality hero banner
- Cinematic lighting with dramatic depth and atmosphere
- 3D rendered aesthetic with glossy surfaces and volumetric effects
- Professional yet eye-catching imagery suitable for B2B education

# CRITICAL: No Text Requirement
IMPORTANT: The image MUST NOT contain ANY text, words, letters, numbers, characters, typography, writing, or inscriptions in ANY language.
Always include in your prompt: "absolutely no text, no letters, no words, no numbers, no writing, no typography, no inscriptions, text-free image"
Also avoid: logos, watermarks, signatures, labels, captions, titles, and human faces.

# Style Guidelines - Premium 3D Cinematic
- IMPORTANT: Use the provided visual style (color scheme, aesthetic, visual elements) from the course
- Create stunning 3D rendered scenes with glossy, polished surfaces
- Use cinematic lighting: dramatic shadows, volumetric light rays, lens flares
- Add depth through: depth of field blur, floating elements, layered composition
- Rich color gradients with luminous highlights and deep shadows
- Inspired by Apple, Notion, Linear, Stripe visual aesthetics
- Premium, sophisticated feel - not cartoonish or flat
- Ensure the image works well as a wide banner (16:9 aspect ratio)
- Leave visual breathing room for potential title overlay

# Format
Return ONLY the image prompt text (2-3 sentences, 50-80 words).
Do not include any explanation, preamble, or commentary - just the prompt itself.
ALWAYS end your prompt with: ", absolutely no text, no letters, no words, no typography, text-free image"`;
}

/**
 * Default fallback prompt if LLM/DB fails to generate one
 */
export function getDefaultImagePrompt(
  lessonTitle: string,
  courseSubject: string,
  visualStyle?: VisualStyle
): string {
  const style = visualStyle ?? DEFAULT_COVER_VISUAL_STYLE;
  return `A stunning premium 3D rendered visualization representing "${lessonTitle}" in the context of ${courseSubject}. Cinematic lighting with dramatic shadows and volumetric light rays. ${style.colorScheme}. Glossy, polished 3D surfaces with ${style.visualElements}. Ultra-wide 16:9 format hero banner with depth of field blur and floating elements. ${style.aesthetic} quality inspired by Apple and Notion aesthetics. ${style.mood} atmosphere, absolutely no text, no letters, no words, no numbers, no writing, no typography, no inscriptions, text-free image.`;
}

// ============================================================================
// DRAFT VARIANT PROMPTS
// ============================================================================

/**
 * System prompt for generating 3 cover prompt variants (draft phase)
 */
export function getVariantsSystemPrompt(language: 'en' | 'ru'): string {
  const descriptionLanguage = language === 'ru' ? 'Russian' : 'English';
  const descriptionExample1 =
    language === 'ru'
      ? 'Кинематографичная 3D сцена с драматичным освещением'
      : 'Cinematic 3D scene with dramatic lighting';
  const descriptionExample2 =
    language === 'ru'
      ? 'Футуристичные глянцевые объекты с неоновым свечением'
      : 'Futuristic glossy objects with neon glow';
  const descriptionExample3 =
    language === 'ru'
      ? 'Элегантная композиция с мягкими градиентами и глубиной'
      : 'Elegant composition with soft gradients and depth';

  return `# Role
You are an expert prompt engineer specializing in AI image generation for premium B2B educational content.
Your task is to create 3 stunning image prompt variants for a lesson cover image (hero banner).

# Output Requirements
Generate exactly 3 distinct image prompts, each with a unique visual approach within PREMIUM 3D CINEMATIC style:

1. **Cinematic Drama**: Epic 3D scene with dramatic lighting, deep shadows, volumetric rays, movie-poster quality
2. **Futuristic Tech**: Glossy 3D objects, neon accents, holographic effects, sci-fi inspired, high-tech feel
3. **Elegant Depth**: Sophisticated 3D composition, soft gradients, floating elements, depth of field, refined luxury

Each prompt MUST produce:
- Premium-quality, visually stunning hero banner
- 3D rendered aesthetic with polished, glossy surfaces
- Cinematic lighting with depth and atmosphere
- Professional yet eye-catching imagery (Apple/Notion/Linear quality)
- NOT flat, NOT cartoonish, NOT simple geometric shapes

# CRITICAL: No Text Requirement
IMPORTANT: All images MUST NOT contain ANY text, words, letters, numbers, characters, typography, writing, or inscriptions in ANY language.
Every prompt MUST end with: ", absolutely no text, no letters, no words, no numbers, no writing, no typography, no inscriptions, text-free image"
Also avoid: logos, watermarks, signatures, labels, captions, titles, and human faces.

# Style Guidelines - Premium 3D Cinematic
- Create stunning 3D rendered scenes, NOT flat illustrations
- Use cinematic lighting: dramatic shadows, volumetric light, lens effects
- Rich color gradients with luminous highlights and deep shadows
- Add depth through: blur effects, floating elements, layered composition
- Glossy, polished surfaces with reflections
- Inspired by Apple keynotes, Notion templates, Linear app, Stripe visuals
- Premium, sophisticated, cutting-edge feel
- Works well as wide banner (16:9 aspect ratio)
- Leave breathing room for potential title overlay

# Format
Return ONLY valid JSON. No markdown code blocks.
Start with { and end with }.

{
  "variants": [
    {
      "id": 1,
      "prompt_en": "Cinematic 3D prompt here (50-80 words)..., absolutely no text, no letters, no words, no typography, text-free image",
      "description_localized": "${descriptionExample1}"
    },
    {
      "id": 2,
      "prompt_en": "Futuristic tech 3D prompt here (50-80 words)..., absolutely no text, no letters, no words, no typography, text-free image",
      "description_localized": "${descriptionExample2}"
    },
    {
      "id": 3,
      "prompt_en": "Elegant depth 3D prompt here (50-80 words)..., absolutely no text, no letters, no words, no typography, text-free image",
      "description_localized": "${descriptionExample3}"
    }
  ]
}

# Critical Rules
- Generate EXACTLY 3 variants
- ALL variants must be premium 3D cinematic style (not flat/geometric)
- Each prompt must be unique with different mood within the premium aesthetic
- All prompts in English (prompt_en)
- All descriptions in ${descriptionLanguage} (description_localized)
- Each prompt must end with the no-text requirement
- Each description should be 5-15 words explaining the visual approach
- Return ONLY raw JSON (no markdown code blocks)`;
}

/**
 * User message for generating 3 cover prompt variants (draft phase)
 */
export function getVariantsUserMessage(params: CoverPromptParams): string {
  const { lessonTitle, keywords, courseSubject, language, styleHint, visualStyle, customPrompt } =
    params;
  const keywordsStr = keywords.length > 0 ? keywords.join(', ') : 'general concepts';
  const style = visualStyle ?? DEFAULT_COVER_VISUAL_STYLE;

  let message = `Generate 3 different image prompt variants for a lesson cover with the following context:

Lesson Title: ${lessonTitle}
Course Subject: ${courseSubject}
Key Topics: ${keywordsStr}
Language Context: ${language === 'ru' ? 'Russian educational content' : 'English educational content'}
${styleHint ? `Style Preference: ${styleHint}` : ''}

## Visual Style (MUST be incorporated in all variants):
- Color Scheme: ${style.colorScheme}
- Aesthetic: ${style.aesthetic}
- Visual Elements: ${style.visualElements}
- Mood: ${style.mood}

Create 3 distinct prompts for 16:9 hero banner images, each with a unique visual approach while maintaining the course visual style.`;

  if (customPrompt?.trim()) {
    message += `\n\n## Additional User Instructions (MUST be incorporated):
${customPrompt.trim()}`;
  }

  return message;
}

/**
 * Build fallback user message when DB prompt lookup fails.
 */
export function buildFallbackUserMessage(
  lessonTitle: string,
  courseTitle: string,
  keywords: string[],
  visualStyle: VisualStyle
): string {
  return `Generate an image prompt for a lesson cover:\nLesson: ${lessonTitle}\nCourse: ${courseTitle}\nTopics: ${keywords.join(', ') || 'general concepts'}\n\nVisual Style:\n- Color Scheme: ${visualStyle.colorScheme}\n- Aesthetic: ${visualStyle.aesthetic}\n- Visual Elements: ${visualStyle.visualElements}\n- Mood: ${visualStyle.mood}`;
}
