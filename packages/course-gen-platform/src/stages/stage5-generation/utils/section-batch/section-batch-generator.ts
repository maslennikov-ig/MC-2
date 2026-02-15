import type { QdrantClient } from '@qdrant/js-client-rest';
import type { GenerationJobInput } from '@megacampus/shared-types';
import logger from '@/shared/logger';
import { SectionBatchResult, SectionBatchResultV2 } from './types';
import { SECTIONS_PER_BATCH } from './constants';
import { extractSection } from './utils';
import { selectModelTier } from './model-selector';
import { generateWithRetry } from './generator-core';
import { convertSectionToV2Specs } from './v2-converter';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { CourseConstraints } from './prompt-builder';

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
    qdrantClient?: QdrantClient,
    overlapFeedback?: string
  ): Promise<SectionBatchResult> {
    if (endSection - startSection !== SECTIONS_PER_BATCH) {
      throw new Error(
        `Invalid batch size: expected ${SECTIONS_PER_BATCH} section(s), got ${endSection - startSection}`
      );
    }

    const sectionIndex = startSection;
    const section = extractSection(input, sectionIndex);
    const language = input.frontend_parameters.language || 'en';

    logger.info({
      msg: 'Section batch generation: language detected',
      language,
      batchNum,
      courseId: input.course_id,
    });

    // Calculate constraints from Stage 4 user-edited values in analysis_result
    const recommendedStructure = input.analysis_result?.recommended_structure;
    let constraints: CourseConstraints | undefined;

    if (
      recommendedStructure?.total_sections &&
      recommendedStructure?.total_lessons &&
      recommendedStructure.total_sections > 0 // Explicit positive check for defense-in-depth
    ) {
      const lessonsPerSectionBudget = Math.round(
        recommendedStructure.total_lessons / recommendedStructure.total_sections
      );

      // Validate calculated budget is sensible
      if (lessonsPerSectionBudget < 1) {
        logger.warn({
          msg: 'Calculated lessons budget is less than 1 - falling back to estimatedLessons',
          totalLessons: recommendedStructure.total_lessons,
          totalSections: recommendedStructure.total_sections,
          calculatedBudget: lessonsPerSectionBudget,
          batchNum,
          courseId: input.course_id,
        });
        // constraints remains undefined, will use fallback estimatedLessons
      } else {
        constraints = {
          totalSections: recommendedStructure.total_sections,
          totalLessons: recommendedStructure.total_lessons,
          currentSectionIndex: sectionIndex,
          lessonsPerSectionBudget,
        };

        logger.info({
          msg: 'Course constraints calculated from Stage 4 user edits',
          batchNum,
          sectionIndex,
          totalSections: constraints.totalSections,
          totalLessons: constraints.totalLessons,
          lessonsPerSectionBudget: constraints.lessonsPerSectionBudget,
          courseId: input.course_id,
        });
      }
    }

    const modelTier = await selectModelTier(input, qdrantClient, language, sectionIndex, section);

    logger.info({
      msg: 'Model tier selected for section batch',
      batchNum,
      sectionIndex,
      tier: modelTier.tier,
      model: modelTier.model,
      reason: modelTier.reason,
    });

    return await generateWithRetry(
      batchNum,
      sectionIndex,
      input,
      modelTier,
      qdrantClient,
      language,
      constraints,
      overlapFeedback
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

    // Pass generated sections from this batch for inter-lesson context.
    // This provides intra-section lesson context (previous/next lessons).
    // For full cross-section context, the caller in generation-phases.ts
    // collects all sections after all batches complete (line ~559).
    const allSections = sectionResult.sections;

    for (let i = 0; i < sectionResult.sections.length; i++) {
      const section = sectionResult.sections[i];
      const sectionIndex = startSection + i;

      const specs = convertSectionToV2Specs(section, sectionIndex, input, allSections);

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
      regenerationMetrics: sectionResult.regenerationMetrics,
    };
  }
}
