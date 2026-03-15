import type { GenerationState } from '../../utils/generation-state.js';
import type { QualityValidator } from '../../../../shared/validation/quality-validator.js';
import type { GenerationJobInput } from '@megacampus/shared-types';
import pino from 'pino';
import { logTrace } from '../../../../shared/trace-logger.js';
import { QUALITY_CONFIG } from './utils.js';
import { formatPedagogicalStrategyForPrompt } from '../../utils/analysis-formatters.js';

const logger = pino({
  name: 'generation-phases:validate-quality',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Build input requirements text from GenerationJobInput
 *
 * Concatenates key fields from analysis_result to create a single
 * text representation for quality validation.
 *
 * @param input - Generation job input
 * @returns Concatenated input requirements text
 */
export function buildInputRequirementsText(input: GenerationJobInput): string {
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

/**
 * Phase 4: Validate quality using QualityValidator
 *
 * Validates generated content against input requirements using:
 * - Jina-v3 embeddings (95% of validations)
 * - Cosine similarity computation
 * - RT-001 quality threshold: 0.75 minimum similarity
 *
 * @param state - Current generation state (must have metadata and sections)
 * @param qualityValidator - Quality validator instance
 * @returns Updated state with quality scores and validation results
 */
export async function validateQualityPhase(
  state: GenerationState,
  qualityValidator: QualityValidator
): Promise<GenerationState> {
  const startTime = Date.now();
  const courseId = state.input.course_id;

  await logTrace({
    courseId,
    stage: 'stage_5',
    phase: 'validate_quality',
    stepName: 'phase_start',
    inputData: { sectionsCount: state.sections.length },
    durationMs: 0,
  });

  try {
    logger.info({ phase: 'validate_quality' }, 'Starting quality validation');

    if (!state.metadata) {
      throw new Error('Cannot validate quality: metadata not generated');
    }

    if (state.sections.length === 0) {
      throw new Error('Cannot validate quality: no sections generated');
    }

    // Extract language for threshold adjustment
    // Note: contextual_language is a pedagogical context object, not a language code
    const language = state.input.frontend_parameters.language || 'en';

    // 1. Validate metadata similarity (if analysis_result provided)
    let metadataSimilarity: number | undefined;
    const metadataTokens = 0;

    if (state.input.analysis_result) {
      // Build input requirements from analysis_result
      const inputRequirements = buildInputRequirementsText(state.input);

      const metadataResult = await qualityValidator.validateMetadata(
        inputRequirements,
        state.metadata,
        language
      );

      metadataSimilarity = metadataResult.score;

      logger.info(
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
    const allTopics =
      state.input.analysis_result?.recommended_structure.sections_breakdown.map(
        section => section.area || 'Untitled Section'
      ) || [];

    // Align with generation logic (lines 479-495): respect total_sections cap
    const recStruct = state.input.analysis_result?.recommended_structure;
    const cappedCount = Math.min(recStruct?.total_sections ?? allTopics.length, allTopics.length);
    const expectedTopics = allTopics.slice(0, cappedCount);

    const sectionResults = await qualityValidator.validateSections(
      expectedTopics,
      state.sections,
      language
    );

    const sectionsSimilarity = sectionResults.map(result => result.score);

    logger.info(
      {
        phase: 'validate_quality',
        sectionsSimilarity: sectionsSimilarity.map(s => s.toFixed(4)),
        allPassed: sectionResults.every(r => r.passed),
      },
      'Sections quality validation complete'
    );

    // 3. Calculate overall weighted average
    // RT-001: Metadata 40% weight, Sections 60% weight
    let overall: number;

    if (metadataSimilarity !== undefined) {
      const sectionsAvg =
        sectionsSimilarity.reduce((sum, s) => sum + s, 0) / sectionsSimilarity.length;
      overall = metadataSimilarity * 0.4 + sectionsAvg * 0.6;
    } else {
      // Title-only scenario: only sections contribute
      overall = sectionsSimilarity.reduce((sum, s) => sum + s, 0) / sectionsSimilarity.length;
    }

    const duration = Date.now() - startTime;

    logger.info(
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
      logger.warn({
        phase: 'validate_quality',
        overall: overall.toFixed(4),
        threshold: QUALITY_CONFIG.MIN_SIMILARITY,
        blocking: false,
        msg: infoMessage,
      });
      // Do NOT add to errors - this is informational only for Stage 5 (skeleton generation)
      // Quality validation will be blocking on Stage 6 (actual lesson content generation)
    }

    await logTrace({
      courseId,
      stage: 'stage_5',
      phase: 'validate_quality',
      stepName: 'phase_complete',
      outputData: { overallScore: overall, passed: overall >= QUALITY_CONFIG.MIN_SIMILARITY },
      qualityScore: overall,
      durationMs: duration,
    });

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
      // Phase 5 removed - quality validation is now the final phase
    };
  } catch (error) {
    logger.error({ error, phase: 'validate_quality' }, 'Quality validation failed');
    return {
      ...state,
      errors: [
        ...state.errors,
        `Quality validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
    };
  }
}
