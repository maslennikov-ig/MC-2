/**
 * Stage 6 Hardcoded Prompts - Lesson Content Generation (7 prompts)
 * @module shared/prompts/stage6-prompts
 *
 * Stage 6: Lesson Content Generation
 * - Serial Generator: Section-by-section content with context window (ACTIVE - used by section-regenerator)
 * - Single-Call Generator: Complete lesson in one call with duration-aware word budget (ACTIVE - primary method)
 * - Planner: Lesson outline generation (DEPRECATED)
 * - Expander: Section expansion (DEPRECATED)
 * - Assembler: Content assembly (DEPRECATED)
 * - Smoother: Transition refinement (DEPRECATED)
 * - Judge: Quality validation (ACTIVE)
 *
 * Note: Stage 6 refactored from 6-node to 3-node pipeline, then to single-call approach.
 * Deprecated prompts kept for historical reference.
 */

import type { HardcodedPrompt } from './types.js';

// ============================================================================
// STAGE 6 PROMPTS (7 total)
// ============================================================================

export const stage6Prompts: HardcodedPrompt[] = [
  {
    stage: 'stage_6',
    promptKey: 'stage6_serial_generator',
    promptName: 'Stage 6 - Serial Generator: Section-by-Section Content',
    promptDescription:
      'Generates section content sequentially with context window from previous sections. Enables natural transitions without separate Smoother node.',
    promptTemplate: `<lesson_context>
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
   \`\`\`mermaid
   flowchart TD
     A[Input] --> B{Decision}
     B -->|Yes| C[Result]
     B -->|No| D[Alternative]
   \`\`\`
   Types: flowchart TD/LR, sequenceDiagram, mindmap, pie, timeline

   CRITICAL MERMAID RULES:
   - NEVER use escaped quotes inside node labels: BAD: A[Text \\"quote\\" here]
   - Keep node labels simple and quote-free: GOOD: A[Простой текст]
   - For special characters use entity codes: A[Text #quot;quote#quot; here]

2. **Math Formulas** (LaTeX):
   - Inline: \`$E=mc^2$\` within text
   - Block: \`$$\\sum_{i=1}^{n} x_i$$\` centered on own line
   - Use \\boxed{} for key formulas: \`$$\\boxed{F = ma}$$\`

3. **Callouts** — For tips, warnings, key insights:
   > [!TIP]
   > Best practice or recommendation

   > [!WARNING]
   > Important caution

   > [!NOTE]
   > Key concept to remember

   Types: NOTE, TIP, WARNING, DANGER, INFO
   CRITICAL: Callout marker must start immediately after >. NEVER wrap in quotes.
   WRONG: > "[!TIP] text"    CORRECT: > [!TIP]

4. **Rich Code Blocks**:
   \`\`\`typescript filename="example.ts" {2,4-6}
   // Line highlighting draws attention
   \`\`\`

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
   - COURSE POSITION (from course_position if provided):
     - Use position awareness to write appropriate introductions and conclusions
     - If is_first_in_course: include course-level welcome and motivation, set expectations for the learning journey
     - If is_first_in_module: briefly introduce the module theme and bridge from previous module
     - If is_last_in_module but NOT is_last_in_course: write a MODULE summary and bridge to the next module. Do NOT write a course-level conclusion
     - If is_last_in_course: write a comprehensive COURSE conclusion with reflection on the full learning journey
     - For all other lessons: write a standard lesson conclusion that connects to the next lesson
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
</task>`,
    variables: [
      {
        name: 'lessonTitle',
        description: 'Lesson title',
        required: true,
      },
      {
        name: 'targetAudience',
        description: 'Target audience',
        required: true,
      },
      {
        name: 'tone',
        description: 'Content tone',
        required: true,
      },
      {
        name: 'difficulty',
        description: 'Difficulty level',
        required: true,
      },
      {
        name: 'sectionTitle',
        description: 'Section title to generate',
        required: true,
      },
      {
        name: 'contentArchetype',
        description: 'Content archetype',
        required: true,
      },
      {
        name: 'depth',
        description: 'Content depth (summary, detailed_analysis, comprehensive)',
        required: true,
      },
      {
        name: 'depthGuidance',
        description: 'Human-readable depth guidance',
        required: true,
      },
      {
        name: 'keyPoints',
        description: 'Formatted key points list',
        required: true,
      },
      {
        name: 'requiredKeywords',
        description: 'Comma-separated required keywords',
        required: false,
      },
      {
        name: 'prohibitedTerms',
        description: 'Comma-separated prohibited terms',
        required: false,
      },
      {
        name: 'ragContext',
        description: 'XML-formatted RAG context',
        required: false,
      },
      {
        name: 'previousContext',
        description:
          'Previous section content (3000-8000 chars, dynamic based on lesson duration/language) for transition smoothing',
        required: true,
      },
      {
        name: 'outputLanguage',
        description: 'Target language for all output content (e.g., "English", "Russian")',
        required: true,
        example: 'English',
      },
      {
        name: 'interLessonContext',
        description:
          'Inter-lesson context XML with previous/next lesson info and covered concepts (pre-rendered)',
        required: false,
      },
      {
        name: 'stylePrompt',
        description: 'Course content style prompt text',
        required: false,
      },
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'stage6_single_call_generator',
    promptName: 'Stage 6 - Single-Call Generator: Complete Lesson in One Call',
    promptDescription:
      'Generates complete lesson content in a single LLM call with duration-aware word budget. Replaces section-by-section approach for better coherence and accurate word counts.',
    promptTemplate: `<lesson_specification>
  <title>{{lessonTitle}}</title>
  <description>{{lessonDescription}}</description>
  <duration_minutes>{{durationMinutes}}</duration_minutes>
  <target_word_count>{{targetWordCount}}</target_word_count>
  <target_audience>{{targetAudience}}</target_audience>
  <tone>{{tone}}</tone>
  <difficulty>{{difficulty}}</difficulty>

  <learning_objectives>
{{learningObjectives}}
  </learning_objectives>

  <sections_to_cover>
{{sectionsList}}
  </sections_to_cover>

  <intro_blueprint>
    <hook_strategy>{{hookStrategy}}</hook_strategy>
    <hook_topic>{{hookTopic}}</hook_topic>
  </intro_blueprint>
</lesson_specification>

<reference_material>
{{ragContext}}
</reference_material>

{{interLessonContext}}

{{generationGuidance}}

<content_style>
{{stylePrompt}}
</content_style>

<rag_validation>
**CRITICAL: Reference Material Relevance Check**

Before using ANY content from <reference_material>, you MUST verify its relevance:

1. **Topic Match Test**: Does the chunk discuss the SAME topic as the lesson "{{lessonTitle}}"?
   - If chunk discusses unrelated products, scenarios, or domains → IGNORE IT COMPLETELY

2. **Key Points Alignment**: Does the chunk support the learning objectives listed above?
   - Only use chunks that directly help explain the specified topics
   - Generic or tangential information should be ignored

3. **When to IGNORE reference material**:
   - Chunk topic doesn't match lesson focus
   - Chunk discusses different industry/product than lesson context
   - Using the chunk would confuse or mislead the reader

4. **When in doubt**: Generate accurate content from your knowledge rather than forcing irrelevant reference material.

**Quality over quantity**: It's better to write accurate content without references than to include misleading information from unrelated chunks.
</rag_validation>

<visual_toolkit>
Use actively to create engaging content:
1. **Mermaid Diagrams** — flowchart TD/LR, sequenceDiagram, mindmap, pie, timeline
   CRITICAL: NEVER use escaped quotes in node labels. Keep labels simple.
2. **Math Formulas** (LaTeX): inline \`$E=mc^2$\` or block \`$$\\sum_{i=1}^{n} x_i$$\`
3. **Callouts**: > [!TIP], > [!WARNING], > [!NOTE], > [!INFO]
   CRITICAL: NEVER wrap callout markers in quotes. WRONG: > "[!TIP]"  CORRECT: > [!TIP]
4. **Tables** for comparisons
5. **Code blocks** with filenames when relevant
*Syntax keywords stay in English regardless of output language.*
</visual_toolkit>

<output_language>
MANDATORY: Write ALL content in {{outputLanguage}}.
Every word, header, example must be in {{outputLanguage}}.
DO NOT mix languages (except code/syntax keywords).
</output_language>

<task>
Write a COMPLETE lesson for a {{durationMinutes}}-minute reading session.
Target: approximately {{targetWordCount}} words total (excluding exercises and digest).

STRUCTURE (use ## headers for each section):
1. ## {{introductionHeader}} — Hook ({{hookStrategy}}) + preview of learning objectives (100-150 words)
2. Content sections (one ## header per topic from sections_to_cover).
   All sections combined should be approximately {{sectionsWordBudget}} words.
   Each section should be focused and proportional.
3. ## {{summaryHeader}} — Brief recap + next steps (80-120 words)
4. ## {{exercisesHeader}} — Exactly 2 practical exercises

Exercise format (use {{outputLanguage}} labels):
### {{exerciseLabel}} 1: [Title]
**{{taskLabel}}:** [Description]
**{{scenarioLabel}}:** [If applicable]
**{{yourAnswerLabel}}:**
> **{{hintLabel}}:** [Hint]
> **{{sampleAnswerLabel}}:** [Model answer]

---

### {{exerciseLabel}} 2: [Title]
[Same format]

5. ## {{digestHeader}} — Write a 3-5 sentence factual summary of the lesson content.
   - Use objective, encyclopedic tone (no "you will learn", "exciting", etc.)
   - Focus on what topics were covered and key takeaways
   - This will be used as context for the next lesson generation

CRITICAL RULES:
- This is a {{durationMinutes}}-minute lesson. Be concise and focused.
- DO NOT repeat or re-explain topics between sections. Each section covers its own unique content.
- Transitions between sections: 1 sentence max. NO recaps of previous sections.
- Cover ALL topics from sections_to_cover, but keep each proportional to the total word budget.
- Include at least 1 visual element (diagram, table, or callout) in the lesson.
- DO NOT start sections with "As we discussed..." or "In the previous section..." patterns.
- VALIDATE reference material relevance BEFORE using (see rag_validation).
- INTER-LESSON CONTINUITY (from inter_lesson_context if provided):
  - Reference previous lesson naturally if context is given
  - Do NOT re-explain terms from terms_already_defined
  - In summary, tease next lesson if next_lesson info is provided
  - COURSE POSITION (from course_position if provided):
    - Use position awareness to write appropriate introductions and conclusions
    - If is_first_in_course: include course-level welcome and motivation, set expectations for the learning journey
    - If is_first_in_module: briefly introduce the module theme and bridge from previous module
    - If is_last_in_module but NOT is_last_in_course: write a MODULE summary and bridge to the next module. Do NOT write a course-level conclusion
    - If is_last_in_course: write a comprehensive COURSE conclusion with reflection on the full learning journey
    - For all other lessons: write a standard lesson conclusion that connects to the next lesson
</task>`,
    variables: [
      { name: 'lessonTitle', description: 'Lesson title', required: true },
      { name: 'lessonDescription', description: 'Lesson description', required: true },
      { name: 'durationMinutes', description: 'Estimated duration in minutes', required: true },
      {
        name: 'targetWordCount',
        description: 'Target word count (durationMinutes × 150)',
        required: true,
      },
      { name: 'targetAudience', description: 'Target audience', required: true },
      { name: 'tone', description: 'Content tone', required: true },
      { name: 'difficulty', description: 'Difficulty level', required: true },
      {
        name: 'learningObjectives',
        description: 'Formatted learning objectives list',
        required: true,
      },
      {
        name: 'sectionsList',
        description: 'Numbered list of section titles to cover',
        required: true,
      },
      {
        name: 'hookStrategy',
        description: 'Hook strategy (analogy, statistic, challenge, question)',
        required: true,
      },
      { name: 'hookTopic', description: 'Topic for the hook', required: true },
      {
        name: 'ragContext',
        description: 'XML-formatted RAG context (all chunks deduplicated)',
        required: false,
      },
      {
        name: 'interLessonContext',
        description: 'Inter-lesson context XML (previous/next lesson info, pre-rendered)',
        required: false,
      },
      {
        name: 'generationGuidance',
        description: 'Generation guidance XML from Stage 4 analysis (pre-rendered)',
        required: false,
      },
      { name: 'stylePrompt', description: 'Course content style prompt text', required: false },
      {
        name: 'outputLanguage',
        description: 'Target language for all output (e.g., "Russian", "English")',
        required: true,
        example: 'Russian',
      },
      {
        name: 'introductionHeader',
        description: 'Localized "Introduction" header',
        required: true,
      },
      {
        name: 'summaryHeader',
        description: 'Localized "Summary/Conclusion" header',
        required: true,
      },
      { name: 'exercisesHeader', description: 'Localized "Exercises" header', required: true },
      { name: 'exerciseLabel', description: 'Localized "Exercise" label', required: true },
      { name: 'taskLabel', description: 'Localized "Task" label', required: true },
      { name: 'scenarioLabel', description: 'Localized "Scenario" label', required: true },
      { name: 'yourAnswerLabel', description: 'Localized "Your Answer" label', required: true },
      { name: 'hintLabel', description: 'Localized "Hint" label', required: true },
      { name: 'sampleAnswerLabel', description: 'Localized "Sample Answer" label', required: true },
      {
        name: 'digestHeader',
        description: 'Localized "Lesson Digest" / "Краткое содержание урока" header',
        required: true,
      },
      {
        name: 'sectionsWordBudget',
        description:
          'Word budget for main content sections (excludes intro, summary, exercises, digest)',
        required: true,
      },
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'stage6_planner',
    promptName: 'Stage 6 - Planner: Lesson Outline Generation [DEPRECATED]',
    promptDescription:
      '[DEPRECATED - Stage 6 refactored from 6-node to 3-node pipeline] Generates detailed lesson outline from specification. Uses Context-First XML strategy with lesson context, learning objectives, RAG context, and visual planning.',
    promptTemplate: `<lesson_context>
  <metadata>
    <lesson_id>{{lessonId}}</lesson_id>
    <title>{{lessonTitle}}</title>
    <description>{{lessonDescription}}</description>
    <difficulty>{{difficulty}}</difficulty>
    <duration_minutes>{{durationMinutes}}</duration_minutes>
    <target_audience>{{targetAudience}}</target_audience>
    <tone>{{tone}}</tone>
    <content_archetype>{{contentArchetype}}</content_archetype>
  </metadata>

  <learning_objectives>
{{learningObjectives}}
  </learning_objectives>

  <introduction_blueprint>
    <hook_strategy>{{hookStrategy}}</hook_strategy>
    <hook_topic>{{hookTopic}}</hook_topic>
    <key_objectives>{{keyObjectives}}</key_objectives>
  </introduction_blueprint>

  <sections>
{{sections}}
  </sections>

  <reference_material>
  {{ragContext}}
  </reference_material>
</lesson_context>

<visual_capabilities>
Available: Mermaid (flowchart, sequence, mindmap, timeline), Math (LaTeX), Callouts (NOTE/TIP/WARNING/DANGER/INFO), Rich Code (filename, line highlight), Tables.
Plan WHERE to use these for maximum visual impact.
</visual_capabilities>

{{#userRefinementPrompt}}
<user_refinement_instructions>
{{userRefinementPrompt}}
</user_refinement_instructions>
{{/userRefinementPrompt}}

<output_language>
MANDATORY: Write ALL content in {{outputLanguage}}.
Every word, header, example, and explanation must be in {{outputLanguage}}.
DO NOT mix languages.
</output_language>

<task>
Create a detailed lesson outline based on the specification above. The outline must:

1. **Introduction**: Plan the opening using the specified hook strategy ({{hookStrategy}})
   - Design a {{hookStrategy}} hook about: {{hookTopic}}
   - Preview the key learning objectives

2. **Main Sections**: For each section listed above, create:
   - 3-5 key points to cover
   - **Visual Plan**: Suggest 1-2 visual elements per section:
     - [DIAGRAM]: flowchart/sequence/mindmap — describe what it shows
     - [TABLE]: comparison/data — describe columns
     - [CALLOUT]: tip/warning/note — describe key message
     - [CODE]: filename and purpose
   - Practical example placeholder:
     > **Example: [Name]** — [Brief scenario description]
   - Transition to next section

3. **Conclusion**: Plan a summary that:
   - Reinforces each learning objective
   - Provides actionable next steps

{{#userRefinementPrompt}}
IMPORTANT: You MUST incorporate the user refinement instructions provided above into the outline structure.
{{/userRefinementPrompt}}

Format as markdown outline. Target total reading time: {{durationMinutes}} minutes
</task>`,
    variables: [
      {
        name: 'lessonId',
        description: 'Lesson UUID',
        required: true,
      },
      {
        name: 'lessonTitle',
        description: 'Lesson title',
        required: true,
      },
      {
        name: 'lessonDescription',
        description: 'Lesson description',
        required: true,
      },
      {
        name: 'difficulty',
        description: 'Difficulty level',
        required: true,
      },
      {
        name: 'durationMinutes',
        description: 'Estimated duration in minutes',
        required: true,
      },
      {
        name: 'targetAudience',
        description: 'Target audience level',
        required: true,
      },
      {
        name: 'tone',
        description: 'Content tone (formal, conversational, etc.)',
        required: true,
      },
      {
        name: 'contentArchetype',
        description: 'Content archetype (code_tutorial, concept_explainer, etc.)',
        required: true,
      },
      {
        name: 'learningObjectives',
        description: 'XML-formatted learning objectives',
        required: true,
      },
      {
        name: 'hookStrategy',
        description: 'Hook strategy (analogy, statistic, challenge, question)',
        required: true,
      },
      {
        name: 'hookTopic',
        description: 'Topic for the hook',
        required: true,
      },
      {
        name: 'keyObjectives',
        description: 'Key learning objectives summary',
        required: true,
      },
      {
        name: 'sections',
        description: 'XML-formatted sections breakdown',
        required: true,
      },
      {
        name: 'ragContext',
        description: 'XML-formatted RAG context chunks',
        required: false,
      },
      {
        name: 'outputLanguage',
        description: 'Target language for all output content (e.g., "English", "Russian")',
        required: true,
        example: 'English',
      },
      {
        name: 'userRefinementPrompt',
        description: 'Optional user feedback for content regeneration',
        required: false,
        example: 'Add more practical examples to section 2',
      },
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'stage6_expander',
    promptName: 'Stage 6 - Expander: Section Content Expansion [DEPRECATED]',
    promptDescription:
      '[DEPRECATED - Stage 6 refactored from 6-node to 3-node pipeline] Expands a single section from outline into full content. Uses content archetype, depth guidance, RAG context, and visual toolkit for engaging content.',
    promptTemplate: `<lesson_context>
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

  <lesson_outline>
{{lessonOutline}}
  </lesson_outline>

  <reference_material>
  {{ragContext}}
  </reference_material>
</lesson_context>

<visual_toolkit>
**VISUAL ELEMENTS** — Use actively to create engaging, professional content:

1. **Mermaid Diagrams** — For processes, flows, relationships:
   \`\`\`mermaid
   flowchart TD
     A[Input] --> B{Decision}
     B -->|Yes| C[Result]
     B -->|No| D[Alternative]
   \`\`\`
   Types: flowchart TD/LR, sequenceDiagram, mindmap, pie, timeline

   CRITICAL MERMAID RULES:
   - NEVER use escaped quotes inside node labels: BAD: A[Text \\"quote\\" here]
   - Keep node labels simple and quote-free: GOOD: A[Простой текст]
   - For special characters use entity codes: A[Text #quot;quote#quot; here]

2. **Math Formulas** (LaTeX):
   - Inline: \`$E=mc^2$\` within text
   - Block: \`$$\\sum_{i=1}^{n} x_i$$\` centered on own line
   - Use \\boxed{} for key formulas: \`$$\\boxed{F = ma}$$\`

3. **Callouts** — For tips, warnings, key insights:
   > [!TIP]
   > Best practice or recommendation

   > [!WARNING]
   > Important caution

   > [!NOTE]
   > Key concept to remember

   Types: NOTE, TIP, WARNING, DANGER, INFO
   CRITICAL: Callout marker must start immediately after >. NEVER wrap in quotes.
   WRONG: > "[!TIP] text"    CORRECT: > [!TIP]

4. **Rich Code Blocks**:
   \`\`\`typescript filename="example.ts" {2,4-6}
   // Line highlighting draws attention
   \`\`\`

5. **Tables** — For comparisons, structured data

*Syntax keywords (mermaid, filename, [!TIP]) stay in English regardless of output language.*
</visual_toolkit>

<output_language>
MANDATORY: Write ALL content in {{outputLanguage}}.
Every word, header, example, and explanation must be in {{outputLanguage}}.
DO NOT mix languages (except code/syntax keywords).
</output_language>

<task>
Write the full content for the "{{sectionTitle}}" section. Requirements:

1. **Cover All Key Points**: Address each point from the specification
2. **Match Depth**: {{depthGuidance}}

3. **Content & Visual Style** ({{contentArchetype}}):
   - *code_tutorial*: Step-by-step with Rich Code blocks (filename REQUIRED). Use flowchart for architecture overview.
   - *concept_explainer*: Clear analogies. USE Mermaid for processes/relationships, Math for formulas, [!TIP] for insights.
   - *case_study*: Narrative with Tables for comparisons, [!INFO] for key takeaways, timeline diagrams if applicable.
   - *legal_warning*: Precise, authoritative. USE [!WARNING]/[!DANGER] for critical points. Minimal decorative visuals.

4. **REQUIRED: Visual Enhancement** — Each section SHOULD include at least one:
   - Diagram (flowchart, sequence, or mindmap) for processes/flows
   - Table for comparisons or structured data
   - Callout for key insight or warning
   - Code block with filename for technical content

5. **REQUIRED: Practical Example** — Use callout format:
   > [!INFO]
   > **Example: [Situation Name]**
   > [Specific situation with concrete details, numbers, or names (2-4 sentences)]

6. **Include Keywords**: Naturally incorporate: {{requiredKeywords}}
7. **Avoid Terms**: Do not use: {{prohibitedTerms}}
8. **Tone**: Maintain {{tone}} tone
9. **Audience**: Write for {{targetAudience}} level

Output as markdown. Do NOT include the section title as a header.
</task>`,
    variables: [
      {
        name: 'lessonTitle',
        description: 'Lesson title',
        required: true,
      },
      {
        name: 'targetAudience',
        description: 'Target audience',
        required: true,
      },
      {
        name: 'tone',
        description: 'Content tone',
        required: true,
      },
      {
        name: 'difficulty',
        description: 'Difficulty level',
        required: true,
      },
      {
        name: 'sectionTitle',
        description: 'Section title to expand',
        required: true,
      },
      {
        name: 'contentArchetype',
        description: 'Content archetype',
        required: true,
      },
      {
        name: 'depth',
        description: 'Content depth (summary, detailed_analysis, comprehensive)',
        required: true,
      },
      {
        name: 'depthGuidance',
        description: 'Human-readable depth guidance',
        required: true,
      },
      {
        name: 'keyPoints',
        description: 'XML-formatted key points',
        required: true,
      },
      {
        name: 'requiredKeywords',
        description: 'Comma-separated required keywords',
        required: false,
      },
      {
        name: 'prohibitedTerms',
        description: 'Comma-separated prohibited terms',
        required: false,
      },
      {
        name: 'lessonOutline',
        description: 'Full lesson outline from planner',
        required: true,
      },
      {
        name: 'ragContext',
        description: 'XML-formatted RAG context',
        required: false,
      },
      {
        name: 'outputLanguage',
        description: 'Target language for all output content (e.g., "English", "Russian")',
        required: true,
        example: 'English',
      },
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'stage6_assembler',
    promptName: 'Stage 6 - Assembler: Content Assembly [DEPRECATED]',
    promptDescription:
      '[DEPRECATED - Stage 6 refactored from 6-node to 3-node pipeline] Assembles expanded sections into cohesive lesson with introduction, transitions, exercises, and conclusion. Preserves all visual elements.',
    promptTemplate: `<lesson_context>
  <metadata>
    <title>{{lessonTitle}}</title>
    <description>{{lessonDescription}}</description>
    <difficulty>{{difficulty}}</difficulty>
    <duration_minutes>{{durationMinutes}}</duration_minutes>
    <target_audience>{{targetAudience}}</target_audience>
    <tone>{{tone}}</tone>
  </metadata>

  <introduction_blueprint>
    <hook_strategy>{{hookStrategy}}</hook_strategy>
    <hook_topic>{{hookTopic}}</hook_topic>
    <key_objectives>{{keyObjectives}}</key_objectives>
  </introduction_blueprint>

  <expanded_sections>
{{expandedSections}}
  </expanded_sections>

  <exercise_specs>
{{exerciseSpecs}}
  </exercise_specs>
</lesson_context>

<output_language>
MANDATORY: Write ALL content in {{outputLanguage}}.
Every word, header, example, and explanation must be in {{outputLanguage}}.
DO NOT mix languages (except code/syntax keywords).
</output_language>

<task>
Assemble a complete lesson from the expanded sections above. You must:

1. **Write Introduction**:
   - Create a {{hookStrategy}} hook about: {{hookTopic}}
   - Preview the key learning objectives
   - Transition smoothly into the first section

2. **Assemble Sections**:
   - Include each expanded section with its title as a heading
   - Add smooth transitions between sections
   - **CRITICAL — Preserve All Visual Elements**:
     - DO NOT modify \`\`\`mermaid blocks
     - DO NOT modify $$...$$ math formulas
     - DO NOT modify > [!NOTE/TIP/WARNING] callouts
     - DO NOT modify \`\`\`lang filename="..." code blocks
     - Keep ALL special markdown syntax exactly as written
   - Maintain consistent tone throughout

3. **Create Exercises**: Follow the structure templates provided

4. **Write Conclusion**:
   - Summarize key takeaways
   - Reinforce learning objectives
   - Provide next steps

Output as complete markdown lesson.
</task>`,
    variables: [
      {
        name: 'lessonTitle',
        description: 'Lesson title',
        required: true,
      },
      {
        name: 'lessonDescription',
        description: 'Lesson description',
        required: true,
      },
      {
        name: 'difficulty',
        description: 'Difficulty level',
        required: true,
      },
      {
        name: 'durationMinutes',
        description: 'Duration in minutes',
        required: true,
      },
      {
        name: 'targetAudience',
        description: 'Target audience',
        required: true,
      },
      {
        name: 'tone',
        description: 'Content tone',
        required: true,
      },
      {
        name: 'hookStrategy',
        description: 'Hook strategy',
        required: true,
      },
      {
        name: 'hookTopic',
        description: 'Hook topic',
        required: true,
      },
      {
        name: 'keyObjectives',
        description: 'Key objectives summary',
        required: true,
      },
      {
        name: 'expandedSections',
        description: 'XML-formatted expanded sections',
        required: true,
      },
      {
        name: 'exerciseSpecs',
        description: 'XML-formatted exercise specifications',
        required: false,
      },
      {
        name: 'outputLanguage',
        description: 'Target language for all output content (e.g., "English", "Russian")',
        required: true,
        example: 'English',
      },
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'stage6_smoother',
    promptName: 'Stage 6 - Smoother: Transition Refinement [DEPRECATED]',
    promptDescription:
      '[DEPRECATED - Stage 6 refactored from 6-node to 3-node pipeline] Polishes assembled content with improved transitions, consistent tone, and refined prose. Does NOT change structure or technical content.',
    promptTemplate: `<lesson_context>
  <metadata>
    <title>{{lessonTitle}}</title>
    <target_audience>{{targetAudience}}</target_audience>
    <tone>{{tone}}</tone>
    <difficulty>{{difficulty}}</difficulty>
  </metadata>

  <style_requirements>
    <tone_guidance>
{{toneGuidance}}
    </tone_guidance>
    <audience_level>
{{audienceLevel}}
    </audience_level>
  </style_requirements>

  <assembled_content>
{{assembledContent}}
  </assembled_content>
</lesson_context>

<output_language>
MANDATORY: Write ALL content in {{outputLanguage}}.
Every word, header, example, and explanation must be in {{outputLanguage}}.
DO NOT mix languages.
</output_language>

<task>
Polish and refine the lesson content above. Focus on:

1. **Transitions**: Ensure smooth flow between sections
2. **Tone Consistency**: Apply {{tone}} tone throughout
3. **Clarity**: Improve readability
4. **Engagement**: Enhance learner engagement

5. **Preserve**: Do NOT change:
   - Section structure and headings
   - Code examples and their explanations
   - Exercise content and solutions
   - Key technical information

Output the polished lesson content in full, maintaining all markdown formatting.
</task>`,
    variables: [
      {
        name: 'lessonTitle',
        description: 'Lesson title',
        required: true,
      },
      {
        name: 'targetAudience',
        description: 'Target audience',
        required: true,
      },
      {
        name: 'tone',
        description: 'Content tone',
        required: true,
      },
      {
        name: 'difficulty',
        description: 'Difficulty level',
        required: true,
      },
      {
        name: 'toneGuidance',
        description: 'Specific tone guidance based on tone type',
        required: true,
      },
      {
        name: 'audienceLevel',
        description: 'Audience-level specific guidance',
        required: true,
      },
      {
        name: 'assembledContent',
        description: 'Assembled lesson content from assembler',
        required: true,
      },
      {
        name: 'outputLanguage',
        description: 'Target language for all output content (e.g., "English", "Russian")',
        required: true,
        example: 'English',
      },
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'stage6_judge',
    promptName: 'Stage 6 - Judge: Quality Validation',
    promptDescription:
      'Validates lesson quality against specification. Checks completeness, accuracy, and adherence to constraints.',
    promptTemplate: `You are a curriculum quality validator. Evaluate the lesson against its specification.

LESSON SPECIFICATION:
{{lessonSpec}}

GENERATED LESSON:
{{generatedLesson}}

<output_language>
The validation feedback (issues, strengths, suggestions) should be written in {{outputLanguage}}.
</output_language>

VALIDATION CRITERIA:
1. **Completeness**: All learning objectives covered
2. **Accuracy**: Content matches specification requirements
3. **Structure**: Follows required structure (intro, sections, exercises, conclusion)
4. **Constraints**: Adheres to required keywords, prohibited terms, depth
5. **Quality**: Clear, engaging, appropriate for target audience
6. **Language Consistency**: All content is in the specified output language ({{outputLanguage}})

OUTPUT FORMAT (JSON):
{
  "isValid": boolean,
  "overallScore": number (0.0-1.0),
  "issues": [
    {
      "severity": "critical" | "warning" | "suggestion",
      "category": string,
      "description": string
    }
  ],
  "strengths": [string],
  "suggestions": [string]
}

Be objective and constructive. Focus on specification adherence.`,
    variables: [
      {
        name: 'lessonSpec',
        description: 'JSON-formatted lesson specification',
        required: true,
      },
      {
        name: 'generatedLesson',
        description: 'Generated lesson content to validate',
        required: true,
      },
      {
        name: 'outputLanguage',
        description: 'Target language for validation feedback (e.g., "English", "Russian")',
        required: true,
        example: 'English',
      },
    ],
  },
];
