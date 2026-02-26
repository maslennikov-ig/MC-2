/**
 * Stage 7 Database Service
 * @module stages/stage7-enrichments/services/database-service
 *
 * Database operations for enrichment generation and status management.
 * Uses Supabase admin client for direct database access.
 */

import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logger } from '@/shared/logger';
import { randomUUID } from 'crypto';
import { getCachedLessonMarkdown } from '../../../shared/cache/file-content-cache';
import type {
  EnrichmentType,
  EnrichmentStatus,
  EnrichmentContent,
  EnrichmentMetadata,
  Json,
} from '@megacampus/shared-types';
import type { EnrichmentWithContext } from '../types';

/**
 * Fetch enrichment with lesson and course context
 *
 * @param enrichmentId - Enrichment UUID
 * @returns Enrichment with context or null if not found
 */
export async function getEnrichment(enrichmentId: string): Promise<EnrichmentWithContext | null> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    // First get the enrichment
    const { data: enrichment, error: enrichmentError } = await supabaseAdmin
      .from('lesson_enrichments')
      .select('*')
      .eq('id', enrichmentId)
      .single();

    if (enrichmentError || !enrichment) {
      logger.warn({ enrichmentId, error: enrichmentError?.message }, 'Enrichment not found');
      return null;
    }

    // Get the lesson (lessons don't have course_id, so we get it from enrichment)
    // Include objectives for keyword extraction in cover generation
    const { data: lesson, error: lessonError } = await supabaseAdmin
      .from('lessons')
      .select('id, title, objectives, duration_minutes')
      .eq('id', enrichment.lesson_id)
      .single();

    if (lessonError || !lesson) {
      logger.warn(
        { enrichmentId, lessonId: enrichment.lesson_id, error: lessonError?.message },
        'Lesson not found for enrichment'
      );
      return null;
    }

    // Get the lesson content from lesson_contents table (content is stored separately)
    const { data: lessonContentData } = await supabaseAdmin
      .from('lesson_contents')
      .select('content')
      .eq('lesson_id', enrichment.lesson_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get the course (using course_id from enrichment, which is denormalized)
    // Include visual_style for card/cover image generation, course_description for context, style for tone
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .select('id, title, language, course_description, visual_style, settings, style')
      .eq('id', enrichment.course_id)
      .single();

    if (courseError || !course) {
      logger.warn(
        { enrichmentId, courseId: enrichment.course_id, error: courseError?.message },
        'Course not found for enrichment'
      );
      return null;
    }

    // Handle nullable content from lesson_contents - can be Json type
    const lessonContent = lessonContentData?.content
      ? typeof lessonContentData.content === 'string'
        ? lessonContentData.content
        : JSON.stringify(lessonContentData.content)
      : null;

    return {
      enrichment: {
        id: enrichment.id,
        lesson_id: enrichment.lesson_id,
        course_id: enrichment.course_id,
        enrichment_type: enrichment.enrichment_type,
        status: enrichment.status,
        order_index: enrichment.order_index,
        title: enrichment.title,
        content: enrichment.content as EnrichmentContent | null,
        metadata: enrichment.metadata as EnrichmentMetadata | null,
        settings: null, // Settings will be passed via job input, not stored in DB
        generation_attempt: enrichment.generation_attempt ?? 0,
        error_message: enrichment.error_message,
        error_details: enrichment.error_details as Record<string, unknown> | null,
        created_at: enrichment.created_at ?? new Date().toISOString(),
        updated_at: enrichment.updated_at ?? new Date().toISOString(),
      },
      lesson: {
        id: lesson.id,
        title: lesson.title,
        content: lessonContent,
        course_id: enrichment.course_id, // Use from enrichment (denormalized)
        duration_minutes:
          typeof lesson.duration_minutes === 'number' ? lesson.duration_minutes : null,
        objectives: lesson.objectives ?? null,
      },
      course: {
        id: course.id,
        title: course.title,
        language: course.language ?? 'en',
        course_description: course.course_description ?? null,
        visual_style: course.visual_style as Record<string, unknown> | null,
        settings: course.settings as Record<string, unknown> | null,
        style: course.style ?? null,
      },
    };
  } catch (error) {
    logger.error(
      {
        enrichmentId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error fetching enrichment with context'
    );
    return null;
  }
}

export interface NotebookLMAsyncMetadataState {
  taskId: string;
  mediaType: 'audio' | 'video';
  status: string;
  pollAttempt: number;
  startedAt: string;
  lastPolledAt: string;
  responseMetadata?: Record<string, unknown>;
}

function createMinimalEnrichmentMetadata(): EnrichmentMetadata {
  return {
    generated_at: new Date().toISOString(),
    generation_duration_ms: 0,
    estimated_cost_usd: 0,
    retry_attempts: 0,
  };
}

/**
 * Persist NotebookLM async bridge state in enrichment metadata.additional_info.
 *
 * This keeps detached polling state durable across worker restarts.
 */
export async function saveNotebookLMAsyncMetadataState(
  enrichmentId: string,
  existingMetadata: EnrichmentMetadata | null,
  state: NotebookLMAsyncMetadataState
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  const baseMetadata: EnrichmentMetadata = existingMetadata
    ? {
        ...existingMetadata,
        generated_at: existingMetadata.generated_at ?? new Date().toISOString(),
        generation_duration_ms: existingMetadata.generation_duration_ms ?? 0,
        estimated_cost_usd: existingMetadata.estimated_cost_usd ?? 0,
        retry_attempts: existingMetadata.retry_attempts ?? 0,
      }
    : createMinimalEnrichmentMetadata();

  const additionalInfo = {
    ...(baseMetadata.additional_info ?? {}),
    notebooklm_async_state: {
      task_id: state.taskId,
      media_type: state.mediaType,
      status: state.status,
      poll_attempt: state.pollAttempt,
      started_at: state.startedAt,
      last_polled_at: state.lastPolledAt,
      response_metadata: state.responseMetadata,
    },
  };

  const nextMetadata: EnrichmentMetadata = {
    ...baseMetadata,
    additional_info: additionalInfo,
  };

  const { error } = await supabaseAdmin
    .from('lesson_enrichments')
    .update({
      metadata: JSON.parse(JSON.stringify(nextMetadata)) as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrichmentId);

  if (error) {
    logger.error(
      { enrichmentId, error: error.message, taskId: state.taskId, mediaType: state.mediaType },
      'Failed to persist NotebookLM async metadata state'
    );
    throw error;
  }
}

/**
 * Update enrichment status
 *
 * @param enrichmentId - Enrichment UUID
 * @param status - New status
 * @param errorMessage - Optional error message (for failed status)
 * @param errorDetails - Optional error details object
 */
export async function updateEnrichmentStatus(
  enrichmentId: string,
  status: EnrichmentStatus,
  errorMessage?: string,
  errorDetails?: Record<string, unknown>
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (errorMessage !== undefined) {
      updateData.error_message = errorMessage;
    }

    if (errorDetails !== undefined) {
      updateData.error_details = errorDetails;
    }

    // Set generated_at when completing
    if (status === 'completed') {
      updateData.generated_at = new Date().toISOString();
    }

    // Clear error fields when not in failed state
    if (status !== 'failed') {
      updateData.error_message = null;
      updateData.error_details = null;
    }

    const { error } = await supabaseAdmin
      .from('lesson_enrichments')
      .update(updateData)
      .eq('id', enrichmentId);

    if (error) {
      logger.error(
        { enrichmentId, status, error: error.message },
        'Failed to update enrichment status'
      );
      throw error;
    }

    logger.debug({ enrichmentId, status }, 'Enrichment status updated');
  } catch (error) {
    logger.error(
      {
        enrichmentId,
        status,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error updating enrichment status'
    );
    throw error;
  }
}

/**
 * Save generated enrichment content
 *
 * @param enrichmentId - Enrichment UUID
 * @param content - Generated content
 * @param metadata - Generation metadata
 */
export async function saveEnrichmentContent(
  enrichmentId: string,
  content: EnrichmentContent,
  metadata: EnrichmentMetadata
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { error } = await supabaseAdmin
      .from('lesson_enrichments')
      .update({
        content: JSON.parse(JSON.stringify(content)) as Json,
        metadata: JSON.parse(JSON.stringify(metadata)) as Json,
        status: 'completed',
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrichmentId);

    if (error) {
      logger.error({ enrichmentId, error: error.message }, 'Failed to save enrichment content');
      throw error;
    }

    logger.info(
      {
        enrichmentId,
        contentType: content.type,
        tokensUsed: metadata.total_tokens,
        costUsd: metadata.estimated_cost_usd,
      },
      'Enrichment content saved successfully'
    );
  } catch (error) {
    logger.error(
      {
        enrichmentId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error saving enrichment content'
    );
    throw error;
  }
}

/**
 * Link storage asset to enrichment (for audio/video)
 *
 * @param enrichmentId - Enrichment UUID
 * @param assetId - Supabase Storage asset UUID
 */
export async function linkEnrichmentAsset(enrichmentId: string, assetId: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { error } = await supabaseAdmin
      .from('lesson_enrichments')
      .update({
        asset_id: assetId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrichmentId);

    if (error) {
      logger.error(
        { enrichmentId, assetId, error: error.message },
        'Failed to link enrichment asset'
      );
      throw error;
    }

    logger.debug({ enrichmentId, assetId }, 'Enrichment asset linked');
  } catch (error) {
    logger.error(
      {
        enrichmentId,
        assetId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error linking enrichment asset'
    );
    throw error;
  }
}

export interface UpsertAssetAndLinkInput {
  enrichmentId: string;
  courseId: string;
  lessonId: string;
  enrichmentType: EnrichmentType;
  storagePath: string;
  mimeType: string;
  extension: string;
  fileSizeBytes: number;
  publicUrl?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Upsert media asset row and link lesson enrichment to assets.id UUID.
 *
 * This ensures lesson_enrichments.asset_id always stores a UUID FK, never a storage path.
 *
 * @param input - Asset + enrichment linkage payload
 * @returns Asset UUID linked to lesson_enrichments.asset_id
 */
export async function upsertAssetAndLinkEnrichment(
  input: UpsertAssetAndLinkInput
): Promise<string> {
  const supabaseAdmin = getSupabaseAdmin();
  const {
    enrichmentId,
    courseId,
    lessonId,
    enrichmentType,
    storagePath,
    mimeType,
    extension,
    fileSizeBytes,
    publicUrl = null,
    metadata,
  } = input;

  try {
    const { data: enrichment, error: enrichmentError } = await supabaseAdmin
      .from('lesson_enrichments')
      .select('asset_id')
      .eq('id', enrichmentId)
      .single();

    if (enrichmentError || !enrichment) {
      logger.error(
        { enrichmentId, error: enrichmentError?.message },
        'Failed to fetch enrichment before asset upsert'
      );
      throw new Error(`Failed to fetch enrichment: ${enrichmentError?.message ?? 'not found'}`);
    }

    const assetId = enrichment.asset_id ?? randomUUID();
    const now = new Date().toISOString();
    const normalizedExtension = extension.toLowerCase().replace(/^\./, '');
    const filename = storagePath.split('/').pop() ?? `${enrichmentId}.${normalizedExtension}`;
    const mergedMetadata = {
      extension: normalizedExtension,
      storage_path: storagePath,
      ...metadata,
    };

    const { error: upsertError } = await supabaseAdmin.from('assets').upsert(
      {
        id: assetId,
        course_id: courseId,
        lesson_id: lessonId,
        asset_type: enrichmentType,
        file_path: storagePath,
        filename,
        mime_type: mimeType,
        size_bytes: fileSizeBytes,
        file_size_bytes: fileSizeBytes,
        url: publicUrl,
        metadata: JSON.parse(JSON.stringify(mergedMetadata)) as Json,
        updated_at: now,
      },
      { onConflict: 'id' }
    );

    if (upsertError) {
      logger.error(
        {
          enrichmentId,
          assetId,
          storagePath,
          error: upsertError.message,
        },
        'Failed to upsert asset row'
      );
      throw upsertError;
    }

    await linkEnrichmentAsset(enrichmentId, assetId);

    logger.info(
      {
        enrichmentId,
        assetId,
        storagePath,
        mimeType,
        fileSizeBytes,
      },
      'Asset upserted and enrichment linked'
    );

    return assetId;
  } catch (error) {
    logger.error(
      {
        enrichmentId,
        storagePath,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error upserting asset and linking enrichment'
    );
    throw error;
  }
}

/**
 * Increment generation attempt counter
 *
 * @param enrichmentId - Enrichment UUID
 * @returns New attempt count
 */
export async function incrementGenerationAttempt(enrichmentId: string): Promise<number> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    // First get current attempt count
    const { data: current, error: fetchError } = await supabaseAdmin
      .from('lesson_enrichments')
      .select('generation_attempt')
      .eq('id', enrichmentId)
      .single();

    if (fetchError || !current) {
      logger.error(
        { enrichmentId, error: fetchError?.message },
        'Failed to fetch current generation attempt'
      );
      throw new Error(`Failed to fetch enrichment: ${fetchError?.message}`);
    }

    const newAttempt = (current.generation_attempt || 0) + 1;

    // Update with incremented value
    const { error: updateError } = await supabaseAdmin
      .from('lesson_enrichments')
      .update({
        generation_attempt: newAttempt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrichmentId);

    if (updateError) {
      logger.error(
        { enrichmentId, error: updateError.message },
        'Failed to increment generation attempt'
      );
      throw updateError;
    }

    logger.debug({ enrichmentId, attempt: newAttempt }, 'Generation attempt incremented');

    return newAttempt;
  } catch (error) {
    logger.error(
      {
        enrichmentId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error incrementing generation attempt'
    );
    throw error;
  }
}

/**
 * Save draft content for two-stage enrichments
 *
 * @param enrichmentId - Enrichment UUID
 * @param draftContent - Draft content (e.g., outline, script)
 * @param metadata - Draft generation metadata
 */
export async function saveDraftContent(
  enrichmentId: string,
  draftContent: unknown,
  metadata: Partial<EnrichmentMetadata>
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { error } = await supabaseAdmin
      .from('lesson_enrichments')
      .update({
        content: JSON.parse(JSON.stringify(draftContent)) as Json,
        metadata: JSON.parse(JSON.stringify(metadata)) as Json,
        status: 'draft_ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrichmentId);

    if (error) {
      logger.error({ enrichmentId, error: error.message }, 'Failed to save draft content');
      throw error;
    }

    logger.debug({ enrichmentId }, 'Draft content saved');
  } catch (error) {
    logger.error(
      {
        enrichmentId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error saving draft content'
    );
    throw error;
  }
}

/**
 * Get lesson content for enrichment generation
 *
 * @param lessonId - Lesson UUID
 * @returns Lesson content string or null
 */
export async function getLessonContent(lessonId: string, courseId: string): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin();

  // Try Redis cache first (populated by Stage 6)
  const cached = await getCachedLessonMarkdown(courseId, lessonId);
  if (cached) {
    logger.debug({ lessonId, courseId }, 'getLessonContent: Redis cache hit');
    return cached;
  }
  logger.debug({ lessonId, courseId }, 'getLessonContent: cache miss, falling back to DB');

  try {
    // Try lesson_contents table first (Stage 6 output)
    const { data: lessonContent } = await supabaseAdmin
      .from('lesson_contents')
      .select('content, metadata')
      .eq('lesson_id', lessonId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lessonContent?.content) {
      logger.warn({ lessonId }, 'No lesson content found');
      return null;
    }

    // Extract markdown content from metadata if available
    const metadata = lessonContent.metadata as Record<string, unknown> | null;
    if (metadata?.markdownContent && typeof metadata.markdownContent === 'string') {
      return metadata.markdownContent;
    }
    // Fall back to stringified content
    return typeof lessonContent.content === 'string'
      ? lessonContent.content
      : JSON.stringify(lessonContent.content);
  } catch (error) {
    logger.error(
      {
        lessonId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error fetching lesson content'
    );
    return null;
  }
}
