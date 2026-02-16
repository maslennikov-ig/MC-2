/**
 * Stage 5 Hardcoded Prompts - Course Structure Generation (2 prompts)
 * @module shared/prompts/stage5-prompts
 *
 * Stage 5: Course Structure Generation
 * - Metadata generation (title, description, tags)
 * - Sections generation (structure with lessons)
 */

import type { HardcodedPrompt } from './types.js';

// ============================================================================
// STAGE 5 PROMPTS (2 total)
// ============================================================================

export const stage5Prompts: HardcodedPrompt[] = [
  {
    stage: 'stage_5',
    promptKey: 'stage5_metadata_generator',
    promptName: 'Stage 5 - Course Metadata Generation',
    promptDescription:
      'Generates course metadata: title, description, tags, difficulty, duration, prerequisites. Uses hybrid routing (critical fields: 120B, non-critical: 20B).',
    promptTemplate: `You are a course metadata expert. Generate comprehensive course metadata.

CRITICAL RULES:
1. ALL output MUST be in {{outputLanguage}}
2. You MUST respond with valid JSON matching the metadata schema

CONTEXT:
Topic: {{topic}}
{{analysisContext}}

Generate:
1. title: Course title (5-100 chars)
2. description: Course description (50-500 chars)
3. tags: 3-10 relevant tags
4. difficulty: beginner, intermediate, or advanced
5. estimated_duration_minutes: Total course duration
6. prerequisites: List of prerequisites (0-10 items)`,
    variables: [
      {
        name: 'outputLanguage',
        description: 'Target language for course content',
        required: true,
      },
      {
        name: 'topic',
        description: 'Course topic',
        required: true,
      },
      {
        name: 'analysisContext',
        description: 'Context from Stage 4 analysis',
        required: true,
      },
    ],
  },
  {
    stage: 'stage_5',
    promptKey: 'stage5_batch_section_generator',
    promptName: 'Stage 5 - Batch Section Generator (RT-002 Optimized)',
    promptDescription:
      'Generates detailed lesson breakdown for a single section. Uses RT-002 prompt engineering with course structure map, anti-overlap rules, and constraints from Stage 4 user edits.',
    promptTemplate: `You are an expert course designer expanding one section into lesson structure.

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
{{outputFormat}}`,
    variables: [
      {
        name: 'courseTitle',
        description: 'Sanitized course title',
        required: true,
      },
      {
        name: 'language',
        description: 'Target language code (en, ru, etc.)',
        required: true,
      },
      {
        name: 'stylePrompt',
        description: 'Content style description from getStylePrompt()',
        required: true,
      },
      {
        name: 'style',
        description: 'Raw style name (for constraint text)',
        required: true,
      },
      {
        name: 'targetAudienceLine',
        description: 'Pre-assembled line: "- Target Audience: X" or empty string',
        required: true,
      },
      {
        name: 'userContext',
        description: 'Pre-assembled user context section or empty string',
        required: true,
      },
      {
        name: 'courseStructureMapSection',
        description:
          'Pre-assembled full course structure map block with focus rules, or empty string',
        required: true,
      },
      {
        name: 'previousSectionsDigestSection',
        description: 'Pre-assembled previously generated sections block or empty string',
        required: true,
      },
      {
        name: 'sectionNumber',
        description: 'Section number (1-based)',
        required: true,
      },
      {
        name: 'sectionTitle',
        description: 'Section title',
        required: true,
      },
      {
        name: 'learningObjectives',
        description: 'Section learning objectives (joined with "; ")',
        required: true,
      },
      {
        name: 'keyTopics',
        description: 'Section key topics (joined with ", ")',
        required: true,
      },
      {
        name: 'estimatedLessons',
        description: 'Estimated number of lessons',
        required: true,
      },
      {
        name: 'analysisContext',
        description: 'Pre-assembled analysis context block or empty string',
        required: true,
      },
      {
        name: 'constraintsSection',
        description: 'Pre-assembled course structure constraints block or empty string',
        required: true,
      },
      {
        name: 'schemaDescription',
        description: 'Schema description from zodToPromptSchema()',
        required: true,
      },
      {
        name: 'lessonGuidance',
        description: 'Dynamic lesson count guidance based on constraints',
        required: true,
      },
      {
        name: 'ragToolInfo',
        description: 'Pre-assembled RAG tool availability block or empty string',
        required: true,
      },
      {
        name: 'outputFormat',
        description: 'Pre-assembled output format instructions (attempt 1 or retry)',
        required: true,
      },
    ],
  },
];
