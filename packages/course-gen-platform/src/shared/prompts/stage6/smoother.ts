import type { HardcodedPrompt } from '../types.js';

export const smootherPrompt: HardcodedPrompt = {
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
};
