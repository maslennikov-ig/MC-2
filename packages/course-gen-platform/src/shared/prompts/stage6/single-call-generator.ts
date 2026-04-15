import type { HardcodedPrompt } from '../types.js';

export const singleCallGeneratorPrompt: HardcodedPrompt = {
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
**VISUAL ELEMENTS** — Use actively to create engaging, professional content:

1. **Mermaid Diagrams** — For processes, flows, relationships:
   \`\`\`mermaid
   flowchart TD
     A[Input] --> B{Decision}
     B -->|Yes| C[Result]
     B -->|No| D[Alternative]
   \`\`\`
   Types: flowchart TD/LR, sequenceDiagram, mindmap, pie, timeline
   CRITICAL: NEVER use escaped quotes in node labels. Keep labels simple.

2. **Tables** — For comparisons, structured data, feature matrices:
   | Feature | Option A | Option B |
   |---------|----------|----------|
   | Speed   | Fast     | Moderate |
   Tables must be standalone blocks — NEVER place tables inside numbered or bulleted lists.

3. **Math Formulas** (LaTeX): inline \`$E=mc^2$\` or block \`$$\\sum_{i=1}^{n} x_i$$\`
{{codeBlockInstruction}}

4. **Callouts** — For tips, warnings, key insights:
   > [!TIP]
   > Best practice or recommendation

   > [!WARNING]
   > Important caution

   Types: NOTE, TIP, WARNING, INFO
   CRITICAL: NEVER wrap callout markers in quotes. WRONG: > "[!TIP]"  CORRECT: > [!TIP]
   Use max 1-2 callouts per lesson for genuinely important tips.

*Syntax keywords (mermaid, [!TIP]) stay in English regardless of output language.*

**MINIMUM VISUAL DENSITY**: Each content section SHOULD include at least one visual element (diagram, table, callout, or comparison). Lessons without ANY visual elements are considered low quality.
</visual_toolkit>

<output_language>
MANDATORY: Write ALL content in {{outputLanguage}}.
Every word, header, example must be in {{outputLanguage}}.
DO NOT mix languages (except code/syntax keywords).
</output_language>

<task>
Write a COMPLETE lesson for a {{durationMinutes}}-minute reading session.
Target: approximately {{targetWordCount}} words total (excluding exercises and digest).

STRUCTURE — exactly 4 parts (use ## headers for each):
1. Intro block MUST start with this exact header line: ## {{introductionHeader}}
   Then write a short hook ({{hookStrategy}}) + motivating context in 2 short paragraphs (target 80-140 words, hard max 170 words).
   IMPORTANT: Do NOT list or preview learning objectives — they are displayed separately in the UI above the lesson content.
   Intro anti-teaser rule: do NOT mention "next lesson/next section", do NOT preview later techniques/topics, and do NOT enumerate later sections.
2. Content sections (one ## header per topic from sections_to_cover).
   All sections combined should be approximately {{sectionsWordBudget}} words.
   Each section should be focused and proportional. Never pre-summarize later sections.
3. ## {{exercisesHeader}} — Exactly 2 practical exercises

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

4. ## {{digestHeader}} — Write a 3-5 sentence factual summary of the lesson content.
   - Use objective, encyclopedic tone (no "you will learn", "exciting", etc.)
   - Focus on what topics were covered and key takeaways
   - This will be used as context for the next lesson generation

CRITICAL RULES:
- This is a {{durationMinutes}}-minute lesson. Be concise and focused.
- DO NOT repeat or re-explain topics between sections. Each section covers its own unique content.
- Transitions between sections: 1 sentence max. NO recaps of previous sections.
- Cover ALL topics from sections_to_cover, but keep each proportional to the total word budget.
- **REQUIRED: Visual Enhancement** — Include at least one visual element per content section (diagram, table, callout, or comparison). Use visuals that enhance understanding, not decoration.
- DO NOT start sections with "As we discussed..." or "In the previous section..." patterns.
- VALIDATE reference material relevance BEFORE using (see rag_validation).
- For non-technical or business audiences: explain conceptually and use business examples. Tables are especially effective for comparing strategies, metrics, or features. Mermaid flowcharts work well for workflows, decision trees, and process maps.
- Code or config snippets are allowed only for code_tutorial.
- Intro must be self-contained: no "next lesson/next section" teasers and no previews of later sections/topics.
- INTER-LESSON CONTINUITY (from inter_lesson_context if provided):
  - Reference previous lesson naturally if context is given
  - Do NOT re-explain terms from terms_already_defined
  - COURSE POSITION (from course_position if provided):
    - Use position awareness to write appropriate introductions
    - If is_first_in_course: include course-level welcome and motivation, set expectations for the learning journey
    - If is_first_in_module: briefly introduce the module theme and bridge from previous module
    - If is_last_in_module but NOT is_last_in_course: briefly synthesize module progress in the final body section
    - If is_last_in_course: reinforce course-level outcomes in the final body section
- Anti-overlap rule: do NOT recap or enumerate techniques/topics that belong to later sections.
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
      description: 'Word budget for main content sections (excludes intro, exercises, digest)',
      required: true,
    },
    {
      name: 'codeBlockInstruction',
      description:
        'Conditional code block instruction for visual toolkit. Empty for non-technical courses, full instruction for code_tutorial archetype.',
      required: false,
    },
  ],
};
