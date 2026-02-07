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

import { getModelForPhase } from '@/shared/llm/langchain-models';
import { trackPhaseExecution, storeTraceData } from '../utils/observability';
import {
  Phase2InputSchema,
  Phase2OutputSchema,
  type Phase2Input,
  type Phase2Output,
} from '@megacampus/shared-types/analysis-schemas';
import { UnifiedRegenerator } from '@/shared/regeneration';
import { zodToPromptSchema } from '@/shared/utils/zod-to-prompt-schema';
import { preprocessObject } from '@/shared/validation/preprocessing';
import { extractJSON } from '@/shared/utils/json-repair';
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
 *
 * @example
 * const result = await runPhase2Scope({
 *   course_id: '550e8400-e29b-41d4-a716-446655440000',
 *   language: 'ru',
 *   topic: 'Procurement law fundamentals',
 *   document_summaries: null,
 *   phase1_output: { ... }
 * });
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
      const rawOutput = response.content as string;

      // Store trace data for orchestrator to log
      const promptText = buildPhase2PromptText(validatedInput);
      storeTraceData(validatedInput.course_id, 'stage_4_scope', {
        promptText,
        completionText: rawOutput,
      });

      // Debug logging removed - use observability tracing via storeTraceData instead

      // TIER 1: PREPROCESSING (before UnifiedRegenerator)
      // Extract JSON from markdown code blocks + strip thinking tags
      let preprocessedOutput = extractJSON(rawOutput);
      try {
        const parsedRaw = JSON.parse(preprocessedOutput) as Record<string, unknown>;
        const recommendedStructure = parsedRaw.recommended_structure as
          | Record<string, unknown>
          | undefined;
        // Check if recommended_structure exists and preprocess sections
        if (
          recommendedStructure?.sections_breakdown &&
          Array.isArray(recommendedStructure.sections_breakdown)
        ) {
          recommendedStructure.sections_breakdown = recommendedStructure.sections_breakdown.map(
            (section: unknown) => {
              return preprocessObject(section as Record<string, unknown>, {
                importance: 'enum',
                difficulty_progression: 'enum',
                difficulty: 'enum',
                // Phase 2 section-level enum fields
              });
            }
          );
        }
        preprocessedOutput = JSON.stringify(parsedRaw);
      } catch (error) {
        // CR-007: Use structured logger instead of console.*
        logger.warn(
          {
            phase: 'phase-2-scope',
            error: error instanceof Error ? error.message : String(error),
          },
          'Preprocessing failed, using raw output'
        );
      }

      // Parse JSON response with 5-layer repair cascade
      let parsedOutput: unknown;
      const repairMetadata: {
        layer_used:
          | 'none'
          | 'layer1_repair'
          | 'layer2_revise'
          | 'layer3_partial'
          | 'layer4_120b'
          | 'layer5_emergency'
          | 'warning_fallback';
        repair_attempts: number;
        successful_fields: string[];
        regenerated_fields: string[];
        models_tried: string[];
      } = {
        layer_used: 'none',
        repair_attempts: 0,
        successful_fields: [],
        regenerated_fields: [],
        models_tried: [modelId],
      };

      try {
        // Attempt 0: Direct parse
        parsedOutput = JSON.parse(preprocessedOutput);
        // Direct parse succeeded
      } catch (parseError) {
        // Direct parse failed, using UnifiedRegenerator with all 5 layers

        // Use UnifiedRegenerator with all 5 layers + warning fallback (Stage 4)
        const regenerator = new UnifiedRegenerator<Phase2Output>({
          enabledLayers: [
            'auto-repair',
            'critique-revise',
            'partial-regen',
            'model-escalation',
            'emergency',
          ],
          maxRetries: 2,
          schema: Phase2OutputSchema,
          model: model,
          metricsTracking: true,
          stage: 'analyze',
          courseId: validatedInput.course_id,
          phaseId: 'stage_4_scope',
          allowWarningFallback: true, // Stage 4 advisory fields
        });

        const result = await regenerator.regenerate({
          rawOutput: preprocessedOutput,
          originalPrompt: buildPhase2PromptText(validatedInput),
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
        });

        if (result.success && result.data) {
          parsedOutput = result.data;

          // Map layer names to legacy format for backward compatibility
          const layerMapping = {
            'auto-repair': 'layer1_repair' as const,
            'critique-revise': 'layer2_revise' as const,
            'partial-regen': 'layer3_partial' as const,
            'model-escalation': 'layer4_120b' as const,
            emergency: 'layer5_emergency' as const,
            warning_fallback: 'warning_fallback' as const,
            failed: 'none' as const,
          };

          repairMetadata.layer_used = layerMapping[result.metadata.layerUsed] || 'none';
          repairMetadata.repair_attempts = result.metadata.retryCount;
          repairMetadata.successful_fields = result.metadata.successfulFields || [];
          repairMetadata.regenerated_fields = result.metadata.regeneratedFields || [];
          repairMetadata.models_tried = [modelId, ...(result.metadata.modelsUsed || [])];

          // UnifiedRegenerator succeeded via layer: ${result.metadata.layerUsed}
        } else {
          // CR-007: Use structured logger instead of console.*
          logger.error(
            { phase: 'phase-2-scope', error: result.error },
            'ALL REPAIR LAYERS EXHAUSTED'
          );
          throw new Error(
            `Failed to parse Phase 2 JSON after all 5 repair layers. Error: ${result.error}`
          );
        }
      }

      const endTime = Date.now();
      const duration_ms = endTime - startTime;

      // Extract token usage from response metadata
      const usage = (
        response as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }
      ).usage_metadata;
      const inputTokens = usage?.input_tokens || 0;
      const outputTokens = usage?.output_tokens || 0;

      // Validate with Zod schema - manually construct phase_metadata (like phase-4-synthesis.ts)
      // LLM only generates business fields (recommended_structure), we add metadata
      const parsedData = parsedOutput as Record<string, unknown>;

      // Post-processing safety net: Ensure ALL required fields have valid values
      const recStructure = parsedData.recommended_structure as Record<string, unknown> | undefined;
      if (recStructure) {
        // Fix top-level fields
        const calcExpl = recStructure.calculation_explanation as string | undefined;
        recStructure.calculation_explanation =
          calcExpl && calcExpl.length >= 50
            ? calcExpl
            : `Estimated ${(recStructure.estimated_content_hours as number) || 1}h × 60min ÷ ${(recStructure.lesson_duration_minutes as number) || 15}min/lesson = ${(recStructure.total_lessons as number) || 10} lessons total`;

        recStructure.scope_warning = recStructure.scope_warning || null;

        // Fix sections breakdown
        if (recStructure.sections_breakdown && Array.isArray(recStructure.sections_breakdown)) {
          recStructure.sections_breakdown = postProcessSections(
            recStructure.sections_breakdown as unknown[]
          );

          // Post-processing validated sections with all required fields
        }
      }

      const validated = Phase2OutputSchema.parse({
        recommended_structure: parsedData.recommended_structure,
        phase_metadata: {
          duration_ms,
          model_used: modelId,
          tokens: {
            input: inputTokens,
            output: outputTokens,
            total: inputTokens + outputTokens,
          },
          quality_score: 0.0, // Will be updated after semantic validation
          retry_count: 0,
          ...(repairMetadata.layer_used !== 'none' && { repair_metadata: repairMetadata }),
        },
      });

      // CRITICAL: Enforce minimum lessons constraint based on course_size preset
      // For 'auto' mode (no preset), default minimum is 10 (FR-015)
      // For specific presets: micro=1, mini=8, compact=15, standard=30, comprehensive=60
      const minLessonsRequired = validatedInput.min_lessons ?? 10;
      if (validated.recommended_structure.total_lessons < minLessonsRequired) {
        throw new Error(
          `Insufficient scope for minimum ${minLessonsRequired} lessons (estimated: ${validated.recommended_structure.total_lessons}). ` +
            `Please expand topic or provide additional requirements.`
        );
      }

      // Log if LLM exceeded max_lessons constraint (non-blocking, for analytics)
      // Note: Root cause fix is in orchestrator.ts - now passing course_size fields to prompt
      const maxLessonsAllowed = validatedInput.max_lessons;
      if (maxLessonsAllowed && validated.recommended_structure.total_lessons > maxLessonsAllowed) {
        logger.warn(
          {
            phase: 'phase-2-scope',
            courseSize: validatedInput.course_size,
            generated: validated.recommended_structure.total_lessons,
            max: maxLessonsAllowed,
            targetSections: validatedInput.target_sections,
            generatedSections: validated.recommended_structure.total_sections,
          },
          'LLM exceeded max_lessons constraint despite prompt guidance'
        );
      }

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
 * Helper: Post-process sections to ensure validity and defaults
 */
function postProcessSections(sections: unknown[]): Record<string, unknown>[] {
  // Valid enum values
  const VALID_IMPORTANCE = ['core', 'important', 'optional'] as const;
  const VALID_DIFFICULTY = ['beginner', 'intermediate', 'advanced'] as const;
  const VALID_PROGRESSION = ['flat', 'gradual', 'steep'] as const;

  return sections.map((section: unknown) => {
    const sec = section as Record<string, unknown>;
    return {
      area: sec.area || 'General Topic',
      estimated_lessons: sec.estimated_lessons || 1,
      // Validate importance against valid enum values (fallback to 'important' if invalid)
      importance: (VALID_IMPORTANCE as readonly string[]).includes(sec.importance as string)
        ? sec.importance
        : 'important',
      // Ensure minimum 2 learning objectives (Zod schema requires .min(2))
      learning_objectives:
        Array.isArray(sec.learning_objectives) && sec.learning_objectives.length >= 2
          ? sec.learning_objectives
          : ['Understand core concepts', 'Apply practical techniques'],
      // Ensure minimum 3 key topics (Zod schema requires .min(3))
      key_topics:
        Array.isArray(sec.key_topics) && sec.key_topics.length >= 3
          ? sec.key_topics
          : ['General concepts', 'Fundamental principles', 'Core techniques'],
      pedagogical_approach:
        typeof sec.pedagogical_approach === 'string' && sec.pedagogical_approach.length >= 50
          ? sec.pedagogical_approach
          : 'Hands-on practice with incremental complexity and real-world examples',
      // Validate difficulty_progression against valid enum values
      difficulty_progression: (VALID_PROGRESSION as readonly string[]).includes(
        sec.difficulty_progression as string
      )
        ? sec.difficulty_progression
        : 'gradual',
      section_id: sec.section_id || '1',
      estimated_duration_hours: Math.max((sec.estimated_duration_hours as number) || 0.5, 0.5),
      // Validate difficulty against valid enum values
      difficulty: (VALID_DIFFICULTY as readonly string[]).includes(sec.difficulty as string)
        ? sec.difficulty
        : 'intermediate',
      prerequisites: Array.isArray(sec.prerequisites) ? sec.prerequisites : [],
    };
  });
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

  // Build optional context
  const documentsContext =
    document_summaries && document_summaries.length > 0
      ? `\n\nAvailable Documents: ${document_summaries.length} documents with processed content`
      : '';

  // Build clarifying context from user answers
  let clarifyingContext = '';
  if (input.clarifying_answers && input.clarifying_answers.length > 0) {
    clarifyingContext = '\n\nUSER CLARIFICATIONS (from Phase 0.5):\n';
    clarifyingContext += input.clarifying_answers
      .map((a, i) => `[Q${i + 1}] ${a.question}\n[A${i + 1}] ${a.answer}`)
      .join('\n\n');
  }

  // Build course size guidance section
  // - For specific sizes: MANDATORY constraint with exact min/max from preset
  // - For auto: explicit guidance to determine optimal size (min 10 default)
  const sizeSection = input.size_guidance
    ? `\n\n## ⚠️ MANDATORY COURSE SIZE CONSTRAINT ⚠️
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
6. The output will be REJECTED if it exceeds these limits`
    : `\n\n## Course Size: AI-Determined (AUTO MODE)
The user has selected **AUTO mode**. Analyze the topic thoroughly and determine the optimal course size yourself based on your expert judgment.
- **HARD MINIMUM**: 10 lessons (course WILL FAIL validation if below this)
- No maximum constraint - create as many lessons as the topic genuinely requires for quality coverage.`;

  // Generate Zod schema description for LLM
  const schemaDescription = zodToPromptSchema(Phase2OutputSchema);

  // Build dynamic minimum lesson rule based on course size
  const minLessonsRule = input.size_guidance
    ? `3. COURSE SIZE PRESET ACTIVE: ${input.course_size?.toUpperCase()} - Generate ${input.min_lessons}-${input.max_lessons} lessons in ${input.target_sections} section(s). DO NOT default to 10 lessons!`
    : `3. Minimum 10 lessons REQUIRED (FR-015) - if scope is insufficient, recommend more content`;

  const systemPrompt = `You are an expert course designer specializing in scope estimation and structure planning.

Your task: Analyze the course topic and provide detailed scope recommendations.

CRITICAL RULES:
1. ALL text output MUST be in ${outputLanguage.toUpperCase()} (the course target language is ${outputLanguage})
2. You MUST respond with valid JSON matching this EXACT schema:

${schemaDescription}

${minLessonsRule}
4. Lesson duration: typically 15 minutes (can vary 3-45 min based on content type)
5. Sections: 1-30 sections, each with 1+ lessons
6. Provide detailed breakdown for each section (learning objectives, key topics, pedagogy)`;

  const userPrompt = `Analyze this course and provide scope recommendations:

**Course Topic**: ${topic}

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
${
  input.size_guidance
    ? `   - FOR THIS ${input.course_size?.toUpperCase()} COURSE: Generate ${input.min_lessons}-${input.max_lessons} lessons ONLY`
    : `   - CRITICAL: Result MUST be ≥ 10 lessons (FR-015)`
}

3. **Generate Sections Breakdown** (${input.size_guidance ? `${input.target_sections} section(s) for ${input.course_size} size` : '1-30 sections'}):

   **CRITICAL: Complete Section Fields**
   EVERY section in sections_breakdown MUST include ALL required fields:
   - area (string)
   - estimated_lessons (number, min 1)
   - importance (core/important/optional)
   - learning_objectives (array, 2+ items)
   - key_topics (array, 3+ items) ← REQUIRED
   - pedagogical_approach (string, 50+ chars) ← REQUIRED
   - difficulty_progression (flat/gradual/steep) ← REQUIRED
   - section_id (string)
   - estimated_duration_hours (number)
   - difficulty (beginner/intermediate/advanced)
   - prerequisites (array of section_ids, empty [] if none)

   ALL sections MUST have ALL 11 fields above. ${input.size_guidance ? `For ${input.course_size} size: generate ${input.target_sections} section(s) only.` : ''}

   - Break course into logical sections
   - For each section:
     - Area name (topic focus)
     - Estimated lessons (min 1)
     - Importance: core/important/optional
     - Learning objectives (2-5 items)
     - Key topics (3-8 items)
     - Pedagogical approach (50-200 chars)
     - Difficulty progression: flat/gradual/steep
     - Section ID (sequential string: "1", "2", "3", ...)
     - Estimated duration hours (calculate from estimated_lessons × lesson_duration_minutes ÷ 60)
     - Difficulty level: beginner/intermediate/advanced
     - Prerequisites (array of section_ids that must be completed first, empty [] if none)

**CRITICAL: SECTION TOPIC DISTINCTNESS** (ZERO TOLERANCE FOR OVERLAP)

Each section MUST cover a COMPLETELY DISTINCT topic area:
1. **ONE concept → ONE section**: Each user-mentioned concept (e.g., "KPI", "dashboards") goes to exactly ONE section. Other sections MUST NOT use it as a main topic. Distribute concepts EVENLY.
2. **Boundary test**: For each section pair — "Could a lesson from A fit in B?" If yes → MERGE or SHARPEN boundaries.
3. **Key topics exclusivity**: Each key_topic MUST appear in EXACTLY ONE section. No duplicates or paraphrases across sections.
4. **Deletion test**: If removing a section creates NO content gap → MERGE it with the similar section.

**CRITICAL CONSTRAINT - KEY TOPICS / LEARNING OBJECTIVES ALIGNMENT:**

Each item in \`key_topics\` MUST directly correspond to a \`learning_objective\` in the same section.
- The key_topic should be the noun/concept/technique from the objective
- DO NOT generate key_topics that are not covered by learning_objectives
- The LLM generating lesson content will use key_topics as section titles
- The LLM validating lesson content will check against learning_objectives
- If they don't match, the lesson will fail quality validation!

**Correct Alignment Example:**
- learning_objective: "Apply the 'Time Compression' technique to accelerate decisions"
  → key_topic: "Time Compression technique"
- learning_objective: "Use 'Scarcity Principle' in event ticket context"
  → key_topic: "Scarcity Principle in sales"
- learning_objective: "Control emotional barriers through objection reframing"
  → key_topic: "Emotional barriers and objection reframing"

**Incorrect Example (CAUSES GENERATION FAILURE):**
- learning_objective: "Apply Time Compression technique"
  → key_topic: "Anchoring technique" ← WRONG! Topic doesn't match objective!

4. **Scope Warning** (if applicable):
   - Warn if scope is very narrow or very broad

**JSON Schema** (fields only, calculate values based on constraints above):
{"recommended_structure":{"estimated_content_hours":<number>,"scope_reasoning":"<string>","lesson_duration_minutes":<number>,"calculation_explanation":"<string>","total_lessons":<number>,"total_sections":<number>,"scope_warning":<string|null>,"sections_breakdown":[{"area":"<string>","estimated_lessons":<number>,"importance":"<core|important|optional>","learning_objectives":["<string>"],"key_topics":["<string>"],"pedagogical_approach":"<string>","difficulty_progression":"<flat|gradual|steep>","section_id":"<string>","estimated_duration_hours":<number>,"difficulty":"<beginner|intermediate|advanced>","prerequisites":["<section_id>"]}]},"phase_metadata":{"duration_ms":0,"model_used":"","tokens":{"input":0,"output":0,"total":0},"quality_score":0.0,"retry_count":0}}

IMPORTANT:
- Output ONLY valid JSON (no markdown, no comments)
- ALL text fields (area, learning_objectives, key_topics, pedagogical_approach, scope_reasoning, calculation_explanation, scope_warning) MUST be in ${outputLanguage.toUpperCase()}
${
  input.size_guidance
    ? `- RESPECT THE SIZE PRESET: Generate ${input.min_lessons}-${input.max_lessons} lessons in ${input.target_sections} section(s) - DO NOT default to 10!
- For ${input.course_size} size: Focus on essentials ONLY, reduce scope if topic is too broad
- STAY WITHIN LIMITS: The user explicitly chose ${input.course_size} size, respect their choice`
    : `- total_lessons MUST be >= 10 (expand scope creatively if needed to surprise the learner)
- For seemingly narrow topics, think broadly: add context, history, applications, best practices
- Aim for comprehensive coverage that provides maximum value`
}
- The ONLY hard constraint is lesson_duration_minutes - respect it strictly
- sections_breakdown array MUST match total_sections count

**New Fields in sections_breakdown (MANDATORY)**:
1. **section_id**: MUST be sequential strings starting from "1" (not numbers)
   - Format: "1", "2", "3", ..., "N" (where N = total_sections)
   - Example: For ${input.target_sections || 3} sections, use "1" through "${input.target_sections || 3}"

2. **estimated_duration_hours**: Calculate for each section
   - Formula: (estimated_lessons × lesson_duration_minutes) ÷ 60
   - Round to 1 decimal place (e.g., 1.3, 2.5, 4.0)
   - Example: 5 lessons × 15 min ÷ 60 = 1.25 hours
   - Sum across all sections should approximately equal estimated_content_hours

3. **difficulty**: Assess based on position in course and target_audience
   - Values: "beginner" | "intermediate" | "advanced"
   - Early sections typically "beginner", middle sections "intermediate", later sections "advanced"
   - Consider target_audience level (novices need more beginner sections)
   - Can have multiple sections at same difficulty level

4. **prerequisites**: Dependency chain (array of section_id strings)
   - Use empty array [] if section has no prerequisites (typically section "1")
   - Reference section_ids that MUST be completed before this section
   - Example: section "3" might require ["1", "2"] to be completed first
   - Advanced sections typically require earlier sections: prerequisites: ["1", "2", "3"]
   - CRITICAL: No circular dependencies (section cannot depend on itself or later sections)
   - CRITICAL: Only reference section_ids that appear BEFORE current section

**Validation Rules**:
- section_id values MUST be unique and sequential
- prerequisites MUST only reference valid section_ids from earlier in the array
- estimated_duration_hours sum should be within ±10% of estimated_content_hours
- difficulty should generally progress from beginner → intermediate → advanced through the course`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * Log warnings for duplicate key_topics across sections (observability).
 * Non-blocking — only logs warnings for monitoring purposes.
 *
 * @param sections - Generated sections_breakdown from Phase 2
 * @param logger - Pino logger instance
 */
export function logDuplicateKeyTopics(
  sections: Array<{ key_topics?: string[]; area?: string }>,
  logger: { warn: (obj: Record<string, unknown>, msg: string) => void }
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
      logger.warn(
        { topic, sections: sectionIndices, phase: 'phase-2-scope' },
        `Duplicate key_topic across sections: "${topic}" in sections ${sectionIndices.join(', ')}`
      );
    }
  }
}
