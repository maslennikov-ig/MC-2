-- Migration: Seed prompt_templates with hardcoded prompts from prompt-registry.ts
-- Purpose: Populate database with all 13 pipeline prompts so they can be edited via UI
-- Date: 2025-12-03
-- Related: T062, specs/015-admin-pipeline-dashboard

-- ============================================================================
-- STAGE 3 PROMPTS (2 total)
-- ============================================================================

-- Stage 3 - Comparative Document Classification
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_3',
  'stage3_classification_comparative',
  'Stage 3 - Comparative Document Classification',
  'Classifies ALL documents in a single LLM call using comparative ranking. Ensures proper distribution: exactly 1 CORE, up to 30% IMPORTANT, remaining SUPPLEMENTARY.',
  $prompt$You are a document classification expert for educational content.

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
Each classification must have: id (UUID), priority (CORE/IMPORTANT/SUPPLEMENTARY), rationale (brief explanation referencing the signals found).$prompt$,
  '[{"name":"maxImportant","description":"Maximum number of IMPORTANT documents (calculated as 30% of total)","required":true,"example":"3"},{"name":"totalDocuments","description":"Total number of documents to classify","required":true,"example":"10"},{"name":"courseTitle","description":"Course title for context","required":false,"example":"Introduction to React Hooks"},{"name":"courseDescription","description":"Course description for context","required":false,"example":"Learn React Hooks fundamentals"},{"name":"documentDescriptions","description":"Formatted list of documents with ID, filename, file type, size, and content preview","required":true,"example":"[Document 1]\\nID: uuid\\nFilename: syllabus.pdf\\n..."}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key, version) DO NOTHING;

-- Stage 3 - Independent Document Classification (Fallback)
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_3',
  'stage3_classification_independent',
  'Stage 3 - Independent Document Classification (Fallback)',
  'Classifies a single document independently (fallback for comparative classification failures). Returns HIGH (≥0.7) or LOW (<0.7) priority.',
  $prompt$You are a document classification expert for educational content.

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

Be precise and consistent. The importance_score should reflect how critical this document is for generating high-quality course content.$prompt$,
  '[{"name":"courseTitle","description":"Course title for context","required":false,"example":"Introduction to React Hooks"},{"name":"courseDescription","description":"Course description for context","required":false,"example":"Learn React Hooks fundamentals"},{"name":"filename","description":"Document filename","required":true,"example":"syllabus.pdf"},{"name":"mimeType","description":"Document MIME type","required":true,"example":"application/pdf"},{"name":"fileSize","description":"Document file size (formatted, e.g., 2.5 MB)","required":true,"example":"2.5 MB"},{"name":"contentPreview","description":"Document content preview or summary","required":true,"example":"Course Overview\\n\\nThis course covers..."}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key, version) DO NOTHING;

-- ============================================================================
-- STAGE 4 PROMPTS (4 total)
-- ============================================================================

-- Stage 4 Phase 1 - Course Classification
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_4',
  'stage4_phase1_classification',
  'Stage 4 Phase 1 - Course Classification',
  'Performs course categorization (6 categories), contextual language generation, and topic analysis. Always outputs in target course language.',
  $prompt$You are an expert curriculum architect with 15+ years of experience in adult education (andragogy).

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

Analyze this topic and provide comprehensive classification and topic analysis.$prompt$,
  '[{"name":"outputLanguage","description":"Target language for course content (English, Russian, etc.)","required":true,"example":"Russian"},{"name":"topic","description":"Course topic to analyze","required":true,"example":"React Hooks fundamentals"},{"name":"userRequirements","description":"Optional user requirements/answers","required":false,"example":"\\n\\nUSER REQUIREMENTS:\\nTarget audience: intermediate developers"},{"name":"documentContext","description":"Optional document summaries context","required":false,"example":"\\n\\nDOCUMENT SUMMARIES:\\n[Document 1]\\n..."}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key, version) DO NOTHING;

-- Stage 4 Phase 2 - Scope Analysis
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_4',
  'stage4_phase2_scope',
  'Stage 4 Phase 2 - Scope Analysis',
  'Estimates course scope: total content hours (0.5-200h), lesson count (minimum 10), sections breakdown (1-30 sections).',
  $prompt$You are a curriculum scope analyst with expertise in estimating course structure.

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

Estimate the course scope and generate detailed structure recommendations.$prompt$,
  '[{"name":"outputLanguage","description":"Target language for course content","required":true,"example":"Russian"},{"name":"lessonDurationMinutes","description":"Duration of each lesson in minutes","required":true,"example":"15"},{"name":"topic","description":"Course topic","required":true,"example":"React Hooks fundamentals"},{"name":"category","description":"Course category from Phase 1","required":true,"example":"professional"},{"name":"complexity","description":"Course complexity from Phase 1","required":true,"example":"intermediate"},{"name":"targetAudience","description":"Target audience from Phase 1","required":true,"example":"intermediate"},{"name":"informationCompleteness","description":"Information completeness percentage from Phase 1","required":true,"example":"85"},{"name":"userRequirements","description":"Optional user requirements","required":false},{"name":"documentContext","description":"Optional document summaries","required":false}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key, version) DO NOTHING;

-- Stage 4 Phase 3 - Deep Expert Analysis
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_4',
  'stage4_phase3_expert',
  'Stage 4 Phase 3 - Deep Expert Analysis',
  'Designs pedagogical strategy (teaching style, assessment, progression), identifies expansion areas, detects research flags. Always uses 120B model.',
  $prompt$You are a senior curriculum architect with 20+ years of experience in adult education (andragogy) and instructional design.

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
- estimated_lessons: Number of lessons needed$prompt$,
  '[{"name":"outputLanguage","description":"Target language for course content","required":true,"example":"Russian"},{"name":"topic","description":"Course topic","required":true},{"name":"category","description":"Course category from Phase 1","required":true},{"name":"categoryConfidence","description":"Category confidence score","required":true},{"name":"complexity","description":"Course complexity","required":true},{"name":"informationCompleteness","description":"Information completeness percentage","required":true},{"name":"targetAudience","description":"Target audience level","required":true},{"name":"totalLessons","description":"Total number of lessons from Phase 2","required":true},{"name":"estimatedHours","description":"Estimated content hours from Phase 2","required":true},{"name":"lessonDurationMinutes","description":"Lesson duration in minutes","required":true},{"name":"totalSections","description":"Total number of sections from Phase 2","required":true},{"name":"userRequirements","description":"Optional user requirements","required":false},{"name":"documentContext","description":"Optional document summaries","required":false}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key, version) DO NOTHING;

-- Stage 4 Phase 4 - Document Synthesis
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_4',
  'stage4_phase4_synthesis',
  'Stage 4 Phase 4 - Document Synthesis',
  'Synthesizes all analysis phases into clear generation instructions for Stage 5. Adaptive model: <3 docs → 20B, ≥3 docs → 120B.',
  $prompt$You are a curriculum synthesis expert. Your task is to combine all analysis phases and document summaries into clear generation instructions.

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
2. content_strategy: Approach for course creation$prompt$,
  '[{"name":"outputLanguage","description":"Target language for course content","required":true},{"name":"topic","description":"Course topic","required":true},{"name":"documentCount","description":"Number of documents analyzed","required":true},{"name":"phase1Summary","description":"Summary of Phase 1 classification results","required":true},{"name":"phase2Summary","description":"Summary of Phase 2 scope analysis","required":true},{"name":"phase3Summary","description":"Summary of Phase 3 expert analysis","required":true},{"name":"documentSummaries","description":"Formatted document summaries","required":false}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key, version) DO NOTHING;

-- ============================================================================
-- STAGE 5 PROMPTS (2 total)
-- ============================================================================

-- Stage 5 - Course Metadata Generation
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_5',
  'stage5_metadata_generator',
  'Stage 5 - Course Metadata Generation',
  'Generates course metadata: title, description, tags, difficulty, duration, prerequisites. Uses hybrid routing (critical fields: 120B, non-critical: 20B).',
  $prompt$You are a course metadata expert. Generate comprehensive course metadata.

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
6. prerequisites: List of prerequisites (0-10 items)$prompt$,
  '[{"name":"outputLanguage","description":"Target language for course content","required":true},{"name":"topic","description":"Course topic","required":true},{"name":"analysisContext","description":"Context from Stage 4 analysis","required":true}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key, version) DO NOTHING;

-- Stage 5 - Course Sections Generation
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_5',
  'stage5_sections_generator',
  'Stage 5 - Course Sections Generation',
  'Generates course structure: sections with lessons. Each section has title, description, and lesson breakdown.',
  $prompt$You are a course structure architect. Generate comprehensive course structure.

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
5. lessons: Array of lessons with title, description, order$prompt$,
  '[{"name":"outputLanguage","description":"Target language for course content","required":true},{"name":"totalSections","description":"Total number of sections to generate","required":true},{"name":"minimumLessons","description":"Minimum total lessons (FR-015: 10)","required":true},{"name":"structureContext","description":"Context from analysis phases","required":true}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key, version) DO NOTHING;

-- ============================================================================
-- STAGE 6 PROMPTS (5 total)
-- ============================================================================

-- Stage 6 - Planner: Lesson Outline Generation
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_6',
  'stage6_planner',
  'Stage 6 - Planner: Lesson Outline Generation',
  'Generates detailed lesson outline from specification. Uses Context-First XML strategy with lesson context, learning objectives, and RAG context.',
  $prompt$<lesson_context>
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

  {{ragContext}}
</lesson_context>

<task>
Create a detailed lesson outline based on the specification above. The outline must:

1. **Introduction**: Plan the opening using the specified hook strategy ({{hookStrategy}})
   - Design a {{hookStrategy}} hook about: {{hookTopic}}
   - Preview the key learning objectives

2. **Main Sections**: For each section listed above, create:
   - 3-5 key points to cover
   - Suggested examples or illustrations
   - Transition to next section

3. **Conclusion**: Plan a summary that:
   - Reinforces each learning objective
   - Provides actionable next steps

Format as markdown outline. Target total reading time: {{durationMinutes}} minutes
</task>$prompt$,
  '[{"name":"lessonId","description":"Lesson UUID","required":true},{"name":"lessonTitle","description":"Lesson title","required":true},{"name":"lessonDescription","description":"Lesson description","required":true},{"name":"difficulty","description":"Difficulty level","required":true},{"name":"durationMinutes","description":"Estimated duration in minutes","required":true},{"name":"targetAudience","description":"Target audience level","required":true},{"name":"tone","description":"Content tone (formal, conversational, etc.)","required":true},{"name":"contentArchetype","description":"Content archetype (code_tutorial, concept_explainer, etc.)","required":true},{"name":"learningObjectives","description":"XML-formatted learning objectives","required":true},{"name":"hookStrategy","description":"Hook strategy (analogy, statistic, challenge, question)","required":true},{"name":"hookTopic","description":"Topic for the hook","required":true},{"name":"keyObjectives","description":"Key learning objectives summary","required":true},{"name":"sections","description":"XML-formatted sections breakdown","required":true},{"name":"ragContext","description":"XML-formatted RAG context chunks","required":false}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key, version) DO NOTHING;

-- Stage 6 - Expander: Section Content Expansion
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_6',
  'stage6_expander',
  'Stage 6 - Expander: Section Content Expansion',
  'Expands a single section from outline into full content. Uses content archetype, depth guidance, and RAG context.',
  $prompt$<lesson_context>
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

  {{ragContext}}
</lesson_context>

<task>
Write the full content for the "{{sectionTitle}}" section. Requirements:

1. **Cover All Key Points**: Address each point from the specification
2. **Match Depth**: {{depthGuidance}}
3. **Content Style** ({{contentArchetype}}): Follow archetype-specific guidelines
4. **Include Keywords**: Naturally incorporate: {{requiredKeywords}}
5. **Avoid Terms**: Do not use: {{prohibitedTerms}}
6. **Tone**: Maintain {{tone}} tone
7. **Audience**: Write for {{targetAudience}} level

Output as markdown. Do NOT include the section title as a header.
</task>$prompt$,
  '[{"name":"lessonTitle","description":"Lesson title","required":true},{"name":"targetAudience","description":"Target audience","required":true},{"name":"tone","description":"Content tone","required":true},{"name":"difficulty","description":"Difficulty level","required":true},{"name":"sectionTitle","description":"Section title to expand","required":true},{"name":"contentArchetype","description":"Content archetype","required":true},{"name":"depth","description":"Content depth (summary, detailed_analysis, comprehensive)","required":true},{"name":"depthGuidance","description":"Human-readable depth guidance","required":true},{"name":"keyPoints","description":"XML-formatted key points","required":true},{"name":"requiredKeywords","description":"Comma-separated required keywords","required":false},{"name":"prohibitedTerms","description":"Comma-separated prohibited terms","required":false},{"name":"lessonOutline","description":"Full lesson outline from planner","required":true},{"name":"ragContext","description":"XML-formatted RAG context","required":false}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key, version) DO NOTHING;

-- Stage 6 - Assembler: Content Assembly
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_6',
  'stage6_assembler',
  'Stage 6 - Assembler: Content Assembly',
  'Assembles expanded sections into cohesive lesson with introduction, transitions, exercises, and conclusion.',
  $prompt$<lesson_context>
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

<task>
Assemble a complete lesson from the expanded sections above. You must:

1. **Write Introduction**:
   - Create a {{hookStrategy}} hook about: {{hookTopic}}
   - Preview the key learning objectives
   - Transition smoothly into the first section

2. **Assemble Sections**:
   - Include each expanded section with its title as a heading
   - Add smooth transitions between sections
   - Maintain consistent tone throughout

3. **Create Exercises**: Follow the structure templates provided

4. **Write Conclusion**:
   - Summarize key takeaways
   - Reinforce learning objectives
   - Provide next steps

Output as complete markdown lesson.
</task>$prompt$,
  '[{"name":"lessonTitle","description":"Lesson title","required":true},{"name":"lessonDescription","description":"Lesson description","required":true},{"name":"difficulty","description":"Difficulty level","required":true},{"name":"durationMinutes","description":"Duration in minutes","required":true},{"name":"targetAudience","description":"Target audience","required":true},{"name":"tone","description":"Content tone","required":true},{"name":"hookStrategy","description":"Hook strategy","required":true},{"name":"hookTopic","description":"Hook topic","required":true},{"name":"keyObjectives","description":"Key objectives summary","required":true},{"name":"expandedSections","description":"XML-formatted expanded sections","required":true},{"name":"exerciseSpecs","description":"XML-formatted exercise specifications","required":false}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key, version) DO NOTHING;

-- Stage 6 - Smoother: Transition Refinement
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_6',
  'stage6_smoother',
  'Stage 6 - Smoother: Transition Refinement',
  'Polishes assembled content with improved transitions, consistent tone, and refined prose. Does NOT change structure or technical content.',
  $prompt$<lesson_context>
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
</task>$prompt$,
  '[{"name":"lessonTitle","description":"Lesson title","required":true},{"name":"targetAudience","description":"Target audience","required":true},{"name":"tone","description":"Content tone","required":true},{"name":"difficulty","description":"Difficulty level","required":true},{"name":"toneGuidance","description":"Specific tone guidance based on tone type","required":true},{"name":"audienceLevel","description":"Audience-level specific guidance","required":true},{"name":"assembledContent","description":"Assembled lesson content from assembler","required":true}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key, version) DO NOTHING;

-- Stage 6 - Judge: Quality Validation
INSERT INTO prompt_templates (stage, prompt_key, prompt_name, prompt_description, prompt_template, variables, version, is_active)
VALUES (
  'stage_6',
  'stage6_judge',
  'Stage 6 - Judge: Quality Validation',
  'Validates lesson quality against specification. Checks completeness, accuracy, and adherence to constraints.',
  $prompt$You are a curriculum quality validator. Evaluate the lesson against its specification.

LESSON SPECIFICATION:
{{lessonSpec}}

GENERATED LESSON:
{{generatedLesson}}

VALIDATION CRITERIA:
1. **Completeness**: All learning objectives covered
2. **Accuracy**: Content matches specification requirements
3. **Structure**: Follows required structure (intro, sections, exercises, conclusion)
4. **Constraints**: Adheres to required keywords, prohibited terms, depth
5. **Quality**: Clear, engaging, appropriate for target audience

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

Be objective and constructive. Focus on specification adherence.$prompt$,
  '[{"name":"lessonSpec","description":"JSON-formatted lesson specification","required":true},{"name":"generatedLesson","description":"Generated lesson content to validate","required":true}]'::jsonb,
  1, true
)
ON CONFLICT (stage, prompt_key, version) DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE prompt_templates IS 'Contains all 13 pipeline prompts seeded from prompt-registry.ts. Stage 3: 2, Stage 4: 4, Stage 5: 2, Stage 6: 5';
