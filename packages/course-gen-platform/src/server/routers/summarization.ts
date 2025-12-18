/**
 * Summarization Router
 * @module server/routers/summarization
 *
 * Provides API endpoints for Stage 3 document summarization monitoring,
 * cost analytics, and summary retrieval. All endpoints are read-only
 * as the summarization workflow is orchestrated by BullMQ workers.
 *
 * Endpoints:
 * - getCostAnalytics: Cost aggregation by model/strategy (authenticated users)
 * - getSummarizationStatus: Course-level summarization progress (authenticated users)
 * - getDocumentSummary: Individual document summary retrieval (authenticated users)
 *
 * Access Control:
 * - All endpoints enforce organization-level RLS via ctx.user.organizationId
 * - SuperAdmin users can query any organization (future enhancement)
 * - Regular users can only access their own organization's data
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc';
import { protectedProcedure } from '../middleware/auth';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import type { SummaryMetadata } from '@megacampus/shared-types';

/**
 * Input schema for getCostAnalytics endpoint
 *
 * Allows filtering by date range with defaults to last 30 days.
 * SuperAdmin users can optionally filter by organization_id.
 */
const getCostAnalyticsInput = z.object({
  /** Optional organization ID (SuperAdmin only, future enhancement) */
  organization_id: z.string().uuid().optional(),

  /** Start date in ISO 8601 format (default: 30 days ago) */
  start_date: z.string().datetime().optional(),

  /** End date in ISO 8601 format (default: now) */
  end_date: z.string().datetime().optional(),
});

/**
 * Input schema for getSummarizationStatus endpoint
 */
const getSummarizationStatusInput = z.object({
  /** Course ID to get summarization status for */
  course_id: z.string().uuid(),
});

/**
 * Input schema for getDocumentSummary endpoint
 */
const getDocumentSummaryInput = z.object({
  /** File ID to retrieve summary for */
  file_id: z.string().uuid(),
});

/**
 * Helper function to group files by model for cost analytics
 *
 * @param files - Array of file_catalog records with summary_metadata
 * @returns Array of cost breakdown by model
 */
function groupByModel(
  files: Array<{
    summary_metadata: SummaryMetadata | null;
    processing_method: string | null;
  }>
): Array<{
  model: string;
  documents: number;
  total_cost_usd: number;
  avg_quality_score: number;
}> {
  const modelMap = new Map<
    string,
    { count: number; cost: number; qualitySum: number }
  >();

  for (const file of files) {
    if (!file.summary_metadata) continue;

    const model = file.summary_metadata.model_used || 'unknown';
    const existing = modelMap.get(model) || { count: 0, cost: 0, qualitySum: 0 };

    modelMap.set(model, {
      count: existing.count + 1,
      cost: existing.cost + (file.summary_metadata.estimated_cost_usd || 0),
      qualitySum:
        existing.qualitySum + (file.summary_metadata.quality_score || 0),
    });
  }

  return Array.from(modelMap.entries()).map(([model, data]) => ({
    model,
    documents: data.count,
    total_cost_usd: data.cost,
    avg_quality_score: data.count > 0 ? data.qualitySum / data.count : 0,
  }));
}

/**
 * Helper function to group files by processing strategy for cost analytics
 *
 * @param files - Array of file_catalog records with summary_metadata
 * @returns Array of cost breakdown by strategy
 */
function groupByStrategy(
  files: Array<{
    summary_metadata: SummaryMetadata | null;
    processing_method: string | null;
  }>
): Array<{
  strategy: string;
  documents: number;
  total_cost_usd: number;
  avg_quality_score: number;
}> {
  const strategyMap = new Map<
    string,
    { count: number; cost: number; qualitySum: number }
  >();

  for (const file of files) {
    if (!file.processing_method) continue;

    const strategy = file.processing_method;
    const existing = strategyMap.get(strategy) || {
      count: 0,
      cost: 0,
      qualitySum: 0,
    };

    strategyMap.set(strategy, {
      count: existing.count + 1,
      cost:
        existing.cost +
        (file.summary_metadata?.estimated_cost_usd || 0),
      qualitySum:
        existing.qualitySum +
        (file.summary_metadata?.quality_score || 0),
    });
  }

  return Array.from(strategyMap.entries()).map(([strategy, data]) => ({
    strategy,
    documents: data.count,
    total_cost_usd: data.cost,
    avg_quality_score: data.count > 0 ? data.qualitySum / data.count : 0,
  }));
}

/**
 * Summarization router
 *
 * Provides read-only endpoints for monitoring Stage 3 document summarization.
 * All mutation operations are handled internally by BullMQ workers.
 */
export const summarizationRouter = router({
  /**
   * Get cost analytics for document summarization
   *
   * Returns aggregated cost data grouped by model and strategy.
   * Useful for billing dashboards and cost tracking.
   *
   * Access Control:
   * - Regular users: Can only query their own organization
   * - SuperAdmin: Can query any organization (future enhancement)
   *
   * @param input.organization_id - Optional org ID (SuperAdmin only)
   * @param input.start_date - Start of date range (default: 30 days ago)
   * @param input.end_date - End of date range (default: now)
   * @returns Cost analytics with breakdowns by model and strategy
   */
  getCostAnalytics: protectedProcedure
    .input(getCostAnalyticsInput)
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      // Default date range: last 30 days
      const endDate = input.end_date || new Date().toISOString();
      const startDate =
        input.start_date ||
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Use organization_id from input (SuperAdmin) or ctx.user (regular user)
      // For now, ignore input.organization_id and always use ctx.user.organizationId
      // TODO: Add SuperAdmin role check for cross-org analytics
      const orgId = ctx.user.organizationId;

      // Query file_catalog for files with summary_metadata in date range
      const { data: files, error } = await supabase
        .from('file_catalog')
        .select('summary_metadata, processing_method, organization_id')
        .eq('organization_id', orgId)
        .not('summary_metadata', 'is', null)
        .gte(
          'summary_metadata->>processing_timestamp',
          startDate
        )
        .lte(
          'summary_metadata->>processing_timestamp',
          endDate
        );

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch cost analytics: ${error.message}`,
        });
      }

      // Parse summary_metadata from JSONB
      const typedFiles = (files || []).map((f) => ({
        ...f,
        summary_metadata: f.summary_metadata as SummaryMetadata | null,
      }));

      // Aggregate cost data
      const totalCost = typedFiles.reduce(
        (sum, f) => sum + (f.summary_metadata?.estimated_cost_usd || 0),
        0
      );

      const totalInputTokens = typedFiles.reduce(
        (sum, f) => sum + (f.summary_metadata?.input_tokens || 0),
        0
      );

      const totalOutputTokens = typedFiles.reduce(
        (sum, f) => sum + (f.summary_metadata?.output_tokens || 0),
        0
      );

      // Group by model and strategy
      const costByModel = groupByModel(typedFiles);
      const costByStrategy = groupByStrategy(typedFiles);

      return {
        organization_id: orgId,
        period_start: startDate,
        period_end: endDate,
        total_cost_usd: totalCost,
        documents_summarized: typedFiles.length,
        avg_cost_per_document:
          typedFiles.length > 0 ? totalCost / typedFiles.length : 0,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        total_tokens: totalInputTokens + totalOutputTokens,
        cost_by_model: costByModel,
        cost_by_strategy: costByStrategy,
      };
    }),

  /**
   * Get summarization status for a course
   *
   * Returns progress metrics and file-level details for course summarization.
   * Used by admin panels and debugging tools to monitor progress.
   *
   * Access Control:
   * - User must belong to same organization as course
   * - RLS policies enforce organization isolation
   *
   * @param input.course_id - Course ID to get status for
   * @returns Summarization status with file details
   */
  getSummarizationStatus: protectedProcedure
    .input(getSummarizationStatusInput)
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      // First, verify the course belongs to the user's organization
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('id, organization_id, generation_status')
        .eq('id', input.course_id)
        .eq('organization_id', ctx.user.organizationId)
        .single();

      if (courseError || !course) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Course not found or access denied',
        });
      }

      // Query file_catalog for all files in this course
      const { data: files, error, count } = await supabase
        .from('file_catalog')
        .select('*', { count: 'exact' })
        .eq('course_id', input.course_id)
        .eq('organization_id', ctx.user.organizationId);

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch summarization status: ${error.message}`,
        });
      }

      // Parse summary_metadata from JSONB
      const typedFiles = (files || []).map((f) => ({
        ...f,
        summary_metadata: f.summary_metadata as SummaryMetadata | null,
      }));

      // Count documents by status
      const completedCount = typedFiles.filter(
        (f) =>
          f.processed_content !== null &&
          f.summary_metadata?.quality_check_passed === true
      ).length;

      const failedCount = typedFiles.filter(
        (f) => f.error_message !== null
      ).length;

      const bypassedCount = typedFiles.filter(
        (f) => f.processing_method === 'full_text'
      ).length;

      const inProgressCount =
        (count || 0) - completedCount - failedCount - bypassedCount;

      // Calculate progress percentage
      const progressPercentage =
        count && count > 0 ? (completedCount / count) * 100 : 0;

      return {
        course_id: input.course_id,
        organization_id: ctx.user.organizationId,
        total_documents: count || 0,
        completed_count: completedCount,
        failed_count: failedCount,
        in_progress_count: Math.max(0, inProgressCount),
        bypassed_count: bypassedCount,
        progress_percentage: progressPercentage,
        current_status: course.generation_status || 'UNKNOWN',
        files: typedFiles.map((f) => ({
          file_id: f.id,
          original_filename: f.filename,
          processing_method: f.processing_method,
          quality_score: f.summary_metadata?.quality_score || null,
          quality_check_passed: f.summary_metadata?.quality_check_passed || null,
          estimated_cost_usd: f.summary_metadata?.estimated_cost_usd || null,
          processing_timestamp: f.summary_metadata?.processing_timestamp || null,
          error_message: f.error_message,
        })),
      };
    }),

  /**
   * Get document summary for a specific file
   *
   * Returns the processed summary and metadata for a single document.
   * Used for preview and debugging purposes.
   *
   * Access Control:
   * - User must belong to same organization as file
   * - RLS policies enforce organization isolation
   *
   * @param input.file_id - File ID to retrieve summary for
   * @returns Document summary with metadata
   */
  getDocumentSummary: protectedProcedure
    .input(getDocumentSummaryInput)
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      // Query file_catalog with organization check
      const { data: file, error } = await supabase
        .from('file_catalog')
        .select('*')
        .eq('id', input.file_id)
        .eq('organization_id', ctx.user.organizationId)
        .single();

      if (error || !file) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File not found or access denied',
        });
      }

      // Parse summary_metadata from JSONB
      const summary_metadata = file.summary_metadata as SummaryMetadata | null;

      // Create preview from processed_content (first 500 chars)
      const preview = file.processed_content
        ? file.processed_content.slice(0, 500) +
          (file.processed_content.length > 500 ? '...' : '')
        : null;

      return {
        file_id: file.id,
        original_filename: file.filename,
        processed_content: file.processed_content,
        processing_method: file.processing_method,
        summary_metadata,
        extracted_text_preview: preview,
      };
    }),
});
