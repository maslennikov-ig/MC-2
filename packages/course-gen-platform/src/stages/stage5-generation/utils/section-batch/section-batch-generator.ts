import type { QdrantClient } from '@qdrant/js-client-rest';
import type { GenerationJobInput } from '@megacampus/shared-types';
import logger from '@/shared/logger';
import { SectionBatchResult, SectionBatchResultV2 } from './types';
import { SECTIONS_PER_BATCH } from './constants';
import { extractSection } from './utils';
import { calculateComplexityScore, assessCriticality, selectModelTier } from './model-selector';
import { generateWithRetry } from './generator-core';
import { convertSectionToV2Specs } from './v2-converter';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

/**
 * SectionBatchGenerator - Generate lessons from section-level structure
 */
export class SectionBatchGenerator {
  /**
   * Generate batch of sections with tiered model routing
   */
  async generateBatch(
    batchNum: number,
    startSection: number,
    endSection: number,
    input: GenerationJobInput,
    qdrantClient?: QdrantClient
  ): Promise<SectionBatchResult> {
    if (endSection - startSection !== SECTIONS_PER_BATCH) {
      throw new Error(
        `Invalid batch size: expected ${SECTIONS_PER_BATCH} section(s), got ${endSection - startSection}`
      );
    }

    const sectionIndex = startSection;
    const section = extractSection(input, sectionIndex);
    const complexityScore = calculateComplexityScore(section);
    const criticalityScore = assessCriticality(section);
    const language = input.frontend_parameters.language || 'en';

    logger.info({
      msg: 'Section batch generation: language detected',
      language,
      batchNum,
      courseId: input.course_id,
    });

    const modelTier = await selectModelTier(
      complexityScore,
      criticalityScore,
      input,
      qdrantClient,
      language
    );

    logger.info({
      msg: 'Model tier selected for section batch',
      batchNum,
      sectionIndex,
      tier: modelTier.tier,
      model: modelTier.model,
      reason: modelTier.reason,
      complexityScore: complexityScore.toFixed(2),
      criticalityScore: criticalityScore.toFixed(2),
    });

    return await generateWithRetry(
      batchNum,
      sectionIndex,
      input,
      modelTier,
      qdrantClient,
      complexityScore,
      criticalityScore,
      language
    );
  }

  /**
   * Generate batch of lessons as V2 LessonSpecifications
   */
  async generateBatchV2(
    batchNum: number,
    startSection: number,
    endSection: number,
    input: GenerationJobInput,
    qdrantClient?: QdrantClient
  ): Promise<SectionBatchResultV2> {
    logger.info({
      msg: 'Starting V2 batch generation',
      batchNum,
      startSection,
      endSection,
      courseId: input.course_id,
    });

    const sectionResult = await this.generateBatch(
      batchNum,
      startSection,
      endSection,
      input,
      qdrantClient
    );

    const lessonSpecs: LessonSpecificationV2[] = [];

    // NOTE: allSections should ideally contain ALL sections from the entire course
    // for proper inter-lesson context. Currently we only have access to the current
    // batch's sections. In the future, this should be called after all batches are
    // generated and sections are collected (similar to generation-phases.ts line 550).
    // For now, we pass undefined to maintain backward compatibility.
    const allSections = undefined; // TODO: Pass all course sections when available

    for (let i = 0; i < sectionResult.sections.length; i++) {
      const section = sectionResult.sections[i];
      const sectionIndex = startSection + i;

      const specs = convertSectionToV2Specs(
        section,
        sectionIndex,
        input,
        allSections
      );

      lessonSpecs.push(...specs);
    }

    logger.info({
      msg: 'V2 batch generation complete',
      batchNum,
      sectionsProcessed: sectionResult.sections.length,
      lessonSpecsGenerated: lessonSpecs.length,
      modelUsed: sectionResult.modelUsed,
    });

    return {
      lessonSpecs,
      modelUsed: sectionResult.modelUsed,
      tier: sectionResult.tier,
      tokensUsed: sectionResult.tokensUsed,
      retryCount: sectionResult.retryCount,
      complexityScore: sectionResult.complexityScore,
      criticalityScore: sectionResult.criticalityScore,
      regenerationMetrics: sectionResult.regenerationMetrics,
    };
  }
}
