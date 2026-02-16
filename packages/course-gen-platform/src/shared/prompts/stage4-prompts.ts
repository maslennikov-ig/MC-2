/**
 * Stage 4 Hardcoded Prompts - Educational Analysis (7 prompts)
 * @module shared/prompts/stage4-prompts
 *
 * Stage 4: Educational Analysis - Multi-phase course analysis
 * - Phase 1: Classification (category, language, topics) — migrated to PromptService (system + user prompts)
 * - Phase 2: Scope (hours, lessons, sections) — migrated to PromptService (system + user prompts)
 * - Phase 3: Expert (pedagogical strategy, expansion areas) — migrated to PromptService (single user prompt)
 * - Phase 4: Synthesis (generation guidance) — migrated to PromptService (system + user prompts)
 */

import type { HardcodedPrompt } from './types.js';

// ============================================================================
// STAGE 4 PROMPTS (7 total)
// ============================================================================

export const stage4Prompts: HardcodedPrompt[] = [
  {
    stage: 'stage_4',
    promptKey: 'stage4_phase1_classification_system',
    promptName: 'Stage 4 Phase 1 - Classification (System)',
    promptDescription:
      'System prompt for course classification: category detection, topic analysis, key concepts extraction.',
    promptTemplate: `You are an expert curriculum architect with 15+ years of experience in adult education (andragogy).

Your task is to analyze course topics and classify them into one of 6 categories, and perform topic analysis.

CRITICAL RULES:
1. ALL output MUST be in {{outputLanguageUpper}} (the course target language is {{outputLanguage}})
2. You MUST respond with valid JSON matching this EXACT schema:

{{schemaDescription}}

3. Ensure all character length constraints are met
4. Extract 3-10 key concepts and 5-15 domain keywords

FIELD FORMATS:

CATEGORIES (with examples):
- professional: Business skills, technical training, certifications (e.g., "Project Management", "Python Programming")
- personal: Self-help, life skills, wellness (e.g., "Time Management", "Healthy Cooking")
- creative: Art, music, design, writing (e.g., "Digital Art", "Creative Writing")
- hobby: Leisure activities, crafts, games (e.g., "Chess", "Photography")
- spiritual: Meditation, mindfulness, philosophy (e.g., "Mindfulness", "Stoic Philosophy")
- academic: Formal education subjects (e.g., "Calculus", "World History")`,
    variables: [
      {
        name: 'outputLanguage',
        description: 'Target language for course content (English, Russian, etc.)',
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
        description: 'Zod schema description for Phase 1 output (from zodToPromptSchema)',
        required: true,
        example: 'Phase1Output schema...',
      },
    ],
  },
  {
    stage: 'stage_4',
    promptKey: 'stage4_phase1_classification_user',
    promptName: 'Stage 4 Phase 1 - Classification (User)',
    promptDescription:
      'User prompt for course classification with topic, audience, and optional document/clarifying context.',
    promptTemplate: `COURSE INFORMATION:
Topic: {{topic}}
Target Language: {{outputLanguage}} (ALL OUTPUT MUST BE IN {{outputLanguageUpper}})
Target Audience: {{targetAudience}}
Lesson Duration: {{lessonDurationMinutes}} minutes
{{courseDescriptionContext}}{{documentContext}}{{clarifyingContext}}

TASK:
1. Classify this course into the most appropriate category
2. Analyze topic complexity and identify key concepts
3. Extract domain keywords relevant to this topic
4. Assess information completeness and identify missing elements

IMPORTANT: Generate ALL text content (topic_analysis descriptions, key_concepts, domain_keywords) in {{outputLanguageUpper}}.
Output MUST be valid JSON with all text fields in {{outputLanguage}}.`,
    variables: [
      {
        name: 'topic',
        description: 'Course topic to analyze',
        required: true,
        example: 'React Hooks fundamentals',
      },
      {
        name: 'outputLanguage',
        description: 'Target language for course content (English, Russian, etc.)',
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
        name: 'targetAudience',
        description: 'Target audience for the course',
        required: true,
        example: 'Developers with React experience',
      },
      {
        name: 'lessonDurationMinutes',
        description: 'Lesson duration in minutes',
        required: true,
        example: '15',
      },
      {
        name: 'courseDescriptionContext',
        description: 'Optional user-provided course description',
        required: false,
        example: '\n\n**User-Provided Course Description**...',
      },
      {
        name: 'documentContext',
        description: 'Optional document summaries context',
        required: false,
        example: '\n\nDOCUMENT SUMMARIES:\n[Document 1]\n...',
      },
      {
        name: 'clarifyingContext',
        description: 'Optional clarifying Q&A context',
        required: false,
        example: '\n\nUSER CLARIFICATIONS...',
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
    promptDescription: 'User prompt for scope estimation: course details, tasks, and constraints.',
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
      'Designs pedagogical strategy (assessment approach, progression logic). Uses Phase 1 and Phase 2 outputs as context.',
    promptTemplate: `You are a senior curriculum architect with 20+ years of experience in adult education (andragogy) and instructional design. Your expertise includes pedagogical strategy, learning progression design, and identifying content gaps.

CRITICAL RULES:
1. ALL your response MUST be in {{outputLanguageUpper}} (the course target language is {{outputLanguage}})
2. You MUST respond with valid JSON matching this EXACT schema:

{{schemaDescription}}

===== CONTEXT FROM PREVIOUS PHASES =====

TOPIC: {{topic}}
TARGET LANGUAGE FOR COURSE: {{outputLanguage}} (ALL text content MUST be in {{outputLanguageUpper}})

CATEGORY: {{category}} (confidence: {{categoryConfidence}})
COMPLEXITY: {{complexity}}
INFORMATION COMPLETENESS: {{informationCompleteness}}%
TARGET AUDIENCE: {{targetAudience}}

SCOPE:
- Total lessons: {{totalLessons}}
- Estimated hours: {{estimatedHours}}h
- Lesson duration: {{lessonDurationMinutes}} minutes
- Total sections: {{totalSections}}{{documentContext}}{{clarifyingContext}}

===== YOUR TASKS =====

TASK 1: DESIGN PEDAGOGICAL STRATEGY

Design a comprehensive pedagogical strategy for this course:

1. assessment_approach (min 50 chars): How learners demonstrate understanding
   - Examples: "Progressive quizzes after each section", "Final capstone project", "Peer review exercises"
   - Provide comprehensive detail - no upper limit

2. progression_logic (min 100 chars): How difficulty increases across lessons
   - Explain the learning arc from beginner to mastery
   - Describe scaffolding strategy
   - Provide comprehensive detail - no upper limit

NOTE ON FIELD LENGTHS:
- All string fields have minimum lengths to ensure quality
- NO upper limits - provide comprehensive, detailed responses
- Quality over brevity - thorough explanations are encouraged

LANGUAGE REQUIREMENT:
- ALL text content (assessment_approach, progression_logic) MUST be in {{outputLanguageUpper}}

===== OUTPUT FORMAT =====

Respond ONLY with valid JSON (no markdown, no code blocks, no explanations):

{
  "pedagogical_strategy": {
    "assessment_approach": "string (min 50 chars, comprehensive detail encouraged)",
    "progression_logic": "string (min 100 chars, comprehensive detail encouraged)"
  }
}`,
    variables: [
      {
        name: 'outputLanguage',
        description: 'Target language for course content',
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
        description: 'Zod schema description for Phase 3 output (from zodToPromptSchema)',
        required: true,
        example: 'Phase3Output schema...',
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
        name: 'documentContext',
        description: 'Optional document summaries',
        required: false,
      },
      {
        name: 'clarifyingContext',
        description: 'Optional clarifying Q&A context',
        required: false,
      },
    ],
  },
  {
    stage: 'stage_4',
    promptKey: 'stage4_phase4_synthesis_system',
    promptName: 'Stage 4 Phase 4 - Synthesis (System)',
    promptDescription:
      'System prompt for document synthesis: combines analysis phases into generation guidance.',
    promptTemplate: `You are an expert curriculum architect specializing in synthesizing diverse information sources into structured course generation guidance.

Your role:
1. Analyze outputs from previous analysis phases (categorization, scope, expert analysis)
2. Synthesize document summaries (if provided) into key insights
3. Generate structured generation_guidance that specifies tone, pedagogy, and content approach

Quality standards:
- generation_guidance must be complete and well-reasoned based on course category and target audience
- All output in English (internal processing language)
- Preserve all critical insights from previous phases
- Balance structured guidance with practical applicability

You have 15+ years experience in curriculum design and instructional synthesis.`,
    variables: [],
  },
  {
    stage: 'stage_4',
    promptKey: 'stage4_phase4_synthesis_user',
    promptName: 'Stage 4 Phase 4 - Synthesis (User)',
    promptDescription:
      'User prompt for document synthesis with all phase outputs, document summaries, and generation guidance schema.',
    promptTemplate: `You are synthesizing course analysis into clear generation instructions for Stage 5 Course Generation.

CRITICAL RULES:
1. ALL your response MUST be in {{outputLanguageUpper}} (the course target language is {{outputLanguage}})
2. You MUST respond with valid JSON matching this EXACT schema:

{{schemaDescription}}

---

ANALYSIS SUMMARY:

Course Topic: {{topic}}
Target Language: {{language}} (for final course output)
Category: {{category}}
Scope: {{totalLessons}} lessons, {{totalSections}} sections
Document Count: {{documentCount}}
{{researchFlagsSection}}

---

PREVIOUS PHASE OUTPUTS:

Phase 1 - Key Concepts:
{{phase1KeyConcepts}}

Phase 2 - Sections Breakdown:
{{phase2SectionsBreakdown}}

Phase 3 - Pedagogical Approach:
{{phase3ProgressionLogic}}
{{documentSummariesSection}}{{clarifyingContext}}

---

TASK: Generate synthesis output

1. **generation_guidance** (structured object):
   - **tone**: Select based on course category and target_audience
     * "conversational but precise": Most programming/technical courses
     * "formal academic": Academic subjects, research-based courses
     * "casual friendly": Personal development, hobbies
     * "technical professional": Professional certifications, business

   - **use_analogies**: true if topic benefits from comparisons (abstract concepts, technical topics)

   - **specific_analogies** (optional): List 1-3 specific analogies that fit this topic
     * Example for programming: ["functions like recipes", "variables like labeled boxes"]
     * Example for networking: ["packets like letters", "router like post office"]

   - **avoid_jargon**: List technical terms that should be avoided or explained
     * Based on target_audience level (beginners need more avoidance)
     * Example: ["polymorphism", "encapsulation"] for beginner OOP course

   - **include_visuals**: Recommend visual aids based on topic nature
     * "diagrams": For system architecture, workflows, relationships
     * "flowcharts": For processes, algorithms, decision trees
     * "code examples": For programming courses
     * "screenshots": For software tutorials
     * "animations": For dynamic processes
     * "plots": For data science, statistics

   - **exercise_types**: Select appropriate assessment methods
     * "coding": Programming, scripting courses
     * "derivation": Math, physics, theoretical subjects
     * "interpretation": Literature, philosophy, analysis
     * "debugging": Software development
     * "refactoring": Advanced programming
     * "analysis": Critical thinking, research-based

   - **contextual_language_hints**: Describe audience level and communication style
     * Example: "Assume no prior programming experience, use simple metaphors"
     * Example: "Target experienced developers, use industry terminology"
     * If research flags exist, mention them briefly here

   - **real_world_examples** (optional): List 1-3 practical applications to reference
     * Example for web dev: ["e-commerce checkout", "social media feed", "real-time chat"]

---

OUTPUT FORMAT (JSON only, no markdown):

{
  "generation_guidance": {
    "tone": "conversational but precise" | "formal academic" | "casual friendly" | "technical professional",
    "use_analogies": true | false,
    "specific_analogies": ["analogy1", "analogy2"],
    "avoid_jargon": ["term1", "term2"],
    "include_visuals": ["diagrams", "code examples"],
    "exercise_types": ["coding", "debugging"],
    "contextual_language_hints": "Audience assumptions and communication style",
    "real_world_examples": ["example1", "example2"]
  }
}

IMPORTANT:
- generation_guidance fields MUST all be populated (only specific_analogies and real_world_examples are optional)
- ALL text content (avoid_jargon, contextual_language_hints, specific_analogies, real_world_examples) MUST be in {{outputLanguageUpper}}
- If research flags exist, mention them briefly in contextual_language_hints`,
    variables: [
      {
        name: 'outputLanguage',
        description: 'Target language for course content',
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
        description: 'Zod schema description for Phase 4 output (from zodToPromptSchema)',
        required: true,
        example: 'Phase4Output schema...',
      },
      {
        name: 'topic',
        description: 'Course topic',
        required: true,
      },
      {
        name: 'language',
        description: 'Target language code (en, ru, etc.)',
        required: true,
        example: 'ru',
      },
      {
        name: 'category',
        description: 'Course category from Phase 1',
        required: true,
        example: 'professional',
      },
      {
        name: 'totalLessons',
        description: 'Total number of lessons from Phase 2',
        required: true,
        example: '15',
      },
      {
        name: 'totalSections',
        description: 'Total number of sections from Phase 2',
        required: true,
        example: '3',
      },
      {
        name: 'documentCount',
        description: 'Number of documents analyzed',
        required: true,
        example: '2',
      },
      {
        name: 'researchFlagsSection',
        description: 'Optional research flags section',
        required: false,
        example: '\nResearch Flags: [flag1, flag2]\n',
      },
      {
        name: 'phase1KeyConcepts',
        description: 'Comma-separated key concepts from Phase 1',
        required: true,
        example: 'useState, useEffect, custom hooks',
      },
      {
        name: 'phase2SectionsBreakdown',
        description: 'Formatted sections breakdown from Phase 2',
        required: true,
        example: '- Introduction: 2 lessons (normal)\n- Core Concepts: 8 lessons (complex)',
      },
      {
        name: 'phase3ProgressionLogic',
        description: 'Progression logic from Phase 3',
        required: true,
        example: 'The course starts with basic concepts...',
      },
      {
        name: 'documentSummariesSection',
        description: 'Optional formatted document summaries',
        required: false,
        example: '\n\nDOCUMENT SUMMARIES:\n[Doc 1]...',
      },
      {
        name: 'clarifyingContext',
        description: 'Optional clarifying Q&A context',
        required: false,
        example: '\n\nUSER CLARIFICATIONS...',
      },
    ],
  },
];
