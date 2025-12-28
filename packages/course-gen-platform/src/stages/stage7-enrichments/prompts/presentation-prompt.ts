/**
 * Presentation Prompt Templates
 * @module stages/stage7-enrichments/prompts/presentation-prompt
 *
 * Implements presentation slide generation for Stage 7 lesson enrichments.
 * Uses a two-stage flow:
 * - Phase 1 (Draft): Generate slide outline/structure
 * - Phase 2 (Final): Generate complete slide content with markdown
 *
 * The presentation includes title slide, content slides with various layouts,
 * speaker notes, and visual suggestions. Follows the 6x6 rule for slide design
 * (max 6 bullet points, max 6 words per point).
 *
 * Token budget: ~1200 tokens (system) + content tokens
 * Expected output: ~1000-2500 tokens (JSON response with slide structure)
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
 * Presentation theme options
 */
export type PresentationTheme = 'default' | 'dark' | 'academic';

/**
 * Slide layout types
 */
export type SlideLayout = 'title' | 'content' | 'two-column' | 'image';

/**
 * Presentation generation settings
 */
export interface PresentationSettings {
  /** Presentation theme (default: default) */
  theme?: PresentationTheme;

  /** Maximum number of slides (default: 10-15) */
  maxSlides?: number;

  /** Include visual suggestions for images (default: true) */
  includeVisualSuggestions?: boolean;

  /** Include speaker notes (default: true) */
  includeSpeakerNotes?: boolean;
}

/**
 * Parameters for building presentation user message
 */
export interface PresentationPromptParams {
  /** Lesson title */
  lessonTitle: string;

  /** Lesson content (markdown format) */
  lessonContent: string;

  /** Learning objectives for the lesson */
  lessonObjectives: string[];

  /** Target language code (ISO 639-1) */
  language: 'ru' | 'en';

  /** Optional generation settings */
  settings?: PresentationSettings;
}

/**
 * Draft slide outline structure (Phase 1)
 */
const presentationDraftOutlineItemSchema = z.object({
  /** Slide title */
  title: z.string().min(1).max(100),

  /** Key points to cover on this slide */
  key_points: z.array(z.string().min(3)).min(1).max(6),

  /** Suggested layout type */
  layout: z.enum(['title', 'content', 'two-column', 'image']),
});

export type PresentationDraftOutlineItem = z.infer<
  typeof presentationDraftOutlineItemSchema
>;

/**
 * Draft output schema (Phase 1)
 *
 * Validates the outline structure before full slide generation.
 */
export const presentationDraftSchema = z.object({
  /** Slide outline array */
  outline: z.array(presentationDraftOutlineItemSchema).min(3).max(30),

  /** Generation metadata */
  metadata: z.object({
    /** Estimated number of slides in final presentation */
    estimated_slides: z.number().int().positive(),

    /** Selected theme */
    theme: z.enum(['default', 'dark', 'academic']),
  }),
});

export type PresentationDraft = z.infer<typeof presentationDraftSchema>;

/**
 * Individual presentation slide structure (Phase 2)
 */
const presentationSlideSchema = z.object({
  /** Slide index (0-based) */
  index: z.number().int().nonnegative(),

  /** Slide title */
  title: z.string().min(1).max(200),

  /** Slide content in Markdown format (follows 6x6 rule) */
  content: z.string().min(1),

  /** Slide layout type */
  layout: z.enum(['title', 'content', 'two-column', 'image']),

  /** Optional speaker notes for presenter */
  speaker_notes: z.string().optional(),

  /** Optional visual suggestion (for image layout or diagrams) */
  visual_suggestion: z.string().optional(),
});

export type PresentationSlide = z.infer<typeof presentationSlideSchema>;

/**
 * Final presentation output schema (Phase 2)
 *
 * Validates the complete presentation structure with all slide content.
 */
export const presentationOutputSchema = z.object({
  /** Presentation theme */
  theme: z.enum(['default', 'dark', 'academic']),

  /** Complete slides array */
  slides: z.array(presentationSlideSchema).min(1).max(100),

  /** Generation metadata */
  metadata: z.object({
    /** Total number of slides */
    total_slides: z.number().int().positive(),

    /** Estimated presentation duration in minutes */
    estimated_duration_minutes: z.number().int().positive(),
  }),
});

export type PresentationOutput = z.infer<typeof presentationOutputSchema>;

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
 * Build the system prompt for presentation draft outline generation (Phase 1)
 *
 * This prompt focuses on creating a structured outline with slide titles,
 * key points, and layout suggestions before full content generation.
 *
 * @returns System prompt string for draft outline generation
 */
export function buildPresentationDraftSystemPrompt(): string {
  return `# Role
You are an **Educational Presentation Designer** specializing in creating engaging slide presentations for online learning platforms.
Your goal is to create a structured outline for a presentation that effectively communicates lesson content through visual slides.

# Input Data
You will receive four inputs wrapped in XML tags:
1. \`<LESSON_TITLE>\`: The title of the lesson
2. \`<LESSON_CONTENT>\`: The full lesson content in markdown format
3. \`<LEARNING_OBJECTIVES>\`: The educational goals for this lesson
4. \`<LANGUAGE>\`: The target language code (ISO 639-1, e.g., 'en', 'ru')
5. \`<SETTINGS>\`: Optional theme and slide count preferences

# Task: Create Slide Outline

Your task is to analyze the lesson content and create a structured outline for a presentation with:
- **Title slide**: Introduction to the topic
- **Content slides**: Main concepts broken into digestible chunks
- **Conclusion slide**: Summary and key takeaways

## Outline Structure

For each slide in the outline, specify:
- **Title**: Clear, concise slide heading (max 10 words)
- **Key Points**: 1-6 main points to cover (following 6x6 rule)
- **Layout**: Suggested layout type (see layout guide below)

## Layout Selection Guide

### Title Layout
- Use for: First slide (introduction)
- Contains: Lesson title, subtitle, presenter info
- When: Always use for slide 0 (title slide)

### Content Layout
- Use for: Standard content delivery with bullet points or text
- Contains: Title + bulleted list or paragraph text
- When: Most common layout for concepts, definitions, explanations
- Follows 6x6 rule: Max 6 bullets, max 6 words per bullet

### Two-Column Layout
- Use for: Comparisons, before/after, pros/cons
- Contains: Title + two side-by-side columns
- When: Comparing concepts, showing contrasts, parallel information
- Each column should have balanced content

### Image Layout
- Use for: Diagrams, charts, code examples, visual concepts
- Contains: Title + large visual area with caption
- When: Visual explanation is more effective than text
- Provide visual_suggestion for what image/diagram to show

## 6x6 Rule for Slides

CRITICAL: Follow the 6x6 presentation rule:
- **Maximum 6 bullet points per slide**
- **Maximum 6 words per bullet point**
- Keep slides concise and visual
- Use speaker notes for detailed explanations

Slides should be scannable in 3-5 seconds. Detailed information goes in speaker notes, not on slides.

## Presentation Length Guidelines

- **Short lessons**: 5-8 slides (5-10 minutes)
- **Standard lessons**: 10-15 slides (15-20 minutes)
- **In-depth lessons**: 15-25 slides (25-35 minutes)

Aim for 1.5-2 minutes per slide on average.

## Theme Selection

Choose the most appropriate theme based on lesson content:
- **default**: General education, accessible, bright (most common)
- **dark**: Technical topics, coding tutorials, modern design
- **academic**: Research, scientific content, formal presentations

# Output Format

CRITICAL: Return ONLY raw JSON. No markdown code blocks.
Start with { and end with }.

{
  "outline": [
    {
      "title": "Slide Title",
      "key_points": [
        "Key point 1",
        "Key point 2",
        "Key point 3"
      ],
      "layout": "content"
    }
  ],
  "metadata": {
    "estimated_slides": 12,
    "theme": "default"
  }
}

# Critical Rules
- Create 5-25 slides depending on lesson complexity
- First slide MUST use "title" layout
- Last slide should summarize key takeaways
- Follow 6x6 rule for key points (max 6 points, max 6 words each)
- Select layout types appropriately
- Balance content across slides (don't overload any single slide)
- Use proper JSON formatting (no trailing commas, valid escape sequences)`;
}

/**
 * Build the user message for presentation draft outline generation (Phase 1)
 *
 * Combines lesson context with generation settings into a structured prompt.
 *
 * @param params - Presentation generation parameters
 * @returns User message string with XML-delimited inputs
 */
export function buildPresentationDraftUserMessage(
  params: PresentationPromptParams
): string {
  const {
    lessonTitle,
    lessonContent,
    lessonObjectives,
    language,
    settings = {},
  } = params;

  const {
    theme = 'default',
    maxSlides = 15,
    includeVisualSuggestions = true,
    includeSpeakerNotes = true,
  } = settings;

  // Format learning objectives
  const objectivesText = lessonObjectives
    .map((obj, idx) => `${idx + 1}. ${obj}`)
    .join('\n');

  // Format settings
  const settingsText = [
    `Theme: ${theme}`,
    `Max Slides: ${maxSlides}`,
    `Include Visual Suggestions: ${includeVisualSuggestions}`,
    `Include Speaker Notes: ${includeSpeakerNotes}`,
  ].join('\n');

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
${settingsText}
</SETTINGS>`;
}

/**
 * Build the system prompt for final presentation generation (Phase 2)
 *
 * This prompt uses the approved outline to generate complete slide content
 * with markdown formatting, speaker notes, and visual suggestions.
 *
 * @returns System prompt string for final presentation generation
 */
export function buildPresentationFinalSystemPrompt(): string {
  return `# Role
You are an **Educational Presentation Designer** creating the final slide content for an online learning presentation.
You have an approved outline and must now generate complete, polished slides with markdown content, speaker notes, and visual suggestions.

# Input Data
You will receive:
1. \`<LESSON_TITLE>\`: The title of the lesson
2. \`<LESSON_CONTENT>\`: The full lesson content in markdown format
3. \`<APPROVED_OUTLINE>\`: The approved slide outline with titles, key points, and layouts
4. \`<LANGUAGE>\`: The target language code (ISO 639-1, e.g., 'en', 'ru')
5. \`<SETTINGS>\`: Theme and feature preferences

# Task: Generate Complete Slides

For each slide in the approved outline, create:
1. **Slide Content** (Markdown format)
2. **Speaker Notes** (if enabled)
3. **Visual Suggestions** (if enabled and layout is image or visual-heavy)

## Slide Content Guidelines

### Title Slide (Layout: title)
\`\`\`markdown
# [Lesson Title]

[Subtitle or brief description]

[Optional: Author/Date]
\`\`\`

### Content Slide (Layout: content)
\`\`\`markdown
# [Slide Title]

- Bullet point 1 (max 6 words)
- Bullet point 2 (max 6 words)
- Bullet point 3 (max 6 words)
- Bullet point 4 (max 6 words)
- Bullet point 5 (max 6 words)
- Bullet point 6 (max 6 words)
\`\`\`

**6x6 Rule**: Maximum 6 bullets, maximum 6 words per bullet.

### Two-Column Slide (Layout: two-column)
\`\`\`markdown
# [Slide Title]

## Left Column

- Point 1
- Point 2
- Point 3

## Right Column

- Point A
- Point B
- Point C
\`\`\`

### Image Slide (Layout: image)
\`\`\`markdown
# [Slide Title]

![Visual Placeholder]

*Caption: Brief description of the visual*
\`\`\`

For image slides, provide a **visual_suggestion** describing what diagram, chart, screenshot, or illustration should be shown.

## Speaker Notes Guidelines

Speaker notes provide the presenter with detailed talking points that don't appear on slides.

**Good speaker notes**:
- Explain concepts in detail (don't just read bullet points)
- Provide examples and context
- Suggest transitions to next slide
- Include timing guidance (e.g., "Spend 2 minutes on this slide")
- Add relevant anecdotes or real-world applications

**Length**: 2-5 sentences per slide (30-100 words)

**Example**:
"This slide introduces the concept of component state in React. Emphasize that state is internal to the component and can change over time, unlike props which are read-only. Use the counter example to demonstrate state updates. Transition to the next slide by asking, 'But how does React know when to re-render?'"

## Visual Suggestions Guidelines

For slides with layout="image" or visual-heavy content, provide specific, actionable guidance:

**Good visual suggestions**:
- "Diagram showing the component lifecycle with three phases: mounting, updating, unmounting"
- "Side-by-side code comparison: class component vs functional component with hooks"
- "Flowchart illustrating the decision tree for choosing between useState and useReducer"
- "Screenshot of React DevTools highlighting the component tree"

**Bad visual suggestions**:
- "Show a diagram" (too vague)
- "Code example" (not specific enough)
- "Image of React" (unclear what to show)

## Language Considerations

- Write all content in the target language (no mixing unless technical terms)
- For Russian: Use clear, grammatically correct Cyrillic script
- For English: Use accessible vocabulary appropriate to audience
- Technical terms: Keep in original language (e.g., "API", "React", "useState")
- Ensure speaker notes are conversational and natural

## Duration Estimation

Estimate realistic presentation duration based on:
- **Title slide**: 30-60 seconds
- **Content slide**: 1.5-2 minutes
- **Two-column slide**: 2-3 minutes (more comparison/discussion)
- **Image slide**: 1-2 minutes (allow time for visual processing)

Total duration = (number of slides × average time per slide)

# Output Format

CRITICAL: Return ONLY raw JSON. No markdown code blocks.
Start with { and end with }.

{
  "theme": "default",
  "slides": [
    {
      "index": 0,
      "title": "Introduction to React Hooks",
      "content": "# Introduction to React Hooks\\n\\nModern State Management\\n\\nBuilding Better Components",
      "layout": "title"
    },
    {
      "index": 1,
      "title": "What Are Hooks?",
      "content": "# What Are Hooks?\\n\\n- Functions for state\\n- Functions for effects\\n- Functions for context\\n- Functions for refs\\n- Functions for memoization\\n- Functions for performance",
      "layout": "content",
      "speaker_notes": "Hooks are special functions that let you hook into React features from function components. Explain that before hooks, you needed class components for state. Emphasize that hooks make code more reusable and easier to test. Transition: 'Let's look at the most common hook: useState.'",
      "visual_suggestion": null
    },
    {
      "index": 2,
      "title": "useState Hook Example",
      "content": "# useState Hook Example\\n\\n![Code Example]\\n\\n*Example: Counter component with useState*",
      "layout": "image",
      "speaker_notes": "This code example shows a simple counter component using the useState hook. Walk through the syntax: array destructuring, initial value, and the setter function. Point out that clicking the button triggers a re-render with the new state value.",
      "visual_suggestion": "Code snippet showing useState hook in a counter component with syntax highlighting. Include import statement, component definition, useState call with destructuring, and JSX with button click handler."
    }
  ],
  "metadata": {
    "total_slides": 12,
    "estimated_duration_minutes": 20
  }
}

# Critical Rules
- Follow the approved outline exactly (same number of slides, same titles, same layouts)
- Write in the target language exclusively (except technical terms)
- Follow 6x6 rule for content slides (max 6 bullets, max 6 words each)
- Provide speaker notes if settings.includeSpeakerNotes is true
- Provide visual suggestions if settings.includeVisualSuggestions is true AND layout is appropriate
- Use proper JSON formatting (no trailing commas, valid escape sequences)
- Ensure slide content is valid Markdown
- Index slides starting from 0
- Calculate accurate total_slides and estimated_duration_minutes`;
}

/**
 * Build the user message for final presentation generation (Phase 2)
 *
 * Includes the approved outline from Phase 1 along with original lesson context.
 *
 * @param params - Presentation generation parameters
 * @param approvedOutline - Approved outline from Phase 1
 * @returns User message string with XML-delimited inputs
 */
export function buildPresentationFinalUserMessage(
  params: PresentationPromptParams,
  approvedOutline: PresentationDraft
): string {
  const {
    lessonTitle,
    lessonContent,
    language,
    settings = {},
  } = params;

  const {
    theme = 'default',
    includeVisualSuggestions = true,
    includeSpeakerNotes = true,
  } = settings;

  // Format approved outline
  const outlineText = approvedOutline.outline
    .map((item, idx) => {
      const keyPointsText = item.key_points
        .map((point) => `  - ${point}`)
        .join('\n');
      return `Slide ${idx}: ${item.title} (${item.layout})\n${keyPointsText}`;
    })
    .join('\n\n');

  // Format settings
  const settingsText = [
    `Theme: ${theme}`,
    `Include Visual Suggestions: ${includeVisualSuggestions}`,
    `Include Speaker Notes: ${includeSpeakerNotes}`,
  ].join('\n');

  return `<LESSON_TITLE>
${sanitizeForPrompt(lessonTitle)}
</LESSON_TITLE>

<LESSON_CONTENT>
${sanitizeForPrompt(lessonContent)}
</LESSON_CONTENT>

<APPROVED_OUTLINE>
${sanitizeForPrompt(outlineText)}
</APPROVED_OUTLINE>

<LANGUAGE>
${sanitizeForPrompt(language)}
</LANGUAGE>

<SETTINGS>
${settingsText}
</SETTINGS>`;
}

/**
 * Estimate token count for presentation draft outline generation (Phase 1)
 *
 * Used for budget tracking and model selection.
 *
 * @param lessonContent - Lesson content to create presentation from
 * @param language - Target language code
 * @param estimatedSlides - Estimated number of slides (default: 12)
 * @returns Estimated total tokens (input + output)
 */
export function estimatePresentationDraftTokens(
  lessonContent: string,
  language: 'ru' | 'en' = 'en',
  estimatedSlides: number = 12
): number {
  const multiplier = TOKEN_MULTIPLIERS[language] || 1.0;

  // System prompt: ~800 tokens
  const systemTokens = 800;

  // Content tokens (adjusted for language)
  const charsPerToken = 4 / multiplier;
  const contentTokens = Math.ceil(lessonContent.length / charsPerToken);

  // Objectives and metadata: ~100 tokens
  const metadataTokens = Math.ceil(100 * multiplier);

  // Output estimate: ~50-80 tokens per slide outline item
  // Each outline includes: title, 3-6 key points, layout
  const tokensPerSlide = 65;
  const outputTokens = Math.ceil(estimatedSlides * tokensPerSlide * multiplier);

  // Metadata overhead: ~50 tokens
  const overheadTokens = Math.ceil(50 * multiplier);

  return systemTokens + contentTokens + metadataTokens + outputTokens + overheadTokens;
}

/**
 * Estimate token count for final presentation generation (Phase 2)
 *
 * Used for budget tracking and model selection.
 *
 * @param lessonContent - Lesson content to create presentation from
 * @param language - Target language code
 * @param slideCount - Number of slides from approved outline
 * @param includeSpeakerNotes - Whether speaker notes are included
 * @returns Estimated total tokens (input + output)
 */
export function estimatePresentationFinalTokens(
  lessonContent: string,
  language: 'ru' | 'en' = 'en',
  slideCount: number = 12,
  includeSpeakerNotes: boolean = true
): number {
  const multiplier = TOKEN_MULTIPLIERS[language] || 1.0;

  // System prompt: ~1200 tokens
  const systemTokens = 1200;

  // Content tokens (adjusted for language)
  const charsPerToken = 4 / multiplier;
  const contentTokens = Math.ceil(lessonContent.length / charsPerToken);

  // Outline tokens (from Phase 1): ~50-80 tokens per slide
  const outlineTokens = Math.ceil(slideCount * 65 * multiplier);

  // Output estimate per slide:
  // - Markdown content: ~100-150 tokens
  // - Speaker notes (if enabled): ~50-100 tokens
  // - Visual suggestion (if applicable): ~30-50 tokens
  const baseTokensPerSlide = 125;
  const speakerNotesTokensPerSlide = includeSpeakerNotes ? 75 : 0;
  const visualSuggestionTokensPerSlide = 40; // Some slides have visuals
  const tokensPerSlide =
    baseTokensPerSlide + speakerNotesTokensPerSlide + visualSuggestionTokensPerSlide;

  const outputTokens = Math.ceil(slideCount * tokensPerSlide * multiplier);

  // Metadata overhead: ~100 tokens
  const overheadTokens = Math.ceil(100 * multiplier);

  return systemTokens + contentTokens + outlineTokens + outputTokens + overheadTokens;
}

/**
 * Estimate total tokens for complete presentation generation (both phases)
 *
 * Convenience function that sums both draft and final phase estimates.
 *
 * @param lessonContent - Lesson content to create presentation from
 * @param language - Target language code
 * @param estimatedSlides - Estimated number of slides (default: 12)
 * @param includeSpeakerNotes - Whether speaker notes are included (default: true)
 * @returns Estimated total tokens for both phases
 */
export function estimatePresentationTokens(
  lessonContent: string,
  language: 'ru' | 'en' = 'en',
  estimatedSlides: number = 12,
  includeSpeakerNotes: boolean = true
): number {
  const draftTokens = estimatePresentationDraftTokens(
    lessonContent,
    language,
    estimatedSlides
  );
  const finalTokens = estimatePresentationFinalTokens(
    lessonContent,
    language,
    estimatedSlides,
    includeSpeakerNotes
  );
  return draftTokens + finalTokens;
}
