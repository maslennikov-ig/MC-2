/**
 * Stage 3 Classification Job Handler
 *
 * Handles document classification jobs for the course generation pipeline.
 * This stage runs after Stage 2 (document processing) and before Stage 4 (analysis).
 *
 * Classification assigns priority levels to documents:
 * - CORE: The single most important document (exactly 1)
 * - IMPORTANT: Key supporting documents (up to 30%)
 * - SUPPLEMENTARY: Additional materials (remaining)
 *
 * These priorities are used by Stage 4 for token budget allocation.
 *
 * @module stages/stage3-classification/handler
 */

import { Job } from 'bullmq';
import { Stage3ClassificationOrchestrator } from './orchestrator';
import type { Stage3Input } from './types';
import { BaseJobHandler, JobResult } from '../../orchestrator/handlers/base-handler';
import { DocumentClassificationJobData, JobType } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../../shared/supabase/admin';

/**
 * Stage 3 Classification Job Handler
 *
 * Thin wrapper around Stage3ClassificationOrchestrator
 */
export class Stage3ClassificationHandler extends BaseJobHandler<DocumentClassificationJobData> {
  private orchestrator: Stage3ClassificationOrchestrator;

  constructor() {
    super(JobType.DOCUMENT_CLASSIFICATION);
    this.orchestrator = new Stage3ClassificationOrchestrator();
  }

  /**
   * Execute Stage 3 classification
   *
   * @param jobData - Classification job data
   * @param job - BullMQ job instance
   * @returns Job result with classification summary
   */
  async execute(
    jobData: DocumentClassificationJobData,
    job: Job<DocumentClassificationJobData>
  ): Promise<JobResult> {
    const { courseId, organizationId } = jobData;

    this.log(job, 'info', 'Starting Stage 3 classification', { courseId, organizationId });

    try {
      // Build orchestrator input
      const input: Stage3Input = {
        courseId,
        organizationId,
        onProgress: (progress: number, message: string) => {
          void job.updateProgress(progress);
          this.log(job, 'debug', 'Classification progress', { courseId, progress, message });
        },
      };

      // Execute classification
      const output = await this.orchestrator.execute(input);

      if (!output.success) {
        this.log(job, 'warn', 'Classification completed with no documents', { courseId });

        return {
          success: false,
          message: 'No documents found for classification',
          data: {
            courseId,
            totalDocuments: 0,
          },
        };
      }

      this.log(job, 'info', 'Stage 3 classification complete', {
        courseId,
        totalDocuments: output.totalDocuments,
        coreCount: output.coreCount,
        importantCount: output.importantCount,
        supplementaryCount: output.supplementaryCount,
        processingTimeMs: output.processingTimeMs,
      });

      // Update course status to stage_3_awaiting_approval
      const supabase = getSupabaseAdmin();
      const { error: updateError } = await supabase
        .from('courses')
        .update({ generation_status: 'stage_3_awaiting_approval' as any })
        .eq('id', courseId);

      if (updateError) {
        this.log(job, 'error', 'Failed to update course status to stage_3_awaiting_approval', {
          courseId,
          error: updateError.message,
        });
        // Don't fail the job, classification was successful
      } else {
        this.log(job, 'info', 'Course status updated to stage_3_awaiting_approval', { courseId });
      }

      return {
        success: true,
        message: 'Classification completed successfully',
        data: {
          courseId,
          totalDocuments: output.totalDocuments,
          coreCount: output.coreCount,
          importantCount: output.importantCount,
          supplementaryCount: output.supplementaryCount,
          processingTimeMs: output.processingTimeMs,
        },
      };
    } catch (error) {
      this.log(job, 'error', 'Stage 3 classification failed', {
        courseId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Update course status with failure details (failed_at_stage)
      const supabase = getSupabaseAdmin();
      try {
        const { error: statusUpdateError } = await supabase
          .from('courses')
          .update({
            generation_status: 'failed',
            failed_at_stage: 3,
            error_code: 'classification_error' as any,
            updated_at: new Date().toISOString(),
          })
          .eq('id', courseId);

        if (statusUpdateError) {
          this.log(job, 'error', 'Failed to update course status with failure details', {
            courseId,
            error: statusUpdateError.message,
          });
        }
      } catch (statusError) {
        this.log(job, 'error', 'Exception updating course failure status', {
          courseId,
          error: statusError instanceof Error ? statusError.message : String(statusError),
        });
      }

      return {
        success: false,
        message: 'Classification failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Singleton instance of the Stage 3 classification handler
 */
export const stage3ClassificationHandler = new Stage3ClassificationHandler();
