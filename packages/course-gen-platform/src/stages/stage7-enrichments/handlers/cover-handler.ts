/**
 * Cover Enrichment Handler
 * @module stages/stage7-enrichments/handlers/cover-handler
 *
 * Two-stage handler for lesson cover image generation.
 * Phase 1 (Draft): LLM generates 3 image prompt variants with different visual approaches
 * Phase 2 (Final): Image model generates hero banner from selected variant
 *
 * Uses OpenRouter API with bytedance-seed/seedream-4.5 model for image generation.
 */

import { z } from 'zod';
import { logger } from '@/shared/logger';
import { llmClient } from '@/shared/llm/client';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { createPromptService } from '@/shared/prompts/prompt-service';
import { DEFAULT_MODEL_ID } from '@megacampus/shared-types';
import type { CoverEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import type { EnrichmentHandler } from '../services/enrichment-router';
import type { EnrichmentHandlerInput, GenerateResult, DraftResult } from '../types';
import { generateImage, base64ToBuffer, convertToWebP } from '../services/image-generation-service';
import { getLessonContent } from '../services/database-service';

// ============================================================================
// TYPES
// ============================================================================

interface CoverPromptParams {
  lessonTitle: string;
  keywords: string[];
  courseSubject: string;
  language: 'en' | 'ru';
  styleHint?: string;
  visualStyle?: {
    colorScheme: string;
    aesthetic: string;
    visualElements: string;
    mood: string;
  };
  /** Custom prompt additions from user (regeneration or initial generation) */
  customPrompt?: string;
}

/**
 * Single cover prompt variant
 */
export interface CoverPromptVariant {
  id: number;
  prompt_en: string;
  description_localized: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Model for generating image prompts (LLM phase) */
const PROMPT_MODEL = DEFAULT_MODEL_ID;

/** Max tokens for prompt generation */
const MAX_PROMPT_TOKENS = 500;

/** Temperature for prompt generation */
const PROMPT_TEMPERATURE = 0.7;

/** Supabase Storage bucket for cover images */
const STORAGE_BUCKET = process.env.ENRICHMENTS_STORAGE_BUCKET ?? 'course-enrichments';

/**
 * Default visual style if none is configured on the course
 * Used for consistent styling across cover images when course lacks visual_style
 *
 * Style: Premium 3D Render + Cinematic lighting
 * - Professional yet visually striking
 * - Works well for B2B educational content
 * - Inspired by Apple, Notion, Linear aesthetics
 */
const DEFAULT_VISUAL_STYLE = {
  colorScheme: 'rich gradients with deep shadows and luminous highlights, vibrant accent colors',
  aesthetic: 'premium 3D render, cinematic lighting, sophisticated and polished',
  visualElements:
    'glossy 3D objects, volumetric light rays, soft reflections, depth of field blur, floating elements',
  mood: 'inspiring, professional, cutting-edge, premium quality',
};

/**
 * Style presets for user-selectable image styles
 * Maps UI style options to visual style parameters
 */
const STYLE_PRESETS: Record<string, typeof DEFAULT_VISUAL_STYLE> = {
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

/**
 * Get visual style based on user-selected style preset
 * Falls back to course visual style or default if preset not found
 */
function getStylePreset(
  styleName: string | undefined,
  courseVisualStyle: typeof DEFAULT_VISUAL_STYLE
): typeof DEFAULT_VISUAL_STYLE {
  if (styleName && STYLE_PRESETS[styleName]) {
    return STYLE_PRESETS[styleName];
  }
  return courseVisualStyle;
}

/**
 * Retry configuration for upload operations
 */
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 1000,
  BACKOFF_MULTIPLIER: 2,
} as const;

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Zod schema for cover prompt variant
 */
const coverPromptVariantSchema = z.object({
  id: z.number().int().min(1).max(3),
  prompt_en: z.string().min(20).max(800), // Increased from 500 to accommodate visual style + no-text suffix
  description_localized: z.string().min(5).max(200),
});

/**
 * Zod schema for draft variants response from LLM
 */
const coverDraftVariantsSchema = z.object({
  variants: z.array(coverPromptVariantSchema).length(3),
});

/**
 * Cover draft content structure for two-stage flow
 */
export interface CoverDraftContent {
  type: 'cover_draft';
  variants: CoverPromptVariant[];
  selected_variant?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = RETRY_CONFIG.MAX_ATTEMPTS,
  initialDelayMs: number = RETRY_CONFIG.INITIAL_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        break;
      }

      const delayMs = initialDelayMs * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt - 1);
      logger.warn({ attempt, delayMs, error: lastError.message }, 'Upload failed, retrying...');
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Alt text templates for cover images - all 19 supported languages
 */
const COVER_ALT_TEMPLATES: Record<string, string> = {
  en: 'Cover illustration for lesson:',
  ru: 'Обложка урока:',
  zh: '课程封面插图:',
  es: 'Ilustración de portada de la lección:',
  fr: 'Illustration de couverture de la leçon:',
  de: 'Titelbild der Lektion:',
  ja: 'レッスンのカバー画像:',
  ko: '수업 표지 일러스트:',
  ar: 'صورة غلاف الدرس:',
  pt: 'Ilustração de capa da lição:',
  it: 'Illustrazione di copertina della lezione:',
  tr: 'Ders kapak resmi:',
  vi: 'Hình minh họa bìa bài học:',
  th: 'ภาพปกบทเรียน:',
  id: 'Ilustrasi sampul pelajaran:',
  ms: 'Ilustrasi kulit pelajaran:',
  hi: 'पाठ के लिए कवर चित्रण:',
  bn: 'পাঠের কভার ইলাস্ট্রেশন:',
  pl: 'Ilustracja okładki lekcji:',
};

/**
 * Generate localized alt text for cover images
 */
function getLocalizedAltText(language: string, lessonTitle: string): string {
  const safeTitle = lessonTitle.slice(0, 100); // Limit length
  const template = COVER_ALT_TEMPLATES[language] ?? COVER_ALT_TEMPLATES.en;
  return `${template} ${safeTitle}`;
}

/**
 * Patterns for prohibited content in image prompts
 * Uses word boundaries to avoid false positives
 */
const PROHIBITED_PATTERNS = [
  /\bnsfw\b/i,
  /\bnude\b/i,
  /\bnaked\b/i,
  /\bexplicit\b/i,
  /\bgore\b/i,
  /\bviolence\b/i,
  /\bviolent\b/i,
  /\bblood\b/i,
  /\bbloody\b/i,
  /\bweapon\b/i,
  /\bweapons\b/i,
  /\bdeath\b/i,
  /\bkill\b/i,
] as const;

/**
 * Check if prompt contains prohibited content
 */
function containsProhibitedContent(prompt: string): boolean {
  return PROHIBITED_PATTERNS.some(pattern => pattern.test(prompt));
}

/**
 * Extract keywords from lesson content
 * Attempts to find key topics or generates from section headings
 */
function extractKeywords(lessonContent: string | null): string[] {
  if (!lessonContent) {
    return [];
  }

  // Try to find a "Key Topics" or similar section
  const keyTopicsMatch = lessonContent.match(
    /(?:## (?:Key Topics?|Main Concepts?|Topics Covered?)\s*\n)([\s\S]*?)(?=\n##|$)/i
  );

  if (keyTopicsMatch) {
    const topicsText = keyTopicsMatch[1];
    const bullets = topicsText.match(/[-*]\s+(.+)/g);
    if (bullets && bullets.length > 0) {
      return bullets.map(b => b.replace(/^[-*]\s+/, '').trim()).slice(0, 5);
    }
  }

  // Fallback: extract section headings
  const sections = lessonContent.match(/^## (.+)$/gm);
  if (sections && sections.length > 0) {
    return sections
      .map(s => s.replace(/^## /, '').trim())
      .filter(s => !s.match(/introduction|summary|conclusion|references/i))
      .slice(0, 5);
  }

  return [];
}

/**
 * Extract visual style from course data
 *
 * Retrieves the visual style from course.visual_style column,
 * falling back to course.settings.visual_style for legacy courses.
 * Uses DEFAULT_VISUAL_STYLE if no style is configured.
 *
 * @param course - Course data with visual_style and settings
 * @returns Visual style object with colorScheme, aesthetic, visualElements, mood
 */
function getVisualStyle(course: { visual_style?: unknown; settings?: unknown }): {
  colorScheme: string;
  aesthetic: string;
  visualElements: string;
  mood: string;
} {
  // First try dedicated visual_style column
  if (course.visual_style && typeof course.visual_style === 'object') {
    const vs = course.visual_style as Record<string, unknown>;
    if (vs.colorScheme && vs.aesthetic && vs.visualElements && vs.mood) {
      return {
        colorScheme: String(vs.colorScheme),
        aesthetic: String(vs.aesthetic),
        visualElements: String(vs.visualElements),
        mood: String(vs.mood),
      };
    }
  }

  // Fallback to settings.visual_style (legacy)
  if (course.settings && typeof course.settings === 'object') {
    const settings = course.settings as Record<string, unknown>;
    if (settings.visual_style && typeof settings.visual_style === 'object') {
      const vs = settings.visual_style as Record<string, unknown>;
      if (vs.colorScheme && vs.aesthetic && vs.visualElements && vs.mood) {
        return {
          colorScheme: String(vs.colorScheme),
          aesthetic: String(vs.aesthetic),
          visualElements: String(vs.visualElements),
          mood: String(vs.mood),
        };
      }
    }
  }

  return DEFAULT_VISUAL_STYLE;
}

/**
 * Extract keywords from lesson objectives
 * Primary source for keyword extraction after Stage 5 completes
 * Objectives contain rich semantic descriptions of lesson content
 */
function extractKeywordsFromObjectives(objectives: string[] | null): string[] {
  if (!objectives || objectives.length === 0) {
    return [];
  }
  // Take up to 5 objectives as keywords (they're already descriptive)
  return objectives.slice(0, 5);
}

/**
 * Default system prompt for cover generation (inline fallback)
 *
 * Style: Premium 3D Render + Cinematic lighting
 * Creates visually striking, professional covers suitable for B2B educational content
 */
function getDefaultCoverSystemPrompt(): string {
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
 *
 * Style: Premium 3D Render + Cinematic lighting
 */
function getDefaultImagePrompt(
  lessonTitle: string,
  courseSubject: string,
  visualStyle?: { colorScheme: string; aesthetic: string; visualElements: string; mood: string }
): string {
  const style = visualStyle ?? DEFAULT_VISUAL_STYLE;
  return `A stunning premium 3D rendered visualization representing "${lessonTitle}" in the context of ${courseSubject}. Cinematic lighting with dramatic shadows and volumetric light rays. ${style.colorScheme}. Glossy, polished 3D surfaces with ${style.visualElements}. Ultra-wide 16:9 format hero banner with depth of field blur and floating elements. ${style.aesthetic} quality inspired by Apple and Notion aesthetics. ${style.mood} atmosphere, absolutely no text, no letters, no words, no numbers, no writing, no typography, no inscriptions, text-free image.`;
}

/**
 * System prompt for generating 3 cover prompt variants (draft phase)
 *
 * Style: Premium 3D Render + Cinematic lighting
 * Three distinct approaches within the premium aesthetic
 */
function getVariantsSystemPrompt(language: 'en' | 'ru'): string {
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
function getVariantsUserMessage(params: CoverPromptParams): string {
  const { lessonTitle, keywords, courseSubject, language, styleHint, visualStyle, customPrompt } =
    params;
  const keywordsStr = keywords.length > 0 ? keywords.join(', ') : 'general concepts';
  const style = visualStyle ?? DEFAULT_VISUAL_STYLE;

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

  // Add user's custom instructions if provided
  if (customPrompt?.trim()) {
    message += `\n\n## Additional User Instructions (MUST be incorporated):
${customPrompt.trim()}`;
  }

  return message;
}

// ============================================================================
// DRAFT GENERATION (Phase 1)
// ============================================================================

/**
 * Generate 3 cover prompt variants using LLM (draft phase)
 *
 * This is Phase 1 of the two-stage flow. Generates 3 different image prompts
 * with unique visual approaches that can be reviewed and selected before
 * final image generation.
 *
 * @param input - Enrichment handler input with context
 * @returns Draft result with 3 prompt variants
 */
async function generateDraft(input: EnrichmentHandlerInput): Promise<DraftResult> {
  const { enrichmentContext } = input;
  const { enrichment, lesson, course } = enrichmentContext;

  const startTime = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  logger.info(
    {
      enrichmentId: enrichment.id,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
    },
    'Cover handler: generating draft prompt variants'
  );

  try {
    // Fetch lesson content from lesson_contents table (for fallback keywords)
    const lessonContent = await getLessonContent(lesson.id);

    // Priority 1: Use objectives from Stage 5 (available immediately)
    // Priority 2: Fallback to content keywords from Stage 6 (if available)
    let keywords: string[];
    let keywordSource: 'objectives' | 'content' | 'none';

    if (lesson.objectives && lesson.objectives.length > 0) {
      keywords = extractKeywordsFromObjectives(lesson.objectives);
      keywordSource = 'objectives';
      logger.debug(
        {
          enrichmentId: enrichment.id,
          keywordSource,
          keywordCount: keywords.length,
          objectivesCount: lesson.objectives.length,
        },
        'Cover handler: using objectives for keyword extraction for draft generation'
      );
    } else if (lessonContent) {
      keywords = extractKeywords(lessonContent);
      keywordSource = 'content';
      logger.debug(
        {
          enrichmentId: enrichment.id,
          keywordSource,
          keywordCount: keywords.length,
        },
        'Cover handler: objectives not available, using content for keywords for draft generation'
      );
    } else {
      keywords = [];
      keywordSource = 'none';
      logger.warn(
        {
          enrichmentId: enrichment.id,
          lessonId: lesson.id,
          hasObjectives: !!lesson.objectives,
          hasContent: !!lessonContent,
        },
        'Cover handler: no keyword sources available - using default prompt for draft generation'
      );
    }

    // Get visual style from course for consistent styling
    const courseVisualStyle = getVisualStyle(course);

    // Apply user-selected style preset if provided, otherwise use course style
    const userStyle = typeof input.settings?.style === 'string' ? input.settings.style : undefined;
    const visualStyle = getStylePreset(userStyle, courseVisualStyle);

    // Extract customPrompt from settings if provided
    const customPrompt =
      typeof input.settings?.customPrompt === 'string' ? input.settings.customPrompt : undefined;

    const promptParams: CoverPromptParams = {
      lessonTitle: lesson.title,
      keywords,
      courseSubject: course.title ?? 'Educational Content',
      language: (course.language as 'en' | 'ru') || 'en',
      visualStyle,
      customPrompt,
    };

    logger.debug(
      {
        enrichmentId: enrichment.id,
        visualStyleSource: course.visual_style
          ? 'visual_style'
          : course.settings?.visual_style
            ? 'settings'
            : 'default',
        colorScheme: visualStyle.colorScheme,
      },
      'Cover handler: using visual style for draft generation'
    );

    // Build prompts for variant generation (inline helpers)
    // TODO: Migrate to DB prompts (stage7_cover_variants_system, stage7_cover_variants_user)
    // Currently uses inline helpers because:
    // 1. Variant generation is experimental and changes frequently
    // 2. Language-specific prompt logic (ru vs en) requires dynamic interpolation
    // 3. Draft phase is internal workflow, not exposed to end users
    const systemPrompt = getVariantsSystemPrompt(promptParams.language);
    const userMessage = getVariantsUserMessage(promptParams);

    // Generate 3 variants via LLM
    const llmResponse = await llmClient.generateCompletion(userMessage, {
      model: PROMPT_MODEL,
      systemPrompt,
      maxTokens: MAX_PROMPT_TOKENS * 3, // More tokens for 3 variants
      temperature: PROMPT_TEMPERATURE,
    });

    inputTokens = llmResponse.inputTokens;
    outputTokens = llmResponse.outputTokens;

    // Parse and validate response
    let variants: CoverPromptVariant[];

    try {
      // Clean up potential markdown code blocks
      let jsonContent = llmResponse.content.trim();
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(jsonContent);
      const validationResult = coverDraftVariantsSchema.safeParse(parsed);

      if (!validationResult.success) {
        logger.warn(
          {
            enrichmentId: enrichment.id,
            errors: validationResult.error.errors,
          },
          'Cover handler: failed to validate draft variants, using fallback'
        );
        throw new Error('Validation failed');
      }

      variants = validationResult.data.variants;

      // Check for prohibited content in all variants
      for (const variant of variants) {
        if (containsProhibitedContent(variant.prompt_en)) {
          logger.warn(
            {
              enrichmentId: enrichment.id,
              variantId: variant.id,
            },
            'Cover handler: prohibited content in variant, replacing'
          );
          // Replace with default prompt using course visual style
          variant.prompt_en = getDefaultImagePrompt(
            lesson.title,
            course.title ?? 'Educational Content',
            visualStyle
          );
        }
      }
    } catch (error) {
      // Fallback: create 3 variations of default prompt
      logger.warn(
        {
          enrichmentId: enrichment.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Cover handler: failed to parse variants, using fallback defaults'
      );

      const defaultPrompt = getDefaultImagePrompt(
        lesson.title,
        course.title ?? 'Educational Content',
        visualStyle
      );

      // Create 3 simple variations using the course visual style
      variants = [
        {
          id: 1,
          prompt_en: defaultPrompt,
          description_localized:
            promptParams.language === 'ru'
              ? `Абстрактная визуализация с ${visualStyle.colorScheme}`
              : `Abstract visualization with ${visualStyle.colorScheme}`,
        },
        {
          id: 2,
          prompt_en: defaultPrompt.replace('abstract visualization', 'metaphorical illustration'),
          description_localized:
            promptParams.language === 'ru'
              ? `Иллюстративный стиль: ${visualStyle.aesthetic}`
              : `Illustrative style: ${visualStyle.aesthetic}`,
        },
        {
          id: 3,
          prompt_en: defaultPrompt.replace('abstract visualization', 'minimalist design'),
          description_localized:
            promptParams.language === 'ru'
              ? `Минималистичный дизайн: ${visualStyle.mood}`
              : `Minimalist design: ${visualStyle.mood}`,
        },
      ];
    }

    const durationMs = Date.now() - startTime;

    logger.info(
      {
        enrichmentId: enrichment.id,
        durationMs,
        tokensUsed: inputTokens + outputTokens,
        variantCount: variants.length,
      },
      'Cover handler: draft prompt variants generated'
    );

    // Build draft content
    const draftContent: CoverDraftContent = {
      type: 'cover_draft',
      variants,
      // selected_variant will be set by user in frontend
    };

    return {
      draftContent,
      metadata: {
        durationMs,
        tokensUsed: inputTokens + outputTokens,
        modelUsed: PROMPT_MODEL,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        enrichmentId: enrichment.id,
        lessonId: lesson.id,
        durationMs,
        error: errorMessage,
      },
      'Cover handler: draft generation failed'
    );

    throw new Error(`Cover draft generation failed: ${errorMessage}`);
  }
}

// ============================================================================
// DIRECT GENERATION (Single-stage fallback)
// ============================================================================

/**
 * Generate a lesson cover image directly (single-stage fallback)
 *
 * Used when two-stage flow is bypassed. Generates a single prompt and
 * immediately creates the image.
 */
async function generate(input: EnrichmentHandlerInput): Promise<GenerateResult> {
  const { enrichmentContext } = input;
  const { enrichment, lesson, course } = enrichmentContext;

  const startTime = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let imageCostUsd = 0;

  logger.info(
    {
      enrichmentId: enrichment.id,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
    },
    'Cover handler: starting cover generation'
  );

  try {
    // Fetch lesson content from lesson_contents table (for fallback keywords)
    const lessonContent = await getLessonContent(lesson.id);

    // Phase 1: Generate image prompt using LLM with DB prompts
    // Priority 1: Use objectives from Stage 5 (available immediately)
    // Priority 2: Fallback to content keywords from Stage 6 (if available)
    let keywords: string[];
    let keywordSource: 'objectives' | 'content' | 'none';

    if (lesson.objectives && lesson.objectives.length > 0) {
      keywords = extractKeywordsFromObjectives(lesson.objectives);
      keywordSource = 'objectives';
      logger.debug(
        {
          enrichmentId: enrichment.id,
          keywordSource,
          keywordCount: keywords.length,
          objectivesCount: lesson.objectives.length,
        },
        'Cover handler: using objectives for keyword extraction for generation'
      );
    } else if (lessonContent) {
      keywords = extractKeywords(lessonContent);
      keywordSource = 'content';
      logger.debug(
        {
          enrichmentId: enrichment.id,
          keywordSource,
          keywordCount: keywords.length,
        },
        'Cover handler: objectives not available, using content for keywords for generation'
      );
    } else {
      keywords = [];
      keywordSource = 'none';
      logger.warn(
        {
          enrichmentId: enrichment.id,
          lessonId: lesson.id,
          hasObjectives: !!lesson.objectives,
          hasContent: !!lessonContent,
        },
        'Cover handler: no keyword sources available - using default prompt for generation'
      );
    }

    const promptService = createPromptService();

    const language = (course.language as 'en' | 'ru') || 'en';
    const languageContext =
      language === 'ru' ? 'Russian educational content' : 'English educational content';

    // Get visual style from course for consistent styling
    const courseVisualStyle = getVisualStyle(course);

    // Apply user-selected style preset if provided, otherwise use course style
    const userStyle = typeof input.settings?.style === 'string' ? input.settings.style : undefined;
    const visualStyle = getStylePreset(userStyle, courseVisualStyle);

    logger.debug(
      {
        enrichmentId: enrichment.id,
        visualStyleSource: userStyle
          ? `preset:${userStyle}`
          : course.visual_style
            ? 'visual_style'
            : course.settings?.visual_style
              ? 'settings'
              : 'default',
        colorScheme: visualStyle.colorScheme,
      },
      'Cover handler: using visual style for generation'
    );

    let imagePrompt: string;

    // Step 1: Load prompts from database (with fallback)
    let systemPrompt: string;
    let userMessage: string;

    try {
      const systemPromptResult = await promptService.getPrompt('stage7_cover_system');
      systemPrompt = systemPromptResult?.promptTemplate ?? getDefaultCoverSystemPrompt();

      userMessage = await promptService.renderPrompt('stage7_cover_user', {
        lessonTitle: lesson.title,
        courseSubject: course.title ?? 'Educational Content',
        keywords: keywords.length > 0 ? keywords.join(', ') : 'general concepts',
        languageContext,
        styleHint: '', // Optional, leave empty
        // Pass visual style for consistent course styling
        colorScheme: visualStyle.colorScheme,
        aesthetic: visualStyle.aesthetic,
        visualElements: visualStyle.visualElements,
        mood: visualStyle.mood,
      });
    } catch (dbError) {
      logger.warn(
        {
          enrichmentId: enrichment.id,
          error: dbError instanceof Error ? dbError.message : 'Unknown error',
        },
        'Cover handler: DB prompt lookup failed, using hardcoded fallback'
      );
      systemPrompt = getDefaultCoverSystemPrompt();
      userMessage = `Generate an image prompt for a lesson cover:\nLesson: ${lesson.title}\nCourse: ${course.title ?? 'Educational Content'}\nTopics: ${keywords.join(', ') || 'general concepts'}\n\nVisual Style:\n- Color Scheme: ${visualStyle.colorScheme}\n- Aesthetic: ${visualStyle.aesthetic}\n- Visual Elements: ${visualStyle.visualElements}\n- Mood: ${visualStyle.mood}`;
    }

    // Append custom prompt from user settings if provided
    const customPrompt =
      typeof input.settings?.customPrompt === 'string' ? input.settings.customPrompt : undefined;

    if (customPrompt?.trim()) {
      userMessage += `\n\n## Additional User Instructions (MUST be incorporated):\n${customPrompt.trim()}`;
      logger.debug(
        { enrichmentId: enrichment.id, customPromptLength: customPrompt.length },
        'Cover handler: adding custom prompt to generation'
      );
    }

    // Step 2: Call LLM (separate error handling)
    try {
      const llmResponse = await llmClient.generateCompletion(userMessage, {
        model: PROMPT_MODEL,
        systemPrompt,
        maxTokens: MAX_PROMPT_TOKENS,
        temperature: PROMPT_TEMPERATURE,
      });

      imagePrompt = llmResponse.content.trim();
      inputTokens = llmResponse.inputTokens;
      outputTokens = llmResponse.outputTokens;

      // Validate prompt length (800 to accommodate visual style + no-text suffix)
      const MIN_PROMPT_LENGTH = 20;
      const MAX_PROMPT_LENGTH = 800;

      if (imagePrompt.length < MIN_PROMPT_LENGTH || imagePrompt.length > MAX_PROMPT_LENGTH) {
        logger.warn(
          {
            enrichmentId: enrichment.id,
            promptLength: imagePrompt.length,
            min: MIN_PROMPT_LENGTH,
            max: MAX_PROMPT_LENGTH,
          },
          'Cover handler: invalid prompt length, using default'
        );
        imagePrompt = getDefaultImagePrompt(
          lesson.title,
          course.title ?? 'Educational Content',
          visualStyle
        );
      }

      // Check for prohibited content
      if (containsProhibitedContent(imagePrompt)) {
        logger.warn(
          { enrichmentId: enrichment.id },
          'Cover handler: prohibited content detected in LLM-generated prompt, using default'
        );
        imagePrompt = getDefaultImagePrompt(
          lesson.title,
          course.title ?? 'Educational Content',
          visualStyle
        );
      }

      logger.info(
        {
          enrichmentId: enrichment.id,
          promptLength: imagePrompt.length,
          inputTokens,
          outputTokens,
        },
        'Cover handler: image prompt generated'
      );
    } catch (llmError) {
      logger.warn(
        {
          enrichmentId: enrichment.id,
          error: llmError instanceof Error ? llmError.message : 'Unknown error',
        },
        'Cover handler: LLM generation failed, using default prompt'
      );
      imagePrompt = getDefaultImagePrompt(
        lesson.title,
        course.title ?? 'Educational Content',
        visualStyle
      );
    }

    // Phase 2: Generate image
    const imageResult = await generateImage(imagePrompt);
    imageCostUsd = imageResult.costUsd;

    logger.info(
      {
        enrichmentId: enrichment.id,
        mimeType: imageResult.mimeType,
        costUsd: imageCostUsd,
      },
      'Cover handler: image generated'
    );

    // Phase 3: Convert to WebP for smaller file size
    const originalBuffer = base64ToBuffer(imageResult.base64Data);
    const webpResult = await convertToWebP(originalBuffer, 85);

    logger.info(
      {
        enrichmentId: enrichment.id,
        originalSize: webpResult.originalSizeBytes,
        webpSize: webpResult.sizeBytes,
        savedBytes: webpResult.originalSizeBytes - webpResult.sizeBytes,
        compressionRatio: webpResult.compressionRatio.toFixed(2),
      },
      'Cover handler: converted to WebP'
    );

    // Phase 4: Upload to Supabase Storage with retry
    const supabase = getSupabaseAdmin();
    const storagePath = `${course.id}/${lesson.id}/${enrichment.id}.webp`;

    // Retry upload up to 3 times with exponential backoff
    await retryWithBackoff(
      async () => {
        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, webpResult.buffer, {
            contentType: 'image/webp',
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Failed to upload image: ${uploadError.message}`);
        }
      },
      3,
      1000
    );

    // Get public URL
    const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

    const imageUrl = publicUrlData.publicUrl;

    logger.info(
      {
        enrichmentId: enrichment.id,
        storagePath,
        imageUrl,
      },
      'Cover handler: image uploaded'
    );

    // Phase 5: Build result
    const durationMs = Date.now() - startTime;

    const content: CoverEnrichmentContent = {
      type: 'cover',
      imageUrl,
      dimensions: {
        width: imageResult.width,
        height: imageResult.height,
      },
      aspectRatio: '16:9',
      generation_prompt: imagePrompt,
      altText: getLocalizedAltText(course.language ?? 'en', lesson.title),
      format: 'webp',
      file_size_bytes: webpResult.sizeBytes,
    };

    const metadata: EnrichmentMetadata = {
      generated_at: new Date().toISOString(),
      generation_duration_ms: durationMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      estimated_cost_usd: imageCostUsd + (inputTokens + outputTokens) * 0.000001, // Approximate LLM cost
      model_used: imageResult.modelUsed,
      quality_score: 1.0, // No quality scoring for images
      retry_attempts: enrichment.generation_attempt,
    };

    logger.info(
      {
        enrichmentId: enrichment.id,
        durationMs,
        totalCostUsd: metadata.estimated_cost_usd,
      },
      'Cover handler: cover generation complete'
    );

    return { content, metadata };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        enrichmentId: enrichment.id,
        lessonId: lesson.id,
        durationMs,
        error: errorMessage,
      },
      'Cover handler: generation failed'
    );

    throw new Error(`Cover generation failed: ${errorMessage}`);
  }
}

// ============================================================================
// FINAL GENERATION (Phase 2)
// ============================================================================

/**
 * Convert approved draft with selected variant to final cover image
 *
 * This is Phase 2 of the two-stage flow. Takes the selected prompt variant
 * from the approved draft and generates the final cover image.
 *
 * @param input - Enrichment handler input
 * @param draft - Approved draft result from Phase 1 with selected variant
 * @returns Generate result with cover image and metadata
 */
async function generateFinal(
  input: EnrichmentHandlerInput,
  draft: DraftResult
): Promise<GenerateResult> {
  const { enrichmentContext } = input;
  const { enrichment, lesson, course } = enrichmentContext;

  const startTime = Date.now();
  let imageCostUsd = 0;

  logger.info(
    {
      enrichmentId: enrichment.id,
      lessonId: lesson.id,
    },
    'Cover handler: generating final image from selected variant'
  );

  try {
    // Extract draft content
    const draftContent = draft.draftContent as CoverDraftContent;

    if (!draftContent.selected_variant) {
      throw new Error('No variant selected in draft content');
    }

    // Find the selected variant
    const selectedVariant = draftContent.variants.find(v => v.id === draftContent.selected_variant);

    if (!selectedVariant) {
      throw new Error(`Selected variant ${draftContent.selected_variant} not found in draft`);
    }

    const imagePrompt = selectedVariant.prompt_en;

    logger.info(
      {
        enrichmentId: enrichment.id,
        variantId: selectedVariant.id,
        promptLength: imagePrompt.length,
      },
      'Cover handler: using selected variant for image generation'
    );

    // Phase 1: Generate image from selected prompt
    const imageResult = await generateImage(imagePrompt);
    imageCostUsd = imageResult.costUsd;

    logger.info(
      {
        enrichmentId: enrichment.id,
        mimeType: imageResult.mimeType,
        costUsd: imageCostUsd,
      },
      'Cover handler: image generated from variant'
    );

    // Phase 2: Convert to WebP for smaller file size
    const originalBuffer = base64ToBuffer(imageResult.base64Data);
    const webpResult = await convertToWebP(originalBuffer, 85);

    logger.info(
      {
        enrichmentId: enrichment.id,
        originalSize: webpResult.originalSizeBytes,
        webpSize: webpResult.sizeBytes,
        savedBytes: webpResult.originalSizeBytes - webpResult.sizeBytes,
        compressionRatio: webpResult.compressionRatio.toFixed(2),
      },
      'Cover handler: converted to WebP'
    );

    // Phase 3: Upload to Supabase Storage with retry
    const supabase = getSupabaseAdmin();
    const storagePath = `${course.id}/${lesson.id}/${enrichment.id}.webp`;

    // Retry upload up to 3 times with exponential backoff
    await retryWithBackoff(
      async () => {
        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, webpResult.buffer, {
            contentType: 'image/webp',
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Failed to upload image: ${uploadError.message}`);
        }
      },
      3,
      1000
    );

    // Get public URL
    const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

    const imageUrl = publicUrlData.publicUrl;

    logger.info(
      {
        enrichmentId: enrichment.id,
        storagePath,
        imageUrl,
      },
      'Cover handler: image uploaded'
    );

    // Phase 4: Build result
    const durationMs = Date.now() - startTime;
    const totalDurationMs = (draft.metadata.durationMs || 0) + durationMs;

    const content: CoverEnrichmentContent = {
      type: 'cover',
      imageUrl,
      dimensions: {
        width: imageResult.width,
        height: imageResult.height,
      },
      aspectRatio: '16:9',
      generation_prompt: imagePrompt,
      altText: getLocalizedAltText(course.language ?? 'en', lesson.title),
      format: 'webp',
      file_size_bytes: webpResult.sizeBytes,
    };

    const metadata: EnrichmentMetadata = {
      generated_at: new Date().toISOString(),
      generation_duration_ms: totalDurationMs,
      input_tokens: draft.metadata.tokensUsed ?? 0,
      output_tokens: 0, // Image generation doesn't produce tokens
      total_tokens: draft.metadata.tokensUsed ?? 0,
      estimated_cost_usd: imageCostUsd + (draft.metadata.tokensUsed ?? 0) * 0.000001,
      model_used: imageResult.modelUsed,
      quality_score: 1.0, // No quality scoring for images
      retry_attempts: enrichment.generation_attempt,
      additional_info: {
        selected_variant_id: selectedVariant.id,
        variant_description: selectedVariant.description_localized,
      },
    };

    logger.info(
      {
        enrichmentId: enrichment.id,
        durationMs,
        totalDurationMs,
        totalCostUsd: metadata.estimated_cost_usd,
      },
      'Cover handler: final cover generation complete'
    );

    return { content, metadata };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        enrichmentId: enrichment.id,
        lessonId: lesson.id,
        durationMs,
        error: errorMessage,
      },
      'Cover handler: final generation failed'
    );

    throw new Error(`Cover final generation failed: ${errorMessage}`);
  }
}

// ============================================================================
// HANDLER EXPORT
// ============================================================================

/**
 * Cover enrichment handler implementing two-stage flow
 *
 * Stage 1 (Draft): Generate 3 image prompt variants using LLM
 * Stage 2 (Final): Generate cover image from selected variant
 *
 * The handler follows the presentation-handler pattern for two-stage generation.
 */
export const coverHandler: EnrichmentHandler = {
  generationFlow: 'two-stage',
  generateDraft,
  generate,
  generateFinal,
};
