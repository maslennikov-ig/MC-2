-- Migration: Add stylePrompt to stage6_serial_generator prompt
-- Purpose: Enable course content style to affect lesson generation
-- Date: 2026-01-14
-- Related: Fix for style selection not affecting generated content
-- Issue: Stage 6 only used tone (formal/conversational) but not full style prompt

-- ============================================================================
-- UPDATE STAGE 6 SERIAL GENERATOR PROMPT WITH STYLE PROMPT
-- ============================================================================

UPDATE prompt_templates
SET prompt_template = $prompt$<lesson_context>
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

<content_style>
**WRITING STYLE GUIDELINES**

{{stylePrompt}}

Apply this style consistently throughout the section content. The style should influence:
- Vocabulary and phrasing choices
- Sentence structure and flow
- How concepts are introduced and explained
- The overall reading experience and engagement level
</content_style>

<rag_validation>
**CRITICAL: Reference Material Relevance Check**

Before using ANY content from <reference_material>, you MUST verify its relevance:

1. **Topic Match Test**: Does the chunk discuss the SAME topic as "{{sectionTitle}}" and the lesson "{{lessonTitle}}"?
   - If chunk discusses unrelated products, scenarios, or domains → IGNORE IT COMPLETELY
   - Example: If lesson is about "CRM for B2B sales" but chunk discusses "event ticket sales" → DO NOT USE

2. **Key Points Alignment**: Does the chunk support the key_points listed above?
   - Only use chunks that directly help explain the specified key_points
   - Generic or tangential information should be ignored

3. **When to IGNORE reference material**:
   - Chunk topic doesn't match section title
   - Chunk discusses different industry/product than lesson context
   - Chunk examples are for different use case than lesson focus
   - Using the chunk would confuse or mislead the reader

4. **When in doubt**: Generate accurate content from your knowledge rather than forcing irrelevant reference material.

**Quality over quantity**: It's better to write accurate content without references than to include misleading information from unrelated chunks.
</rag_validation>

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
3. **VALIDATE reference material relevance BEFORE using** (see rag_validation above)
4. Apply depth guidance: {{depthGuidance}}
5. Match the {{tone}} tone for {{targetAudience}} audience
6. **APPLY WRITING STYLE from <content_style> section** — This is crucial for consistency
7. INTER-LESSON CONTINUITY (from inter_lesson_context if provided):
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
    version = 3,
    updated_at = now()
WHERE stage = 'stage_6' AND prompt_key = 'stage6_serial_generator';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Updated stage6_serial_generator prompt with stylePrompt support (v3)';
END $$;
