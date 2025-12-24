/**
 * Hardcoded Prompt Registry - 18 Prompts from Stage 3-6
 *
 * Central registry of all hardcoded prompts extracted from stage files.
 * Provides fallback when prompts are not available in the database.
 *
 * @module shared/prompts/prompt-registry
 *
 * Prompt Inventory:
 * - Stage 3: 2 classification prompts (comparative, independent)
 * - Stage 4: 4 analysis phases (classification, scope, expert, synthesis)
 * - Stage 5: 2 metadata/sections prompts (metadata, sections)
 * - Stage 6: 5 lesson content prompts (planner, expander, assembler, smoother, judge)
 *
 * Structure:
 * - promptKey: Unique identifier (e.g., "stage4_phase1_classification")
 * - promptName: Human-readable name
 * - promptDescription: Brief description of prompt purpose
 * - promptTemplate: Full prompt template with {{variable}} placeholders
 * - variables: List of required/optional variables
 *
 * @example
 * ```typescript
 * const prompt = PROMPT_REGISTRY.get('stage6_planner');
 * console.log(prompt.promptName); // "Stage 6 - Planner: Lesson Outline Generation"
 * console.log(prompt.variables); // [{ name: 'lessonSpec', required: true, ... }]
 * ```
 */

import type { PromptVariable } from '@megacampus/shared-types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Hardcoded prompt entry with template and metadata
 */
export interface HardcodedPrompt {
  stage: 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6';
  promptKey: string;
  promptName: string;
  promptDescription: string;
  promptTemplate: string;
  variables: PromptVariable[];
}

// ============================================================================
// STAGE 3 PROMPTS (2 total)
// ============================================================================

const stage3Prompts: HardcodedPrompt[] = [
  {
    stage: 'stage_3',
    promptKey: 'stage3_classification_comparative',
    promptName: 'Stage 3 - Comparative Document Classification',
    promptDescription:
      'Classifies ALL documents in a single LLM call using comparative ranking. Ensures proper distribution: exactly 1 CORE, up to 30% IMPORTANT, remaining SUPPLEMENTARY.',
    promptTemplate: `You are a document classification expert for educational content.

TASK: Classify ALL documents by their importance for course generation using COMPARATIVE ranking.

=== PRIORITY LEVELS ===
- CORE: The single most important document (exactly 1). Primary course material, syllabus, or technical specification.
- IMPORTANT: Key supporting documents (maximum {{maxImportant}} documents, ~30%). Content that significantly enhances course quality.
- SUPPLEMENTARY: Additional materials (remaining documents). Nice-to-have content, references, appendices.

=== STEP 1: IDENTIFY SIGNALS FOR EACH DOCUMENT ===

CORE SIGNALS (strong indicators - document is likely CORE):
□ Learning objectives ("By the end of...", "Students will...", "Цели обучения", "Компетенции")
□ Grading criteria, assessment weights, exam structure
□ Course schedule with dates and deadlines
□ "Required reading" or "обязательная литература"
□ Prerequisites listed
□ Filename contains: Syllabus, ТЗ, Техническое задание, Curriculum, Program, Программа курса

IMPORTANT SIGNALS (document should be IMPORTANT or higher):
□ Practice exercises, discussion questions, assignments
□ Case studies, worked examples
□ Lab guides, tutorial content, workshop materials
□ Chapter or lecture content with learning material

SUPPLEMENTARY SIGNALS (only these documents should be SUPPLEMENTARY):
□ "Optional", "recommended", "further reading", "дополнительно", "для самостоятельного изучения"
□ Bibliography, citation lists, references only
□ Appendix, glossary, index
□ Administrative documents without learning content

=== STEP 2: APPLY CLASSIFICATION RULES ===

1. DEFAULT UP NOT DOWN: When uncertain between categories, choose the HIGHER priority
2. Any document with learning objectives = CORE or IMPORTANT, NEVER SUPPLEMENTARY
3. SUPPLEMENTARY requires explicit "optional" indicators OR pure reference format (bibliography)
4. If filename contains ТЗ/Syllabus/Curriculum/Программа → MUST be CORE unless proven otherwise
5. Instructional content with exercises or examples → minimum IMPORTANT, never SUPPLEMENTARY

CRITICAL: Do NOT classify primary instructional content as SUPPLEMENTARY.

=== CONSTRAINTS (MUST FOLLOW) ===
- Exactly 1 document must be CORE (no more, no less)
- Maximum {{maxImportant}} documents can be IMPORTANT
- All remaining documents are SUPPLEMENTARY
- You must classify ALL {{totalDocuments}} documents provided

=== COURSE CONTEXT ===
Title: {{courseTitle}}
Description: {{courseDescription}}

=== DOCUMENTS TO CLASSIFY ({{totalDocuments}} total) ===
{{documentDescriptions}}

=== OUTPUT FORMAT ===
Return a JSON object with a "classifications" array containing ALL documents.
Each classification must have: id (UUID), priority (CORE/IMPORTANT/SUPPLEMENTARY), rationale (brief explanation referencing the signals found).`,
    variables: [
      {
        name: 'maxImportant',
        description: 'Maximum number of IMPORTANT documents (calculated as 30% of total)',
        required: true,
        example: '3',
      },
      {
        name: 'totalDocuments',
        description: 'Total number of documents to classify',
        required: true,
        example: '10',
      },
      {
        name: 'courseTitle',
        description: 'Course title for context',
        required: false,
        example: 'Introduction to React Hooks',
      },
      {
        name: 'courseDescription',
        description: 'Course description for context',
        required: false,
        example: 'Learn React Hooks fundamentals',
      },
      {
        name: 'documentDescriptions',
        description:
          'Formatted list of documents with ID, filename, file type, size, and content preview',
        required: true,
        example:
          '[Document 1]\nID: uuid\nFilename: syllabus.pdf\n...',
      },
    ],
  },
  {
    stage: 'stage_3',
    promptKey: 'stage3_classification_independent',
    promptName: 'Stage 3 - Independent Document Classification (Fallback)',
    promptDescription:
      'Classifies a single document independently (fallback for comparative classification failures). Returns HIGH (≥0.7) or LOW (<0.7) priority.',
    promptTemplate: `You are a document classification expert for educational content.

Your task is to analyze a document and classify it by importance for course generation.

CLASSIFICATION CRITERIA:

HIGH PRIORITY (importance_score >= 0.7):
- Primary course material (textbooks, syllabi, main lectures, course outlines)
- Critical reference documents (standards, specifications, key papers)
- Regulatory/compliance documents (laws, regulations, mandatory guidelines)
- Documents that are essential for understanding the core subject matter

LOW PRIORITY (importance_score < 0.7):
- Supplementary presentations (slides that repeat main content)
- Additional notes (non-essential supplementary information)
- Optional references (nice-to-have but not critical)
- Administrative documents (schedules, announcements)

COURSE CONTEXT:
Title: {{courseTitle}}
Description: {{courseDescription}}

DOCUMENT TO CLASSIFY:
Filename: {{filename}}
File Type: {{mimeType}}
File Size: {{fileSize}}

Content Preview:
{{contentPreview}}

---

OUTPUT FORMAT:
Respond with ONLY a JSON object (no markdown, no code blocks):
{
  "importance_score": <number 0.0-1.0>,
  "classification_rationale": "<brief explanation of classification decision>"
}

Be precise and consistent. The importance_score should reflect how critical this document is for generating high-quality course content.`,
    variables: [
      {
        name: 'courseTitle',
        description: 'Course title for context',
        required: false,
        example: 'Introduction to React Hooks',
      },
      {
        name: 'courseDescription',
        description: 'Course description for context',
        required: false,
        example: 'Learn React Hooks fundamentals',
      },
      {
        name: 'filename',
        description: 'Document filename',
        required: true,
        example: 'syllabus.pdf',
      },
      {
        name: 'mimeType',
        description: 'Document MIME type',
        required: true,
        example: 'application/pdf',
      },
      {
        name: 'fileSize',
        description: 'Document file size (formatted, e.g., "2.5 MB")',
        required: true,
        example: '2.5 MB',
      },
      {
        name: 'contentPreview',
        description: 'Document content preview or summary',
        required: true,
        example: 'Course Overview\n\nThis course covers...',
      },
    ],
  },
];

// ============================================================================
// STAGE 4 PROMPTS (4 total)
// ============================================================================

const stage4Prompts: HardcodedPrompt[] = [
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

FIELD FORMATS:
- theory_practice_ratio: Format "XX:YY" where XX+YY=100 (e.g., "30:70", "50:50", "70:30")

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
        name: 'userRequirements',
        description: 'Optional user requirements/answers',
        required: false,
        example: '\n\nUSER REQUIREMENTS:\nTarget audience: intermediate developers',
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
    promptKey: 'stage4_phase2_scope',
    promptName: 'Stage 4 Phase 2 - Scope Analysis',
    promptDescription:
      'Estimates course scope: total content hours (0.5-200h), lesson count (minimum 10), sections breakdown (1-30 sections).',
    promptTemplate: `You are a curriculum scope analyst with expertise in estimating course structure.

Your task is to analyze the course topic and classify output to estimate:
1. Total content hours (0.5-200h)
2. Lesson count (MINIMUM 10 lessons enforced)
3. Sections breakdown (1-30 sections)

CRITICAL RULES:
1. ALL output MUST be in {{outputLanguage}}
2. You MUST respond with valid JSON matching the Phase2Output schema
3. Ensure minimum 10 lessons constraint (FR-015)
4. Each lesson is {{lessonDurationMinutes}} minutes

CONTEXT FROM PHASE 1:
Topic: {{topic}}
Category: {{category}}
Complexity: {{complexity}}
Target Audience: {{targetAudience}}
Information Completeness: {{informationCompleteness}}%

{{userRequirements}}{{documentContext}}

Estimate the course scope and generate detailed structure recommendations.`,
    variables: [
      {
        name: 'outputLanguage',
        description: 'Target language for course content',
        required: true,
        example: 'Russian',
      },
      {
        name: 'lessonDurationMinutes',
        description: 'Duration of each lesson in minutes',
        required: true,
        example: '15',
      },
      {
        name: 'topic',
        description: 'Course topic',
        required: true,
        example: 'React Hooks fundamentals',
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
        example: 'intermediate',
      },
      {
        name: 'informationCompleteness',
        description: 'Information completeness percentage from Phase 1',
        required: true,
        example: '85',
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
1. teaching_style: hands-on, theory-first, project-based, or mixed
2. assessment_approach: Describe assessment strategy (min 50 chars)
3. practical_focus: high, medium, or low
4. progression_logic: Explain learning progression (min 100 chars)
5. interactivity_level: high, medium, or low

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
2. scope_instructions: 100-800 characters - Clear, actionable instructions for Stage 5
3. content_strategy: How to approach course creation

CONTEXT:
Topic: {{topic}}
Documents: {{documentCount}} documents
{{phase1Summary}}
{{phase2Summary}}
{{phase3Summary}}
{{documentSummaries}}

Synthesize all information into:
1. scope_instructions: Clear instructions for content generation (100-800 chars)
2. content_strategy: Approach for course creation`,
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

// ============================================================================
// STAGE 5 PROMPTS (2 total)
// ============================================================================

const stage5Prompts: HardcodedPrompt[] = [
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

// ============================================================================
// STAGE 6 PROMPTS (5 total)
// ============================================================================

const stage6Prompts: HardcodedPrompt[] = [
  {
    stage: 'stage_6',
    promptKey: 'stage6_planner',
    promptName: 'Stage 6 - Planner: Lesson Outline Generation',
    promptDescription:
      'Generates detailed lesson outline from specification. Uses Context-First XML strategy with lesson context, learning objectives, RAG context, and visual planning.',
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
   - Preview the key learning objectives

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

3. **Conclusion**: Plan a summary that:
   - Reinforces each learning objective
   - Provides actionable next steps

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
  },
  {
    stage: 'stage_6',
    promptKey: 'stage6_expander',
    promptName: 'Stage 6 - Expander: Section Content Expansion',
    promptDescription:
      'Expands a single section from outline into full content. Uses content archetype, depth guidance, RAG context, and visual toolkit for engaging content.',
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

  <lesson_outline>
{{lessonOutline}}
  </lesson_outline>

  <reference_material>
  {{ragContext}}
  </reference_material>
</lesson_context>

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

4. **Rich Code Blocks**:
   \`\`\`typescript filename="example.ts" {2,4-6}
   // Line highlighting draws attention
   \`\`\`

5. **Tables** — For comparisons, structured data

*Syntax keywords (mermaid, filename, [!TIP]) stay in English regardless of output language.*
</visual_toolkit>

<output_language>
MANDATORY: Write ALL content in {{outputLanguage}}.
Every word, header, example, and explanation must be in {{outputLanguage}}.
DO NOT mix languages (except code/syntax keywords).
</output_language>

<task>
Write the full content for the "{{sectionTitle}}" section. Requirements:

1. **Cover All Key Points**: Address each point from the specification
2. **Match Depth**: {{depthGuidance}}

3. **Content & Visual Style** ({{contentArchetype}}):
   - *code_tutorial*: Step-by-step with Rich Code blocks (filename REQUIRED). Use flowchart for architecture overview.
   - *concept_explainer*: Clear analogies. USE Mermaid for processes/relationships, Math for formulas, [!TIP] for insights.
   - *case_study*: Narrative with Tables for comparisons, [!INFO] for key takeaways, timeline diagrams if applicable.
   - *legal_warning*: Precise, authoritative. USE [!WARNING]/[!DANGER] for critical points. Minimal decorative visuals.

4. **REQUIRED: Visual Enhancement** — Each section SHOULD include at least one:
   - Diagram (flowchart, sequence, or mindmap) for processes/flows
   - Table for comparisons or structured data
   - Callout for key insight or warning
   - Code block with filename for technical content

5. **REQUIRED: Practical Example** — Use callout format:
   > [!INFO]
   > **Example: [Situation Name]**
   > [Specific situation with concrete details, numbers, or names (2-4 sentences)]

6. **Include Keywords**: Naturally incorporate: {{requiredKeywords}}
7. **Avoid Terms**: Do not use: {{prohibitedTerms}}
8. **Tone**: Maintain {{tone}} tone
9. **Audience**: Write for {{targetAudience}} level

Output as markdown. Do NOT include the section title as a header.
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
        description: 'Section title to expand',
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
        description: 'XML-formatted key points',
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
        name: 'lessonOutline',
        description: 'Full lesson outline from planner',
        required: true,
      },
      {
        name: 'ragContext',
        description: 'XML-formatted RAG context',
        required: false,
      },
      {
        name: 'outputLanguage',
        description: 'Target language for all output content (e.g., "English", "Russian")',
        required: true,
        example: 'English',
      },
    ],
  },
  {
    stage: 'stage_6',
    promptKey: 'stage6_assembler',
    promptName: 'Stage 6 - Assembler: Content Assembly',
    promptDescription:
      'Assembles expanded sections into cohesive lesson with introduction, transitions, exercises, and conclusion. Preserves all visual elements.',
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
   - Preview the key learning objectives
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

4. **Write Conclusion**:
   - Summarize key takeaways
   - Reinforce learning objectives
   - Provide next steps

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
  },
  {
    stage: 'stage_6',
    promptKey: 'stage6_smoother',
    promptName: 'Stage 6 - Smoother: Transition Refinement',
    promptDescription:
      'Polishes assembled content with improved transitions, consistent tone, and refined prose. Does NOT change structure or technical content.',
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
  },
  {
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
3. **Structure**: Follows required structure (intro, sections, exercises, conclusion)
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
  },
];

// ============================================================================
// REGISTRY CONSTRUCTION
// ============================================================================

/**
 * Central prompt registry: Map<promptKey, HardcodedPrompt>
 *
 * All 18 prompts indexed by promptKey for fast lookup.
 */
export const PROMPT_REGISTRY = new Map<string, HardcodedPrompt>([
  ...stage3Prompts.map((p) => [p.promptKey, p] as [string, HardcodedPrompt]),
  ...stage4Prompts.map((p) => [p.promptKey, p] as [string, HardcodedPrompt]),
  ...stage5Prompts.map((p) => [p.promptKey, p] as [string, HardcodedPrompt]),
  ...stage6Prompts.map((p) => [p.promptKey, p] as [string, HardcodedPrompt]),
]);

/**
 * Get all prompts for a specific stage
 *
 * @param stage - Stage identifier
 * @returns Array of prompts for that stage
 */
export function getPromptsByStage(
  stage: 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6'
): HardcodedPrompt[] {
  return Array.from(PROMPT_REGISTRY.values()).filter((p) => p.stage === stage);
}

/**
 * Get prompt by key
 *
 * @param promptKey - Unique prompt identifier
 * @returns Prompt or undefined if not found
 */
export function getPrompt(promptKey: string): HardcodedPrompt | undefined {
  return PROMPT_REGISTRY.get(promptKey);
}
