/**
 * Stage 5 Generation - LangGraph Orchestrator
 *
 * @module services/stage5/generation-orchestrator
 *
 * Implements RT-002 4-Phase Generation Architecture with LangGraph StateGraph:
 * - Phase 1: validate_input (schema validation)
 * - Phase 2: generate_metadata (MetadataGenerator with RT-001 hybrid routing)
 * - Phase 3: generate_sections (SectionBatchGenerator with tiered routing)
 * - Phase 4: validate_quality (QualityValidator with 0.75 threshold)
 *
 * Note: Phase 5 (validate_lessons) removed - lesson validation performed in
 * performPostGenerationQualityGate after StateGraph execution.
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-001-model-routing.md
 * @see specs/008-generation-generation-json/research-decisions/rt-002-generation-architecture.md
 * @see specs/008-generation-generation-json/research-decisions/rt-004-retry-strategy.md
 */

import { StateGraph, END, Annotation } from '@langchain/langgraph';
import { GenerationPhases } from './phases/generation-phases';
import { MetadataGenerator } from './utils/metadata-generator';
import { SectionBatchGenerator } from './utils/section-batch-generator';
import { QualityValidator } from '../../shared/validation/quality-validator';
import type { QdrantClient } from '@qdrant/js-client-rest';
import type {
  GenerationJobInput,
  GenerationResult,
  CourseMetadata,
  Section,
} from '@megacampus/shared-types';
import pino from 'pino';
import { logTrace } from '../../shared/trace-logger';
import {
  QUALITY_CONFIG,
  performPostGenerationQualityGate,
  assembleGenerationResult,
  detectOverlap,
  buildSectionOverlapFeedback,
} from './orchestrator-helpers';
import type { CrossSectionOverlapResult } from '../../shared/validation/quality-validator';

// ============================================================================
// LANGGRAPH STATE ANNOTATION
// ============================================================================

/**
 * LangGraph State Annotation for GenerationState
 *
 * Defines the state schema for the 4-phase workflow.
 * Each field is annotated for LangGraph's state management.
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
    sections_breakdown?: Array<{
      section_number: number;
      model: string;
      tier?: string;
      retry_count: number;
    }>;
  }>,

  // Retry tracking
  retryCount: Annotation<{
    metadata: number;
    sections: number[];
  }>,

  // Phase execution metadata
  currentPhase: Annotation<
    'validate_input' | 'generate_metadata' | 'generate_sections' | 'validate_quality'
  >,
  phaseDurations: Annotation<{
    validate_input?: number;
    generate_metadata?: number;
    generate_sections?: number;
    validate_quality?: number;
  }>,

  // Error handling
  errors: Annotation<string[]>,

  // Model override (for handler-level fallback retry)
  modelOverride: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
});

/** Type alias for LangGraph state (inferred from Annotation) */
type GenerationStateType = typeof GenerationStateAnnotation.State;

// ============================================================================
// GENERATION ORCHESTRATOR CLASS
// ============================================================================

/**
 * GenerationOrchestrator - Main entry point for 4-phase generation pipeline
 *
 * Builds and executes LangGraph StateGraph workflow with dependency-injected services.
 * Coordinates MetadataGenerator, SectionBatchGenerator, and QualityValidator across 4 phases.
 */
/** Maximum overlap retry attempts before proceeding with warning */
const MAX_OVERLAP_RETRIES = 2;

export class GenerationOrchestrator {
  private phases: GenerationPhases;
  private graph: { invoke: (state: GenerationStateType) => Promise<GenerationStateType> };
  private logger: pino.Logger;

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

    this.phases = new GenerationPhases(
      metadataGenerator,
      sectionBatchGenerator,
      qualityValidator,
      qdrantClient
    );

    this.graph = this.buildGraph();
    this.logger.info('GenerationOrchestrator initialized with 4-phase StateGraph');
  }

  /**
   * Build and compile the LangGraph StateGraph workflow
   *
   * RT-002 Graph: START -> validate_input -> generate_metadata ->
   *               generate_sections -> validate_quality -> END
   */
  private buildGraph() {
    this.logger.info('Building 4-phase StateGraph workflow');

    const graph = new StateGraph(GenerationStateAnnotation)
      .addNode('validate_input', this.phases.validateInput.bind(this.phases))
      .addNode('generate_metadata', this.phases.generateMetadata.bind(this.phases))
      .addNode('generate_sections', this.phases.generateSections.bind(this.phases))
      .addNode('validate_quality', this.phases.validateQuality.bind(this.phases))
      .setEntryPoint('validate_input')
      .addEdge('validate_input', 'generate_metadata')
      .addEdge('generate_metadata', 'generate_sections')
      .addEdge('generate_sections', 'validate_quality')
      .addEdge('validate_quality', END);

    const compiled = graph.compile();
    this.logger.info('StateGraph compiled successfully with 4 phases');
    return compiled;
  }

  /**
   * Execute the 4-phase generation pipeline
   *
   * @param input - Generation job input from BullMQ queue
   * @param modelOverride - Optional model override for fallback retry
   * @returns GenerationResult with course_structure and generation_metadata
   * @throws Error if generation fails
   */
  async execute(input: GenerationJobInput, modelOverride?: string): Promise<GenerationResult> {
    this.logExecutionStart(input, modelOverride);
    const startTime = Date.now();

    await this.logInitTraces(input, modelOverride);

    // STEP 1: Initialize state
    const initialState = this.buildInitialState(input, modelOverride);
    this.logger.info('Initial state initialized, invoking StateGraph');

    // STEP 2: Invoke LangGraph StateGraph
    const finalState = await this.invokeGraph(initialState, input, startTime);
    const totalDuration = Date.now() - startTime;

    this.logger.info(
      { course_id: input.course_id, duration: totalDuration, errors: finalState.errors.length },
      'StateGraph execution completed'
    );

    // STEP 3: Validate final state
    this.validateFinalState(finalState, input, totalDuration);

    // STEP 4: Post-generation quality gate (T037)
    const qualityGateResults = await performPostGenerationQualityGate(
      finalState.sections,
      input,
      this.logger
    );

    this.logQualityGateResults(input, qualityGateResults);

    // STEP 4.5: Overlap retry loop (non-blocking — never fails the pipeline)
    const updatedSections = await this.retryOverlappingSections(
      finalState.sections,
      input,
      qualityGateResults.overlapResult
    );

    // STEP 5: Assemble and return result (use updated sections if overlap was resolved)
    const stateForAssembly =
      updatedSections !== finalState.sections
        ? { ...finalState, sections: updatedSections }
        : finalState;

    return this.assembleAndReturnResult(stateForAssembly, input, totalDuration);
  }

  // ==========================================================================
  // OVERLAP RETRY LOGIC
  // ==========================================================================

  /**
   * Retry overlapping sections after post-generation quality gate.
   *
   * Non-blocking: if overlap persists after MAX_OVERLAP_RETRIES, proceeds with warning.
   * For each overlapping pair, regenerates both sections with specific feedback
   * about what the other section already covers.
   *
   * @param sections - Original generated sections
   * @param input - Generation job input
   * @param initialOverlapResult - Overlap result from quality gate
   * @returns Updated sections array (same reference if no overlap detected)
   */
  private async retryOverlappingSections(
    sections: Section[],
    input: GenerationJobInput,
    initialOverlapResult: CrossSectionOverlapResult | null
  ): Promise<Section[]> {
    if (!initialOverlapResult?.hasOverlap) {
      return sections;
    }

    const updatedSections = [...sections];
    let currentOverlapResult = initialOverlapResult;

    for (let attempt = 0; attempt < MAX_OVERLAP_RETRIES; attempt++) {
      if (!currentOverlapResult.hasOverlap) break;

      this.logger.info(
        {
          courseId: input.course_id,
          attempt: attempt + 1,
          maxAttempts: MAX_OVERLAP_RETRIES,
          overlapCount: currentOverlapResult.overlapCount,
          pairs: currentOverlapResult.overlappingPairs.map(
            p => `S${p.sectionA}<>S${p.sectionB} (${p.similarity.toFixed(2)})`
          ),
        },
        `Overlap detected, regenerating overlapping sections (attempt ${attempt + 1}/${MAX_OVERLAP_RETRIES})`
      );

      // Build per-section overlap feedback
      const feedbackMap = buildSectionOverlapFeedback(currentOverlapResult, updatedSections);

      // Regenerate each overlapping section sequentially
      // (sequential so later sections benefit from earlier regenerations)
      for (const [sectionIdx, feedback] of feedbackMap) {
        try {
          const regenerated = await this.phases.regenerateSingleSection(
            sectionIdx,
            input,
            feedback
          );
          if (regenerated.length > 0) {
            updatedSections[sectionIdx] = regenerated[0];
          }
        } catch (error) {
          this.logger.warn(
            {
              courseId: input.course_id,
              sectionIndex: sectionIdx + 1,
              error: error instanceof Error ? error.message : String(error),
            },
            `Failed to regenerate overlapping section ${sectionIdx + 1}, keeping original`
          );
        }
      }

      // Re-run overlap detection on updated sections
      currentOverlapResult = (await detectOverlap(updatedSections, input, this.logger)) || {
        hasOverlap: false,
        overlapCount: 0,
        overlapThreshold: 0,
        overlappingPairs: [],
      };
    }

    if (currentOverlapResult.hasOverlap) {
      this.logger.warn(
        {
          courseId: input.course_id,
          overlapCount: currentOverlapResult.overlapCount,
          pairs: currentOverlapResult.overlappingPairs
            .map(p => `S${p.sectionA}<>S${p.sectionB} (${p.similarity.toFixed(2)})`)
            .join(', '),
        },
        'Overlap persists after max retries, proceeding with warning (non-blocking)'
      );

      await logTrace({
        courseId: input.course_id,
        stage: 'stage_5',
        phase: 'overlap_retry',
        stepName: 'exhausted',
        outputData: {
          overlapCount: currentOverlapResult.overlapCount,
          pairs: currentOverlapResult.overlappingPairs,
        },
        durationMs: 0,
      });
    } else if (updatedSections !== sections) {
      this.logger.info({ courseId: input.course_id }, 'Overlap resolved after regeneration');
    }

    return updatedSections;
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  /** Log execution start message */
  private logExecutionStart(input: GenerationJobInput, modelOverride?: string): void {
    if (modelOverride) {
      this.logger.info(
        { course_id: input.course_id, modelOverride, source: 'handler_fallback' },
        'Starting 4-phase generation pipeline with model override'
      );
    } else {
      this.logger.info({ course_id: input.course_id }, 'Starting 4-phase generation pipeline');
    }
  }

  /** Log initialization traces */
  private async logInitTraces(input: GenerationJobInput, modelOverride?: string): Promise<void> {
    await logTrace({
      courseId: input.course_id,
      stage: 'stage_5',
      phase: 'init',
      stepName: 'start',
      inputData: {
        courseId: input.course_id,
        topic: input.analysis_result?.course_category?.primary,
        ...(modelOverride && { modelOverride, source: 'handler_fallback' }),
      },
      durationMs: 0,
    });

    await logTrace({
      courseId: input.course_id,
      stage: 'stage_5',
      phase: 'init',
      stepName: 'parameter_validate',
      inputData: {
        source: 'stage_4',
        hasAnalysisResult: !!input.analysis_result,
        hasGenerationGuidance: !!input.analysis_result?.generation_guidance,
        hasRecommendedStructure: !!input.analysis_result?.recommended_structure,
      },
      outputData: {
        validationPassed: !!(input.analysis_result && input.analysis_result.recommended_structure),
        totalSections: input.analysis_result?.recommended_structure?.total_sections,
        totalLessons: input.analysis_result?.recommended_structure?.total_lessons,
      },
      durationMs: 0,
    });
  }

  /** Build initial state for StateGraph */
  private buildInitialState(
    input: GenerationJobInput,
    modelOverride?: string
  ): GenerationStateType {
    return {
      input,
      metadata: null,
      sections: [],
      qualityScores: { sections_similarity: [] },
      tokenUsage: { metadata: 0, sections: 0, validation: 0, total: 0 },
      modelUsed: { metadata: '', sections: '' },
      retryCount: { metadata: 0, sections: [] },
      currentPhase: 'validate_input',
      phaseDurations: {},
      errors: [],
      modelOverride: modelOverride || null,
    };
  }

  /** Invoke the StateGraph and handle execution errors */
  private async invokeGraph(
    initialState: GenerationStateType,
    input: GenerationJobInput,
    startTime: number
  ): Promise<GenerationStateType> {
    try {
      return await this.graph.invoke(initialState);
    } catch (error) {
      const errorMessage = `StateGraph execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error({ error }, errorMessage);

      await logTrace({
        courseId: input.course_id,
        stage: 'stage_5',
        phase: 'complete',
        stepName: 'failed',
        errorData: { error: errorMessage },
        durationMs: Date.now() - startTime,
      });

      throw new Error(errorMessage);
    }
  }

  /** Validate that the final state has no errors and has results */
  private validateFinalState(
    finalState: GenerationStateType,
    input: GenerationJobInput,
    totalDuration: number
  ): void {
    if (finalState.errors.length > 0) {
      const errorSummary = finalState.errors.join('; ');
      this.logger.error(
        { course_id: input.course_id, errors: finalState.errors },
        'Generation failed with errors'
      );

      // Fire-and-forget trace logging
      void logTrace({
        courseId: input.course_id,
        stage: 'stage_5',
        phase: 'complete',
        stepName: 'failed',
        errorData: { error: errorSummary },
        durationMs: totalDuration,
      });

      throw new Error(`Generation failed: ${errorSummary}`);
    }

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
  }

  /** Log quality gate results */
  private logQualityGateResults(
    input: GenerationJobInput,
    results: Awaited<ReturnType<typeof performPostGenerationQualityGate>>
  ): void {
    const { qualityResult, lessonsResult, overlapResult } = results;

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
        overlap_detection: overlapResult
          ? {
              ran: true,
              hasOverlap: overlapResult.hasOverlap,
              overlapCount: overlapResult.overlapCount,
            }
          : { ran: false },
      },
      'T037 quality gate validation completed'
    );
  }

  /** Assemble final result and log completion */
  private async assembleAndReturnResult(
    finalState: GenerationStateType,
    input: GenerationJobInput,
    totalDuration: number
  ): Promise<GenerationResult> {
    const { courseStructure, generationMetadata } = assembleGenerationResult(
      finalState.metadata!,
      finalState.sections,
      finalState.tokenUsage,
      finalState.modelUsed,
      finalState.qualityScores,
      finalState.phaseDurations,
      finalState.retryCount,
      totalDuration
    );

    const result: GenerationResult = {
      course_structure: courseStructure,
      generation_metadata: generationMetadata,
    };

    this.logger.info({ course_id: input.course_id }, 'GenerationResult assembled successfully');

    await logTrace({
      courseId: input.course_id,
      stage: 'stage_5',
      phase: 'complete',
      stepName: 'finish',
      inputData: { courseId: input.course_id },
      outputData: courseStructure,
      costUsd: generationMetadata.cost_usd,
      tokensUsed: generationMetadata.total_tokens.total,
      durationMs: totalDuration,
    });

    return result;
  }
}
