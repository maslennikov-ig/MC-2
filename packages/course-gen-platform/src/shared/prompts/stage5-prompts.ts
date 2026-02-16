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
    promptTemplate: `You are an expert course designer expanding section-level structure into detailed lessons.

**Course Context**:
- Course Title: {{courseTitle}}
- Target Language: {{language}}
- Content Style: {{stylePrompt}}
{{targetAudienceLine}}
{{userContext}}
{{courseStructureMapSection}}
{{previousSectionsDigestSection}}
**Section to Expand** (Section {{sectionNumber}}):
- Section Title: {{sectionTitle}}
- Learning Objectives (section-level): {{learningObjectives}}
- Key Topics: {{keyTopics}}
- Estimated Lessons: {{estimatedLessons}}

{{analysisContext}}
{{constraintsSection}}**Your Task**: Expand this section into 3-5 detailed lessons.

**CRITICAL: You MUST respond with valid JSON matching this EXACT schema**:

{{schemaDescription}}

**Constraints**:
1. **Lesson Breakdown**: {{lessonGuidance}}
2. **Learning Objectives**: Each lesson must have 1-5 SMART objectives using Bloom's taxonomy action verbs
   - Apply {{style}} style to objectives (e.g., storytelling: "explore", "discover"; academic: "analyze", "evaluate")
3. **Key Topics**: Each lesson must have 2-10 specific key topics
   - Frame topics in {{style}} style (e.g., conversational: "Let's learn about...", professional: "Core competency:")
4. **Coherence**: Lessons must follow logical progression, build on prerequisites
5. **Language**: All content in {{language}}

**Content Completeness**: Every field must contain real, finished content in {{language}}. Replace any placeholder text (e.g., [название], [insert X here], [TBD]) with actual content.

**NOTE**: Duration fields are managed by the system and not part of the schema you need to generate.

{{ragToolInfo}}{{outputFormat}}`,
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
        description: 'Pre-assembled full course structure map block with focus rules, or empty string',
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
