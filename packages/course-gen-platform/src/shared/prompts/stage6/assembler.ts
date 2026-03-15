import type { HardcodedPrompt } from '../types.js';

export const assemblerPrompt: HardcodedPrompt = {
  stage: 'stage_6',
  promptKey: 'stage6_assembler',
  promptName: 'Stage 6 - Assembler: Content Assembly [DEPRECATED]',
  promptDescription:
    '[DEPRECATED - Stage 6 refactored from 6-node to 3-node pipeline] Assembles expanded sections into cohesive lesson with introduction, transitions, and exercises. Preserves all visual elements.',
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
   - Provide motivating context for the topic. Do NOT list or preview learning objectives — they are displayed separately in the UI.
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

4. **Final Section Integrity**:
   - Keep the final body section concise and focused
   - Do NOT add a standalone conclusion section

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
};
