'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth';
import { extractApiError } from '@/lib/api-error-handler';

export async function triggerStage6ForLesson(lessonId: string) {
  const headers = await getBackendAuthHeaders();
  
  const response = await fetch(`${TRPC_URL}/admin.triggerStage6ForLesson`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ lessonId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to trigger generation');
  }

  revalidatePath('/admin/generation/[courseId]', 'page');
  return response.json();
}

export async function regenerateLessonWithRefinement(
  lessonId: string,
  refinementType: 'fix' | 'add' | 'simplify' | 'restructure' | 'custom',
  userInstructions: string
) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/admin.regenerateLessonWithRefinement`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ lessonId, refinementType, userInstructions }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to regenerate lesson');
  }

  revalidatePath('/admin/generation/[courseId]', 'page');
  return response.json();
}

export async function finalizeCourse(courseId: string) {
  const headers = await getBackendAuthHeaders();

  // Note: This endpoint might need to be created in admin router first if it doesn't exist
  // Assuming we will create admin.finalizeCourse
  const response = await fetch(`${TRPC_URL}/admin.finalizeCourse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to finalize course');
  }

  revalidatePath('/admin/generation/[courseId]', 'page');
  return response.json();
}

/**
 * Start course generation (Stage 0 approval)
 * Triggers the generation.initiate tRPC endpoint
 */
export async function startGeneration(courseId: string) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/generation.initiate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId, webhookUrl: null }),
  });

  if (!response.ok) {
    await extractApiError(response, 'Failed to start generation');
  }

  revalidatePath('/courses/generating/[slug]', 'page');
  return response.json();
}

/**
 * Approve a stage and continue to the next stage
 * Used by StageApprovalBanner component for staged generation gates
 */
export async function approveStage(courseId: string, currentStage: number) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/generation.approveStage`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId, currentStage }),
  });

  if (!response.ok) {
    await extractApiError(response, 'Failed to approve stage');
  }

  revalidatePath('/courses/generating/[slug]', 'page');
  return response.json();
}

/**
 * Cancel course generation
 * Sets the course status to 'cancelled'
 */
export async function cancelGeneration(courseId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('courses')
    .update({ generation_status: 'cancelled' })
    .eq('id', courseId);

  if (error) {
    throw new Error(error.message || 'Failed to cancel generation');
  }

  revalidatePath('/courses/generating/[slug]', 'page');
  return { success: true };
}

/**
 * Get stage results for a specific stage
 * Used by StageResultsPreview component
 */
export async function getStageResults(courseId: string, stage: number) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/generation.getStageResults?input=${encodeURIComponent(JSON.stringify({ courseId, stage }))}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    await extractApiError(response, 'Failed to get stage results');
  }

  const data = await response.json();
  return data?.result?.data || data;
}

/**
 * Update a field in stage results (stage 4 or stage 5)
 * Used by EditableField and EditableChips components for inline editing
 */
export async function updateFieldAction(
  courseId: string,
  stageId: 'stage_4' | 'stage_5',
  fieldPath: string,
  value: unknown
) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/generation.updateField`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId, stageId, fieldPath, value }),
  });

  if (!response.ok) {
    await extractApiError(response, 'Failed to update field');
  }

  revalidatePath('/courses/generating/[slug]', 'page');
  const data = await response.json();
  return data?.result?.data || data;
}

/**
 * Add a lesson or section to the course structure using AI generation
 * Calls generation.addElement tRPC endpoint
 */
export async function addElementAction(
  courseId: string,
  elementType: 'lesson' | 'section',
  parentPath: string,
  position: 'start' | 'end' | number,
  userInstruction: string
) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/generation.addElement`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      courseId,
      elementType,
      parentPath,
      position,
      userInstruction
    }),
  });

  if (!response.ok) {
    await extractApiError(response, 'Failed to add element');
  }

  revalidatePath('/courses/generating/[slug]', 'page');
  const data = await response.json();
  return data?.result?.data || data;
}

/**
 * Regenerate a specific field/block using AI with smart context routing
 * Calls generation.regenerateBlock tRPC endpoint
 * Used by InlineRegenerateChat component for inline field regeneration
 */
export async function regenerateBlockAction(
  courseId: string,
  stageId: 'stage_4' | 'stage_5',
  blockPath: string,
  userInstruction: string
) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/generation.regenerateBlock`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      courseId,
      stageId,
      blockPath,
      userInstruction
    }),
  });

  if (!response.ok) {
    await extractApiError(response, 'Failed to regenerate block');
  }

  revalidatePath('/courses/generating/[slug]', 'page');
  const data = await response.json();
  return data?.result?.data || data;
}

/**
 * Get block dependencies (upstream and downstream)
 * Calls generation.getBlockDependencies tRPC endpoint
 * Used by ImpactAnalysisModal to show how many elements will be affected
 */
export async function getBlockDependenciesAction(
  courseId: string,
  blockPath: string
) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(
    `${TRPC_URL}/generation.getBlockDependencies?input=${encodeURIComponent(JSON.stringify({ courseId, blockPath }))}`,
    {
      method: 'GET',
      headers,
    }
  );

  if (!response.ok) {
    await extractApiError(response, 'Failed to get block dependencies');
  }

  const data = await response.json();
  return data?.result?.data || data;
}

/**
 * Handle cascade update for changed learning objectives
 * Calls generation.cascadeUpdate tRPC endpoint
 * Used after user confirms action in ImpactAnalysisModal
 */
export async function cascadeUpdateAction(
  courseId: string,
  blockPath: string,
  mode: 'mark_stale' | 'auto_regenerate' | 'review_each'
) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/generation.cascadeUpdate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      courseId,
      blockPath,
      mode
    }),
  });

  if (!response.ok) {
    await extractApiError(response, 'Failed to perform cascade update');
  }

  revalidatePath('/courses/generating/[slug]', 'page');
  const data = await response.json();
  return data?.result?.data || data;
}

/**
 * Delete a lesson or section from the course structure
 * Calls generation.deleteElement tRPC endpoint
 * Used by LessonRow and SectionAccordion delete buttons
 *
 * Smart confirmation (FR-011a):
 * - If element has content and confirm=false, returns requiresConfirmation=true
 * - If confirm=true or element is empty, deletes and returns success
 */
export async function deleteElementAction(
  courseId: string,
  elementPath: string,
  confirm: boolean = false
) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/generation.deleteElement`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      courseId,
      elementPath,
      confirm
    }),
  });

  if (!response.ok) {
    await extractApiError(response, 'Failed to delete element');
  }

  revalidatePath('/courses/generating/[slug]', 'page');
  const data = await response.json();
  return data?.result?.data || data;
}
