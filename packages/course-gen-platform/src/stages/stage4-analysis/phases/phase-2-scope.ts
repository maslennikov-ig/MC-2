/**
 * Phase 2: Scope Analysis Service
 *
 * Estimates course scope and generates detailed structure recommendations.
 * Uses database-configured model (mathematical/logical task) with English-only output.
 *
 * Key responsibilities:
 * - Estimate total content hours (0.5-200h)
 * - Calculate lesson count (15 min lessons, MINIMUM 10 enforced)
 * - Generate sections breakdown (1-30 sections)
 * - Validate minimum 10 lessons constraint (FR-015)
 *
 * @module phase-2-scope
 */

import { getModelForPhase, getTextContent } from '@/shared/llm/langchain-models';
import { trackPhaseExecution, storeTraceData } from '../utils/observability';
import {
  Phase2InputSchema,
  Phase2OutputSchema,
  type Phase2Input,
  type Phase2Output,
} from '@megacampus/shared-types/analysis-schemas';
import { zodToPromptSchema } from '@/shared/utils/zod-to-prompt-schema';
import {
  preprocessRawOutput,
  parseWithRepairCascade,
  postProcessAndValidate,
} from './phase-2-scope-helpers';
import { logger } from '@/shared/logger';

/**
 * Main Phase 2 execution function: Scope Analysis
 *
 * Analyzes course topic and Phase 1 output to estimate scope and structure.
 * Uses database-configured model (scope estimation is mathematical).
 *
 * @param input - Phase 2 input data (validated)
 * @returns Validated Phase 2 output with scope recommendations
 * @throws Error if minimum 10 lessons constraint violated (FR-015)
 * @throws Error if LLM output fails schema validation
 */
export async function runPhase2Scope(input: Phase2Input): Promise<Phase2Output> {
  // Validate input
  const validatedInput = Phase2InputSchema.parse(input);

  // Get model for Phase 2 from database config
  const model = await getModelForPhase(
    'stage_4_scope',
    validatedInput.course_id,
    undefined,
    validatedInput.language
  );
  const modelId = model.model || 'unknown';

  // Build prompt
  const prompt = buildPhase2Prompt(validatedInput);

  // Execute with observability tracking
  const result = await trackPhaseExecution(
    'stage_4_scope',
    validatedInput.course_id,
    modelId,
    async () => {
      const startTime = Date.now();

      // Invoke LLM
      const response = await model.invoke(prompt);
      const rawOutput = getTextContent(response.content);

      // Store trace data for orchestrator to log
      const promptText = buildPhase2PromptText(validatedInput);
      storeTraceData(validatedInput.course_id, 'stage_4_scope', {
        promptText,
        completionText: rawOutput,
      });

      // TIER 1: PREPROCESSING (before UnifiedRegenerator)
      const preprocessedOutput = preprocessRawOutput(rawOutput);

      // TIER 2: Parse JSON with 5-layer repair cascade
      const { parsedOutput, repairMetadata } = await parseWithRepairCascade(
        preprocessedOutput,
        model,
        modelId,
        validatedInput,
        buildPhase2PromptText
      );

      const durationMs = Date.now() - startTime;

      // Extract token usage from response metadata
      const usage = (
        response as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }
      ).usage_metadata;
      const inputTokens = usage?.input_tokens || 0;
      const outputTokens = usage?.output_tokens || 0;

      // TIER 3: Post-process, validate with Zod, enforce constraints
      const validated = postProcessAndValidate(
        parsedOutput,
        modelId,
        durationMs,
        inputTokens,
        outputTokens,
        repairMetadata,
        validatedInput
      );

      // Log duplicate key_topics across sections (observability)
      logDuplicateKeyTopics(validated.recommended_structure.sections_breakdown, {
        warn: (obj: Record<string, unknown>, msg: string) => {
          logger.warn(obj, msg);
        },
      });

      return {
        result: validated,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        },
      };
    }
  );

  return result;
}

/**
 * Builds the Phase 2 LLM prompt as text (for repair layers)
 *
 * @param input - Validated Phase 2 input
 * @returns Complete prompt text
 */
function buildPhase2PromptText(input: Phase2Input): string {
  const messages = buildPhase2Prompt(input);
  return messages.map(m => `${m.role.toUpperCase()}:\n${m.content}`).join('\n\n');
}

/**
 * Builds the Phase 2 LLM prompt
 *
 * Prompt engineering:
 * - Context from Phase 1 (category, complexity, audience)
 * - Clear task definition (estimate hours, calculate lessons, break down sections)
 * - English-only output enforcement
 * - JSON schema with examples
 * - Minimum 10 lessons guidance
 *
 * @param input - Validated Phase 2 input
 * @returns Formatted prompt messages
 */
function buildPhase2Prompt(input: Phase2Input): { role: string; content: string }[] {
  const { phase1_output, topic, document_summaries, language } = input;

  // Determine output language based on course language
  const outputLanguage = language === 'en' ? 'English' : language === 'ru' ? 'Russian' : language;

  // Build context from Phase 1
  const category = phase1_output.course_category.primary;
  const complexity = phase1_output.topic_analysis.complexity;
  const targetAudience = phase1_output.topic_analysis.target_audience;
  const keyConcepts = phase1_output.topic_analysis.key_concepts.join(', ');

  // Build optional context sections
  const documentsContext = buildDocumentsContext(document_summaries);
  const clarifyingContext = buildClarifyingContext(input);
  const courseDescriptionContext = buildCourseDescriptionContext(input);
  const learningOutcomesContext = buildLearningOutcomesContext(input);
  const sizeSection = buildSizeSection(input);
  const schemaDescription = zodToPromptSchema(Phase2OutputSchema);
  const minLessonsRule = buildMinLessonsRule(input);

  const systemPrompt = buildSystemPrompt(outputLanguage, schemaDescription, minLessonsRule);
  const userPrompt = buildUserPrompt(
    input,
    topic,
    category,
    complexity,
    targetAudience,
    keyConcepts,
    documentsContext,
    clarifyingContext,
    courseDescriptionContext,
    learningOutcomesContext,
    sizeSection,
    outputLanguage
  );

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/** Build documents context section */
function buildDocumentsContext(documentSummaries: Phase2Input['document_summaries']): string {
  return documentSummaries && documentSummaries.length > 0
    ? `\n\nAvailable Documents: ${documentSummaries.length} documents with processed content`
    : '';
}

/** Build clarifying answers context section */
function buildClarifyingContext(input: Phase2Input): string {
  if (!input.clarifying_answers || input.clarifying_answers.length === 0) {
    return '';
  }
  let context = '\n\nUSER CLARIFICATIONS (from Phase 0.5):\n';
  context += input.clarifying_answers
    .map((a, i) => `[Q${i + 1}] ${a.question}\n[A${i + 1}] ${a.answer}`)
    .join('\n\n');
  return context;
}

/** Build course description context section */
function buildCourseDescriptionContext(input: Phase2Input): string {
  if (!input.course_description) {
    return '';
  }
  return `\n\n**USER-PROVIDED COURSE DESCRIPTION** (MUST FOLLOW):\n${input.course_description}`;
}

/** Build learning outcomes context section */
function buildLearningOutcomesContext(input: Phase2Input): string {
  if (!input.learning_outcomes) {
    return '';
  }
  const outcomes = Array.isArray(input.learning_outcomes)
    ? input.learning_outcomes.join('\n- ')
    : input.learning_outcomes;
  return `\n\n**REQUIRED LEARNING OUTCOMES**:\n- ${outcomes}`;
}

/** Build course size guidance section */
function buildSizeSection(input: Phase2Input): string {
  if (input.size_guidance) {
    return `\n\n## MANDATORY COURSE SIZE CONSTRAINT
${input.size_guidance}

**ABSOLUTE REQUIREMENT - READ CAREFULLY:**
The user has explicitly selected course size: ${input.course_size?.toUpperCase()}

YOU MUST GENERATE EXACTLY:
- **LESSONS**: ${input.min_lessons} to ${input.max_lessons} (target: ${input.target_lessons})
- **SECTIONS**: ${input.target_sections} section(s) ONLY

**HARD LIMITS (WILL CAUSE VALIDATION FAILURE IF VIOLATED):**
- Minimum lessons: ${input.min_lessons}
- Maximum lessons: ${input.max_lessons}
- Maximum sections: ${input.target_sections}

**STRICT RULES:**
1. DO NOT generate more than ${input.max_lessons} lessons under ANY circumstances
2. DO NOT generate more than ${input.target_sections} section(s) - merge topics if needed
3. For ${input.course_size} size, focus ONLY on absolute essentials
4. If topic is broad, REDUCE scope ruthlessly - cover core concepts only
5. If topic is narrow, add depth but STAY within lesson limit
6. The output will be REJECTED if it exceeds these limits`;
  }

  return `\n\n## Course Size: AI-Determined (AUTO MODE)
The user has selected **AUTO mode**. Analyze the topic thoroughly and determine the optimal course size yourself based on your expert judgment.
- **HARD MINIMUM**: 10 lessons (course WILL FAIL validation if below this)
- No maximum constraint - create as many lessons as the topic genuinely requires for quality coverage.`;
}

/** Build dynamic minimum lesson rule based on course size */
function buildMinLessonsRule(input: Phase2Input): string {
  return input.size_guidance
    ? `3. COURSE SIZE PRESET ACTIVE: ${input.course_size?.toUpperCase()} - Generate ${input.min_lessons}-${input.max_lessons} lessons in ${input.target_sections} section(s). DO NOT default to 10 lessons!`
    : `3. Minimum 10 lessons REQUIRED (FR-015) - if scope is insufficient, recommend more content`;
}

/** Build the system prompt */
function buildSystemPrompt(
  outputLanguage: string,
  schemaDescription: string,
  minLessonsRule: string
): string {
  return `You are an expert course designer specializing in scope estimation and structure planning.

Your task: Analyze the course topic and provide detailed scope recommendations.

CRITICAL RULES:
1. ALL text output MUST be in ${outputLanguage.toUpperCase()} (the course target language is ${outputLanguage})
2. You MUST respond with valid JSON matching this EXACT schema:

${schemaDescription}

${minLessonsRule}
4. Lesson duration: typically 15 minutes (can vary 3-45 min based on content type)
5. Sections: 1-30 sections, each with 1+ lessons
6. Provide detailed breakdown for each section (learning objectives, key topics, pedagogy)`;
}

/** Build the user prompt */
function buildUserPrompt(
  input: Phase2Input,
  topic: string,
  category: string,
  complexity: string,
  targetAudience: string,
  keyConcepts: string,
  documentsContext: string,
  clarifyingContext: string,
  courseDescriptionContext: string,
  learningOutcomesContext: string,
  sizeSection: string,
  outputLanguage: string
): string {
  const sizeConstraintNote = input.size_guidance
    ? `   - FOR THIS ${input.course_size?.toUpperCase()} COURSE: Generate ${input.min_lessons}-${input.max_lessons} lessons ONLY`
    : `   - CRITICAL: Result MUST be >= 10 lessons (FR-015)`;

  const sectionsRange = input.size_guidance
    ? `${input.target_sections} section(s) for ${input.course_size} size`
    : '1-30 sections';

  const sectionsSuffix = input.size_guidance
    ? `For ${input.course_size} size: generate ${input.target_sections} section(s) only.`
    : '';

  const sizeSpecificNotes = input.size_guidance
    ? `- RESPECT THE SIZE PRESET: Generate ${input.min_lessons}-${input.max_lessons} lessons in ${input.target_sections} section(s) - DO NOT default to 10!
- For ${input.course_size} size: Focus on essentials ONLY, reduce scope if topic is too broad
- STAY WITHIN LIMITS: The user explicitly chose ${input.course_size} size, respect their choice`
    : `- total_lessons MUST be >= 10 (expand scope creatively if needed to surprise the learner)
- For seemingly narrow topics, think broadly: add context, history, applications, best practices
- Aim for comprehensive coverage that provides maximum value`;

  // Add overlap feedback from previous attempt (if retrying due to overlap)
  const overlapFeedbackSection = input.overlap_feedback ? `\n\n${input.overlap_feedback}\n` : '';

  return `Analyze this course and provide scope recommendations:${overlapFeedbackSection}

**Course Topic**: ${topic}${courseDescriptionContext}${learningOutcomesContext}

**Category**: ${category}
**Complexity**: ${complexity}
**Target Audience**: ${targetAudience}
**Key Concepts**: ${keyConcepts}${documentsContext}${clarifyingContext}${sizeSection}

**Tasks**:
1. **Estimate Total Content Hours** (0.5-200h):
   - Consider topic breadth, depth, and target audience level
   - Factor in available documents (if any)
   - Provide reasoning for estimate

2. **Calculate Lesson Count**:
   - Determine appropriate lesson duration (3-45 min, typically 15 min)
   - Formula: total_lessons = ceil((estimated_hours * 60) / lesson_duration_minutes)
${sizeConstraintNote}

3. **Generate Sections Breakdown** (${sectionsRange}):

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

   ALL sections MUST have ALL 9 fields above. ${sectionsSuffix}

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
- ALL text fields (area, learning_objectives, key_topics, pedagogical_approach, scope_reasoning, calculation_explanation, scope_warning) MUST be in ${outputLanguage.toUpperCase()}
${sizeSpecificNotes}
- The ONLY hard constraint is lesson_duration_minutes - respect it strictly
- sections_breakdown array MUST match total_sections count

**New Fields in sections_breakdown (MANDATORY)**:
1. **section_id**: MUST be sequential strings starting from "1" (not numbers)
   - Format: "1", "2", "3", ..., "N" (where N = total_sections)
   - Example: For ${input.target_sections || 3} sections, use "1" through "${input.target_sections || 3}"

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
- difficulty should generally progress from beginner -> intermediate -> advanced through the course`;
}

/**
 * Log warnings for duplicate key_topics across sections (observability).
 * Non-blocking - only logs warnings for monitoring purposes.
 *
 * @param sections - Generated sections_breakdown from Phase 2
 * @param sectionLogger - Pino logger instance
 */
export function logDuplicateKeyTopics(
  sections: Array<{ key_topics?: string[]; area?: string }>,
  sectionLogger: { warn: (obj: Record<string, unknown>, msg: string) => void }
): void {
  const topicToSections = new Map<string, number[]>();
  for (let i = 0; i < sections.length; i++) {
    for (const topic of sections[i].key_topics || []) {
      const normalized = topic.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[-_]/g, ' ');
      if (!topicToSections.has(normalized)) {
        topicToSections.set(normalized, []);
      }
      topicToSections.get(normalized)!.push(i + 1);
    }
  }
  for (const [topic, sectionIndices] of topicToSections) {
    if (sectionIndices.length > 1) {
      sectionLogger.warn(
        { topic, sections: sectionIndices, phase: 'phase-2-scope' },
        `Duplicate key_topic across sections: "${topic}" in sections ${sectionIndices.join(', ')}`
      );
    }
  }
}
