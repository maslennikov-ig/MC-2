import type { HardcodedPrompt } from '../types.js';

export const judgePrompt: HardcodedPrompt = {
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
3. **Structure**: Follows required structure (intro, sections, exercises)
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
};
