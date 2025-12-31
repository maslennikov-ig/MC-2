'use server';

import { z } from 'zod';
import { getUserClient, getAdminClient } from '@/lib/supabase/client-factory';
import { getCurrentUser } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth';

// ============================================================================
// Input Validation Schemas
// ============================================================================

const createEnrichmentSchema = z.object({
  lessonId: z.string().regex(/^\d+\.\d+$/, 'Invalid lesson ID format (expected: "1.2")'),
  courseId: z.string().uuid('Invalid course ID'),
  enrichmentType: z.enum(['video', 'audio', 'quiz', 'presentation', 'document']),
  settings: z.record(z.unknown()).optional(),
});

const reorderEnrichmentsSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  lessonId: z.string().regex(/^\d+\.\d+$/, 'Invalid lesson ID format (expected: "1.2")'),
  orderedIds: z.array(z.string().uuid('Invalid enrichment ID')).min(1),
});

export interface CreateEnrichmentInput {
  lessonId: string; // In format "1.2" (module.lesson label)
  courseId: string;
  enrichmentType: 'video' | 'audio' | 'quiz' | 'presentation' | 'document';
  settings?: Record<string, unknown>;
}

export interface CreateEnrichmentResult {
  success: boolean;
  enrichmentId?: string;
  error?: string;
}

/**
 * Create an enrichment for a lesson
 *
 * Converts lesson label (e.g., "1.2") to lesson UUID, then calls tRPC API
 */
export async function createEnrichment(
  input: CreateEnrichmentInput
): Promise<CreateEnrichmentResult> {
  try {
    // Input validation
    const validation = createEnrichmentSchema.safeParse(input);
    if (!validation.success) {
      logger.error('[createEnrichment] Invalid input', {
        errors: validation.error.flatten(),
      });
      return { success: false, error: 'Invalid input data' };
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const supabase = await getUserClient();

    // Authorization: Verify user owns the course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('user_id')
      .eq('id', input.courseId)
      .single();

    if (courseError || !course) {
      logger.error('[createEnrichment] Course not found', { courseId: input.courseId });
      return { success: false, error: 'Course not found' };
    }

    if (course.user_id !== currentUser.id) {
      logger.error('[createEnrichment] Unauthorized access attempt', {
        userId: currentUser.id,
        courseId: input.courseId,
        courseOwner: course.user_id,
      });
      return { success: false, error: 'Unauthorized' };
    }

    // Convert lessonId label to UUID
    const [moduleNum, lessonNum] = input.lessonId.split('.').map(Number);

    // Get section (module) by order_index
    const { data: section, error: sectionError } = await supabase
      .from('sections')
      .select('id')
      .eq('course_id', input.courseId)
      .eq('order_index', moduleNum)
      .single();

    if (sectionError || !section) {
      logger.error('[createEnrichment] Section not found', {
        moduleNum,
        courseId: input.courseId,
        error: sectionError?.message,
      });
      return { success: false, error: 'Section not found' };
    }

    // Get lesson by section_id and order_index
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id')
      .eq('section_id', section.id)
      .eq('order_index', lessonNum)
      .single();

    if (lessonError || !lesson) {
      logger.error('[createEnrichment] Lesson not found', {
        lessonNum,
        sectionId: section.id,
        error: lessonError?.message,
      });
      return { success: false, error: 'Lesson not found' };
    }

    // Call tRPC API to create enrichment
    const headers = await getBackendAuthHeaders();
    const response = await fetch(`${TRPC_URL}/enrichment.create`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lessonId: lesson.id,
        enrichmentType: input.enrichmentType,
        settings: input.settings || {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[createEnrichment] tRPC call failed', {
        status: response.status,
        error: errorText,
      });
      return { success: false, error: `Failed to create enrichment: ${response.status}` };
    }

    const result = await response.json();

    if (!result.result?.data?.success) {
      return {
        success: false,
        error: result.result?.data?.error || 'Unknown error',
      };
    }

    logger.info('[createEnrichment] Enrichment created', {
      enrichmentId: result.result.data.enrichmentId,
      lessonId: input.lessonId,
      type: input.enrichmentType,
    });

    return {
      success: true,
      enrichmentId: result.result.data.enrichmentId,
    };
  } catch (error) {
    logger.error('[createEnrichment] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create enrichment',
    };
  }
}

// ============================================================================
// Reorder Enrichments
// ============================================================================

export interface ReorderEnrichmentsInput {
  courseId: string;
  lessonId: string; // In format "1.2" (module.lesson label)
  orderedIds: string[]; // Array of enrichment UUIDs in new order
}

export interface ReorderEnrichmentsResult {
  success: boolean;
  error?: string;
}

/**
 * Reorder enrichments within a lesson
 *
 * Updates the order_index for each enrichment based on its position
 * in the provided orderedIds array.
 *
 * @param input - The reorder input containing courseId, lessonId label, and ordered IDs
 * @returns Success status and optional error message
 */
export async function reorderEnrichments(
  input: ReorderEnrichmentsInput
): Promise<ReorderEnrichmentsResult> {
  try {
    // Input validation
    const validation = reorderEnrichmentsSchema.safeParse(input);
    if (!validation.success) {
      logger.error('[reorderEnrichments] Invalid input', {
        errors: validation.error.flatten(),
      });
      return { success: false, error: 'Invalid input data' };
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const supabase = await getUserClient();

    // Authorization: Verify user owns the course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('user_id')
      .eq('id', input.courseId)
      .single();

    if (courseError || !course) {
      logger.error('[reorderEnrichments] Course not found', { courseId: input.courseId });
      return { success: false, error: 'Course not found' };
    }

    if (course.user_id !== currentUser.id) {
      logger.error('[reorderEnrichments] Unauthorized access attempt', {
        userId: currentUser.id,
        courseId: input.courseId,
        courseOwner: course.user_id,
      });
      return { success: false, error: 'Unauthorized' };
    }

    // Convert lessonId label to UUID
    const [moduleNum, lessonNum] = input.lessonId.split('.').map(Number);

    // Get section (module) by order_index
    const { data: section, error: sectionError } = await supabase
      .from('sections')
      .select('id')
      .eq('course_id', input.courseId)
      .eq('order_index', moduleNum)
      .single();

    if (sectionError || !section) {
      logger.error('[reorderEnrichments] Section not found', {
        moduleNum,
        courseId: input.courseId,
        error: sectionError?.message,
      });
      return { success: false, error: 'Section not found' };
    }

    // Get lesson by section_id and order_index
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id')
      .eq('section_id', section.id)
      .eq('order_index', lessonNum)
      .single();

    if (lessonError || !lesson) {
      logger.error('[reorderEnrichments] Lesson not found', {
        lessonNum,
        sectionId: section.id,
        error: lessonError?.message,
      });
      return { success: false, error: 'Lesson not found' };
    }

    // Update order_index for each enrichment using admin client
    const adminClient = getAdminClient();

    for (let i = 0; i < input.orderedIds.length; i++) {
      const { error } = await adminClient
        .from('lesson_enrichments')
        .update({ order_index: i })
        .eq('id', input.orderedIds[i])
        .eq('lesson_id', lesson.id);

      if (error) {
        logger.error('[reorderEnrichments] Failed to update order', {
          enrichmentId: input.orderedIds[i],
          orderIndex: i,
          error: error.message,
        });
        return { success: false, error: 'Failed to update order' };
      }
    }

    logger.info('[reorderEnrichments] Enrichments reordered', {
      lessonId: input.lessonId,
      lessonUuid: lesson.id,
      count: input.orderedIds.length,
    });

    return { success: true };
  } catch (error) {
    logger.error('[reorderEnrichments] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reorder',
    };
  }
}

// ============================================================================
// Delete Enrichment
// ============================================================================

const deleteEnrichmentSchema = z.object({
  enrichmentId: z.string().uuid('Invalid enrichment ID'),
  courseId: z.string().uuid('Invalid course ID'),
});

export interface DeleteEnrichmentInput {
  enrichmentId: string;
  courseId: string;
}

export interface DeleteEnrichmentResult {
  success: boolean;
  error?: string;
}

/**
 * Delete an enrichment
 *
 * Validates ownership and calls the tRPC endpoint to delete the enrichment
 * and any associated storage assets.
 *
 * @param input - The delete input containing enrichmentId and courseId
 * @returns Success status and optional error message
 */
export async function deleteEnrichment(
  input: DeleteEnrichmentInput
): Promise<DeleteEnrichmentResult> {
  try {
    // Input validation
    const validation = deleteEnrichmentSchema.safeParse(input);
    if (!validation.success) {
      logger.error('[deleteEnrichment] Invalid input', {
        errors: validation.error.flatten(),
      });
      return { success: false, error: 'Invalid input data' };
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const supabase = await getUserClient();

    // Authorization: Verify user owns the course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('user_id')
      .eq('id', input.courseId)
      .single();

    if (courseError || !course) {
      logger.error('[deleteEnrichment] Course not found', { courseId: input.courseId });
      return { success: false, error: 'Course not found' };
    }

    if (course.user_id !== currentUser.id) {
      logger.error('[deleteEnrichment] Unauthorized access attempt', {
        userId: currentUser.id,
        courseId: input.courseId,
        courseOwner: course.user_id,
      });
      return { success: false, error: 'Unauthorized' };
    }

    // Call tRPC API to delete enrichment
    const headers = await getBackendAuthHeaders();
    const response = await fetch(`${TRPC_URL}/enrichment.delete`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        enrichmentId: input.enrichmentId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[deleteEnrichment] tRPC call failed', {
        status: response.status,
        error: errorText,
      });
      return { success: false, error: `Failed to delete enrichment: ${response.status}` };
    }

    const result = await response.json();

    if (!result.result?.data?.success) {
      return {
        success: false,
        error: result.result?.data?.error || 'Unknown error',
      };
    }

    logger.info('[deleteEnrichment] Enrichment deleted', {
      enrichmentId: input.enrichmentId,
      courseId: input.courseId,
    });

    return { success: true };
  } catch (error) {
    logger.error('[deleteEnrichment] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete enrichment',
    };
  }
}

// ============================================================================
// Get Single Enrichment
// ============================================================================

const getEnrichmentSchema = z.object({
  enrichmentId: z.string().uuid('Invalid enrichment ID'),
  courseId: z.string().uuid('Invalid course ID'),
});

export interface GetEnrichmentInput {
  enrichmentId: string;
  courseId: string;
}

export interface GetEnrichmentResult {
  success: boolean;
  enrichment?: {
    id: string;
    enrichment_type: 'video' | 'audio' | 'quiz' | 'presentation' | 'document' | 'cover';
    status:
      | 'pending'
      | 'draft_generating'
      | 'draft_ready'
      | 'generating'
      | 'completed'
      | 'failed'
      | 'cancelled';
    content: unknown;
    draft_content: unknown;
    metadata: Record<string, unknown> | null;
    error_message: string | null;
    asset_url: string | null;
  };
  error?: string;
}

/**
 * Get a single enrichment by ID
 *
 * Verifies course ownership before returning enrichment data.
 * Used by DetailView to display enrichment details.
 *
 * @param input - The enrichment ID and course ID
 * @returns The enrichment data or error
 */
export async function getEnrichment(
  input: GetEnrichmentInput
): Promise<GetEnrichmentResult> {
  try {
    // Input validation
    const validation = getEnrichmentSchema.safeParse(input);
    if (!validation.success) {
      logger.error('[getEnrichment] Invalid input', {
        errors: validation.error.flatten(),
      });
      return { success: false, error: 'Invalid input data' };
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const supabase = await getUserClient();

    // Authorization: Verify user owns the course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('user_id')
      .eq('id', input.courseId)
      .single();

    if (courseError || !course) {
      logger.error('[getEnrichment] Course not found', { courseId: input.courseId });
      return { success: false, error: 'Course not found' };
    }

    if (course.user_id !== currentUser.id) {
      logger.error('[getEnrichment] Unauthorized access attempt', {
        userId: currentUser.id,
        courseId: input.courseId,
        courseOwner: course.user_id,
      });
      return { success: false, error: 'Unauthorized' };
    }

    // Fetch the enrichment
    const { data: enrichment, error: enrichmentError } = await supabase
      .from('lesson_enrichments')
      .select('id, enrichment_type, status, content, metadata, error_message, asset_id')
      .eq('id', input.enrichmentId)
      .eq('course_id', input.courseId)
      .single();

    if (enrichmentError || !enrichment) {
      logger.error('[getEnrichment] Enrichment not found', {
        enrichmentId: input.enrichmentId,
        error: enrichmentError?.message,
      });
      return { success: false, error: 'Enrichment not found' };
    }

    // Get signed URL for asset if it exists
    let assetUrl: string | null = null;
    if (enrichment.asset_id) {
      // Get the asset file path
      const { data: asset } = await supabase
        .from('assets')
        .select('file_path')
        .eq('id', enrichment.asset_id)
        .single();

      if (asset?.file_path) {
        // Create signed URL (valid for 1 hour)
        const { data: signedUrlData } = await supabase.storage
          .from('course-assets')
          .createSignedUrl(asset.file_path, 3600);

        assetUrl = signedUrlData?.signedUrl || null;
      }
    }

    logger.debug('[getEnrichment] Enrichment fetched', {
      enrichmentId: input.enrichmentId,
      type: enrichment.enrichment_type,
      status: enrichment.status,
    });

    return {
      success: true,
      enrichment: {
        id: enrichment.id,
        enrichment_type: enrichment.enrichment_type,
        status: enrichment.status,
        content: enrichment.content,
        draft_content: null, // Not stored separately, content is the source
        metadata: enrichment.metadata as Record<string, unknown> | null,
        error_message: enrichment.error_message,
        asset_url: assetUrl,
      },
    };
  } catch (error) {
    logger.error('[getEnrichment] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get enrichment',
    };
  }
}
