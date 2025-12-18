/**
 * Status Router
 * @module server/routers/generation/status
 *
 * Handles course generation status operations:
 * - getStatus: Poll generation progress and phase
 * - approveStage: Approve stage and continue to next
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { instructorProcedure } from '../../procedures';
import { protectedProcedure } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { addJob } from '../../../orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import type { Database, GenerationMetadata, JobData } from '@megacampus/shared-types';
import type { CourseSettings } from './_shared/types';

// Type aliases for Database tables
type Course = Database['public']['Tables']['courses']['Row'];
type Organization = Database['public']['Tables']['organizations']['Row'];

export const statusRouter = router({
  /**
   * Get current generation status and progress
   * Returns detailed progress information including:
   * - Current phase (validate_input, generate_metadata, etc.)
   * - Progress percentage
   * - Estimated time remaining
   * - Error information if failed
   */
  getStatus: protectedProcedure
    .use(createRateLimiter({ requests: 30, window: 60 })) // 30 status checks per minute
    .input(z.object({ courseId: z.string().uuid('Invalid course ID') }))
    .query(async ({ ctx, input }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();

      // Defensive check
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const currentUser = ctx.user;
      const organizationId = currentUser.organizationId;

      try {
        // Step 1: Fetch course with generation metadata
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, organization_id, generation_status, generation_metadata, created_at, updated_at')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found',
          });
        }

        // Step 2: Verify organization access
        if (course.organization_id !== organizationId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        // Step 3: Determine current phase and progress
        const generationStatus = (course.generation_status as string) || 'idle';
        // Extended type for error states which may have additional fields
        type GenerationMetadataWithError = GenerationMetadata & {
          last_progress?: number;
          last_phase?: string;
          error_message?: string;
        };
        const generationMetadata = course.generation_metadata as unknown as GenerationMetadataWithError | null;

        // Phase weights for progress calculation
        const phaseWeights = {
          validate_input: 5,      // 0-5%
          generate_metadata: 20,  // 5-25%
          generate_sections: 60,  // 25-85%
          validate_quality: 10,   // 85-95%
          validate_lessons: 5,    // 95-100%
        };

        let progress = 0;
        let currentPhase: string | null = null;
        let estimatedTimeRemaining: number | null = null;
        let error: string | undefined = undefined;

        // Determine progress based on status
        if (generationStatus === 'queued') {
          progress = 0;
          currentPhase = 'validate_input';
          estimatedTimeRemaining = 150000; // 150 seconds
        } else if (generationStatus === 'generating') {
          // Calculate progress from generation_metadata
          if (generationMetadata?.duration_ms) {
            const { duration_ms } = generationMetadata;

            if (duration_ms.validation > 0) {
              currentPhase = 'validate_lessons';
              progress = 95 + (phaseWeights.validate_lessons * 0.5);
            } else if (duration_ms.sections > 0) {
              currentPhase = 'generate_sections';
              const batchProgress = (generationMetadata.batch_count || 0) / 8; // 8 batches assumed
              progress = 25 + (phaseWeights.generate_sections * batchProgress);
            } else if (duration_ms.metadata > 0) {
              currentPhase = 'generate_metadata';
              progress = 5 + (phaseWeights.generate_metadata * 0.5);
            } else {
              currentPhase = 'validate_input';
              progress = 2.5;
            }

            // Estimate remaining time
            const totalEstimated = 150000; // 150 seconds
            const elapsed = duration_ms.total || 0;
            estimatedTimeRemaining = Math.max(0, totalEstimated - elapsed);
          } else {
            currentPhase = 'validate_input';
            progress = 5;
            estimatedTimeRemaining = 145000;
          }
        } else if (generationStatus === 'completed') {
          progress = 100;
          currentPhase = 'validate_lessons';
          estimatedTimeRemaining = null;
        } else if (generationStatus === 'failed') {
          progress = generationMetadata?.last_progress || 0;
          currentPhase = generationMetadata?.last_phase || null;
          estimatedTimeRemaining = null;
          error = generationMetadata?.error_message || 'Generation failed';
        }

        // Step 4: Build response
        return {
          courseId: course.id,
          status: generationStatus,
          progress: Math.round(progress),
          currentPhase,
          estimatedTimeRemaining,
          generationMetadata: generationStatus === 'completed' ? generationMetadata : undefined,
          error,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error({
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Unexpected error in generation.getStatus');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),

  /**
   * Approve stage and continue to next
   * Handles stage transitions:
   * - Stage 2 -> Stage 3 (Classification)
   * - Stage 3 -> Stage 4 (Structure Analysis)
   * - Stage 4 -> Stage 5 (Structure Generation)
   * - Stage 5 -> Stage 5 Complete (Ready for Manual Stage 6)
   */
  approveStage: instructorProcedure
    .input(z.object({
      courseId: z.string().uuid(),
      currentStage: z.number().int().min(2).max(5),
    }))
    .mutation(async ({ ctx, input }) => {
      const { courseId, currentStage } = input;
      const supabase = getSupabaseAdmin();
      const userId = ctx.user!.id;

      // Verify ownership
      const { data: course, error } = await supabase
        .from('courses')
        .select('*, organization:organizations(tier)')
        .eq('id', courseId)
        .single();

      if (error || !course) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
      }
      if (course.user_id !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const currentStatus = course.generation_status as string;
      const expectedStatus = `stage_${currentStage}_awaiting_approval`;

      if (currentStatus !== expectedStatus && currentStatus !== 'failed' && currentStatus !== 'cancelled') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid status for approval. Expected ${expectedStatus}, got ${currentStatus}`,
        });
      }

      const courseWithOrg = course as unknown as Course & { organization: Organization | null };
      const tier = (courseWithOrg.organization?.tier || 'free');
      const priority = tier === 'premium' ? 10 : (tier === 'standard' ? 5 : 1);

      // Transition Logic
      if (currentStage === 2) {
        // Stage 2 -> Stage 3 (Classification)
        // Note: Summarization is now part of Stage 2, so we go directly to Classification
        await supabase.from('courses').update({ generation_status: 'stage_3_init' as unknown as Database['public']['Enums']['generation_status'] }).eq('id', courseId);

        // Queue a single DOCUMENT_CLASSIFICATION job for the course
        // The classification orchestrator will load all documents and classify them
        const classificationJobData = {
          jobType: JobType.DOCUMENT_CLASSIFICATION,
          organizationId: course.organization_id,
          courseId,
          userId,
          createdAt: new Date().toISOString(),
        };

        await addJob(JobType.DOCUMENT_CLASSIFICATION, classificationJobData as unknown as JobData, { priority });
        logger.info({ courseId, userId }, 'Stage 2 approved, queued DOCUMENT_CLASSIFICATION job for Stage 3');

        return { success: true, nextStage: 3 };
      }

      if (currentStage === 3) {
        await supabase.from('courses').update({ generation_status: 'stage_4_init' as unknown as Database['public']['Enums']['generation_status'] }).eq('id', courseId);

        const { data: documents } = await supabase
          .from('file_catalog')
          .select('id, filename, processed_content, processing_method, summary_metadata')
          .eq('course_id', courseId)
          .not('processed_content', 'is', null);

        const document_summaries = (documents || []).map(doc => ({
          document_id: doc.id,
          file_name: doc.filename,
          processed_content: doc.processed_content,
          processing_method: doc.processing_method,
          summary_metadata: doc.summary_metadata,
        }));

        const settings = (course.settings as unknown as CourseSettings) || {};
        const jobData = {
          jobType: JobType.STRUCTURE_ANALYSIS,
          organizationId: course.organization_id,
          courseId,
          userId,
          createdAt: new Date().toISOString(),
          course_id: courseId,
          organization_id: course.organization_id,
          user_id: userId,
          input: {
            topic: settings.topic || course.title || '',
            language: course.language || 'en',
            style: course.style || 'formal',
            answers: settings.answers || null,
            target_audience: course.target_audience || '',
            difficulty: course.difficulty || 'intermediate',
            lesson_duration_minutes: settings.lesson_duration_minutes || 30,
            document_summaries,
          },
          priority,
          attempt_count: 0,
          created_at: new Date().toISOString(),
        };

        await addJob(JobType.STRUCTURE_ANALYSIS, jobData as unknown as JobData, { priority });
        return { success: true, nextStage: 4 };
      }

      if (currentStage === 4) {
        await supabase.from('courses').update({ generation_status: 'stage_5_init' as unknown as Database['public']['Enums']['generation_status'] }).eq('id', courseId);

        const analysisResult = course.analysis_result;
        const { data: vectorizedFiles } = await supabase
          .from('file_catalog')
          .select('id, filename, processed_content')
          .eq('course_id', courseId)
          .eq('vector_status', 'indexed' as unknown as Database['public']['Enums']['vector_status']);

        const hasVectorizedDocs = vectorizedFiles && vectorizedFiles.length > 0;
        const documentSummaries = hasVectorizedDocs
          ? (vectorizedFiles as Array<{
              id: string;
              filename: string;
              processed_content: string | null;
            }>).map((file) => ({
              file_id: file.id,
              file_name: file.filename,
              summary: file.processed_content || '',
              key_topics: [],
            }))
          : [];

        const jobInput = {
          course_id: courseId,
          organization_id: course.organization_id,
          user_id: userId,
          analysis_result: analysisResult,
          frontend_parameters: {
            course_title: course.title,
            language: course.language,
            style: course.style,
            target_audience: (course.settings as unknown as CourseSettings)?.target_audience,
            desired_lessons_count: (course.settings as unknown as CourseSettings)?.desired_lessons_count,
            desired_modules_count: (course.settings as unknown as CourseSettings)?.desired_modules_count,
            lesson_duration_minutes: (course.settings as unknown as CourseSettings)?.lesson_duration_minutes,
            learning_outcomes: (course.settings as unknown as CourseSettings)?.learning_outcomes,
          },
          vectorized_documents: hasVectorizedDocs,
          document_summaries: documentSummaries,
        };

        await addJob(JobType.STRUCTURE_GENERATION, jobInput as unknown as JobData, { priority });
        return { success: true, nextStage: 5 };
      }

      if (currentStage === 5) {
        // Stage 5 -> Stage 5 Complete (Ready for Manual Stage 6)
        // Note: We transition to stage_5_complete to trigger the ManualStage6Panel in the UI
        await supabase.from('courses').update({ generation_status: 'stage_5_complete' as unknown as Database['public']['Enums']['generation_status'] }).eq('id', courseId);
        return { success: true, nextStage: 6 };
      }

      return { success: false, nextStage: currentStage };
    }),
});
