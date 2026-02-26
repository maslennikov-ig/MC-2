-- Migration: Update Stage 7 cover prompts to premium 3D cinematic style
-- Date: 2026-01-22
-- Description: Updates cover image generation prompts from abstract/geometric style
--              to premium 3D render + cinematic lighting for more visually striking covers
--              Inspired by Apple, Notion, Linear, Stripe visual aesthetics

-- =============================================================================
-- Update Cover System Prompt
-- =============================================================================

UPDATE prompt_templates
SET
  prompt_template = E'# Role
You are an expert prompt engineer specializing in AI image generation for premium B2B educational content.
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
Return ONLY the image prompt text (2-4 sentences, 60-120 words).
Do not include any explanation, preamble, or commentary - just the prompt itself.
ALWAYS end your prompt with: ", absolutely no text, no letters, no words, no typography, text-free image"',
  prompt_description = 'System prompt for LLM to generate optimized image prompts for lesson cover hero banners (16:9). Premium 3D cinematic style inspired by Apple/Notion/Linear aesthetics.',
  version = version + 1,
  updated_at = NOW()
WHERE prompt_key = 'stage7_cover_system';

-- =============================================================================
-- Update Cover User Prompt (add visual style variables)
-- =============================================================================

UPDATE prompt_templates
SET
  prompt_template = E'Generate an image prompt for a lesson cover with the following context:

Lesson Title: {{lessonTitle}}
Course Subject: {{courseSubject}}
Key Topics: {{keywords}}
Language Context: {{languageContext}}
{{styleHint}}

## Visual Style (MUST be incorporated for brand consistency):
- Color Scheme: {{colorScheme}}
- Aesthetic: {{aesthetic}}
- Visual Elements: {{visualElements}}
- Mood: {{mood}}

Create a prompt for a premium 3D cinematic 16:9 hero banner that visually represents this lesson topic.
The image should have glossy surfaces, dramatic lighting, and depth - inspired by Apple/Notion quality.',
  variables = '[
    {"name": "lessonTitle", "description": "Lesson title", "required": true},
    {"name": "courseSubject", "description": "Course subject area", "required": true},
    {"name": "keywords", "description": "Lesson keywords (comma-separated)", "required": true},
    {"name": "languageContext", "description": "Language context (e.g., Russian educational content)", "required": true},
    {"name": "styleHint", "description": "Optional style preference line", "required": false},
    {"name": "colorScheme", "description": "Visual style color scheme", "required": true},
    {"name": "aesthetic", "description": "Visual style aesthetic", "required": true},
    {"name": "visualElements", "description": "Visual style elements", "required": true},
    {"name": "mood", "description": "Visual style mood", "required": true}
  ]'::jsonb,
  prompt_description = 'User message template for cover image prompt generation. Provides lesson context and visual style for premium 3D cinematic covers.',
  version = version + 1,
  updated_at = NOW()
WHERE prompt_key = 'stage7_cover_user';

-- =============================================================================
-- Update Course Card Prompt (optional, for consistency)
-- =============================================================================

UPDATE prompt_templates
SET
  prompt_template = E'Create a premium 1:1 square thumbnail image for an educational course catalog.

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
- Premium 3D rendered aesthetic with glossy, polished surfaces
- Cinematic lighting with dramatic shadows and highlights
- Rich visual depth with layered composition
- Centered focal point that works at small sizes
- High contrast for visibility in catalog grids

STYLE GUIDELINES - Premium 3D Cinematic:
- Create stunning 3D rendered scenes, NOT flat illustrations
- Use cinematic lighting: dramatic shadows, volumetric effects
- Glossy surfaces with reflections and depth
- Rich gradients with luminous highlights
- Inspired by Apple, Notion, Linear visual aesthetics
- Premium, sophisticated feel - not cartoonish
- Design should be recognizable even at small thumbnail sizes (200x200px)

CRITICAL CONSTRAINTS - NO TEXT:
ABSOLUTELY NO text, letters, words, numbers, characters, typography, writing, inscriptions, labels, captions, titles, or any form of written language in ANY alphabet.
Also AVOID: logos, watermarks, signatures, human faces with identifiable features.
The image must be 100% text-free and symbol-based only.

OUTPUT:
A stunning, premium square thumbnail suitable for course discovery. The image should capture the essence of "{{courseTopic}}" through premium 3D visuals while maintaining brand consistency.

Remember: ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS, NO TYPOGRAPHY, TEXT-FREE IMAGE.',
  prompt_description = 'Generates premium 3D cinematic 1:1 square thumbnail for course catalog. Apple/Notion quality aesthetic.',
  version = version + 1,
  updated_at = NOW()
WHERE prompt_key = 'stage7_card_course';

-- =============================================================================
-- Update Lesson Card Prompt (optional, for consistency)
-- =============================================================================

UPDATE prompt_templates
SET
  prompt_template = E'Create a premium 1:1 square thumbnail image for a specific lesson within an educational course.

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
- Premium 3D rendered aesthetic matching the course style
- Cinematic lighting with dramatic depth
- Visual consistency with the parent course
- Clear focal point suitable for small display sizes
- Distinct from course card but harmonious with it

STYLE GUIDELINES - Premium 3D Cinematic:
- Create stunning 3D rendered scenes with glossy surfaces
- Use cinematic lighting matching the course aesthetic
- Rich color gradients consistent with course palette
- Depth through blur effects, floating elements, layering
- Premium, sophisticated feel
- Design should be identifiable at thumbnail size (150-200px)

DIFFERENTIATION STRATEGY:
While maintaining the same premium 3D style as the parent course:
- Adjust composition to highlight lesson-specific concepts
- Use different arrangements of visual elements
- Vary the focal point or perspective
- Create subtle variations in lighting/depth
- Ensure recognizably part of course family, but unique to this lesson

CRITICAL CONSTRAINTS - NO TEXT:
ABSOLUTELY NO text, letters, words, numbers, characters, typography in ANY alphabet.
Also AVOID: logos, watermarks, signatures, human faces.
The image must be 100% text-free.

OUTPUT:
A polished, premium square thumbnail that visually represents "{{lessonTitle}}" within "{{courseTitle}}". Premium 3D cinematic quality.

Remember: ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS, TEXT-FREE IMAGE.',
  prompt_description = 'Generates premium 3D cinematic 1:1 square thumbnail for lesson navigation. Maintains visual consistency with parent course.',
  version = version + 1,
  updated_at = NOW()
WHERE prompt_key = 'stage7_card_lesson';

-- =============================================================================
-- Verification
-- =============================================================================

DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM prompt_templates
  WHERE stage = 'stage_7'
    AND prompt_template LIKE '%3D%'
    AND prompt_template LIKE '%cinematic%';

  IF updated_count < 2 THEN
    RAISE WARNING 'Expected at least 2 Stage 7 prompts updated with 3D cinematic style, found %', updated_count;
  ELSE
    RAISE NOTICE 'Successfully updated % Stage 7 prompts to premium 3D cinematic style', updated_count;
  END IF;
END $$;
