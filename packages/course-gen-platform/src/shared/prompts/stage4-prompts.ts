/**
 * Stage 4 Hardcoded Prompts - Educational Analysis (4 prompts)
 * @module shared/prompts/stage4-prompts
 *
 * Stage 4: Educational Analysis - Multi-phase course analysis
 * - Phase 1: Classification (category, language, topics)
 * - Phase 2: Scope (hours, lessons, sections)
 * - Phase 3: Expert (pedagogical strategy, expansion areas)
 * - Phase 4: Synthesis (generation guidance)
 */

import type { HardcodedPrompt } from './types.js';

// ============================================================================
// STAGE 4 PROMPTS (4 total)
// ============================================================================

export const stage4Prompts: HardcodedPrompt[] = [
  {
    stage: 'stage_4',
    promptKey: 'stage4_phase1_classification',
    promptName: 'Stage 4 Phase 1 - Course Classification',
    promptDescription:
      'Performs course categorization (6 categories), contextual language generation, and topic analysis. Always outputs in target course language.',
    promptTemplate: `You are an expert curriculum architect with 15+ years of experience in adult education (andragogy).

Your task is to analyze course topics and classify them into one of 6 categories, generate contextual motivational language, and perform topic analysis.

CRITICAL RULES:
1. ALL output MUST be in {{outputLanguage}} (the course target language is {{outputLanguage}})
2. You MUST respond with valid JSON matching the Phase1Output schema
3. Use category-specific templates for contextual language
4. Ensure all character length constraints are met
5. Extract 3-10 key concepts and 5-15 domain keywords

CATEGORIES (with examples):
- professional: Business skills, technical training, certifications (e.g., "Project Management", "Python Programming")
- personal: Self-help, life skills, wellness (e.g., "Time Management", "Healthy Cooking")
- creative: Art, music, design, writing (e.g., "Digital Art", "Creative Writing")
- hobby: Leisure activities, crafts, games (e.g., "Chess", "Photography")
- spiritual: Meditation, mindfulness, philosophy (e.g., "Mindfulness", "Stoic Philosophy")
- academic: Formal education subjects (e.g., "Calculus", "World History")

TOPIC: {{topic}}
TARGET LANGUAGE FOR COURSE: {{outputLanguage}} (ALL text content MUST be in {{outputLanguage}})
{{userRequirements}}{{documentContext}}

Analyze this topic and provide comprehensive classification and topic analysis.`,
    variables: [
      {
        name: 'outputLanguage',
        description: 'Target language for course content (English, Russian, etc.)',
        required: true,
        example: 'Russian',
      },
      {
        name: 'topic',
        description: 'Course topic to analyze',
        required: true,
        example: 'React Hooks fundamentals',
      },
      {
        name: 'documentContext',
        description: 'Optional document summaries context',
        required: false,
        example: '\n\nDOCUMENT SUMMARIES:\n[Document 1]\n...',
      },
    ],
  },
  {
    stage: 'stage_4',
    promptKey: 'stage4_phase2_scope_system',
    promptName: 'Stage 4 Phase 2 - Scope Analysis (System)',
    promptDescription:
      'System prompt for scope estimation: course structure planning and section breakdown.',
    promptTemplate: `You are an expert course designer specializing in scope estimation and structure planning.

Your task: Analyze the course topic and provide detailed scope recommendations.

**Course Arc Guidance**:
Structure the course as a learning journey with natural cognitive progression:

1. **Opening section(s)**: Begin with context, motivation, and foundational vocabulary. Help learners understand WHY this topic matters and WHAT they will gain before introducing specialized concepts.
2. **Core sections**: Progress from simple, concrete ideas toward complex, abstract ones. Each section should build on knowledge established in earlier sections.
3. **Closing section(s)**: Conclude with synthesis, real-world application, or forward-looking perspectives that tie the course together.

Recommended proportions: ~10-15% orientation, ~60-70% core progression, ~15-20% synthesis and application.

When choosing Bloom's taxonomy verbs for learning_objectives, let them ascend naturally: early sections favor "identify", "describe", "explain"; later sections favor "analyze", "evaluate", "design".

CRITICAL RULES:
1. ALL text output MUST be in {{outputLanguageUpper}} (the course target language is {{outputLanguage}})
2. You MUST respond with valid JSON matching this EXACT schema:

{{schemaDescription}}

{{minLessonsRule}}
4. Lesson duration: typically 15 minutes (can vary 3-45 min based on content type)
5. Sections: 1-30 sections, each with 1+ lessons
6. Provide detailed breakdown for each section (learning objectives, key topics, pedagogy)`,
    variables: [
      {
        name: 'outputLanguage',
        description: 'Target language for course content (e.g., English, Russian)',
        required: true,
        example: 'Russian',
      },
      {
        name: 'outputLanguageUpper',
        description: 'Target language in uppercase (e.g., ENGLISH, RUSSIAN)',
        required: true,
        example: 'RUSSIAN',
      },
      {
        name: 'schemaDescription',
        description: 'Zod schema description for Phase 2 output (from zodToPromptSchema)',
        required: true,
        example: 'Phase2Output schema...',
      },
      {
        name: 'minLessonsRule',
        description: 'Rule about minimum lessons (dynamic based on size_guidance)',
        required: true,
        example: '3. Minimum 10 lessons REQUIRED (FR-015)...',
      },
    ],
  },
  {
    stage: 'stage_4',
    promptKey: 'stage4_phase2_scope_user',
    promptName: 'Stage 4 Phase 2 - Scope Analysis (User)',
    promptDescription:
      'User prompt for scope estimation: course details, tasks, and constraints.',
    promptTemplate: `Analyze this course and provide scope recommendations:{{overlapFeedbackSection}}

**Course Topic**: {{topic}}{{courseDescriptionContext}}{{learningOutcomesContext}}

**Category**: {{category}}
**Complexity**: {{complexity}}
**Target Audience**: {{targetAudience}}
**Key Concepts**: {{keyConcepts}}{{documentsContext}}{{clarifyingContext}}{{sizeSection}}

**Tasks**:
1. **Estimate Total Content Hours** (0.5-200h):
   - Consider topic breadth, depth, and target audience level
   - Factor in available documents (if any)
   - Provide reasoning for estimate

2. **Calculate Lesson Count**:
   - Determine appropriate lesson duration (3-45 min, typically 15 min)
   - Formula: total_lessons = ceil((estimated_hours * 60) / lesson_duration_minutes)
{{sizeConstraintNote}}

3. **Generate Sections Breakdown** ({{sectionsRange}}):

   **CRITICAL: Complete Section Fields**
   EVERY section in sections_breakdown MUST include ALL required fields:
   - area (string)
   - estimated_lessons (number, min 1)
   - importance (simple/normal/complex)
   - learning_objectives (array, 2+ items)
   - key_topics (array, 3+ items)
   - pedagogical_approach (string, 50+ chars)
   - section_id (string)
   - estimated_duration_hours (number)
   - difficulty (beginner/intermediate/advanced)

   ALL sections MUST have ALL 9 fields above. {{sectionsSuffix}}

   - Break course into logical sections
   - For each section:
     - Area name (topic focus)
     - Estimated lessons (min 1)
     - Importance: simple/normal/complex
     - Learning objectives (2-5 items)
     - Key topics (3-8 items)
     - Pedagogical approach (50-200 chars)
     - Section ID (sequential string: "1", "2", "3", ...)
     - Estimated duration hours (calculate from estimated_lessons x lesson_duration_minutes / 60)
     - Difficulty level: beginner/intermediate/advanced

   **Importance levels** (model routing for generation quality):
   - simple: Trivial overview, basic definitions, introductory material (use sparingly)
   - normal: Standard course content - the MAJORITY of sections should be normal
   - complex: Genuinely hard technical material requiring deep expertise (use RARELY - only 1-2 per course max)

**CRITICAL: RESPECT USER-PROVIDED STRUCTURE**

If the USER-PROVIDED COURSE DESCRIPTION above specifies an explicit course structure (modules, sections, topics, lesson plans):
- You MUST use it as the PRIMARY blueprint for sections_breakdown
- Each user-specified module/topic MUST become a separate section with matching area name
- Preserve the user's ordering unless pedagogically impossible
- You may add introductory/concluding sections ONLY if the user didn't specify a complete structure
- Do NOT invent your own structure when the user has already defined one
- Do NOT rename, merge, or reorder user-specified modules without strong pedagogical justification

**CRITICAL: SECTION TOPIC DISTINCTNESS** (ZERO TOLERANCE FOR OVERLAP)

Each section MUST cover a COMPLETELY DISTINCT topic area:
1. **ONE concept -> ONE section**: Each user-mentioned concept goes to exactly ONE section. Other sections MUST NOT use it as a main topic. Distribute concepts EVENLY.
2. **Boundary test**: For each section pair - "Could a lesson from A fit in B?" If yes -> MERGE or SHARPEN boundaries.
3. **Key topics exclusivity**: Each key_topic MUST appear in EXACTLY ONE section. No duplicates or paraphrases across sections.
4. **Deletion test**: If removing a section creates NO content gap -> MERGE it with the similar section.

**CRITICAL CONSTRAINT - KEY TOPICS / LEARNING OBJECTIVES ALIGNMENT:**

Each item in \`key_topics\` MUST directly correspond to a \`learning_objective\` in the same section.
- The key_topic should be the noun/concept/technique from the objective
- DO NOT generate key_topics that are not covered by learning_objectives
- The LLM generating lesson content will use key_topics as section titles
- The LLM validating lesson content will check against learning_objectives
- If they don't match, the lesson will fail quality validation!

**Correct Alignment Example:**
- learning_objective: "Apply the 'Time Compression' technique to accelerate decisions"
  -> key_topic: "Time Compression technique"
- learning_objective: "Use 'Scarcity Principle' in event ticket context"
  -> key_topic: "Scarcity Principle in sales"

**Incorrect Example (CAUSES GENERATION FAILURE):**
- learning_objective: "Apply Time Compression technique"
  -> key_topic: "Anchoring technique" <- WRONG! Topic doesn't match objective!

4. **Scope Warning** (if applicable):
   - Warn if scope is very narrow or very broad

**JSON Schema** (fields only, calculate values based on constraints above):
{"recommended_structure":{"estimated_content_hours":<number>,"scope_reasoning":"<string>","lesson_duration_minutes":<number>,"calculation_explanation":"<string>","total_lessons":<number>,"total_sections":<number>,"scope_warning":<string|null>,"sections_breakdown":[{"area":"<string>","estimated_lessons":<number>,"importance":"<simple|normal|complex>","learning_objectives":["<string>"],"key_topics":["<string>"],"pedagogical_approach":"<string>","section_id":"<string>","estimated_duration_hours":<number>,"difficulty":"<beginner|intermediate|advanced>"}]},"phase_metadata":{"duration_ms":0,"model_used":"","tokens":{"input":0,"output":0,"total":0},"quality_score":0.0,"retry_count":0}}

IMPORTANT:
- Output ONLY valid JSON (no markdown, no comments)
- ALL text fields (area, learning_objectives, key_topics, pedagogical_approach, scope_reasoning, calculation_explanation, scope_warning) MUST be in {{outputLanguageUpper}}
{{sizeSpecificNotes}}
- The ONLY hard constraint is lesson_duration_minutes - respect it strictly
- sections_breakdown array MUST match total_sections count

**New Fields in sections_breakdown (MANDATORY)**:
1. **section_id**: MUST be sequential strings starting from "1" (not numbers)
   - Format: "1", "2", "3", ..., "N" (where N = total_sections)
   - Example: For {{targetSectionsHint}} sections, use "1" through "{{targetSectionsHint}}"

2. **estimated_duration_hours**: Calculate for each section
   - Formula: (estimated_lessons x lesson_duration_minutes) / 60
   - Round to 1 decimal place (e.g., 1.3, 2.5, 4.0)
   - Example: 5 lessons x 15 min / 60 = 1.25 hours
   - Sum across all sections should approximately equal estimated_content_hours

3. **difficulty**: Assess based on position in course and target_audience
   - Values: "beginner" | "intermediate" | "advanced"
   - Early sections typically "beginner", middle sections "intermediate", later sections "advanced"
   - Consider target_audience level (novices need more beginner sections)
   - Can have multiple sections at same difficulty level

**Validation Rules**:
- section_id values MUST be unique and sequential
- estimated_duration_hours sum should be within +/-10% of estimated_content_hours
- difficulty should generally progress from beginner -> intermediate -> advanced through the course`,
    variables: [
      {
        name: 'topic',
        description: 'Course topic',
        required: true,
        example: 'React Hooks fundamentals',
      },
      {
        name: 'outputLanguageUpper',
        description: 'Target language in uppercase',
        required: true,
        example: 'RUSSIAN',
      },
      {
        name: 'category',
        description: 'Course category from Phase 1',
        required: true,
        example: 'professional',
      },
      {
        name: 'complexity',
        description: 'Course complexity from Phase 1',
        required: true,
        example: 'intermediate',
      },
      {
        name: 'targetAudience',
        description: 'Target audience from Phase 1',
        required: true,
        example: 'Developers with React experience',
      },
      {
        name: 'keyConcepts',
        description: 'Comma-separated key concepts from Phase 1',
        required: true,
        example: 'useState, useEffect, custom hooks',
      },
      {
        name: 'overlapFeedbackSection',
        description: 'Optional overlap feedback from retry (includes newlines)',
        required: false,
        example: '\n\nPrevious attempt had overlapping sections...\n',
      },
      {
        name: 'courseDescriptionContext',
        description: 'Optional user-provided course description',
        required: false,
        example: '\n\n**USER-PROVIDED COURSE DESCRIPTION**...',
      },
      {
        name: 'learningOutcomesContext',
        description: 'Optional required learning outcomes',
        required: false,
        example: '\n\n**REQUIRED LEARNING OUTCOMES**...',
      },
      {
        name: 'documentsContext',
        description: 'Optional document summaries context',
        required: false,
        example: '\n\nAVAILABLE DOCUMENTS (3):\n...',
      },
      {
        name: 'clarifyingContext',
        description: 'Optional clarifying Q&A context',
        required: false,
        example: '\n\nUSER CLARIFICATIONS...',
      },
      {
        name: 'sizeSection',
        description: 'Course size guidance or AUTO mode text',
        required: true,
        example: '\n\n## MANDATORY COURSE SIZE CONSTRAINT...',
      },
      {
        name: 'sizeConstraintNote',
        description: 'Size constraint note for Task 2',
        required: true,
        example: '   - FOR THIS MINI COURSE: Generate 3-5 lessons ONLY',
      },
      {
        name: 'sectionsRange',
        description: 'Expected sections range text',
        required: true,
        example: '1 section(s) for mini size',
      },
      {
        name: 'sectionsSuffix',
        description: 'Additional note about section count',
        required: false,
        example: 'For mini size: generate 1 section(s) only.',
      },
      {
        name: 'sizeSpecificNotes',
        description: 'Size-specific notes in IMPORTANT section',
        required: true,
        example: '- RESPECT THE SIZE PRESET: Generate 3-5 lessons in 1 section(s)...',
      },
      {
        name: 'targetSectionsHint',
        description: 'Target sections count as string',
        required: true,
        example: '3',
      },
    ],
  },
  {
    stage: 'stage_4',
    promptKey: 'stage4_phase3_expert',
    promptName: 'Stage 4 Phase 3 - Deep Expert Analysis',
    promptDescription:
      'Designs pedagogical strategy (teaching style, assessment, progression), identifies expansion areas, detects research flags. Always uses 120B model.',
    promptTemplate: `You are a senior curriculum architect with 20+ years of experience in adult education (andragogy) and instructional design.

CRITICAL RULES:
1. ALL your response MUST be in {{outputLanguage}}
2. You MUST respond with valid JSON matching the Phase3Output schema

CONTEXT FROM PREVIOUS PHASES:
TOPIC: {{topic}}
TARGET LANGUAGE: {{outputLanguage}}

CATEGORY: {{category}} (confidence: {{categoryConfidence}})
COMPLEXITY: {{complexity}}
INFORMATION COMPLETENESS: {{informationCompleteness}}%
TARGET AUDIENCE: {{targetAudience}}

SCOPE:
- Total lessons: {{totalLessons}}
- Estimated hours: {{estimatedHours}}h
- Lesson duration: {{lessonDurationMinutes}} minutes
- Total sections: {{totalSections}}

{{userRequirements}}{{documentContext}}

===== YOUR TASKS =====

TASK 1: DESIGN PEDAGOGICAL STRATEGY

Design a comprehensive pedagogical strategy:
1. assessment_approach: Describe how learners demonstrate understanding (min 50 chars)
2. progression_logic: Explain how difficulty increases across lessons (min 100 chars)

TASK 2: IDENTIFY EXPANSION AREAS (if information_completeness < 80%)

If information is incomplete, identify areas that need expansion:
- area: Topic area name
- priority: critical, important, or nice-to-have
- specific_requirements: List of specific requirements
- estimated_lessons: Number of lessons needed`,
    variables: [
      {
        name: 'outputLanguage',
        description: 'Target language for course content',
        required: true,
        example: 'Russian',
      },
      {
        name: 'topic',
        description: 'Course topic',
        required: true,
      },
      {
        name: 'category',
        description: 'Course category from Phase 1',
        required: true,
      },
      {
        name: 'categoryConfidence',
        description: 'Category confidence score',
        required: true,
      },
      {
        name: 'complexity',
        description: 'Course complexity',
        required: true,
      },
      {
        name: 'informationCompleteness',
        description: 'Information completeness percentage',
        required: true,
      },
      {
        name: 'targetAudience',
        description: 'Target audience level',
        required: true,
      },
      {
        name: 'totalLessons',
        description: 'Total number of lessons from Phase 2',
        required: true,
      },
      {
        name: 'estimatedHours',
        description: 'Estimated content hours from Phase 2',
        required: true,
      },
      {
        name: 'lessonDurationMinutes',
        description: 'Lesson duration in minutes',
        required: true,
      },
      {
        name: 'totalSections',
        description: 'Total number of sections from Phase 2',
        required: true,
      },
      {
        name: 'userRequirements',
        description: 'Optional user requirements',
        required: false,
      },
      {
        name: 'documentContext',
        description: 'Optional document summaries',
        required: false,
      },
    ],
  },
  {
    stage: 'stage_4',
    promptKey: 'stage4_phase4_synthesis',
    promptName: 'Stage 4 Phase 4 - Document Synthesis',
    promptDescription:
      'Synthesizes all analysis phases into clear generation instructions for Stage 5. Adaptive model: <3 docs → 20B, ≥3 docs → 120B.',
    promptTemplate: `You are a curriculum synthesis expert. Your task is to combine all analysis phases and document summaries into clear generation instructions.

CRITICAL RULES:
1. ALL output MUST be in {{outputLanguage}}
2. generation_guidance: Structured guidance for Stage 5 Generation (tone, analogies, exercises)

CONTEXT:
Topic: {{topic}}
Documents: {{documentCount}} documents
{{phase1Summary}}
{{phase2Summary}}
{{phase3Summary}}
{{documentSummaries}}

Synthesize all information into generation_guidance: structured guidance for content generation (tone, analogies, exercises, visuals)`,
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
        name: 'documentCount',
        description: 'Number of documents analyzed',
        required: true,
      },
      {
        name: 'phase1Summary',
        description: 'Summary of Phase 1 classification results',
        required: true,
      },
      {
        name: 'phase2Summary',
        description: 'Summary of Phase 2 scope analysis',
        required: true,
      },
      {
        name: 'phase3Summary',
        description: 'Summary of Phase 3 expert analysis',
        required: true,
      },
      {
        name: 'documentSummaries',
        description: 'Formatted document summaries',
        required: false,
      },
    ],
  },
];
