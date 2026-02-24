-- Migration: Seed stage6_serial_generator prompt to prompt_templates
-- Purpose: Add the serial generator prompt so it can be edited via UI (currently using hardcoded fallback)
-- Date: 2026-01-08
-- Related: Stage 6 lesson content generation pipeline

-- ============================================================================
-- STAGE 6 SERIAL GENERATOR PROMPT
-- ============================================================================

INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_6',
  'stage6_serial_generator',
  'Stage 6 - Serial Generator: Section-by-Section Content',
  'Generates section content sequentially with context window from previous sections. Enables natural transitions without separate Smoother node.',
  $prompt$<lesson_context>
  <metadata>
    <lesson_title>{{lessonTitle}}</lesson_title>
    <target_audience>{{targetAudience}}</target_audience>
    <tone>{{tone}}</tone>
    <difficulty>{{difficulty}}</difficulty>
  </metadata>

  <section_spec>
    <title>{{sectionTitle}}</title>
    <content_archetype>{{contentArchetype}}</content_archetype>
    <depth>{{depth}}</depth>
    <depth_guidance>{{depthGuidance}}</depth_guidance>
    <key_points>
{{keyPoints}}
    </key_points>
    <required_keywords>{{requiredKeywords}}</required_keywords>
    <prohibited_terms>{{prohibitedTerms}}</prohibited_terms>
  </section_spec>

  <reference_material>
  {{ragContext}}
  </reference_material>

  <previous_context>
{{previousContext}}
  </previous_context>

{{interLessonContext}}
</lesson_context>

<visual_toolkit>
**VISUAL ELEMENTS** — Use actively to create engaging, professional content:

1. **Mermaid Diagrams** — For processes, flows, relationships:
   ```mermaid
   flowchart TD
     A[Input] --> B{Decision}
     B -->|Yes| C[Result]
     B -->|No| D[Alternative]
   ```
   Types: flowchart TD/LR, sequenceDiagram, mindmap, pie, timeline

   CRITICAL MERMAID RULES:
   - NEVER use escaped quotes inside node labels: BAD: A[Text \"quote\" here]
   - Keep node labels simple and quote-free: GOOD: A[Простой текст]
   - For special characters use entity codes: A[Text #quot;quote#quot; here]

2. **Math Formulas** (LaTeX):
   - Inline: `$E=mc^2$` within text
   - Block: `$$\sum_{i=1}^{n} x_i$$` centered on own line
   - Use \boxed{} for key formulas: `$$\boxed{F = ma}$$`

3. **Callouts** — For tips, warnings, key insights:
   > [!TIP]
   > Best practice or recommendation

   > [!WARNING]
   > Important caution

   > [!NOTE]
   > Key concept to remember

   Types: NOTE, TIP, WARNING, DANGER, INFO

4. **Rich Code Blocks**:
   ```typescript filename="example.ts" {2,4-6}
   // Line highlighting draws attention
   ```

5. **Tables** — For comparisons, structured data

*Syntax keywords (mermaid, filename, [!TIP]) stay in English regardless of output language.*
</visual_toolkit>

<output_language>
MANDATORY: Write ALL content in {{outputLanguage}}.
Every word, header, example, and explanation must be in {{outputLanguage}}.
DO NOT mix languages (except code/syntax keywords).
</output_language>

<task>
Write the content for section "{{sectionTitle}}".

CRITICAL INSTRUCTIONS:
1. DO NOT repeat the lesson title or introduction
2. Create a SMOOTH TRANSITION from the previous context
3. Use the reference material to inform your content
4. Apply depth guidance: {{depthGuidance}}
5. Match the {{tone}} tone for {{targetAudience}} audience
6. INTER-LESSON CONTINUITY (from inter_lesson_context if provided):
   - Reference previous lesson naturally: "As we explored in [previous_lesson.title]..." or "Building on [concept]..."
   - Do NOT re-explain terms from terms_already_defined — the reader already knows them
   - In conclusion sections, tease next lesson: "In the next lesson, we will explore [next_lesson.title]..."
   Example:
   ✓ GOOD: "Building on the React hooks concept from the previous lesson, let's explore..."
   ✗ BAD: "React hooks allow you to use state in functional components..." (re-explaining known term)

Content Requirements:
- Cover all key points from the specification
- Naturally incorporate keywords: {{requiredKeywords}}
- Avoid prohibited terms: {{prohibitedTerms}}
- Match content archetype: {{contentArchetype}}

Visual Enhancement (REQUIRED):
- Include at least ONE visual element (diagram, table, callout, or code block)
- Use visuals that enhance understanding, not decoration

Practical Examples:
- Include concrete examples using callout format:
  > [!INFO]
  > **Example: [Situation Name]**
  > [Specific details, 2-4 sentences]

Output markdown content for this section only (no header needed).
</task>$prompt$,
  '[
    {"name":"lessonTitle","description":"Lesson title","required":true},
    {"name":"targetAudience","description":"Target audience","required":true},
    {"name":"tone","description":"Content tone","required":true},
    {"name":"difficulty","description":"Difficulty level","required":true},
    {"name":"sectionTitle","description":"Section title to generate","required":true},
    {"name":"contentArchetype","description":"Content archetype","required":true},
    {"name":"depth","description":"Content depth (summary, detailed_analysis, comprehensive)","required":true},
    {"name":"depthGuidance","description":"Human-readable depth guidance","required":true},
    {"name":"keyPoints","description":"Formatted key points list","required":true},
    {"name":"requiredKeywords","description":"Comma-separated required keywords","required":false},
    {"name":"prohibitedTerms","description":"Comma-separated prohibited terms","required":false},
    {"name":"ragContext","description":"XML-formatted RAG context","required":false},
    {"name":"previousContext","description":"Previous section content for transition smoothing","required":true},
    {"name":"outputLanguage","description":"Target language for all output content (e.g., English, Russian)","required":true,"example":"English"},
    {"name":"interLessonContext","description":"Inter-lesson context XML with previous/next lesson info and covered concepts","required":false}
  ]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key, version) DO UPDATE SET
  prompt_name = EXCLUDED.prompt_name,
  prompt_description = EXCLUDED.prompt_description,
  prompt_template = EXCLUDED.prompt_template,
  variables = EXCLUDED.variables,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Seeded stage6_serial_generator prompt to prompt_templates table';
END $$;
