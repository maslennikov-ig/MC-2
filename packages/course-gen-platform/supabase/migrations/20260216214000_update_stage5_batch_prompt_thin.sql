-- Migration: Update Stage 5 batch section prompt to thin/low-noise version
-- Purpose: Reduce prompt verbosity and style micromanagement for structure generation.
-- Date: 2026-02-16
-- Related: Stage 5 prompt minimalism rollout

UPDATE prompt_templates
SET
  prompt_name = 'Stage 5 - Batch Section Generator (RT-002 Optimized)',
  prompt_description = 'Generates detailed lesson breakdown for a single section. Uses RT-002 prompt engineering with course structure map, anti-overlap rules, and constraints from Stage 4 user edits.',
  prompt_template = $prompt$You are an expert course designer expanding one section into lesson structure.

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
{{outputFormat}}$prompt$,
  updated_at = NOW()
WHERE stage = 'stage_5'
  AND prompt_key = 'stage5_batch_section_generator'
  AND is_active = true;

DO $$
DECLARE
  active_count integer;
BEGIN
  SELECT COUNT(*)
  INTO active_count
  FROM prompt_templates
  WHERE stage = 'stage_5'
    AND prompt_key = 'stage5_batch_section_generator'
    AND is_active = true;

  IF active_count = 0 THEN
    RAISE WARNING 'No active stage5_batch_section_generator prompt found to update';
  ELSE
    RAISE NOTICE 'Updated stage5_batch_section_generator active prompt(s): %', active_count;
  END IF;
END $$;

