/**
 * Stage 7 Hardcoded Prompts - Visual Enrichments (4 prompts)
 * @module shared/prompts/stage7-prompts
 *
 * Stage 7: Enrichments - Card & Cover Image Generation
 * - Course Card: Catalog thumbnail (1:1 square)
 * - Lesson Card: Navigation thumbnail (1:1 square)
 * - Cover System: System prompt for lesson cover generation
 * - Cover User: User message template for cover generation
 */

import type { HardcodedPrompt } from './types.js';

// ============================================================================
// STAGE 7 PROMPTS (4 total) - Enrichments: Card & Cover
// ============================================================================

export const stage7Prompts: HardcodedPrompt[] = [
  {
    stage: 'stage_7',
    promptKey: 'stage7_card_course',
    promptName: 'Stage 7 - Course Card: Catalog Thumbnail',
    promptDescription:
      'Generates 1:1 square thumbnail image for course catalog display. Uses visual style from course settings for brand consistency.',
    promptTemplate: `Create a professional 1:1 square thumbnail image for an educational course catalog.

SUBJECT CONTEXT:
Course: "{{courseTitle}}"
Topic: {{courseTopic}}
Language Context: {{languageContext}}

VISUAL STYLE (MUST FOLLOW):
Color Scheme: {{colorScheme}}
Aesthetic: {{aesthetic}}
Visual Elements: {{visualElements}}
Mood: {{mood}}

COMPOSITION REQUIREMENTS:
- 1:1 square format (optimized for thumbnail display)
- Abstract or symbolic representation of the course topic
- Professional, modern digital art aesthetic
- Rich visual depth with layered composition
- Centered focal point that works at small sizes
- High contrast for visibility in catalog grids

STYLE GUIDELINES:
- Use the specified color scheme prominently
- Incorporate the visual elements mentioned in the style
- Match the aesthetic and mood described
- Create depth through gradients, lighting, and layering
- Avoid literal/photorealistic depictions - prefer conceptual imagery
- Design should be recognizable even at small thumbnail sizes (200x200px)

CRITICAL CONSTRAINTS - NO TEXT:
ABSOLUTELY NO text, letters, words, numbers, characters, typography, writing, inscriptions, labels, captions, titles, or any form of written language in ANY alphabet (Latin, Cyrillic, Arabic, etc.).
Also AVOID: logos, watermarks, signatures, human faces with identifiable features.
The image must be 100% text-free and symbol-based only.

OUTPUT:
A stunning, professional square thumbnail suitable for course discovery and catalog browsing. The image should capture the essence of "{{courseTopic}}" through visual symbolism while maintaining brand consistency with the specified visual style.

Remember: ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS, NO TYPOGRAPHY, TEXT-FREE IMAGE.`,
    variables: [
      { name: 'courseTitle', description: 'Course title', required: true },
      { name: 'courseTopic', description: 'Course subject area', required: true },
      {
        name: 'languageContext',
        description: 'Language context description (e.g., "Russian educational content")',
        required: true,
      },
      { name: 'colorScheme', description: 'Visual style color scheme', required: true },
      { name: 'aesthetic', description: 'Visual style aesthetic', required: true },
      { name: 'visualElements', description: 'Visual style elements', required: true },
      { name: 'mood', description: 'Visual style mood', required: true },
    ],
  },
  {
    stage: 'stage_7',
    promptKey: 'stage7_card_lesson',
    promptName: 'Stage 7 - Lesson Card: Navigation Thumbnail',
    promptDescription:
      'Generates 1:1 square thumbnail for lesson sidebar/navigation. Maintains visual consistency with parent course while representing specific lesson focus.',
    promptTemplate: `Create a professional 1:1 square thumbnail image for a specific lesson within an educational course.

LESSON CONTEXT:
Lesson: "{{lessonTitle}}"
Key Objectives: {{objectivesSummary}}

COURSE CONTEXT (for visual consistency):
Course: "{{courseTitle}}"
Topic: {{courseTopic}}

VISUAL STYLE (MUST FOLLOW for brand consistency):
Color Scheme: {{colorScheme}}
Aesthetic: {{aesthetic}}
Visual Elements: {{visualElements}}
Mood: {{mood}}

COMPOSITION REQUIREMENTS:
- 1:1 square format (sidebar/navigation thumbnail)
- Topic-specific visualization representing the lesson objectives
- Visual consistency with the parent course style
- Modern, professional digital art aesthetic
- Clear focal point suitable for small display sizes
- Distinct from course card but harmonious with it

STYLE GUIDELINES:
- Use the specified color scheme (same as course for consistency)
- Incorporate the visual elements and aesthetic from course style
- Match the mood described
- Create visual variation through composition and focus, NOT color palette
- Focus on the specific lesson topic while maintaining course brand
- Design should be identifiable at thumbnail size (150x150px to 200x200px)

DIFFERENTIATION STRATEGY:
While maintaining the same color scheme and aesthetic as the parent course:
- Adjust composition to highlight lesson-specific concepts
- Use different arrangements of visual elements
- Vary the focal point or perspective
- Create subtle variations in lighting/depth
- Ensure the image is recognizably part of the course family, but unique to this lesson

CRITICAL CONSTRAINTS - NO TEXT:
ABSOLUTELY NO text, letters, words, numbers, characters, typography, writing, inscriptions, labels, captions, titles, or any form of written language in ANY alphabet.
Also AVOID: logos, watermarks, signatures, human faces with identifiable features.
The image must be 100% text-free and rely on pure visual symbolism.

OUTPUT:
A polished, professional square thumbnail that visually represents "{{lessonTitle}}" within the context of "{{courseTitle}}". The image should be immediately recognizable as part of the course's visual family while uniquely representing this specific lesson's focus.

Remember: ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS, NO TYPOGRAPHY, TEXT-FREE IMAGE.`,
    variables: [
      { name: 'lessonTitle', description: 'Lesson title', required: true },
      {
        name: 'objectivesSummary',
        description: 'Lesson objectives summary (semicolon-separated)',
        required: true,
      },
      { name: 'courseTitle', description: 'Parent course title', required: true },
      { name: 'courseTopic', description: 'Parent course topic', required: true },
      { name: 'colorScheme', description: 'Visual style color scheme', required: true },
      { name: 'aesthetic', description: 'Visual style aesthetic', required: true },
      { name: 'visualElements', description: 'Visual style elements', required: true },
      { name: 'mood', description: 'Visual style mood', required: true },
    ],
  },
  {
    stage: 'stage_7',
    promptKey: 'stage7_cover_system',
    promptName: 'Stage 7 - Cover: System Prompt',
    promptDescription:
      'System prompt for LLM to generate optimized image prompts for lesson cover hero banners (16:9 aspect ratio).',
    promptTemplate: `# Role
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
ALWAYS end your prompt with: ", absolutely no text, no letters, no words, no typography, text-free image"`,
    variables: [],
  },
  {
    stage: 'stage_7',
    promptKey: 'stage7_cover_user',
    promptName: 'Stage 7 - Cover: User Prompt',
    promptDescription:
      'User message template for cover image prompt generation. Provides lesson context for the LLM to create an appropriate image generation prompt.',
    promptTemplate: `Generate an image prompt for a lesson cover with the following context:

Lesson Title: {{lessonTitle}}
Course Subject: {{courseSubject}}
Key Topics: {{keywords}}
Language Context: {{languageContext}}
{{styleHint}}

Create a prompt for a 16:9 hero banner image that visually represents this lesson topic.`,
    variables: [
      { name: 'lessonTitle', description: 'Lesson title', required: true },
      { name: 'courseSubject', description: 'Course subject area', required: true },
      { name: 'keywords', description: 'Lesson keywords (comma-separated)', required: true },
      {
        name: 'languageContext',
        description: 'Language context (e.g., "Russian educational content")',
        required: true,
      },
      {
        name: 'styleHint',
        description: 'Optional style preference line (e.g., "Style Preference: minimalist")',
        required: false,
      },
    ],
  },
];
