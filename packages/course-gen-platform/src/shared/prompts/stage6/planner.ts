import type { HardcodedPrompt } from '../types.js';

export const plannerPrompt: HardcodedPrompt = {
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
   - Provide motivating context for the topic. Do NOT list or preview learning objectives — they are displayed separately in the UI.

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

3. **Final Section Guidance**:
   - Ensure the last main section naturally synthesizes learning objective progress
   - Do NOT add a separate standalone conclusion section

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
};
