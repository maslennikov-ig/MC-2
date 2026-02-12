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
    promptKey: 'stage5_sections_generator',
    promptName: 'Stage 5 - Course Sections Generation',
    promptDescription:
      'Generates course structure: sections with lessons. Each section has title, description, and lesson breakdown.',
    promptTemplate: `You are a course structure architect. Generate comprehensive course structure.

CRITICAL RULES:
1. ALL output MUST be in {{outputLanguage}}
2. Generate {{totalSections}} sections with lessons
3. Minimum {{minimumLessons}} total lessons across all sections

CONTEXT:
{{structureContext}}

Generate sections with:
1. section_id: Unique identifier
2. title: Section title
3. description: Section description
4. order: Section order (1-based)
5. lessons: Array of lessons with title, description, order`,
    variables: [
      {
        name: 'outputLanguage',
        description: 'Target language for course content',
        required: true,
      },
      {
        name: 'totalSections',
        description: 'Total number of sections to generate',
        required: true,
      },
      {
        name: 'minimumLessons',
        description: 'Minimum total lessons (FR-015: 10)',
        required: true,
      },
      {
        name: 'structureContext',
        description: 'Context from analysis phases',
        required: true,
      },
    ],
  },
];
