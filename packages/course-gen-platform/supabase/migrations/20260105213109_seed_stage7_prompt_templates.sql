-- Migration: Add Stage 7 prompt templates for Card and Cover enrichments
-- Date: 2026-01-05
-- Description: Seeds prompt_templates table with Stage 7 (Enrichments) prompts
--              for card and cover image generation, enabling admin panel management

-- =============================================================================
-- Update CHECK constraint to allow stage_7
-- =============================================================================

ALTER TABLE prompt_templates
DROP CONSTRAINT IF EXISTS prompt_templates_stage_check;

ALTER TABLE prompt_templates
ADD CONSTRAINT prompt_templates_stage_check
CHECK (stage = ANY (ARRAY['stage_3'::text, 'stage_4'::text, 'stage_5'::text, 'stage_6'::text, 'stage_7'::text]));

-- =============================================================================
-- Stage 7 Card Prompts
-- =============================================================================

-- Course Card: 1:1 thumbnail for course catalog
INSERT INTO prompt_templates (
  stage,
  prompt_key,
  prompt_name,
  prompt_description,
  prompt_template,
  variables,
  version,
  is_active
) VALUES (
  'stage_7',
  'stage7_card_course',
  'Stage 7 - Course Card: Catalog Thumbnail',
  'Generates 1:1 square thumbnail image for course catalog display. Uses visual style from course settings for brand consistency.',
  E'Create a professional 1:1 square thumbnail image for an educational course catalog.

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

Remember: ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS, NO TYPOGRAPHY, TEXT-FREE IMAGE.',
  '[
    {"name": "courseTitle", "description": "Course title", "required": true},
    {"name": "courseTopic", "description": "Course subject area", "required": true},
    {"name": "languageContext", "description": "Language context description (e.g., Russian educational content)", "required": true},
    {"name": "colorScheme", "description": "Visual style color scheme", "required": true},
    {"name": "aesthetic", "description": "Visual style aesthetic", "required": true},
    {"name": "visualElements", "description": "Visual style elements", "required": true},
    {"name": "mood", "description": "Visual style mood", "required": true}
  ]'::jsonb,
  1,
  true
);

-- Lesson Card: 1:1 thumbnail for lesson navigation
INSERT INTO prompt_templates (
  stage,
  prompt_key,
  prompt_name,
  prompt_description,
  prompt_template,
  variables,
  version,
  is_active
) VALUES (
  'stage_7',
  'stage7_card_lesson',
  'Stage 7 - Lesson Card: Navigation Thumbnail',
  'Generates 1:1 square thumbnail for lesson sidebar/navigation. Maintains visual consistency with parent course while representing specific lesson focus.',
  E'Create a professional 1:1 square thumbnail image for a specific lesson within an educational course.

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
A polished, professional square thumbnail that visually represents "{{lessonTitle}}" within the context of "{{courseTitle}}". The image should be immediately recognizable as part of the course''s visual family while uniquely representing this specific lesson''s focus.

Remember: ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS, NO TYPOGRAPHY, TEXT-FREE IMAGE.',
  '[
    {"name": "lessonTitle", "description": "Lesson title", "required": true},
    {"name": "objectivesSummary", "description": "Lesson objectives summary (semicolon-separated)", "required": true},
    {"name": "courseTitle", "description": "Parent course title", "required": true},
    {"name": "courseTopic", "description": "Parent course topic", "required": true},
    {"name": "colorScheme", "description": "Visual style color scheme", "required": true},
    {"name": "aesthetic", "description": "Visual style aesthetic", "required": true},
    {"name": "visualElements", "description": "Visual style elements", "required": true},
    {"name": "mood", "description": "Visual style mood", "required": true}
  ]'::jsonb,
  1,
  true
);

-- =============================================================================
-- Stage 7 Cover Prompts
-- =============================================================================

-- Cover System Prompt: LLM instructions for generating image prompts
INSERT INTO prompt_templates (
  stage,
  prompt_key,
  prompt_name,
  prompt_description,
  prompt_template,
  variables,
  version,
  is_active
) VALUES (
  'stage_7',
  'stage7_cover_system',
  'Stage 7 - Cover: System Prompt',
  'System prompt for LLM to generate optimized image prompts for lesson cover hero banners (16:9 aspect ratio).',
  E'# Role
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
ALWAYS end your prompt with: ", absolutely no text, no letters, no words, no typography, text-free image"',
  '[]'::jsonb,
  1,
  true
);

-- Cover User Prompt: Context template for cover generation request
INSERT INTO prompt_templates (
  stage,
  prompt_key,
  prompt_name,
  prompt_description,
  prompt_template,
  variables,
  version,
  is_active
) VALUES (
  'stage_7',
  'stage7_cover_user',
  'Stage 7 - Cover: User Prompt',
  'User message template for cover image prompt generation. Provides lesson context for the LLM to create an appropriate image generation prompt.',
  E'Generate an image prompt for a lesson cover with the following context:

Lesson Title: {{lessonTitle}}
Course Subject: {{courseSubject}}
Key Topics: {{keywords}}
Language Context: {{languageContext}}
{{styleHint}}

Create a prompt for a 16:9 hero banner image that visually represents this lesson topic.',
  '[
    {"name": "lessonTitle", "description": "Lesson title", "required": true},
    {"name": "courseSubject", "description": "Course subject area", "required": true},
    {"name": "keywords", "description": "Lesson keywords (comma-separated)", "required": true},
    {"name": "languageContext", "description": "Language context (e.g., Russian educational content)", "required": true},
    {"name": "styleHint", "description": "Optional style preference line (e.g., Style Preference: minimalist)", "required": false}
  ]'::jsonb,
  1,
  true
);

-- =============================================================================
-- Verification
-- =============================================================================

-- Verify all Stage 7 prompts were inserted
DO $$
DECLARE
  prompt_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO prompt_count
  FROM prompt_templates
  WHERE stage = 'stage_7';

  IF prompt_count <> 4 THEN
    RAISE EXCEPTION 'Expected 4 Stage 7 prompts, found %', prompt_count;
  END IF;

  RAISE NOTICE 'Successfully inserted % Stage 7 prompt templates', prompt_count;
END $$;
