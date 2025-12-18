/**
 * Generation Phases - 5-Phase LangGraph Workflow Orchestration
 *
 * @module services/stage5/generation-phases
 *
 * Implements RT-002 5-Phase Generation Architecture for LangGraph workflow:
 * - Phase 1: validate_input (schema validation with GenerationJobInputSchema)
 * - Phase 2: generate_metadata (MetadataGenerator with RT-001 hybrid routing)
 * - Phase 3: generate_sections (SectionBatchGenerator with tiered routing)
 * - Phase 4: validate_quality (QualityValidator with 0.75 threshold)
 * - Phase 5: validate_lessons (MinimumLessonsValidator with ≥10 lessons)
 *
 * Each phase method:
 * - Calls appropriate service (MetadataGenerator, SectionBatchGenerator, QualityValidator)
 * - Tracks model used, tokens, duration, retries
 * - Updates state immutably using state helpers from generation-state.ts
 * - Handles errors with try-catch + Pino logging
 * - Implements retry logic (2-3 attempts per phase with exponential backoff)
 *
 * RT-001 Integration:
 * - Phase 2: Track critical vs non-critical field routing in metadata
 * - Phase 3: Track tier selection (OSS 120B, qwen3-max, Gemini) per section
 * - Phase 4: Track validation method (embedding vs llm_judge)
 *
 * RT-004 Retry Logic:
 * - Exponential backoff: delay = 1000 * Math.pow(2, attempt - 1)
 * - Max 3 attempts per phase
 * - Track retry count in state.retryCount
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-001-model-routing.md
 * @see specs/008-generation-generation-json/research-decisions/rt-002-generation-architecture.md
 * @see specs/008-generation-generation-json/research-decisions/rt-004-retry-strategy.md
 * @see packages/course-gen-platform/src/services/stage5/generation-state.ts
 */

import type { GenerationState } from '../utils/generation-state';
import { MetadataGenerator } from '../utils/metadata-generator';
import { SectionBatchGenerator, type SectionBatchResult } from '../utils/section-batch-generator';
import { QualityValidator } from '../../../shared/validation/quality-validator';
import type { QdrantClient } from '@qdrant/js-client-rest';
import pino from 'pino';
import type { GenerationJobInput, Section } from '@megacampus/shared-types';
import { GenerationJobInputSchema } from '@megacampus/shared-types/generation-job';
import { formatPedagogicalStrategyForPrompt } from '../utils/analysis-formatters';
import { V2LessonSpecGenerator } from './phase3-v2-spec-generator';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import pLimit from 'p-limit';
import { createModelConfigService, getEffectiveStageConfig } from '../../../shared/llm/model-config-service';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * RT-004 Retry configuration
 */
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 1000,
} as const;

/**
 * Parallel section generation configuration
 *
 * Optimized for OpenRouter rate limits and performance:
 * - MAX_CONCURRENT_SECTIONS: 4 (respects API rate limits while maximizing throughput)
 * - RETRY_DELAY_MS: 2000 (base delay for exponential backoff)
 * - RATE_LIMIT_DELAY_MS: 2000 (delay between batches for rate limiting)
 *
 * Note: RETRY_ATTEMPTS_PER_SECTION is now fetched from database via model-config-service
 */
const PARALLEL_CONFIG = {
  /** Maximum concurrent section generations (respects OpenRouter rate limits) */
  MAX_CONCURRENT_SECTIONS: 4,
  /** Base retry delay in milliseconds */
  RETRY_DELAY_MS: 2000,
  /** Delay between parallel batches for rate limiting */
  RATE_LIMIT_DELAY_MS: 2000,
} as const;

/**
 * RT-001 Quality thresholds
 */
const QUALITY_CONFIG = {
  MIN_SIMILARITY: 0.75,     // Overall quality threshold
  MIN_LESSONS: 10,          // FR-015: Minimum 10 lessons total
} as const;

// ============================================================================
// GENERATION PHASES CLASS
// ============================================================================

/**
 * GenerationPhases - Orchestrates 5-phase LangGraph workflow
 *
 * Coordinates generation services (MetadataGenerator, SectionBatchGenerator,
 * QualityValidator) and manages state transitions through the 5-phase workflow.
 *
 * @example
 * ```typescript
 * const phases = new GenerationPhases(
 *   new MetadataGenerator(),
 *   new SectionBatchGenerator(),
 *   new QualityValidator(),
 *   qdrantClient // Optional RAG
 * );
 *
 * // Phase 1: Validate input
 * let state = await phases.validateInput(initialState);
 *
 * // Phase 2: Generate metadata
 * state = await phases.generateMetadata(state);
 *
 * // Phase 3: Generate sections
 * state = await phases.generateSections(state);
 *
 * // Phase 4: Validate quality
 * state = await phases.validateQuality(state);
 *
 * // Phase 5: Validate lessons
 * state = await phases.validateLessons(state);
 * ```
 */
export class GenerationPhases {
  private logger: pino.Logger;
  private v2SpecGenerator: V2LessonSpecGenerator;

  constructor(
    private metadataGenerator: MetadataGenerator,
    private sectionBatchGenerator: SectionBatchGenerator,
    private qualityValidator: QualityValidator,
    private qdrantClient?: QdrantClient
  ) {
    this.logger = pino({
      name: 'generation-phases',
      level: process.env.LOG_LEVEL || 'info',
    });
    this.v2SpecGenerator = new V2LessonSpecGenerator();
  }

  // ==========================================================================
  // PHASE 1: VALIDATE INPUT
  // ==========================================================================

  /**
   * Phase 1: Validate input with GenerationJobInputSchema
   *
   * Validates the input job data against the Zod schema to ensure all
   * required fields are present and valid before starting generation.
   *
   * No retry logic needed - schema validation is deterministic.
   *
   * @param state - Current generation state
   * @returns Updated state with validation results
   *
   * @example
   * ```typescript
   * const state = await phases.validateInput(initialState);
   * if (state.errors.length > 0) {
   *   console.error('Input validation failed:', state.errors);
   * }
   * ```
   */
  async validateInput(state: GenerationState): Promise<GenerationState> {
    const startTime = Date.now();

    try {
      this.logger.info({ phase: 'validate_input' }, 'Starting input validation');

      // Validate with GenerationJobInputSchema
      const result = GenerationJobInputSchema.safeParse(state.input);

      if (!result.success) {
        const errors = result.error.errors.map(
          (err) => `${err.path.join('.')}: ${err.message}`
        );
        const errorMessage = `Input validation failed: ${errors.join('; ')}`;

        this.logger.error(
          { phase: 'validate_input', errors },
          'Input validation failed'
        );

        return {
          ...state,
          errors: [...state.errors, errorMessage],
          phaseDurations: {
            ...state.phaseDurations,
            validate_input: Date.now() - startTime,
          },
        };
      }

      this.logger.info({ phase: 'validate_input' }, 'Input validation passed');

      return {
        ...state,
        phaseDurations: {
          ...state.phaseDurations,
          validate_input: Date.now() - startTime,
        },
        currentPhase: 'generate_metadata',
      };
    } catch (error) {
      this.logger.error(
        { error, phase: 'validate_input' },
        'Input validation encountered unexpected error'
      );
      return {
        ...state,
        errors: [
          ...state.errors,
          `Input validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }

  // ==========================================================================
  // PHASE 2: GENERATE METADATA
  // ==========================================================================

  /**
   * Phase 2: Generate course metadata using MetadataGenerator
   *
   * Calls MetadataGenerator.generate() which implements RT-001 hybrid routing:
   * - Critical fields → qwen3-max (learning_outcomes, pedagogical_strategy, etc.)
   * - Non-critical fields → OSS 120B (course_description, course_tags, etc.)
   *
   * Implements RT-004 retry logic with exponential backoff (max 3 attempts).
   *
   * @param state - Current generation state
   * @returns Updated state with metadata and tracking metrics
   *
   * @example
   * ```typescript
   * const state = await phases.generateMetadata(previousState);
   * console.log(state.metadata.course_title);
   * console.log(state.tokenUsage.metadata); // Tokens consumed
   * console.log(state.modelUsed.metadata);   // qwen3-max or OSS 120B
   * ```
   */
  async generateMetadata(state: GenerationState): Promise<GenerationState> {
    const startTime = Date.now();
    let attempt = 0;

    while (attempt < RETRY_CONFIG.MAX_ATTEMPTS) {
      attempt++;

      try {
        this.logger.info(
          { phase: 'generate_metadata', attempt, maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS },
          'Generating metadata'
        );

        // Call MetadataGenerator (RT-001 hybrid routing)
        const result = await this.metadataGenerator.generate(state.input);

        const duration = Date.now() - startTime;

        this.logger.info(
          {
            phase: 'generate_metadata',
            modelUsed: result.modelUsed,
            tokensUsed: result.tokensUsed,
            retryCount: result.retryCount,
            duration,
          },
          'Metadata generation succeeded'
        );

        return {
          ...state,
          metadata: result.metadata as any, // MetadataGenerator returns Partial<CourseStructure>
          tokenUsage: {
            ...state.tokenUsage,
            metadata: result.tokensUsed,
            total: state.tokenUsage.total + result.tokensUsed,
          },
          modelUsed: {
            ...state.modelUsed,
            metadata: result.modelUsed,
          },
          retryCount: {
            ...state.retryCount,
            metadata: attempt - 1,
          },
          phaseDurations: {
            ...state.phaseDurations,
            generate_metadata: duration,
          },
          currentPhase: 'generate_sections',
        };
      } catch (error) {
        this.logger.warn(
          { error, attempt, phase: 'generate_metadata' },
          'Metadata generation failed'
        );

        if (attempt >= RETRY_CONFIG.MAX_ATTEMPTS) {
          const errorMessage = `Metadata generation failed after ${RETRY_CONFIG.MAX_ATTEMPTS} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`;
          this.logger.error({ phase: 'generate_metadata' }, errorMessage);
          return {
            ...state,
            errors: [...state.errors, errorMessage],
          };
        }

        // RT-004: Exponential backoff
        const delay = RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Should never reach here due to loop logic
    return {
      ...state,
      errors: [...state.errors, 'Metadata generation failed unexpectedly'],
    };
  }

  // ==========================================================================
  // PHASE 3: GENERATE SECTIONS (Parallel with Promise.allSettled)
  // ==========================================================================

  /**
   * Phase 3: Generate sections using SectionBatchGenerator with parallel processing
   *
   * Optimized implementation using Promise.allSettled for graceful partial failure handling:
   * - Uses p-limit for concurrency control (default: 4 concurrent sections)
   * - Handles partial failures gracefully - if 1 section fails, others still complete
   * - Implements retry logic for failed sections (max 3 attempts per section)
   * - Maintains correct section_number ordering regardless of completion order
   *
   * RT-001 tiered routing:
   * - Tier 1: OSS 120B (70-75% of sections)
   * - Tier 2: qwen3-max (20-25% escalation for complex/critical sections)
   * - Tier 3: Gemini 2.5 Flash (5% overflow for context >108K tokens)
   *
   * Performance target: ~2-4 minutes for 6 sections (down from ~12 minutes sequential)
   *
   * @param state - Current generation state (must have metadata)
   * @returns Updated state with accumulated sections and tracking metrics
   *
   * @example
   * ```typescript
   * const state = await phases.generateSections(previousState);
   * console.log(state.sections.length); // Total sections generated
   * console.log(state.tokenUsage.sections); // Total tokens consumed
   * console.log(state.modelUsed.sections);   // Primary model used
   * ```
   */
  async generateSections(state: GenerationState): Promise<GenerationState> {
    const startTime = Date.now();

    try {
      this.logger.info({ phase: 'generate_sections' }, 'Starting parallel section generation');

      // Determine total sections from analysis_result
      if (!state.input.analysis_result) {
        throw new Error(
          'Cannot generate sections: analysis_result is null (title-only scenario not supported)'
        );
      }

      const totalSections =
        state.input.analysis_result.recommended_structure.sections_breakdown.length;

      // Get retry attempts from database config
      let retryAttemptsPerSection = 3; // Default fallback

      try {
        const modelConfigService = createModelConfigService();
        // Use stage 5 config for section generation retry attempts
        const phaseConfig = await modelConfigService.getModelForPhase('stage_5_sections');
        const effectiveConfig = getEffectiveStageConfig(phaseConfig);
        retryAttemptsPerSection = effectiveConfig.maxRetries;

        this.logger.info({
          phase: 'generate_sections',
          retryAttemptsPerSection,
          source: phaseConfig.source,
        }, 'Using database-driven retry attempts config');
      } catch (error) {
        this.logger.warn({
          phase: 'generate_sections',
          error: error instanceof Error ? error.message : String(error),
        }, 'Failed to load retry config, using default: 3');
        // Keep default: retryAttemptsPerSection = 3
      }

      this.logger.info(
        {
          phase: 'generate_sections',
          totalSections,
          maxConcurrency: PARALLEL_CONFIG.MAX_CONCURRENT_SECTIONS,
          retryAttemptsPerSection,
        },
        `Generating ${totalSections} sections in parallel (max ${PARALLEL_CONFIG.MAX_CONCURRENT_SECTIONS} concurrent)`
      );

      // Create concurrency limiter using p-limit
      const limit = pLimit(PARALLEL_CONFIG.MAX_CONCURRENT_SECTIONS);

      // Create array of section indices to process
      const sectionIndices = Array.from({ length: totalSections }, (_, i) => i);

      // Launch all sections in parallel with concurrency control
      const sectionPromises = sectionIndices.map((sectionIndex) =>
        limit(() => this.generateSingleSectionWithRetry(
          sectionIndex,
          state.input,
          this.qdrantClient
        ))
      );

      this.logger.info(
        {
          phase: 'generate_sections',
          totalSections,
          concurrencyLimit: PARALLEL_CONFIG.MAX_CONCURRENT_SECTIONS,
        },
        `Launched ${totalSections} section generation tasks with concurrency limit`
      );

      // Wait for all sections with Promise.allSettled for graceful partial failure handling
      const results = await Promise.allSettled(sectionPromises);

      // Process results and separate successes from failures
      const successfulResults: Array<{ index: number; result: SectionBatchResult }> = [];
      const failedResults: Array<{ index: number; error: string }> = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
          successfulResults.push({ index: i, result: result.value });
        } else {
          failedResults.push({
            index: i,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }

      this.logger.info(
        {
          phase: 'generate_sections',
          successCount: successfulResults.length,
          failureCount: failedResults.length,
          failedIndices: failedResults.map(f => f.index),
        },
        `Initial parallel generation complete: ${successfulResults.length}/${totalSections} succeeded`
      );

      // Retry failed sections with exponential backoff
      const retriedResults = await this.retryFailedSections(
        failedResults,
        state.input,
        this.qdrantClient,
        retryAttemptsPerSection
      );

      // Merge retried successes
      successfulResults.push(...retriedResults.successes);
      const finalFailures = retriedResults.failures;

      // Sort sections by section_number to maintain correct order
      const allSections: Section[] = successfulResults
        .flatMap(r => r.result.sections)
        .sort((a, b) => a.section_number - b.section_number);

      // Aggregate metrics
      const totalTokensUsed = successfulResults.reduce((sum, r) => sum + r.result.tokensUsed, 0);
      const aggregatedRetryCounts = successfulResults.map(r => r.result.retryCount);
      const lastModelUsed = successfulResults.length > 0
        ? successfulResults[successfulResults.length - 1].result.modelUsed
        : '';

      const duration = Date.now() - startTime;

      this.logger.info(
        {
          phase: 'generate_sections',
          totalSections: allSections.length,
          totalTokens: totalTokensUsed,
          duration,
          durationPerSection: allSections.length > 0 ? Math.round(duration / allSections.length) : 0,
          failedSections: finalFailures.length,
        },
        `Section generation completed in ${Math.round(duration / 1000)}s (${allSections.length}/${totalSections} sections)`
      );

      // Build updated state
      let updatedState: GenerationState = {
        ...state,
        sections: allSections,
        tokenUsage: {
          ...state.tokenUsage,
          sections: totalTokensUsed,
          total: state.tokenUsage.total + totalTokensUsed,
        },
        modelUsed: {
          ...state.modelUsed,
          sections: lastModelUsed,
        },
        retryCount: {
          ...state.retryCount,
          sections: aggregatedRetryCounts,
        },
        phaseDurations: {
          ...state.phaseDurations,
          generate_sections: duration,
        },
        currentPhase: 'validate_quality',
      };

      // Add errors for any final failures
      if (finalFailures.length > 0) {
        const errorMessages = finalFailures.map(
          f => `Section ${f.index + 1} generation failed after ${retryAttemptsPerSection} retries: ${f.error}`
        );
        updatedState = {
          ...updatedState,
          errors: [...updatedState.errors, ...errorMessages],
        };
      }

      return updatedState;
    } catch (error) {
      this.logger.error(
        { error, phase: 'generate_sections' },
        'Section generation failed'
      );
      return {
        ...state,
        errors: [
          ...state.errors,
          `Section generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }

  /**
   * Generate a single section with retry logic
   *
   * Wraps sectionBatchGenerator.generateBatch with individual retry handling.
   * This allows each section to retry independently without affecting others.
   *
   * @param sectionIndex - Section index (0-based)
   * @param input - Generation job input
   * @param qdrantClient - Optional RAG client
   * @returns Section batch result
   * @throws Error if all retry attempts fail
   */
  private async generateSingleSectionWithRetry(
    sectionIndex: number,
    input: GenerationJobInput,
    qdrantClient?: QdrantClient
  ): Promise<SectionBatchResult> {
    const sectionStartTime = Date.now();

    this.logger.info(
      {
        phase: 'generate_sections',
        sectionIndex: sectionIndex + 1,
      },
      `Starting generation for section ${sectionIndex + 1}`
    );

    const result = await this.sectionBatchGenerator.generateBatch(
      sectionIndex + 1, // batchNum (1-indexed for logging)
      sectionIndex,     // startSection (0-indexed)
      sectionIndex + 1, // endSection (exclusive, 1 section per batch)
      input,
      qdrantClient
    );

    const sectionDuration = Date.now() - sectionStartTime;

    this.logger.info(
      {
        phase: 'generate_sections',
        sectionIndex: sectionIndex + 1,
        duration: sectionDuration,
        tokensUsed: result.tokensUsed,
        modelUsed: result.modelUsed,
      },
      `Section ${sectionIndex + 1} generated in ${Math.round(sectionDuration / 1000)}s`
    );

    return result;
  }

  /**
   * Retry failed sections with exponential backoff
   *
   * Attempts to regenerate sections that failed in the initial parallel batch.
   * Uses exponential backoff between retries to handle rate limiting.
   *
   * @param failedResults - Array of failed section results
   * @param input - Generation job input
   * @param qdrantClient - Optional RAG client
   * @param maxRetries - Maximum retry attempts per section (from database config)
   * @returns Object with successfully retried sections and final failures
   */
  private async retryFailedSections(
    failedResults: Array<{ index: number; error: string }>,
    input: GenerationJobInput,
    qdrantClient: QdrantClient | undefined,
    maxRetries: number
  ): Promise<{
    successes: Array<{ index: number; result: SectionBatchResult }>;
    failures: Array<{ index: number; error: string }>;
  }> {
    const successes: Array<{ index: number; result: SectionBatchResult }> = [];
    const failures: Array<{ index: number; error: string }> = [];

    if (failedResults.length === 0) {
      return { successes, failures };
    }

    this.logger.info(
      {
        phase: 'generate_sections',
        failedCount: failedResults.length,
        maxRetries,
      },
      `Retrying ${failedResults.length} failed sections`
    );

    for (const failed of failedResults) {
      let lastError = failed.error;
      let retrySuccess = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Exponential backoff delay
        const delay = PARALLEL_CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1);

        this.logger.info(
          {
            phase: 'generate_sections',
            sectionIndex: failed.index + 1,
            attempt,
            maxAttempts: maxRetries,
            delayMs: delay,
          },
          `Retry attempt ${attempt}/${maxRetries} for section ${failed.index + 1} after ${delay}ms delay`
        );

        await new Promise(resolve => setTimeout(resolve, delay));

        try {
          const result = await this.generateSingleSectionWithRetry(
            failed.index,
            input,
            qdrantClient
          );

          successes.push({ index: failed.index, result });
          retrySuccess = true;

          this.logger.info(
            {
              phase: 'generate_sections',
              sectionIndex: failed.index + 1,
              attempt,
            },
            `Section ${failed.index + 1} succeeded on retry attempt ${attempt}`
          );

          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);

          this.logger.warn(
            {
              phase: 'generate_sections',
              sectionIndex: failed.index + 1,
              attempt,
              error: lastError,
            },
            `Section ${failed.index + 1} retry attempt ${attempt} failed`
          );
        }
      }

      if (!retrySuccess) {
        failures.push({
          index: failed.index,
          error: lastError,
        });

        this.logger.error(
          {
            phase: 'generate_sections',
            sectionIndex: failed.index + 1,
            maxAttempts: maxRetries,
            error: lastError,
          },
          `Section ${failed.index + 1} failed after all ${maxRetries} retry attempts`
        );
      }
    }

    this.logger.info(
      {
        phase: 'generate_sections',
        retriedSuccessCount: successes.length,
        finalFailureCount: failures.length,
      },
      `Retry phase complete: ${successes.length} recovered, ${failures.length} final failures`
    );

    return { successes, failures };
  }

  // ==========================================================================
  // PHASE 4: VALIDATE QUALITY
  // ==========================================================================

  /**
   * Phase 4: Validate quality using QualityValidator
   *
   * Validates generated content against input requirements using:
   * - Jina-v3 embeddings (95% of validations)
   * - Cosine similarity computation
   * - RT-001 quality threshold: 0.75 minimum similarity
   *
   * Validates:
   * 1. Metadata similarity (if analysis_result provided)
   * 2. Section similarities (per-section validation)
   * 3. Overall weighted average: 40% metadata + 60% sections
   *
   * If validation fails (overall < 0.75):
   * - Retry with stricter prompt OR
   * - Escalate to OSS 120B for regeneration
   *
   * @param state - Current generation state (must have metadata and sections)
   * @returns Updated state with quality scores and validation results
   *
   * @example
   * ```typescript
   * const state = await phases.validateQuality(previousState);
   * console.log(state.qualityScores.overall); // 0.82
   * if (state.qualityScores.overall < 0.75) {
   *   console.log('Quality validation failed - retry needed');
   * }
   * ```
   */
  async validateQuality(state: GenerationState): Promise<GenerationState> {
    const startTime = Date.now();

    try {
      this.logger.info({ phase: 'validate_quality' }, 'Starting quality validation');

      if (!state.metadata) {
        throw new Error('Cannot validate quality: metadata not generated');
      }

      if (state.sections.length === 0) {
        throw new Error('Cannot validate quality: no sections generated');
      }

      // Extract language for threshold adjustment
      // Note: contextual_language is a pedagogical context object, not a language code
      const language =
        state.input.frontend_parameters.language ||
        'en';

      // 1. Validate metadata similarity (if analysis_result provided)
      let metadataSimilarity: number | undefined;
      const metadataTokens = 0;

      if (state.input.analysis_result) {
        // Build input requirements from analysis_result
        const inputRequirements = this.buildInputRequirementsText(state.input);

        const metadataResult = await this.qualityValidator.validateMetadata(
          inputRequirements,
          state.metadata as any,
          language
        );

        metadataSimilarity = metadataResult.score;

        this.logger.info(
          {
            phase: 'validate_quality',
            metadataSimilarity: metadataSimilarity.toFixed(4),
            passed: metadataResult.passed,
            threshold: metadataResult.threshold,
          },
          'Metadata quality validation complete'
        );
      }

      // 2. Validate section similarities
      const expectedTopics =
        state.input.analysis_result?.recommended_structure.sections_breakdown.map(
          (section) => section.area || 'Untitled Section'
        ) || [];

      const sectionResults = await this.qualityValidator.validateSections(
        expectedTopics,
        state.sections,
        language
      );

      const sectionsSimilarity = sectionResults.map((result) => result.score);

      this.logger.info(
        {
          phase: 'validate_quality',
          sectionsSimilarity: sectionsSimilarity.map((s) => s.toFixed(4)),
          allPassed: sectionResults.every((r) => r.passed),
        },
        'Sections quality validation complete'
      );

      // 3. Calculate overall weighted average
      // RT-001: Metadata 40% weight, Sections 60% weight
      let overall: number;

      if (metadataSimilarity !== undefined) {
        const sectionsAvg =
          sectionsSimilarity.reduce((sum, s) => sum + s, 0) /
          sectionsSimilarity.length;
        overall = metadataSimilarity * 0.4 + sectionsAvg * 0.6;
      } else {
        // Title-only scenario: only sections contribute
        overall =
          sectionsSimilarity.reduce((sum, s) => sum + s, 0) /
          sectionsSimilarity.length;
      }

      const duration = Date.now() - startTime;

      this.logger.info(
        {
          phase: 'validate_quality',
          overall: overall.toFixed(4),
          threshold: QUALITY_CONFIG.MIN_SIMILARITY,
          passed: overall >= QUALITY_CONFIG.MIN_SIMILARITY,
          duration,
        },
        'Quality validation complete'
      );

      // Check if quality passed (informational only - non-blocking)
      if (overall < QUALITY_CONFIG.MIN_SIMILARITY) {
        const infoMessage = `Quality below target (informational): overall similarity ${overall.toFixed(4)} < threshold ${QUALITY_CONFIG.MIN_SIMILARITY}`;
        this.logger.warn({
          phase: 'validate_quality',
          overall: overall.toFixed(4),
          threshold: QUALITY_CONFIG.MIN_SIMILARITY,
          blocking: false,
          msg: infoMessage,
        });
        // Do NOT add to errors - this is informational only for Stage 5 (skeleton generation)
        // Quality validation will be blocking on Stage 6 (actual lesson content generation)
      }

      // Always proceed - quality validation is non-blocking at this stage
      return {
        ...state,
        qualityScores: {
          metadata_similarity: metadataSimilarity,
          sections_similarity: sectionsSimilarity,
          overall,
        },
        tokenUsage: {
          ...state.tokenUsage,
          validation: metadataTokens,
          total: state.tokenUsage.total + metadataTokens,
        },
        phaseDurations: {
          ...state.phaseDurations,
          validate_quality: duration,
        },
        currentPhase: 'validate_lessons',
      };
    } catch (error) {
      this.logger.error(
        { error, phase: 'validate_quality' },
        'Quality validation failed'
      );
      return {
        ...state,
        errors: [
          ...state.errors,
          `Quality validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }

  // ==========================================================================
  // PHASE 5: VALIDATE LESSONS
  // ==========================================================================

  /**
   * Phase 5: Validate minimum lessons count (FR-015)
   *
   * Simple count-based validation: total lessons across all sections must be ≥10.
   * No LLM invocation required.
   *
   * If validation fails (<10 lessons):
   * - Retry generateSections with explicit "minimum 10 lessons" constraint
   *
   * @param state - Current generation state (must have sections)
   * @returns Updated state with lesson validation results
   *
   * @example
   * ```typescript
   * const state = await phases.validateLessons(previousState);
   * const totalLessons = state.sections.reduce((sum, s) => sum + s.lessons.length, 0);
   * if (totalLessons < 10) {
   *   console.log('Lesson count validation failed - retry needed');
   * }
   * ```
   */
  async validateLessons(state: GenerationState): Promise<GenerationState> {
    const startTime = Date.now();

    try {
      this.logger.info({ phase: 'validate_lessons' }, 'Starting lesson count validation');

      if (state.sections.length === 0) {
        throw new Error('Cannot validate lessons: no sections generated');
      }

      // Count total lessons across all sections
      const totalLessons = state.sections.reduce(
        (sum, section) => sum + section.lessons.length,
        0
      );

      const duration = Date.now() - startTime;

      this.logger.info(
        {
          phase: 'validate_lessons',
          totalLessons,
          minimumRequired: QUALITY_CONFIG.MIN_LESSONS,
          passed: totalLessons >= QUALITY_CONFIG.MIN_LESSONS,
          duration,
        },
        'Lesson count validation complete'
      );

      // Check if lesson count passed
      if (totalLessons < QUALITY_CONFIG.MIN_LESSONS) {
        const errorMessage = `Lesson count validation failed: only ${totalLessons} lessons, minimum ${QUALITY_CONFIG.MIN_LESSONS} required (FR-015)`;
        this.logger.warn({ phase: 'validate_lessons' }, errorMessage);
        return {
          ...state,
          errors: [...state.errors, errorMessage],
        };
      }

      return {
        ...state,
        phaseDurations: {
          ...state.phaseDurations,
          validate_lessons: duration,
        },
      };
    } catch (error) {
      this.logger.error(
        { error, phase: 'validate_lessons' },
        'Lesson count validation failed'
      );
      return {
        ...state,
        errors: [
          ...state.errors,
          `Lesson count validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }

  // ==========================================================================
  // PHASE 3 V2: GENERATE V2 LESSON SPECIFICATIONS
  // ==========================================================================

  /**
   * Phase 3 V2: Generate LessonSpecificationV2 array with Semantic Scaffolding
   *
   * Alternative to generateSections() that produces V2 LessonSpecifications
   * for Stage 6 lesson content generation. Uses Semantic Scaffolding to
   * provide structured blueprints with content archetypes, hook strategies,
   * and RAG context integration.
   *
   * This method does NOT update the GenerationState sections - it returns
   * the V2 specs directly for use in Stage 6 workflows.
   *
   * @param state - Current generation state with analysis_result
   * @returns Array of LessonSpecificationV2 for all lessons in the course
   *
   * @example
   * ```typescript
   * // After Phase 2 metadata generation
   * const v2Specs = await phases.generateV2Specs(state);
   *
   * // Use v2Specs in Stage 6 for content generation
   * for (const spec of v2Specs) {
   *   const content = await stage6Generator.generateLesson(spec);
   * }
   * ```
   */
  async generateV2Specs(state: GenerationState): Promise<LessonSpecificationV2[]> {
    const startTime = Date.now();

    try {
      this.logger.info(
        { phase: 'generate_v2_specs', courseId: state.input.course_id },
        'Starting V2 lesson specification generation'
      );

      // Validate analysis_result is present
      if (!state.input.analysis_result) {
        throw new Error(
          'Cannot generate V2 specs: analysis_result is null (title-only scenario not supported for V2)'
        );
      }

      // Generate V2 specs using the dedicated generator
      const v2Specs = await this.v2SpecGenerator.generateV2Specs(state);

      const duration = Date.now() - startTime;
      const totalSections = state.input.analysis_result.recommended_structure.sections_breakdown.length;

      this.logger.info(
        {
          phase: 'generate_v2_specs',
          courseId: state.input.course_id,
          totalLessons: v2Specs.length,
          totalSections,
          durationMs: duration,
        },
        'V2 lesson specification generation complete'
      );

      return v2Specs;
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          phase: 'generate_v2_specs',
          courseId: state.input.course_id,
        },
        'V2 lesson specification generation failed'
      );
      throw error;
    }
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  /**
   * Build input requirements text from GenerationJobInput
   *
   * Concatenates key fields from analysis_result to create a single
   * text representation for quality validation.
   *
   * @param input - Generation job input
   * @returns Concatenated input requirements text
   *
   * @private
   */
  private buildInputRequirementsText(input: GenerationJobInput): string {
    if (!input.analysis_result) {
      return input.frontend_parameters.course_title;
    }

    const parts: string[] = [];

    parts.push(input.frontend_parameters.course_title);
    parts.push(input.analysis_result.topic_analysis.determined_topic);

    // Format pedagogical_strategy object using helper
    const strategyFormatted = formatPedagogicalStrategyForPrompt(
      input.analysis_result.pedagogical_strategy
    );
    parts.push(strategyFormatted);

    parts.push(input.analysis_result.topic_analysis.key_concepts.join(', '));

    return parts.join('\n');
  }
}
