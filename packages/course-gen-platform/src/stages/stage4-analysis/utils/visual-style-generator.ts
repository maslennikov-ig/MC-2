/**
 * Visual Style Generator for Course Imagery
 * @module stages/stage4-analysis/utils/visual-style-generator
 *
 * Generates visual style recommendations for course cover images and promotional materials.
 * Analyzes course topic and category to suggest appropriate color schemes, aesthetics,
 * visual elements, and mood for consistent course branding.
 *
 * Uses LLM to intelligently map course content to visual design patterns:
 * - Tech/Programming → digital, blue-purple gradients, code patterns
 * - Business/Marketing → professional, orange-teal, growth charts
 * - Creative/Design → artistic, pastels, brush strokes
 * - Science → analytical, clean lines, molecules
 * - Languages → cultural, warm tones, communication symbols
 */

import { z } from 'zod';
import { logger } from '@/shared/logger';
import { llmClient } from '@/shared/llm/client';
import { DEFAULT_MODEL_ID } from '@megacampus/shared-types';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

/**
 * Visual style structure returned by generator
 */
export interface VisualStyle {
  /** Color palette description (e.g., "blue and purple gradients with cyan accents") */
  colorScheme: string;
  /** Overall aesthetic (e.g., "modern tech, digital, sleek") */
  aesthetic: string;
  /** Visual elements to include (e.g., "abstract code patterns, geometric shapes") */
  visualElements: string;
  /** Mood/tone of visuals (e.g., "professional, innovative, clean") */
  mood: string;
}

/**
 * Zod schema for validating LLM output
 */
const visualStyleSchema = z.object({
  colorScheme: z.string().min(10).max(200),
  aesthetic: z.string().min(5).max(150),
  visualElements: z.string().min(10).max(300),
  mood: z.string().min(5).max(100),
});

/**
 * Input parameters for visual style generation
 */
export interface VisualStyleParams {
  /** Course title (used for context) */
  courseTitle: string;
  /** Main course topic */
  courseTopic: string;
  /** Course language (for localized outputs) */
  language: string;
  /** Optional category hint (professional, creative, academic, etc.) */
  category?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Model for style generation */
const STYLE_MODEL = DEFAULT_MODEL_ID;

/** Max tokens for style generation */
const MAX_STYLE_TOKENS = 400;

/** Temperature for creative style outputs */
const STYLE_TEMPERATURE = 0.8;

// ============================================================================
// PROMPTS
// ============================================================================

/**
 * Build system prompt for visual style generation
 */
function buildStyleSystemPrompt(language: string): string {
  const languageName = language === 'en' ? 'English' : language === 'ru' ? 'Russian' : language;

  return `You are a creative visual designer specializing in educational content branding.

Your task is to analyze a course topic and generate appropriate visual style recommendations for course imagery (covers, promotional materials, thumbnails).

CRITICAL RULES:
1. Output MUST be valid JSON matching this exact schema:
{
  "colorScheme": "string (10-200 chars): Color palette description",
  "aesthetic": "string (5-150 chars): Overall visual style",
  "visualElements": "string (10-300 chars): Specific visual elements to include",
  "mood": "string (5-100 chars): Emotional tone of the visuals"
}

2. ALL text fields MUST be in ${languageName.toUpperCase()}
3. Base recommendations on course subject matter
4. Keep descriptions concise and actionable for designers/AI image models

STYLE MAPPING GUIDELINES:
- Tech/Programming → Digital aesthetics, blue-purple gradients, code patterns, clean geometric shapes
- Business/Finance → Professional, orange-teal palettes, growth charts, corporate minimalism
- Creative/Design → Artistic, pastel colors, brush strokes, dynamic compositions
- Science/Math → Analytical, clean lines, molecules/formulas, structured layouts
- Languages/Culture → Cultural elements, warm tones, communication symbols, diversity
- Health/Fitness → Energetic, green-blue palettes, activity illustrations, vitality
- Personal Development → Inspiring, sunrise colors, growth metaphors, aspirational
- Hobby/Leisure → Friendly, vibrant colors, playful elements, approachable style

OUTPUT LANGUAGE: ${languageName}`;
}

/**
 * Build user message for visual style generation
 */
function buildStyleUserMessage(params: VisualStyleParams): string {
  const { courseTitle, courseTopic, category } = params;

  return `Generate visual style recommendations for this course:

COURSE INFORMATION:
Title: ${courseTitle}
Topic: ${courseTopic}
${category ? `Category: ${category}` : ''}

TASK:
Analyze the course topic and generate appropriate visual style recommendations:
1. colorScheme: Describe the color palette (be specific about colors and combinations)
2. aesthetic: Define the overall visual style and design approach
3. visualElements: List specific visual elements or motifs to include
4. mood: Describe the emotional tone the visuals should convey

Respond with valid JSON only. No explanations or markdown formatting.`;
}

// ============================================================================
// FALLBACK STYLES
// ============================================================================

/**
 * Fallback visual styles based on category
 */
const FALLBACK_STYLES: Record<string, VisualStyle> = {
  professional: {
    colorScheme: 'blue and purple gradients with white accents',
    aesthetic: 'modern, professional, clean',
    visualElements: 'geometric shapes, abstract patterns, minimal icons',
    mood: 'confident, trustworthy, innovative',
  },
  creative: {
    colorScheme: 'pastel rainbow with soft gradients',
    aesthetic: 'artistic, dynamic, expressive',
    visualElements: 'brush strokes, abstract art, creative tools',
    mood: 'inspiring, imaginative, energetic',
  },
  academic: {
    colorScheme: 'navy blue and gold with white background',
    aesthetic: 'scholarly, structured, traditional',
    visualElements: 'books, academic symbols, clean typography',
    mood: 'serious, authoritative, educational',
  },
  personal: {
    colorScheme: 'warm orange and teal with soft gradients',
    aesthetic: 'friendly, approachable, motivational',
    visualElements: 'growth symbols, light metaphors, human elements',
    mood: 'uplifting, supportive, empowering',
  },
  default: {
    colorScheme: 'blue and white with subtle gradients',
    aesthetic: 'clean, modern, educational',
    visualElements: 'minimal geometric shapes, subtle patterns',
    mood: 'professional, clear, accessible',
  },
};

/**
 * Get fallback style based on category
 */
function getFallbackStyle(category?: string): VisualStyle {
  const baseStyle = category && FALLBACK_STYLES[category]
    ? FALLBACK_STYLES[category]
    : FALLBACK_STYLES.default;

  return baseStyle;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Generate visual style recommendations for a course
 *
 * Analyzes course topic and uses LLM to generate appropriate visual style.
 * Falls back to category-based defaults if LLM fails.
 *
 * @param params - Visual style generation parameters
 * @returns VisualStyle object with color scheme, aesthetic, elements, and mood
 *
 * @example
 * const style = await generateVisualStyle({
 *   courseTitle: 'Introduction to Python Programming',
 *   courseTopic: 'Python programming fundamentals',
 *   language: 'en',
 *   category: 'professional'
 * });
 * // Returns:
 * // {
 * //   colorScheme: 'blue and green gradients with dark accents',
 * //   aesthetic: 'modern tech, digital, clean',
 * //   visualElements: 'code snippets, Python logo, abstract circuits',
 * //   mood: 'professional, innovative, accessible'
 * // }
 */
export async function generateVisualStyle(
  params: VisualStyleParams
): Promise<VisualStyle> {
  const { courseTitle, courseTopic, language, category } = params;

  logger.info(
    {
      courseTitle: courseTitle.slice(0, 50),
      courseTopic: courseTopic.slice(0, 50),
      language,
      category,
    },
    'Generating visual style for course'
  );

  try {
    // Build prompts
    const systemPrompt = buildStyleSystemPrompt(language);
    const userMessage = buildStyleUserMessage(params);

    // Generate style via LLM
    const llmResponse = await llmClient.generateCompletion(userMessage, {
      model: STYLE_MODEL,
      systemPrompt,
      maxTokens: MAX_STYLE_TOKENS,
      temperature: STYLE_TEMPERATURE,
    });

    logger.debug(
      {
        inputTokens: llmResponse.inputTokens,
        outputTokens: llmResponse.outputTokens,
        model: llmResponse.model,
      },
      'Visual style LLM response received'
    );

    // Parse and validate response
    let jsonContent = llmResponse.content.trim();

    // Strip markdown code blocks if present
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonContent);
    const validationResult = visualStyleSchema.safeParse(parsed);

    if (!validationResult.success) {
      logger.warn(
        {
          errors: validationResult.error.errors,
          rawContent: jsonContent.slice(0, 200),
        },
        'Visual style validation failed, using fallback'
      );
      return getFallbackStyle(category);
    }

    const style = validationResult.data;

    logger.info(
      {
        colorScheme: style.colorScheme.slice(0, 50),
        aesthetic: style.aesthetic.slice(0, 50),
      },
      'Visual style generated successfully'
    );

    return style;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        courseTitle: courseTitle.slice(0, 50),
      },
      'Failed to generate visual style, using fallback'
    );

    return getFallbackStyle(category);
  }
}
