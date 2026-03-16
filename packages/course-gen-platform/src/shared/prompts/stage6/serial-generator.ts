import type { HardcodedPrompt } from '../types.js';

export const serialGeneratorPrompt: HardcodedPrompt = {
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
   Tables must be standalone blocks — NEVER place markdown tables inside numbered or bulleted lists.

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
   - COURSE POSITION (from course_position if provided):
     - Use position awareness to write appropriate introductions
     - If is_first_in_course: include course-level welcome and motivation, set expectations for the learning journey
     - If is_first_in_module: briefly introduce the module theme and bridge from previous module
     - If is_last_in_module but NOT is_last_in_course: briefly synthesize module progress in the final body section
     - If is_last_in_course: reinforce course-level outcomes in the final body section
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
};
