/**
 * Card Image Prompt Templates
 * @module stages/stage7-enrichments/prompts/card-prompt
 *
 * Builds optimized prompts for course and lesson card/thumbnail image generation.
 * Cards are 1:1 square thumbnails used in course catalogs and lesson sidebars.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CourseCardParams {
  /** Course title */
  courseTitle: string;
  /** Course topic/subject area */
  courseTopic: string;
  /** Target language */
  language: string;
  /** Visual style from course configuration */
  visualStyle: {
    colorScheme: string;
    aesthetic: string;
    visualElements: string;
    mood: string;
  };
}

export interface LessonCardParams {
  /** Lesson title */
  lessonTitle: string;
  /** Lesson learning objectives */
  lessonObjectives: string[];
  /** Parent course title */
  courseTitle: string;
  /** Parent course topic */
  courseTopic: string;
  /** Visual style from course configuration (for consistency) */
  visualStyle: {
    colorScheme: string;
    aesthetic: string;
    visualElements: string;
    mood: string;
  };
}

// ============================================================================
// COURSE CARD PROMPT BUILDER
// ============================================================================

/**
 * Build image generation prompt for course catalog thumbnail (1:1 square)
 *
 * Purpose: Create a visual identity for the course in catalog view
 * Requirements:
 * - Abstract/symbolic representation (NO text)
 * - 1:1 square composition optimized for thumbnails
 * - Professional quality suitable for marketing/discovery
 * - Uses visualStyle for brand consistency
 */
export function buildCourseCardPrompt(params: CourseCardParams): string {
  const { courseTitle, courseTopic, language, visualStyle } = params;

  // Build style description from visualStyle object
  const styleDescription = `
Color Scheme: ${visualStyle.colorScheme}
Aesthetic: ${visualStyle.aesthetic}
Visual Elements: ${visualStyle.visualElements}
Mood: ${visualStyle.mood}
  `.trim();

  return `Create a professional 1:1 square thumbnail image for an educational course catalog.

SUBJECT CONTEXT:
Course: "${courseTitle}"
Topic: ${courseTopic}
Language Context: ${language === 'ru' ? 'Russian educational content' : language === 'en' ? 'English educational content' : `${language} educational content`}

VISUAL STYLE (MUST FOLLOW):
${styleDescription}

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
A stunning, professional square thumbnail suitable for course discovery and catalog browsing. The image should capture the essence of "${courseTopic}" through visual symbolism while maintaining brand consistency with the specified visual style.

Remember: ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS, NO TYPOGRAPHY, TEXT-FREE IMAGE.`;
}

// ============================================================================
// LESSON CARD PROMPT BUILDER
// ============================================================================

/**
 * Build image generation prompt for lesson page card/sidebar (1:1 square)
 *
 * Purpose: Create a visual preview for the lesson in sidebar/navigation
 * Requirements:
 * - Topic-specific but consistent with parent course style
 * - 1:1 square composition
 * - NO text in image
 * - Professional quality for lesson identification
 */
export function buildLessonCardPrompt(params: LessonCardParams): string {
  const { lessonTitle, lessonObjectives, courseTitle, courseTopic, visualStyle } = params;

  // Build objectives summary (limit to first 3 for conciseness)
  const objectivesSummary = lessonObjectives.slice(0, 3).join('; ');

  // Build style description from visualStyle object
  const styleDescription = `
Color Scheme: ${visualStyle.colorScheme}
Aesthetic: ${visualStyle.aesthetic}
Visual Elements: ${visualStyle.visualElements}
Mood: ${visualStyle.mood}
  `.trim();

  return `Create a professional 1:1 square thumbnail image for a specific lesson within an educational course.

LESSON CONTEXT:
Lesson: "${lessonTitle}"
Key Objectives: ${objectivesSummary}

COURSE CONTEXT (for visual consistency):
Course: "${courseTitle}"
Topic: ${courseTopic}

VISUAL STYLE (MUST FOLLOW for brand consistency):
${styleDescription}

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
A polished, professional square thumbnail that visually represents "${lessonTitle}" within the context of "${courseTitle}". The image should be immediately recognizable as part of the course's visual family while uniquely representing this specific lesson's focus.

Remember: ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS, NO TYPOGRAPHY, TEXT-FREE IMAGE.`;
}

// ============================================================================
// DEFAULT FALLBACK PROMPTS
// ============================================================================

/**
 * Default fallback for course card if prompt generation fails
 */
export function getDefaultCourseCardPrompt(
  courseTitle: string,
  courseTopic: string
): string {
  return `A stunning abstract 1:1 square thumbnail representing "${courseTitle}" in the context of ${courseTopic}. Modern digital art style with flowing gradients in professional tones. Clean geometric shapes creating depth and visual interest, centered composition optimized for thumbnail display. Professional educational aesthetic, visually striking at small sizes, absolutely no text, no letters, no words, no numbers, no writing, no typography, no inscriptions, text-free image.`;
}

/**
 * Default fallback for lesson card if prompt generation fails
 */
export function getDefaultLessonCardPrompt(
  lessonTitle: string,
  courseTitle: string,
  courseTopic: string
): string {
  return `A professional 1:1 square thumbnail for the lesson "${lessonTitle}" within the course "${courseTitle}" (${courseTopic}). Abstract visualization with symbolic representation of the lesson topic. Modern digital art with clean composition, centered focal point, harmonious with course visual style. Optimized for sidebar display at small sizes, absolutely no text, no letters, no words, no numbers, no writing, no typography, no inscriptions, text-free image.`;
}
