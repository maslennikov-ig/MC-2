/**
 * Section Regeneration Service - Incremental Section Regeneration
 *
 * Implements FR-026: Regenerate individual sections within an already-generated
 * course structure without regenerating the entire course.
 *
 * Key features:
 * - Atomic JSONB update (replace single section in courses.course_structure)
 * - Recalculate global lesson_number across all sections
 * - Track regeneration history in generation_metadata
 * - Maintain lesson numbering consistency
 *
 * @module services/stage5/section-regeneration-service
 * @see specs/008-generation-generation-json/spec.md (FR-026)
 * @see specs/008-generation-generation-json/tasks.md (T039-A)
 */

import type {
  CourseStructure,
  GenerationMetadata,
  GenerationJobInput,
  AnalysisResult,
} from '@megacampus/shared-types';
import { SectionBatchGenerator } from './section-batch-generator';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import type { QdrantClient } from '@qdrant/js-client-rest';
import logger from '@/shared/logger';

// ============================================================================
// TYPES
// ============================================================================

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/**
 * Regeneration history entry structure
 *
 * Tracks each section regeneration operation for audit trail and cost tracking.
 * This will be added to GenerationMetadata.regeneration_history array.
 */
export interface RegenerationHistoryEntry {
  /** Section number that was regenerated (1-indexed) */
  section_number: number;
  /** ISO 8601 timestamp of regeneration */
  timestamp: string;
  /** Model used for regeneration */
  model_used: string;
  /** Model tier used (tier1_oss120b | tier2_qwen3Max | tier3_gemini) */
  tier: string;
  /** Tokens consumed during regeneration */
  tokens_used: number;
  /** Cost in USD (calculated from tokens + model pricing) */
  cost_usd: number;
}

interface ExtendedGenerationMetadata extends GenerationMetadata {
  regeneration_history?: RegenerationHistoryEntry[];
}

interface CourseData {
  course_structure: CourseStructure | null;
  analysis_result: AnalysisResult | null;
  generation_metadata: GenerationMetadata | null;
  title: string;
  language: string | null;
  style: string | null;
}

// ============================================================================
// SECTION REGENERATION SERVICE CLASS
// ============================================================================

/**
 * SectionRegenerationService - Regenerate individual sections
 *
 * Provides atomic section replacement with proper lesson numbering recalculation
 * and regeneration history tracking.
 *
 * @example
 * ```typescript
 * const service = new SectionRegenerationService(
 *   sectionBatchGenerator,
 *   qualityValidator,
 *   qdrantClient
 * );
 *
 * const updatedStructure = await service.regenerateSection(
 *   'course-uuid',
 *   2, // section number
 *   'user-uuid',
 *   'org-uuid'
 * );
 * ```
 */
export class SectionRegenerationService {
  constructor(
    private sectionBatchGenerator: SectionBatchGenerator,
    private qdrantClient?: QdrantClient
  ) {}

  /**
   * Regenerate a single section within an existing course structure
   *
   * Implements 9-step workflow:
   * 1. Fetch current course structure
   * 2. Validate section number
   * 3. Validate analysis_result exists
   * 4. Extract section context from analysis_result
   * 5. Build GenerationJobInput for single section
   * 6. Call SectionBatchGenerator
   * 7. Replace section and recalculate lesson numbers
   * 8. Atomic JSONB update
   * 9. Update regeneration_history
   *
   * @param courseId - Course UUID
   * @param sectionNumber - Section to regenerate (1-indexed)
   * @param userId - User UUID (for audit trail)
   * @param organizationId - Organization UUID (for RLS)
   * @returns Updated course structure
   *
   * @throws Error if course not found, section number invalid, analysis_result missing, or generation fails
   */
  async regenerateSection(
    courseId: string,
    sectionNumber: number,
    userId: string,
    organizationId: string
  ): Promise<CourseStructure> {
    logger.info(
      {
        courseId,
        sectionNumber,
        userId,
        organizationId,
      },
      'Starting section regeneration'
    );

    // ========================================================================
    // STEP 1: Fetch Current Course Structure
    // ========================================================================

    const supabase = getSupabaseAdmin();

    // Note: analysis_result and generation_metadata fields added in migrations
    // but database types not regenerated yet. Using type assertion.
    // See: packages/course-gen-platform/src/server/routers/analysis.ts:546-547
    const { data, error } = await supabase
      .from('courses')
      .select('course_structure, analysis_result, generation_metadata, title, language, style')
      .eq('id', courseId)
      .eq('organization_id', organizationId) // RLS check
      .single();

    const course = data as unknown as CourseData | null;

    if (error || !course) {
      const errorMessage = `Course not found: ${courseId}`;
      logger.error({ courseId, organizationId, error }, errorMessage);
      throw new Error(errorMessage);
    }

    if (!course.course_structure) {
      const errorMessage = `Course structure not found for course: ${courseId}`;
      logger.error({ courseId }, errorMessage);
      throw new Error(errorMessage);
    }

    const structure = course.course_structure;
    const analysisResult = course.analysis_result;
    const existingMetadata = course.generation_metadata;

    // ========================================================================
    // STEP 2: Validate Section Number
    // ========================================================================

    const totalSections = structure.sections.length;
    if (sectionNumber < 1 || sectionNumber > totalSections) {
      const errorMessage = `Invalid section number: ${sectionNumber}. Must be between 1 and ${totalSections}`;
      logger.error(
        {
          courseId,
          sectionNumber,
          totalSections,
        },
        errorMessage
      );
      throw new Error(errorMessage);
    }

    const sectionIndex = sectionNumber - 1;
    const oldSection = structure.sections[sectionIndex];

    logger.info(
      {
        courseId,
        sectionNumber,
        oldSectionTitle: oldSection.section_title,
        oldLessonsCount: oldSection.lessons.length,
      },
      'Found section to regenerate'
    );

    // ========================================================================
    // STEP 3: Validate analysis_result exists
    // ========================================================================

    if (!analysisResult) {
      const errorMessage = `Cannot regenerate section: analysis_result is required for section generation`;
      logger.error(
        {
          courseId,
          sectionNumber,
        },
        errorMessage
      );
      throw new Error(errorMessage);
    }

    // ========================================================================
    // STEP 4: Extract Section Context from analysis_result
    // ========================================================================

    let sectionContext = null;
    if (analysisResult?.recommended_structure?.sections_breakdown) {
      const breakdown = analysisResult.recommended_structure.sections_breakdown;
      if (breakdown[sectionIndex]) {
        sectionContext = {
          area: breakdown[sectionIndex].area,
          estimated_lessons: breakdown[sectionIndex].estimated_lessons,
        };

        logger.info(
          {
            courseId,
            sectionNumber,
            sectionContext,
          },
          'Extracted section context from analysis_result'
        );
      }
    }

    // ========================================================================
    // STEP 5: Build GenerationJobInput for Single Section
    // ========================================================================

    const jobInput: GenerationJobInput = {
      course_id: courseId,
      organization_id: organizationId,
      user_id: userId,
      analysis_result: analysisResult,
      frontend_parameters: {
        course_title: course.title,
        language: course.language || undefined,
        style: (course.style || undefined) as GenerationJobInput['frontend_parameters']['style'],
      },
      vectorized_documents: false, // Not needed for regeneration
      document_summaries: [],
    };

    logger.info(
      {
        courseId,
        sectionNumber,
        jobInput: {
          course_title: jobInput.frontend_parameters.course_title,
          language: jobInput.frontend_parameters.language,
          style: jobInput.frontend_parameters.style,
        },
      },
      'Built generation job input for section'
    );

    // ========================================================================
    // STEP 6: Call SectionBatchGenerator for Single Section
    // ========================================================================

    logger.info(
      {
        courseId,
        sectionNumber,
        batchNum: sectionNumber,
        startSection: sectionIndex,
        endSection: sectionIndex + 1,
      },
      'Calling SectionBatchGenerator for section regeneration'
    );

    const result = await this.sectionBatchGenerator.generateBatch(
      sectionNumber,      // batchNum
      sectionIndex,       // startSection
      sectionIndex + 1,   // endSection (exclusive)
      jobInput,
      this.qdrantClient
    );

    if (result.sections.length !== 1) {
      const errorMessage = `Expected exactly 1 section from generator, got ${result.sections.length}`;
      logger.error(
        {
          courseId,
          sectionNumber,
          sectionsCount: result.sections.length,
        },
        errorMessage
      );
      throw new Error(errorMessage);
    }

    const newSection = result.sections[0];

    logger.info(
      {
        courseId,
        sectionNumber,
        newSectionTitle: newSection.section_title,
        newLessonsCount: newSection.lessons.length,
        modelUsed: result.modelUsed,
        tier: result.tier,
        tokensUsed: result.tokensUsed,
      },
      'Section generated successfully'
    );

    // ========================================================================
    // STEP 7: Replace Section and Recalculate Lesson Numbers
    // ========================================================================

    // Replace old section with new one
    const updatedSections = [...structure.sections];
    updatedSections[sectionIndex] = newSection;

    // CRITICAL: Recalculate global lesson_number across ALL sections
    let globalLessonNumber = 1;
    updatedSections.forEach(section => {
      section.lessons.forEach(lesson => {
        lesson.lesson_number = globalLessonNumber++;
      });
    });

    // Update section_number on all sections (should already be correct, but verify)
    updatedSections.forEach((section, idx) => {
      section.section_number = idx + 1;
    });

    // Build updated structure
    const updatedStructure: CourseStructure = {
      ...structure,
      sections: updatedSections,
    };

    logger.info(
      {
        courseId,
        sectionNumber,
        totalLessons: globalLessonNumber - 1,
        totalSections: updatedSections.length,
      },
      'Recalculated lesson numbers across all sections'
    );

    // ========================================================================
    // STEP 8: Atomic JSONB Update
    // ========================================================================

    const { error: updateError } = await supabase
      .from('courses')
      .update({
        course_structure: updatedStructure as unknown as Json, // Type assertion for JSONB
        updated_at: new Date().toISOString(),
      })
      .eq('id', courseId)
      .eq('organization_id', organizationId); // Double-check RLS

    if (updateError) {
      const errorMessage = `Failed to update course structure: ${updateError.message}`;
      logger.error(
        {
          courseId,
          sectionNumber,
          error: updateError,
        },
        errorMessage
      );
      throw new Error(errorMessage);
    }

    logger.info(
      {
        courseId,
        sectionNumber,
      },
      'Course structure updated atomically'
    );

    // ========================================================================
    // STEP 9: Update regeneration_history in generation_metadata
    // ========================================================================

    // Use the metadata we already fetched in Step 1
    const metadata = (existingMetadata || {}) as ExtendedGenerationMetadata;

    // Initialize regeneration_history if not exists
    // Note: regeneration_history is not yet in GenerationMetadata schema,
    // so we handle it as an optional field
    if (!metadata.regeneration_history) {
      metadata.regeneration_history = [];
    }

    // Calculate cost (TODO: implement proper cost calculation from tokens + model pricing)
    // For now, use a placeholder value
    const costUsd = 0;

    // Add regeneration entry
    const regenerationEntry: RegenerationHistoryEntry = {
      section_number: sectionNumber,
      timestamp: new Date().toISOString(),
      model_used: result.modelUsed,
      tier: result.tier,
      tokens_used: result.tokensUsed,
      cost_usd: costUsd,
    };

    metadata.regeneration_history.push(regenerationEntry);

    // Update generation_metadata (using type assertion as field not in generated types yet)
    const { error: metadataUpdateError } = await supabase
      .from('courses')
      .update({
        generation_metadata: metadata as unknown as Json,
      })
      .eq('id', courseId);

    if (metadataUpdateError) {
      logger.error(
        {
          courseId,
          sectionNumber,
          error: metadataUpdateError,
        },
        'Failed to update regeneration history (non-critical)'
      );
      // Non-critical error: log but don't throw
    } else {
      logger.info(
        {
          courseId,
          sectionNumber,
          regenerationEntry,
        },
        'Regeneration history updated'
      );
    }

    logger.info(
      {
        courseId,
        sectionNumber,
        newLessonsCount: newSection.lessons.length,
        modelUsed: result.modelUsed,
        tier: result.tier,
        tokensUsed: result.tokensUsed,
      },
      'Section regeneration completed successfully'
    );

    return updatedStructure;
  }
}
