/**
 * Phase 2: Scope Analysis - Helper Functions
 *
 * Extracted from phase-2-scope.ts to reduce function complexity and line count.
 * Contains:
 * - JSON parsing with 5-layer repair cascade
 * - Post-processing for sections and metadata
 * - Validation and constraint enforcement
 *
 * @module phase-2-scope-helpers
 */

import {
  Phase2OutputSchema,
  type Phase2Input,
  type Phase2Output,
} from '@megacampus/shared-types/analysis-schemas';
import type { ChatOpenAI } from '@langchain/openai';
import { UnifiedRegenerator } from '@/shared/regeneration';
import { preprocessObject } from '@/shared/validation/preprocessing';
import { extractJSON } from '@/shared/utils/json-repair';
import { logger } from '@/shared/logger';

// ============================================================================
// TYPES
// ============================================================================

/** Repair metadata tracking for JSON parsing layers */
export interface RepairMetadata {
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
}

// ============================================================================
// PREPROCESSING
// ============================================================================

/**
 * Preprocess raw LLM output: extract JSON, preprocess enum fields in sections
 */
export function preprocessRawOutput(rawOutput: string): string {
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
            difficulty: 'enum',
          });
        }
      );
    }
    preprocessedOutput = JSON.stringify(parsedRaw);
  } catch (error) {
    logger.warn(
      {
        phase: 'phase-2-scope',
        error: error instanceof Error ? error.message : String(error),
      },
      'Preprocessing failed, using raw output'
    );
  }
  return preprocessedOutput;
}

// ============================================================================
// JSON PARSING WITH REPAIR CASCADE
// ============================================================================

/**
 * Parse JSON output with 5-layer repair cascade via UnifiedRegenerator.
 *
 * @returns Parsed output and repair metadata
 */
export async function parseWithRepairCascade(
  preprocessedOutput: string,
  model: ChatOpenAI,
  modelId: string,
  validatedInput: Phase2Input,
  buildPromptTextFn: (input: Phase2Input) => string
): Promise<{ parsedOutput: unknown; repairMetadata: RepairMetadata }> {
  const repairMetadata: RepairMetadata = {
    layer_used: 'none',
    repair_attempts: 0,
    successful_fields: [],
    regenerated_fields: [],
    models_tried: [modelId],
  };

  let parsedOutput: unknown;

  try {
    // Attempt 0: Direct parse
    parsedOutput = JSON.parse(preprocessedOutput);
  } catch (parseError) {
    // Direct parse failed, using UnifiedRegenerator with all 5 layers
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
      originalPrompt: buildPromptTextFn(validatedInput),
      parseError: parseError instanceof Error ? parseError.message : String(parseError),
    });

    if (result.success && result.data) {
      parsedOutput = result.data;
      applyRepairResult(repairMetadata, result, modelId);
    } else {
      logger.error({ phase: 'phase-2-scope', error: result.error }, 'ALL REPAIR LAYERS EXHAUSTED');
      throw new Error(
        `Failed to parse Phase 2 JSON after all 5 repair layers. Error: ${result.error}`
      );
    }
  }

  return { parsedOutput, repairMetadata };
}

/** Map UnifiedRegenerator result to legacy repair metadata */
function applyRepairResult(
  repairMetadata: RepairMetadata,
  result: {
    metadata: {
      layerUsed: string;
      retryCount: number;
      successfulFields?: string[];
      regeneratedFields?: string[];
      modelsUsed?: string[];
    };
  },
  modelId: string
): void {
  const layerMapping: Record<string, RepairMetadata['layer_used']> = {
    'auto-repair': 'layer1_repair',
    'critique-revise': 'layer2_revise',
    'partial-regen': 'layer3_partial',
    'model-escalation': 'layer4_120b',
    emergency: 'layer5_emergency',
    warning_fallback: 'warning_fallback',
    failed: 'none',
  };

  repairMetadata.layer_used = layerMapping[result.metadata.layerUsed] || 'none';
  repairMetadata.repair_attempts = result.metadata.retryCount;
  repairMetadata.successful_fields = result.metadata.successfulFields || [];
  repairMetadata.regenerated_fields = result.metadata.regeneratedFields || [];
  repairMetadata.models_tried = [modelId, ...(result.metadata.modelsUsed || [])];
}

// ============================================================================
// POST-PROCESSING
// ============================================================================

/**
 * Post-process and validate parsed output into Phase2Output.
 * Applies safety net defaults, validates with Zod, and enforces constraints.
 */
export function postProcessAndValidate(
  parsedOutput: unknown,
  modelId: string,
  durationMs: number,
  inputTokens: number,
  outputTokens: number,
  repairMetadata: RepairMetadata,
  validatedInput: Phase2Input
): Phase2Output {
  const parsedData = parsedOutput as Record<string, unknown>;

  // Post-processing safety net: Ensure ALL required fields have valid values
  applyStructureDefaults(parsedData);

  const validated = Phase2OutputSchema.parse({
    recommended_structure: parsedData.recommended_structure,
    phase_metadata: {
      duration_ms: durationMs,
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
  enforceMinLessonsConstraint(validated, validatedInput);

  // Log if LLM exceeded max_lessons constraint (non-blocking, for analytics)
  logMaxLessonsExceeded(validated, validatedInput);

  return validated;
}

/** Apply safety net defaults to recommended_structure fields */
function applyStructureDefaults(parsedData: Record<string, unknown>): void {
  const recStructure = parsedData.recommended_structure as Record<string, unknown> | undefined;
  if (!recStructure) return;

  // Fix top-level fields
  const calcExpl = recStructure.calculation_explanation as string | undefined;
  recStructure.calculation_explanation =
    calcExpl && calcExpl.length >= 50
      ? calcExpl
      : `Estimated ${(recStructure.estimated_content_hours as number) || 1}h x 60min / ${(recStructure.lesson_duration_minutes as number) || 15}min/lesson = ${(recStructure.total_lessons as number) || 10} lessons total`;

  recStructure.scope_warning = recStructure.scope_warning || null;

  // Fix sections breakdown
  if (recStructure.sections_breakdown && Array.isArray(recStructure.sections_breakdown)) {
    recStructure.sections_breakdown = postProcessSections(
      recStructure.sections_breakdown as unknown[]
    );
  }
}

/** Enforce minimum lessons constraint (FR-015) */
function enforceMinLessonsConstraint(validated: Phase2Output, validatedInput: Phase2Input): void {
  const minLessonsRequired = validatedInput.min_lessons ?? 10;
  if (validated.recommended_structure.total_lessons < minLessonsRequired) {
    throw new Error(
      `Insufficient scope for minimum ${minLessonsRequired} lessons (estimated: ${validated.recommended_structure.total_lessons}). ` +
        `Please expand topic or provide additional requirements.`
    );
  }
}

/** Log warning if max_lessons constraint exceeded (non-blocking) */
function logMaxLessonsExceeded(validated: Phase2Output, validatedInput: Phase2Input): void {
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
}

// ============================================================================
// SECTION POST-PROCESSING
// ============================================================================

/**
 * Post-process sections to ensure validity and defaults
 */
export function postProcessSections(sections: unknown[]): Record<string, unknown>[] {
  const VALID_IMPORTANCE = ['simple', 'normal', 'complex'] as const;
  const VALID_DIFFICULTY = ['beginner', 'intermediate', 'advanced'] as const;

  return sections.map((section: unknown) => {
    const sec = section as Record<string, unknown>;
    return {
      area: sec.area || 'General Topic',
      estimated_lessons: sec.estimated_lessons || 1,
      importance: (VALID_IMPORTANCE as readonly string[]).includes(sec.importance as string)
        ? sec.importance
        : 'normal',
      learning_objectives:
        Array.isArray(sec.learning_objectives) && sec.learning_objectives.length >= 2
          ? sec.learning_objectives
          : ['Understand core concepts', 'Apply practical techniques'],
      key_topics:
        Array.isArray(sec.key_topics) && sec.key_topics.length >= 3
          ? sec.key_topics
          : ['General concepts', 'Fundamental principles', 'Core techniques'],
      pedagogical_approach:
        typeof sec.pedagogical_approach === 'string' && sec.pedagogical_approach.length >= 50
          ? sec.pedagogical_approach
          : 'Hands-on practice with incremental complexity and real-world examples',
      section_id: sec.section_id || '1',
      estimated_duration_hours: Math.max((sec.estimated_duration_hours as number) || 0.5, 0.5),
      difficulty: (VALID_DIFFICULTY as readonly string[]).includes(sec.difficulty as string)
        ? sec.difficulty
        : 'intermediate',
    };
  });
}
