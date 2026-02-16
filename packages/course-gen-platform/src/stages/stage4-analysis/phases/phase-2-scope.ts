/**
 * Phase 2: Scope Analysis Service
 *
 * Estimates course scope and generates detailed structure recommendations.
 * Uses database-configured model (mathematical/logical task) with English-only output.
 *
 * Document handling: uses summaries only (no full text, no Budget Allocator).
 * Scope estimation doesn't need full document text — summaries are sufficient.
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
import { createPromptService } from '@/shared/prompts/prompt-service';
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
  const prompt = await buildPhase2Prompt(validatedInput);

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
      const promptText = await buildPhase2PromptText(validatedInput);
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
async function buildPhase2PromptText(input: Phase2Input): Promise<string> {
  const messages = await buildPhase2Prompt(input);
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
async function buildPhase2Prompt(
  input: Phase2Input
): Promise<{ role: string; content: string }[]> {
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

  const systemPrompt = await buildSystemPrompt(outputLanguage, schemaDescription, minLessonsRule);
  const userPrompt = await buildUserPrompt(
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
  if (!documentSummaries || documentSummaries.length === 0) return '';

  const parts: string[] = [];
  parts.push(`\n\nAVAILABLE DOCUMENTS (${documentSummaries.length}):`);
  parts.push('Use these documents as PRIMARY source for course structure.');
  parts.push('Each section MUST be grounded in document content where possible.\n');

  for (let i = 0; i < documentSummaries.length; i++) {
    parts.push(`[Document ${i + 1}]`);
    parts.push(documentSummaries[i]);
    parts.push('');
  }

  return parts.join('\n');
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
async function buildSystemPrompt(
  outputLanguage: string,
  schemaDescription: string,
  minLessonsRule: string
): Promise<string> {
  const promptService = createPromptService();
  return promptService.renderPrompt('stage4_phase2_scope_system', {
    outputLanguage,
    outputLanguageUpper: outputLanguage.toUpperCase(),
    schemaDescription,
    minLessonsRule,
  });
}

/** Build the user prompt */
async function buildUserPrompt(
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
): Promise<string> {
  // Pre-compute all dynamic values
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

  const overlapFeedbackSection = input.overlap_feedback ? `\n\n${input.overlap_feedback}\n` : '';

  const promptService = createPromptService();
  return promptService.renderPrompt('stage4_phase2_scope_user', {
    topic,
    outputLanguageUpper: outputLanguage.toUpperCase(),
    category,
    complexity,
    targetAudience,
    keyConcepts,
    overlapFeedbackSection,
    courseDescriptionContext,
    learningOutcomesContext,
    documentsContext,
    clarifyingContext,
    sizeSection,
    sizeConstraintNote,
    sectionsRange,
    sectionsSuffix,
    sizeSpecificNotes,
    targetSectionsHint: String(input.target_sections || 3),
  });
}

