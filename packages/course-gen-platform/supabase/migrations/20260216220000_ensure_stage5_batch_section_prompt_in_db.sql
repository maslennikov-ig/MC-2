-- Migration: Ensure DB-first prompt exists for stage5_batch_section_generator
-- Purpose: Runtime uses PromptService (DB-first). This creates/updates the active prompt
--          with the same key/template used by current Stage 5 code.
-- Date: 2026-02-16

DO $$
DECLARE
  v_template text := $prompt$You are an expert course designer expanding one section into lesson structure.

**Course Context**:
- Course Title: {{courseTitle}}
- Target Language: {{language}}
- Style Signal: {{stylePrompt}}
{{targetAudienceLine}}
{{userContext}}
{{courseStructureMapSection}}
{{previousSectionsDigestSection}}

**Section to Expand** (Section {{sectionNumber}}):
- Section Title: {{sectionTitle}}
- Section Objectives: {{learningObjectives}}
- Key Topics: {{keyTopics}}
- Estimated Lessons: {{estimatedLessons}}

{{analysisContext}}
{{constraintsSection}}
**CRITICAL: Return valid JSON matching this EXACT schema**
{{schemaDescription}}

**PEDAGOGICAL GUARDRAILS**:
1. First lesson must be introductory and contextual for this section.
2. Last lesson must provide synthesis, application, or transition.
3. Keep lesson sequence logically progressive (foundational -> applied).
4. Avoid overloading one lesson with all key topics.

**Generation Requirements**:
- Lesson Breakdown: {{lessonGuidance}}
- All text in {{language}}
- Replace placeholders ([TBD], [insert X], [название]) with final text
- Duration fields are system-managed (do not invent extra duration fields)

{{ragToolInfo}}
{{outputFormat}}$prompt$;
  v_variables jsonb := '[
    {"name":"courseTitle","description":"Sanitized course title","required":true},
    {"name":"language","description":"Target language code (en, ru, etc.)","required":true},
    {"name":"stylePrompt","description":"Short style signal for structural generation","required":true},
    {"name":"style","description":"Raw style name (for constraint text)","required":true},
    {"name":"targetAudienceLine","description":"Pre-assembled target audience line or empty string","required":true},
    {"name":"userContext","description":"Pre-assembled user context section or empty string","required":true},
    {"name":"courseStructureMapSection","description":"Pre-assembled full course structure map block with focus rules, or empty string","required":true},
    {"name":"previousSectionsDigestSection","description":"Pre-assembled previously generated sections block or empty string","required":true},
    {"name":"sectionNumber","description":"Section number (1-based)","required":true},
    {"name":"sectionTitle","description":"Section title","required":true},
    {"name":"learningObjectives","description":"Section learning objectives (joined with \"; \")","required":true},
    {"name":"keyTopics","description":"Section key topics (joined with \", \")","required":true},
    {"name":"estimatedLessons","description":"Estimated number of lessons","required":true},
    {"name":"analysisContext","description":"Pre-assembled analysis context block or empty string","required":true},
    {"name":"constraintsSection","description":"Pre-assembled course structure constraints block or empty string","required":true},
    {"name":"schemaDescription","description":"Schema description from zodToPromptSchema()","required":true},
    {"name":"lessonGuidance","description":"Dynamic lesson count guidance based on constraints","required":true},
    {"name":"ragToolInfo","description":"Pre-assembled RAG tool availability block or empty string","required":true},
    {"name":"outputFormat","description":"Pre-assembled output format instructions (attempt 1 or retry)","required":true}
  ]'::jsonb;
  active_exists boolean;
  next_version integer;
BEGIN
  -- 1) Update active row if it already exists
  UPDATE prompt_templates
  SET
    prompt_name = 'Stage 5 - Batch Section Generator (RT-002 Optimized)',
    prompt_description = 'Generates detailed lesson breakdown for a single section. Uses RT-002 prompt engineering with course structure map, anti-overlap rules, and constraints from Stage 4 user edits.',
    prompt_template = v_template,
    variables = v_variables,
    updated_at = NOW()
  WHERE stage = 'stage_5'
    AND prompt_key = 'stage5_batch_section_generator'
    AND is_active = true;

  -- 2) Insert active row if key is missing
  SELECT EXISTS (
    SELECT 1
    FROM prompt_templates
    WHERE stage = 'stage_5'
      AND prompt_key = 'stage5_batch_section_generator'
      AND is_active = true
  ) INTO active_exists;

  IF NOT active_exists THEN
    SELECT COALESCE(MAX(version) + 1, 1)
    INTO next_version
    FROM prompt_templates
    WHERE stage = 'stage_5'
      AND prompt_key = 'stage5_batch_section_generator';

    INSERT INTO prompt_templates (
      stage,
      prompt_key,
      prompt_name,
      prompt_description,
      prompt_template,
      variables,
      version,
      is_active
    )
    VALUES (
      'stage_5',
      'stage5_batch_section_generator',
      'Stage 5 - Batch Section Generator (RT-002 Optimized)',
      'Generates detailed lesson breakdown for a single section. Uses RT-002 prompt engineering with course structure map, anti-overlap rules, and constraints from Stage 4 user edits.',
      v_template,
      v_variables,
      next_version,
      true
    );
  END IF;

  RAISE NOTICE 'Ensured active DB prompt for stage5_batch_section_generator';
END $$;

