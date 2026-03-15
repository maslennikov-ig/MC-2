/**
 * Generation Phases - 5-Phase LangGraph Workflow Orchestration
 *
 * @module services/stage5/generation-phases
 *
 * Implements RT-002 5-Phase Generation Architecture for LangGraph workflow
 */

import type { GenerationState } from '../utils/generation-state.js';
import { MetadataGenerator } from '../utils/metadata-generator.js';
import { SectionBatchGenerator } from '../utils/section-batch-generator.js';
import { QualityValidator } from '../../../shared/validation/quality-validator.js';
import type { QdrantClient } from '@qdrant/js-client-rest';
import pino from 'pino';
import type { GenerationJobInput, Section } from '@megacampus/shared-types';
import { V2LessonSpecGenerator } from './phase3-v2-spec-generator.js';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

import { validateInputPhase } from './generation-phases/validate-input.js';
import { generateMetadataPhase } from './generation-phases/generate-metadata.js';
import { generateSectionsPhase } from './generation-phases/generate-sections.js';
import { validateQualityPhase } from './generation-phases/validate-quality.js';

export {
  exponentialBackoff,
  buildSectionDigest,
  sanitizeDigest,
  RETRY_CONFIG,
  SECTION_RETRY_CONFIG,
  QUALITY_CONFIG,
} from './generation-phases/utils.js';

/**
 * GenerationPhases - Orchestrates 5-phase LangGraph workflow
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

  async validateInput(state: GenerationState): Promise<GenerationState> {
    return validateInputPhase(state);
  }

  async generateMetadata(state: GenerationState): Promise<GenerationState> {
    return generateMetadataPhase(state, this.metadataGenerator);
  }

  async generateSections(state: GenerationState): Promise<GenerationState> {
    return generateSectionsPhase(state, this.sectionBatchGenerator, this.qdrantClient);
  }

  async validateQuality(state: GenerationState): Promise<GenerationState> {
    return validateQualityPhase(state, this.qualityValidator);
  }

  generateV2Specs(state: GenerationState): LessonSpecificationV2[] {
    const startTime = Date.now();

    try {
      this.logger.info(
        { phase: 'generate_v2_specs', courseId: state.input.course_id },
        'Starting V2 lesson specification generation'
      );

      if (!state.input.analysis_result) {
        throw new Error(
          'Cannot generate V2 specs: analysis_result is null (title-only scenario not supported for V2)'
        );
      }

      const v2Specs = this.v2SpecGenerator.generateV2Specs(state);

      const duration = Date.now() - startTime;
      const totalSections =
        state.input.analysis_result.recommended_structure.sections_breakdown.length;

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

  async regenerateSingleSection(
    sectionIndex: number,
    input: GenerationJobInput,
    overlapFeedback: string
  ): Promise<Section[]> {
    this.logger.info(
      {
        phase: 'overlap_retry',
        sectionIndex: sectionIndex + 1,
        courseId: input.course_id,
      },
      `Regenerating section ${sectionIndex + 1} due to overlap detection`
    );

    const result = await this.sectionBatchGenerator.generateBatch(
      sectionIndex + 1, // batchNum (1-indexed)
      sectionIndex, // startSection (0-indexed)
      sectionIndex + 1, // endSection (exclusive)
      input,
      this.qdrantClient,
      overlapFeedback
    );

    this.logger.info(
      {
        phase: 'overlap_retry',
        sectionIndex: sectionIndex + 1,
        lessonsGenerated: result.sections[0]?.lessons?.length || 0,
        modelUsed: result.modelUsed,
        courseId: input.course_id,
      },
      `Section ${sectionIndex + 1} regenerated successfully`
    );

    return result.sections;
  }
}
