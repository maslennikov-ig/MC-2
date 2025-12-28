/**
 * Video Script Prompt Templates
 * @module stages/stage7-enrichments/prompts/video-prompt
 *
 * Implements video script generation for Stage 7 lesson enrichments.
 * Uses a two-stage flow:
 * - Phase 1 (Draft): Generate video script with narration structure
 * - Phase 2 (Final): Generate final video metadata (stub for now)
 *
 * The script includes intro, sections with narration, and conclusion.
 * Visual suggestions are provided for future video generation with slides/avatars.
 *
 * Token budget: ~1000 tokens (system) + content tokens
 * Expected output: ~1500-3000 tokens (JSON response with script structure)
 */

import { z } from 'zod';

/**
 * Language-specific token multipliers
 * Non-Latin scripts use more tokens per character
 */
const TOKEN_MULTIPLIERS: Record<string, number> = {
  en: 1.0, // Baseline - Latin script
  ru: 1.33, // Cyrillic
  zh: 2.67, // Chinese
  ja: 2.0, // Japanese
  ko: 2.0, // Korean
  ar: 1.5, // Arabic
  hi: 1.5, // Hindi/Devanagari
};

/**
 * Video script tone options
 */
export type VideoTone = 'professional' | 'conversational' | 'energetic';

/**
 * Video script pacing options
 */
export type VideoPacing = 'slow' | 'moderate' | 'fast';

/**
 * Video script generation settings
 */
export interface VideoScriptSettings {
  /** Tone of the video narration */
  tone?: VideoTone;

  /** Pacing of the video narration */
  pacing?: VideoPacing;
}

/**
 * Parameters for building video script user message
 */
export interface VideoScriptParams {
  /** Lesson title */
  lessonTitle: string;

  /** Lesson content (markdown format) */
  lessonContent: string;

  /** Learning objectives for the lesson */
  lessonObjectives: string[];

  /** Target language code (ISO 639-1) */
  language: 'ru' | 'en';

  /** Optional generation settings */
  settings?: VideoScriptSettings;
}

/**
 * Video script section structure
 */
const videoScriptSectionSchema = z.object({
  /** Section title */
  title: z.string().min(3).max(100),

  /** Narration text for this section */
  narration: z.string().min(50),

  /** Key points covered in this section */
  key_points: z.array(z.string().min(10)).min(1).max(5),

  /** Visual suggestions for slides/video (e.g., "Show diagram of...", "Display code example") */
  visual_suggestions: z.string().min(10),

  /** Estimated duration in seconds */
  duration_seconds: z.number().int().positive(),
});

export type VideoScriptSection = z.infer<typeof videoScriptSectionSchema>;

/**
 * Video script intro/conclusion structure
 */
const videoScriptSegmentSchema = z.object({
  /** Narration text */
  text: z.string().min(50),

  /** Estimated duration in seconds */
  duration_seconds: z.number().int().positive(),
});

export type VideoScriptSegment = z.infer<typeof videoScriptSegmentSchema>;

/**
 * Complete video script output schema
 *
 * Validates the structured JSON output from the LLM.
 * This schema is used for Phase 1 (Draft) generation.
 */
export const videoScriptOutputSchema = z.object({
  /** Script structure with intro, sections, and conclusion */
  script: z.object({
    /** Opening segment to hook the viewer */
    intro: videoScriptSegmentSchema,

    /** Main content sections */
    sections: z.array(videoScriptSectionSchema).min(1).max(10),

    /** Closing segment with summary and call-to-action */
    conclusion: videoScriptSegmentSchema,
  }),

  /** Generation metadata */
  metadata: z.object({
    /** Total estimated duration in seconds */
    total_duration_seconds: z.number().int().positive(),

    /** Tone used in the script */
    tone: z.enum(['professional', 'conversational', 'energetic']),

    /** Pacing of the narration */
    pacing: z.enum(['slow', 'moderate', 'fast']),

    /** Total word count */
    word_count: z.number().int().nonnegative(),
  }),
});

export type VideoScriptOutput = z.infer<typeof videoScriptOutputSchema>;

/**
 * Sanitize text for safe prompt interpolation
 * Prevents prompt injection by escaping all XML special characters
 * and removing potential CDATA markers that could break XML structure
 */
function sanitizeForPrompt(text: string): string {
  if (!text) return '';
  return (
    text
      // Escape XML special characters (& must be first)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      // Remove CDATA markers that could break XML structure
      .replace(/\]\]>/g, ']]&gt;')
      .replace(/<!\[CDATA\[/gi, '&lt;![CDATA[')
      // Limit consecutive newlines (prevent structure breaking)
      .replace(/\n{4,}/g, '\n\n\n')
  );
}

/**
 * Build the system prompt for video script generation
 *
 * This prompt uses XML-style delimiters to prevent prompt injection
 * and provides clear guidelines for educational video script writing.
 *
 * @returns System prompt string for video script generation
 */
export function buildVideoScriptSystemPrompt(): string {
  return `# Role
You are an **Educational Video Script Writer** specializing in creating engaging video presentations for online learning platforms.
Your goal is to transform lesson content into a compelling video script that combines clear narration with visual suggestions for slides or avatar-based video generation.

# Input Data
You will receive four inputs wrapped in XML tags:
1. \`<LESSON_TITLE>\`: The title of the lesson
2. \`<LESSON_CONTENT>\`: The full lesson content in markdown format
3. \`<LEARNING_OBJECTIVES>\`: The educational goals for this lesson
4. \`<LANGUAGE>\`: The target language code (ISO 639-1, e.g., 'en', 'ru')
5. \`<SETTINGS>\`: Optional tone and pacing preferences

# Script Structure Requirements

Your video script MUST follow this structure:

## 1. Intro (30-60 seconds)
- Hook the viewer with an engaging opening
- State what they will learn (reference learning objectives)
- Set expectations for video length and difficulty
- Create curiosity or highlight practical value

## 2. Sections (Main Content)
For each major topic in the lesson:
- **Title**: Clear section heading
- **Narration**: Full script text to be spoken (conversational, not bullet points)
- **Key Points**: 1-5 main takeaways from this section
- **Visual Suggestions**: Specific guidance for slides/video (e.g., "Show code example with syntax highlighting", "Display diagram comparing X vs Y", "Animate the workflow steps")
- **Duration**: Realistic time estimate in seconds

Guidelines for sections:
- Break complex topics into digestible 2-5 minute segments
- Use transitions between sections ("Now that we understand X, let's explore Y...")
- Include examples and practical applications
- Avoid jargon without explanation
- Make abstract concepts concrete with analogies

## 3. Conclusion (30-45 seconds)
- Summarize key takeaways (2-3 main points)
- Reinforce learning objectives achieved
- Suggest next steps or related topics
- End with a motivating call-to-action

# Narration Guidelines

**Tone Options**:
- **Professional**: Formal, expert voice (academic or corporate training)
- **Conversational**: Friendly, accessible (online course, tutorial)
- **Energetic**: Dynamic, enthusiastic (motivational, creative topics)

**Pacing Options**:
- **Slow**: 120-140 words/minute (beginner-friendly, complex topics)
- **Moderate**: 140-160 words/minute (standard educational content)
- **Fast**: 160-180 words/minute (advanced learners, reviews)

**Language Considerations**:
- Match the target language exactly (no mixing unless technical terms)
- For Russian: Use clear, grammatically correct Cyrillic script
- For English: Use accessible vocabulary appropriate to difficulty level
- Technical terms: Keep in original language (e.g., "API", "React", "TypeScript")

**Engagement Techniques**:
- Use rhetorical questions to maintain attention
- Include "you" language to make it personal ("You'll learn...", "Imagine you're...")
- Vary sentence length to maintain rhythm
- Use pauses strategically (indicated by ellipsis or sentence breaks)

# Visual Suggestions

Provide specific, actionable visual guidance for each section:
- **Good**: "Display code snippet showing useState hook syntax with line-by-line highlighting"
- **Bad**: "Show code example"
- **Good**: "Animate the three phases of React rendering: trigger, render, commit"
- **Bad**: "Explain React rendering"

Visual types to consider:
- Code examples with syntax highlighting
- Diagrams (flowcharts, architecture, comparisons)
- Animations (step-by-step processes, transformations)
- Screenshots (UI examples, tool interfaces)
- Text overlays (key definitions, formulas)
- Icons or illustrations (concepts, metaphors)

# Duration Estimation

Calculate realistic durations based on word count and pacing:
- **Slow**: 2.0-2.5 words/second (120-150 wpm)
- **Moderate**: 2.3-2.7 words/second (140-160 wpm)
- **Fast**: 2.7-3.0 words/second (160-180 wpm)

Add buffer time for:
- Visual transitions: +2-3 seconds per section
- Code examples: +5-10 seconds for viewer processing
- Diagrams: +3-5 seconds for comprehension

Total video should typically be:
- Short lessons: 5-8 minutes
- Standard lessons: 8-15 minutes
- In-depth lessons: 15-25 minutes

# Output Format

CRITICAL: Return ONLY raw JSON. No markdown code blocks.
Start with { and end with }.

{
  "script": {
    "intro": {
      "text": "Full narration text for intro...",
      "duration_seconds": 45
    },
    "sections": [
      {
        "title": "Section Title",
        "narration": "Full narration text for this section...",
        "key_points": [
          "Key point 1",
          "Key point 2",
          "Key point 3"
        ],
        "visual_suggestions": "Specific visual guidance for slides/video...",
        "duration_seconds": 180
      }
    ],
    "conclusion": {
      "text": "Full narration text for conclusion...",
      "duration_seconds": 40
    }
  },
  "metadata": {
    "total_duration_seconds": 600,
    "tone": "conversational",
    "pacing": "moderate",
    "word_count": 1200
  }
}

# Critical Rules
- Write in the target language exclusively (except technical terms)
- Keep narration conversational and engaging (avoid reading bullet points)
- Provide specific, actionable visual suggestions
- Ensure total duration is realistic (no rushing or padding)
- Match tone and pacing to settings provided
- Reference learning objectives in intro and conclusion
- Use proper JSON formatting (no trailing commas, valid escape sequences)`;
}

/**
 * Build the user message for video script generation
 *
 * Combines lesson context with generation settings into a structured prompt.
 *
 * @param params - Video script generation parameters
 * @returns User message string with XML-delimited inputs
 */
export function buildVideoScriptUserMessage(params: VideoScriptParams): string {
  const {
    lessonTitle,
    lessonContent,
    lessonObjectives,
    language,
    settings = {},
  } = params;

  const { tone = 'conversational', pacing = 'moderate' } = settings;

  // Format learning objectives
  const objectivesText = lessonObjectives
    .map((obj, idx) => `${idx + 1}. ${obj}`)
    .join('\n');

  return `<LESSON_TITLE>
${sanitizeForPrompt(lessonTitle)}
</LESSON_TITLE>

<LESSON_CONTENT>
${sanitizeForPrompt(lessonContent)}
</LESSON_CONTENT>

<LEARNING_OBJECTIVES>
${sanitizeForPrompt(objectivesText)}
</LEARNING_OBJECTIVES>

<LANGUAGE>
${sanitizeForPrompt(language)}
</LANGUAGE>

<SETTINGS>
Tone: ${tone}
Pacing: ${pacing}
</SETTINGS>`;
}

/**
 * Estimate token count for video script generation
 *
 * Used for budget tracking and model selection.
 *
 * @param lessonContent - Lesson content to convert to script
 * @param language - Target language code
 * @returns Estimated total tokens (input + output)
 */
export function estimateVideoScriptTokens(
  lessonContent: string,
  language: 'ru' | 'en' = 'en'
): number {
  const multiplier = TOKEN_MULTIPLIERS[language] || 1.0;

  // System prompt: ~1200 tokens
  const systemTokens = 1200;

  // Content tokens (adjusted for language)
  const charsPerToken = 4 / multiplier;
  const contentTokens = Math.ceil(lessonContent.length / charsPerToken);

  // Objectives and metadata: ~150 tokens
  const metadataTokens = Math.ceil(150 * multiplier);

  // Output estimate: ~1500-3000 tokens for structured script
  // Longer lessons generate longer scripts
  const baseOutputTokens = 1500;
  const scalingFactor = Math.min(contentTokens / 2000, 2.0); // Cap at 2x base
  const outputTokens = Math.ceil(baseOutputTokens * scalingFactor * multiplier);

  return systemTokens + contentTokens + metadataTokens + outputTokens;
}
