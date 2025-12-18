/**
 * Stage 5 Generation - LangGraph Orchestrator
 *
 * @module services/stage5/generation-orchestrator
 *
 * Implements RT-002 5-Phase Generation Architecture with LangGraph StateGraph:
 * - Phase 1: validate_input (schema validation)
 * - Phase 2: generate_metadata (MetadataGenerator with RT-001 hybrid routing)
 * - Phase 3: generate_sections (SectionBatchGenerator with tiered routing)
 * - Phase 4: validate_quality (QualityValidator with 0.75 threshold)
 * - Phase 5: validate_lessons (MinimumLessonsValidator with ≥10 lessons)
 *
 * Linear workflow with no conditional edges or branching.
 * Each phase updates state immutably and transitions to next phase.
 *
 * RT-001 Model Routing Integration:
 * - Phase 2: qwen3-max (critical) + OSS 120B (non-critical)
 * - Phase 3: OSS 120B (primary) + qwen3-max (escalation) + Gemini (overflow)
 * - Phase 4: Jina-v3 embeddings (95%) + OSS 120B LLM-as-judge (5%)
 *
 * RT-004 Retry Logic:
 * - Tracks retry counts per phase in state.retryCount
 * - Exponential backoff implemented in GenerationPhases
 * - Max 3 attempts per phase
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-001-model-routing.md
 * @see specs/008-generation-generation-json/research-decisions/rt-002-generation-architecture.md
 * @see specs/008-generation-generation-json/research-decisions/rt-004-retry-strategy.md
 * @see packages/course-gen-platform/src/services/stage5/generation-state.ts
 * @see packages/course-gen-platform/src/services/stage5/generation-phases.ts
 */

import { StateGraph, END, Annotation } from '@langchain/langgraph';
import { GenerationPhases } from './phases/generation-phases';
import { MetadataGenerator } from './utils/metadata-generator';
import { SectionBatchGenerator } from './utils/section-batch-generator';
import { QualityValidator } from '../../shared/validation/quality-validator';
import { calculateGenerationCost } from '../../shared/llm/cost-calculator';
import type { QdrantClient } from '@qdrant/js-client-rest';
import type {
  GenerationJobInput,
  GenerationResult,
  GenerationMetadata,
  CourseStructure,
  CourseMetadata,
  Section,
} from '@megacampus/shared-types';
import pino from 'pino';
import { MinimumLessonsValidator } from './validators/minimum-lessons-validator';
import { logTrace } from '../../shared/trace-logger';

// ============================================================================
// QUALITY GATE CONFIGURATION (T037)
// ============================================================================

/**
 * Quality gate configuration for section validation
 *
 * T037: Preparation for LLM Judge integration in Phase 6.5
 * Current implementation uses structural quality checks.
 * Full LLM Judge with CLEV voting (2 judges + conditional 3rd, temp 0.0)
 * will be implemented in Phase 6.5 (T081-T094).
 *
 * @see specs/010-stages-456-pipeline/spec.md
 */
const QUALITY_CONFIG = {
  /** Semantic similarity threshold for quality validation */
  SIMILARITY_THRESHOLD: 0.75,
  /** Minimum lessons required per section for quality pass */
  MIN_LESSONS_PER_SECTION: 3,
  /** Minimum learning objectives required per lesson */
  MIN_OBJECTIVES_PER_LESSON: 1,
  /** Minimum key topics required per lesson */
  MIN_TOPICS_PER_LESSON: 2,
  /** Enable LLM Judge validation (Phase 6.5 - T081-T094) */
  ENABLE_LLM_JUDGE: false,
} as const;

// ============================================================================
// SECTION QUALITY VALIDATION TYPES (T037)
// ============================================================================

/**
 * Result of section quality validation
 */
interface SectionQualityValidationResult {
  /** Whether all quality checks passed */
  passed: boolean;
  /** Overall quality score (0-1 based on compliance percentage) */
  score: number;
  /** Sections that failed quality checks */
  failedSections: Array<{
    sectionNumber: number;
    score: number;
    reason: string;
  }>;
}

// ============================================================================
// LANGGRAPH STATE ANNOTATION
// ============================================================================

/**
 * LangGraph State Annotation for GenerationState
 *
 * Defines the state schema for the 5-phase workflow.
 * Each field is annotated for LangGraph's state management.
 *
 * IMPORTANT: LangGraph uses Annotation API (not plain interfaces) for state definition.
 * This ensures proper state merging and immutability tracking.
 *
 * @see https://langchain-ai.github.io/langgraphjs/how-tos/state-model/
 */
const GenerationStateAnnotation = Annotation.Root({
  // Input data
  input: Annotation<GenerationJobInput>,

  // Generation results (accumulated)
  metadata: Annotation<CourseMetadata | null>,
  sections: Annotation<Section[]>,

  // Quality tracking
  qualityScores: Annotation<{
    metadata_similarity?: number;
    sections_similarity: number[];
    overall?: number;
  }>,

  // Token usage tracking
  tokenUsage: Annotation<{
    metadata: number;
    sections: number;
    validation: number;
    total: number;
  }>,

  // Model selection tracking
  modelUsed: Annotation<{
    metadata: string;
    sections: string;
    validation?: string;
  }>,

  // Retry tracking
  retryCount: Annotation<{
    metadata: number;
    sections: number[];
  }>,

  // Phase execution metadata
  currentPhase: Annotation<'validate_input' | 'generate_metadata' | 'generate_sections' | 'validate_quality' | 'validate_lessons'>,
  phaseDurations: Annotation<{
    validate_input?: number;
    generate_metadata?: number;
    generate_sections?: number;
    validate_quality?: number;
    validate_lessons?: number;
  }>,

  // Error handling
  errors: Annotation<string[]>,
});

/**
 * Type alias for LangGraph state (inferred from Annotation)
 */
type GenerationStateType = typeof GenerationStateAnnotation.State;

// ============================================================================
// GENERATION ORCHESTRATOR CLASS
// ============================================================================

/**
 * GenerationOrchestrator - Main entry point for 5-phase generation pipeline
 *
 * Builds and executes LangGraph StateGraph workflow with dependency-injected services.
 * Coordinates MetadataGenerator, SectionBatchGenerator, QualityValidator, and
 * MinimumLessonsValidator across 5 phases.
 *
 * RT-002 Linear Workflow (no branching):
 * 1. validate_input → 2. generate_metadata → 3. generate_sections →
 * 4. validate_quality → 5. validate_lessons → END
 *
 * @example
 * ```typescript
 * const orchestrator = new GenerationOrchestrator(
 *   new MetadataGenerator(),
 *   new SectionBatchGenerator(),
 *   new QualityValidator(),
 *   qdrantClient // Optional RAG
 * );
 *
 * const result = await orchestrator.execute(jobInput, qdrantClient);
 * console.log(result.course_structure);
 * console.log(result.generation_metadata);
 * ```
 */
export class GenerationOrchestrator {
  private phases: GenerationPhases;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private graph: any;
  private logger: pino.Logger;

  /**
   * @param metadataGenerator - Service for Phase 2 metadata generation
   * @param sectionBatchGenerator - Service for Phase 3 section batch generation
   * @param qualityValidator - Service for Phase 4 quality validation
   * @param qdrantClient - Optional Qdrant client for RAG context (FR-004)
   */
  constructor(
    metadataGenerator: MetadataGenerator,
    sectionBatchGenerator: SectionBatchGenerator,
    qualityValidator: QualityValidator,
    qdrantClient?: QdrantClient
  ) {
    this.logger = pino({
      name: 'generation-orchestrator',
      level: process.env.LOG_LEVEL || 'info',
    });

    // Instantiate GenerationPhases with injected services
    this.phases = new GenerationPhases(
      metadataGenerator,
      sectionBatchGenerator,
      qualityValidator,
      qdrantClient
    );

    // Build and compile StateGraph
    this.graph = this.buildGraph();

    this.logger.info('GenerationOrchestrator initialized with 5-phase StateGraph');
  }

  /**
   * Build and compile the LangGraph StateGraph workflow
   *
   * RT-002 Graph Structure:
   * START → validate_input → generate_metadata → generate_sections →
   *         validate_quality → validate_lessons → END
   *
   * Linear flow with no conditional edges or branching.
   *
   * @returns Compiled StateGraph application
   * @private
   */
  private buildGraph() {
    this.logger.info('Building 5-phase StateGraph workflow');

    const graph = new StateGraph(GenerationStateAnnotation)
      // Add 5 phase nodes
      .addNode('validate_input', this.phases.validateInput.bind(this.phases))
      .addNode('generate_metadata', this.phases.generateMetadata.bind(this.phases))
      .addNode('generate_sections', this.phases.generateSections.bind(this.phases))
      .addNode('validate_quality', this.phases.validateQuality.bind(this.phases))
      .addNode('validate_lessons', this.phases.validateLessons.bind(this.phases))

      // Define linear edges (RT-002 sequential flow)
      .setEntryPoint('validate_input')
      .addEdge('validate_input', 'generate_metadata')
      .addEdge('generate_metadata', 'generate_sections')
      .addEdge('generate_sections', 'validate_quality')
      .addEdge('validate_quality', 'validate_lessons')
      .addEdge('validate_lessons', END);

    const compiled = graph.compile();

    this.logger.info('StateGraph compiled successfully with 5 phases');

    return compiled;
  }

  /**
   * Execute the 5-phase generation pipeline
   *
   * Workflow:
   * 1. Initialize state from GenerationJobInput
   * 2. Invoke LangGraph StateGraph (5 phases execute sequentially)
   * 3. Validate final state for errors
   * 4. Assemble GenerationResult from finalState
   *
   * RT-001 Model Routing:
   * - Metadata: qwen3-max (critical) + OSS 120B (non-critical)
   * - Sections: OSS 120B (primary) + qwen3-max (escalation)
   * - Validation: Jina-v3 embeddings (95%) + OSS 120B LLM-as-judge (5%)
   *
   * RT-004 Retry Logic:
   * - Implemented in GenerationPhases methods
   * - Max 3 attempts per phase with exponential backoff
   *
   * @param input - Generation job input from BullMQ queue
   * @returns GenerationResult with course_structure and generation_metadata
   * @throws Error if generation fails (validation errors, phase failures)
   *
   * @example
   * ```typescript
   * const jobInput: GenerationJobInput = {
   *   course_id: 'uuid',
   *   organization_id: 'org-uuid',
   *   user_id: 'user-uuid',
   *   analysis_result: analysisResult,
   *   frontend_parameters: { course_title: 'Machine Learning' },
   *   document_summaries: null,
   * };
   *
   * const result = await orchestrator.execute(jobInput);
   * console.log(result.course_structure.sections.length); // 6 sections
   * console.log(result.generation_metadata.total_tokens.total); // 8500 tokens
   * ```
   */
  async execute(
    input: GenerationJobInput
  ): Promise<GenerationResult> {
    this.logger.info(
      { course_id: input.course_id },
      'Starting 5-phase generation pipeline'
    );

    const startTime = Date.now();

    await logTrace({
      courseId: input.course_id,
      stage: 'stage_5',
      phase: 'init',
      stepName: 'start',
      inputData: { 
        courseId: input.course_id,
        topic: input.analysis_result?.course_category?.primary
      },
      durationMs: 0
    });

    // ========== STEP 1: Initialize state ==========
    const initialState: GenerationStateType = {
      input,
      metadata: null,
      sections: [],
      qualityScores: {
        sections_similarity: [],
      },
      tokenUsage: {
        metadata: 0,
        sections: 0,
        validation: 0,
        total: 0,
      },
      modelUsed: {
        metadata: '',
        sections: '',
      },
      retryCount: {
        metadata: 0,
        sections: [],
      },
      currentPhase: 'validate_input',
      phaseDurations: {},
      errors: [],
    };

    this.logger.info('Initial state initialized, invoking StateGraph');

    // ========== STEP 2: Invoke LangGraph StateGraph ==========
    let finalState: GenerationStateType;

    try {
      finalState = await this.graph.invoke(initialState);
    } catch (error) {
      const errorMessage = `StateGraph execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error({ error }, errorMessage);

      await logTrace({
        courseId: input.course_id,
        stage: 'stage_5',
        phase: 'complete',
        stepName: 'failed',
        errorData: { error: errorMessage },
        durationMs: Date.now() - startTime
      });

      throw new Error(errorMessage);
    }

    const totalDuration = Date.now() - startTime;

    // Trace logs for each phase
    await logTrace({
      courseId: input.course_id,
      stage: 'stage_5',
      phase: 'validate_input',
      stepName: 'validate_schema',
      inputData: {},
      durationMs: finalState.phaseDurations.validate_input || 0
    });

    if (finalState.metadata) {
      await logTrace({
        courseId: input.course_id,
        stage: 'stage_5',
        phase: 'generate_metadata',
        stepName: 'generate_course_metadata',
        inputData: {},
        outputData: { metadata: finalState.metadata },
        durationMs: finalState.phaseDurations.generate_metadata || 0
      });
    }

    await logTrace({
      courseId: input.course_id,
      stage: 'stage_5',
      phase: 'generate_sections',
      stepName: 'generate_sections_batch',
      inputData: {},
      outputData: { sectionsCount: finalState.sections.length },
      durationMs: finalState.phaseDurations.generate_sections || 0
    });

    await logTrace({
      courseId: input.course_id,
      stage: 'stage_5',
      phase: 'validate_quality',
      stepName: 'quality_check',
      inputData: {},
      outputData: { qualityScores: finalState.qualityScores },
      durationMs: finalState.phaseDurations.validate_quality || 0
    });

    this.logger.info(
      {
        course_id: input.course_id,
        duration: totalDuration,
        errors: finalState.errors.length,
      },
      'StateGraph execution completed'
    );

    // ========== STEP 3: Validate final state for errors ==========
    if (finalState.errors.length > 0) {
      const errorSummary = finalState.errors.join('; ');
      this.logger.error(
        { course_id: input.course_id, errors: finalState.errors },
        'Generation failed with errors'
      );

      await logTrace({
        courseId: input.course_id,
        stage: 'stage_5',
        phase: 'complete',
        stepName: 'failed',
        errorData: { error: errorSummary },
        durationMs: totalDuration
      });

      throw new Error(`Generation failed: ${errorSummary}`);
    }

    // ========== STEP 4: Validate results presence ==========
    if (!finalState.metadata) {
      throw new Error('Metadata generation failed: metadata is null');
    }

    if (finalState.sections.length === 0) {
      throw new Error('Section generation failed: no sections generated');
    }

    this.logger.info(
      {
        course_id: input.course_id,
        sections_count: finalState.sections.length,
        total_tokens: finalState.tokenUsage.total,
        overall_quality: finalState.qualityScores.overall,
      },
      'Generation completed successfully'
    );

    // ========== STEP 4.5: T037 Quality Gate Validation ==========
    // Perform additional quality validation after section generation
    // This is a preparation step for LLM Judge integration in Phase 6.5 (T081-T094)
    const { qualityResult, lessonsResult } = await this.performPostGenerationQualityGate(
      finalState.sections,
      input
    );

    // Log quality gate results (non-blocking for now)
    this.logger.info(
      {
        course_id: input.course_id,
        structural_quality: {
          passed: qualityResult.passed,
          score: qualityResult.score,
          threshold: QUALITY_CONFIG.SIMILARITY_THRESHOLD,
          failedSectionsCount: qualityResult.failedSections.length,
        },
        minimum_lessons: {
          passed: lessonsResult.passed,
          totalLessons: lessonsResult.totalLessons,
          required: lessonsResult.minimumRequired,
          deficit: lessonsResult.deficit,
        },
      },
      'T037 quality gate validation completed'
    );

    // ========== STEP 5: Assemble GenerationResult ==========
    // Cast metadata to CourseStructure (metadata contains all required fields from Phase 2)
    // The spread ensures all metadata fields are copied to courseStructure
    const courseStructure: CourseStructure = {
      ...(finalState.metadata as CourseStructure),
      sections: finalState.sections,
    };

    // Calculate cost using cost-calculator service
    // Create minimal metadata object with required fields for cost calculation
    const costCalculationMetadata: Partial<GenerationMetadata> = {
      model_used: finalState.modelUsed,
      total_tokens: {
        metadata: finalState.tokenUsage.metadata,
        sections: finalState.tokenUsage.sections,
        validation: finalState.tokenUsage.validation,
        total: finalState.tokenUsage.total,
      },
    };
    const costBreakdown = calculateGenerationCost(costCalculationMetadata as GenerationMetadata);

    const generationMetadata: GenerationMetadata = {
      model_used: finalState.modelUsed,
      total_tokens: {
        metadata: finalState.tokenUsage.metadata,
        sections: finalState.tokenUsage.sections,
        validation: finalState.tokenUsage.validation,
        total: finalState.tokenUsage.total,
      },
      cost_usd: costBreakdown.total_cost_usd,
      duration_ms: {
        metadata: finalState.phaseDurations.generate_metadata || 0,
        sections: finalState.phaseDurations.generate_sections || 0,
        validation: finalState.phaseDurations.validate_quality || 0,
        total: totalDuration,
      },
      quality_scores: {
        metadata_similarity: finalState.qualityScores.metadata_similarity || 0,
        sections_similarity: finalState.qualityScores.sections_similarity,
        overall: finalState.qualityScores.overall || 0,
      },
      batch_count: finalState.sections.length, // 1 section per batch
      retry_count: {
        metadata: finalState.retryCount.metadata,
        sections: finalState.retryCount.sections,
      },
      created_at: new Date().toISOString(),
    };

    const result: GenerationResult = {
      course_structure: courseStructure,
      generation_metadata: generationMetadata,
    };

    this.logger.info(
      { course_id: input.course_id },
      'GenerationResult assembled successfully'
    );

    await logTrace({
      courseId: input.course_id,
      stage: 'stage_5',
      phase: 'complete',
      stepName: 'finish',
      inputData: { courseId: input.course_id },
      outputData: courseStructure, // Full CourseStructure for UI display
      costUsd: generationMetadata.cost_usd,
      tokensUsed: generationMetadata.total_tokens.total,
      durationMs: totalDuration
    });

    return result;
  }

  // ==========================================================================
  // QUALITY VALIDATION METHODS (T037)
  // ==========================================================================

  /**
   * Validate section quality with 0.75 threshold
   *
   * T037: Preparation for LLM Judge integration in Phase 6.5
   * Current implementation uses structural quality checks:
   * - Lesson count per section (min 3)
   * - Learning objectives per lesson (min 1)
   * - Key topics per lesson (min 2)
   *
   * Returns score 0-1 based on compliance percentage.
   *
   * Full LLM Judge with CLEV voting (2 judges + conditional 3rd, temp 0.0)
   * will be implemented in Phase 6.5 (T081-T094).
   *
   * @param sections - Generated sections to validate
   * @param input - Original generation job input for context
   * @returns Quality validation result with pass/fail status and score
   *
   * @example
   * ```typescript
   * const qualityResult = await this.validateSectionQuality(sections, state.input);
   * if (!qualityResult.passed) {
   *   logger.warn({
   *     qualityScore: qualityResult.score,
   *     threshold: 0.75,
   *     failedSections: qualityResult.failedSections,
   *   }, 'Quality validation failed, may need regeneration');
   * }
   * ```
   */
  private async validateSectionQuality(
    sections: Section[],
    input: GenerationJobInput
  ): Promise<SectionQualityValidationResult> {
    this.logger.info(
      { sectionCount: sections.length, courseId: input.course_id },
      'Starting section quality validation (T037)'
    );

    const failedSections: SectionQualityValidationResult['failedSections'] = [];
    let totalChecks = 0;
    let passedChecks = 0;

    for (const section of sections) {
      const sectionNumber = section.section_number;
      const reasons: string[] = [];

      // Check 1: Minimum lessons per section (min 3)
      totalChecks++;
      const lessonCount = section.lessons?.length ?? 0;
      if (lessonCount >= QUALITY_CONFIG.MIN_LESSONS_PER_SECTION) {
        passedChecks++;
      } else {
        reasons.push(
          `Insufficient lessons: ${lessonCount}/${QUALITY_CONFIG.MIN_LESSONS_PER_SECTION} required`
        );
      }

      // Check lessons for lesson objectives and key topics
      for (const lesson of section.lessons ?? []) {
        // Check 2: Minimum lesson objectives per lesson (min 1)
        totalChecks++;
        const objectivesCount = lesson.lesson_objectives?.length ?? 0;
        if (objectivesCount >= QUALITY_CONFIG.MIN_OBJECTIVES_PER_LESSON) {
          passedChecks++;
        } else {
          reasons.push(
            `Lesson "${lesson.lesson_title}": ${objectivesCount}/${QUALITY_CONFIG.MIN_OBJECTIVES_PER_LESSON} lesson objectives`
          );
        }

        // Check 3: Minimum key topics per lesson (min 2)
        totalChecks++;
        const topicsCount = lesson.key_topics?.length ?? 0;
        if (topicsCount >= QUALITY_CONFIG.MIN_TOPICS_PER_LESSON) {
          passedChecks++;
        } else {
          reasons.push(
            `Lesson "${lesson.lesson_title}": ${topicsCount}/${QUALITY_CONFIG.MIN_TOPICS_PER_LESSON} key topics`
          );
        }
      }

      // If any reasons, this section failed
      if (reasons.length > 0) {
        const sectionScore = reasons.length === 0 ? 1.0 : Math.max(0, 1 - (reasons.length * 0.2));
        failedSections.push({
          sectionNumber,
          score: sectionScore,
          reason: reasons.join('; '),
        });
      }
    }

    // Calculate overall score based on compliance percentage
    const score = totalChecks > 0 ? passedChecks / totalChecks : 0;
    const passed = score >= QUALITY_CONFIG.SIMILARITY_THRESHOLD;

    const result: SectionQualityValidationResult = {
      passed,
      score,
      failedSections,
    };

    // Log quality validation result
    if (!result.passed) {
      this.logger.warn(
        {
          qualityScore: result.score,
          threshold: QUALITY_CONFIG.SIMILARITY_THRESHOLD,
          failedSections: result.failedSections,
          courseId: input.course_id,
        },
        'Quality validation failed, may need regeneration'
      );
    } else {
      this.logger.info(
        {
          qualityScore: result.score,
          threshold: QUALITY_CONFIG.SIMILARITY_THRESHOLD,
          courseId: input.course_id,
        },
        'Quality validation passed'
      );
    }

    return result;
  }

  /**
   * Perform additional quality gate validation after section generation
   *
   * T037: Integrates structural quality checks and minimum lessons validation.
   * Called after StateGraph execution to provide additional validation layer.
   *
   * @param sections - Generated sections from StateGraph
   * @param input - Original generation job input
   * @returns Combined validation results
   */
  private async performPostGenerationQualityGate(
    sections: Section[],
    input: GenerationJobInput
  ): Promise<{
    qualityResult: SectionQualityValidationResult;
    lessonsResult: ReturnType<MinimumLessonsValidator['validateSections']>;
  }> {
    // T037: Quality validation with 0.75 threshold
    const qualityResult = await this.validateSectionQuality(sections, input);

    if (!qualityResult.passed) {
      this.logger.warn(
        {
          qualityScore: qualityResult.score,
          threshold: QUALITY_CONFIG.SIMILARITY_THRESHOLD,
          failedSections: qualityResult.failedSections,
        },
        'Quality validation failed, may need regeneration'
      );
    }

    // T037: Minimum lessons validation (FR-015)
    const lessonsValidator = new MinimumLessonsValidator();
    const lessonsResult = lessonsValidator.validateSections(sections);

    if (!lessonsResult.passed) {
      this.logger.warn(
        {
          totalLessons: lessonsResult.totalLessons,
          required: 10,
          deficit: lessonsResult.deficit,
        },
        'Course does not meet minimum 10 lessons requirement'
      );
    }

    return { qualityResult, lessonsResult };
  }
}
