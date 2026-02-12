'use server'

import { TRPCClientError } from '@trpc/client'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getServerTrpcClient } from '@/lib/trpc/server-caller'
import { ENV } from '@/lib/env'

/**
 * Convert tRPC or unknown errors to a plain Error for server action boundaries
 */
function toActionError(error: unknown, fallback: string): Error {
  if (error instanceof TRPCClientError) return new Error(error.message)
  if (error instanceof Error) return error
  return new Error(fallback)
}

export async function triggerStage6ForLesson(lessonId: string) {
  try {
    const client = await getServerTrpcClient()
    const result = await client.admin.triggerStage6ForLesson.mutate({ lessonId })
    revalidatePath('/admin/generation/[courseId]', 'page')
    return result
  } catch (error) {
    throw toActionError(error, 'Failed to trigger generation')
  }
}

export async function regenerateLessonWithRefinement(
  lessonId: string,
  refinementType: 'fix' | 'add' | 'simplify' | 'restructure' | 'custom',
  userInstructions: string
) {
  try {
    const client = await getServerTrpcClient()
    const result = await client.admin.regenerateLessonWithRefinement.mutate({
      lessonId,
      refinementType,
      userInstructions,
    })
    revalidatePath('/admin/generation/[courseId]', 'page')
    return result
  } catch (error) {
    throw toActionError(error, 'Failed to regenerate lesson')
  }
}

export async function finalizeCourse(courseId: string) {
  try {
    const client = await getServerTrpcClient()
    const result = await client.admin.finalizeCourse.mutate({ courseId })
    revalidatePath('/admin/generation/[courseId]', 'page')
    return result
  } catch (error) {
    throw toActionError(error, 'Failed to finalize course')
  }
}

/**
 * Start course generation (Stage 0 approval)
 * Triggers the generation.initiate tRPC endpoint
 */
export async function startGeneration(courseId: string) {
  try {
    const client = await getServerTrpcClient()
    const result = await client.generation.initiate.mutate({ courseId, webhookUrl: null })
    revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
    return result
  } catch (error) {
    throw toActionError(error, 'Failed to start generation')
  }
}

/**
 * Approve a stage and continue to the next stage
 * Used by StageApprovalBanner component for staged generation gates
 */
export async function approveStage(courseId: string, currentStage: number) {
  try {
    const client = await getServerTrpcClient()
    const result = await client.generation.approveStage.mutate({ courseId, currentStage })
    revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
    return result
  } catch (error) {
    throw toActionError(error, 'Failed to approve stage')
  }
}

/**
 * Pause course generation
 * Calls the API endpoint to pause generation with proper validation and RPC
 */
export async function pauseGeneration(courseId: string) {
  const supabase = await createClient()

  // Get the course slug and org slug for API call
  const { data: course, error: fetchError } = await supabase
    .from('courses')
    .select('slug, organizations!inner(slug)')
    .eq('id', courseId)
    .single()

  if (fetchError || !course) {
    throw new Error('Course not found')
  }

  // Extract org_slug from joined organization
  const orgData = course.organizations as { slug: string } | null
  const orgSlug = orgData?.slug
  if (!orgSlug) {
    throw new Error('Organization not found for course')
  }

  // Call the API endpoint which uses atomic RPC with FOR UPDATE lock
  // Use absolute URL for server actions (fetch requires absolute URLs in server context)
  const appUrl = ENV.NEXT_PUBLIC_APP_URL
  const response = await fetch(`${appUrl}/api/courses/${orgSlug}/${course.slug}/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to pause generation')
  }

  revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
  return response.json()
}

/**
 * Resume paused course generation
 * Calls the API endpoint to resume generation with proper validation
 */
export async function resumeGeneration(courseId: string) {
  const supabase = await createClient()

  // Get the course slug and org slug for API call
  const { data: course, error: fetchError } = await supabase
    .from('courses')
    .select('slug, organizations!inner(slug)')
    .eq('id', courseId)
    .single()

  if (fetchError || !course) {
    throw new Error('Course not found')
  }

  // Extract org_slug from joined organization
  const orgData = course.organizations as { slug: string } | null
  const orgSlug = orgData?.slug
  if (!orgSlug) {
    throw new Error('Organization not found for course')
  }

  // Call the API endpoint
  // Use absolute URL for server actions (fetch requires absolute URLs in server context)
  const appUrl = ENV.NEXT_PUBLIC_APP_URL
  const response = await fetch(`${appUrl}/api/courses/${orgSlug}/${course.slug}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to resume generation')
  }

  revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
  return response.json()
}

/**
 * Cancel course generation
 * Updates course status to 'cancelled' and triggers backend cleanup.
 * Backend (lifecycle.router.ts) handles BullMQ job removal via removeJobsByCourseId.
 */
export async function cancelGeneration(courseId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('courses')
    .update({ generation_status: 'cancelled' })
    .eq('id', courseId)

  if (error) {
    throw new Error(error.message || 'Failed to cancel generation')
  }

  // Call backend tRPC to clean up BullMQ jobs
  try {
    const client = await getServerTrpcClient()
    await client.generation.cancelGeneration.mutate({ courseId })
  } catch (backendError) {
    // Log but don't fail - status already updated
    console.error('Failed to call backend cancel:', backendError)
  }

  revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
  return { success: true }
}

/**
 * Get stage results for a specific stage
 * Used by StageResultsPreview component
 *
 * Note: No tRPC procedure exists for this — fetches directly from Supabase.
 * Stage <= 4 = analysis_result, Stage >= 5 = course_structure
 */
export async function getStageResults(courseId: string, stage: number) {
  try {
    const supabase = await createClient()
    const { data: course, error } = await supabase
      .from('courses')
      .select('analysis_result, course_structure')
      .eq('id', courseId)
      .single()

    if (error || !course) {
      throw new Error('Course not found')
    }

    return stage <= 4 ? course.analysis_result : course.course_structure
  } catch (error) {
    throw toActionError(error, 'Failed to get stage results')
  }
}

/**
 * Update a field in stage results (stage 4, stage 5, or stage 6)
 * Used by EditableField and EditableChips components for inline editing
 */
export async function updateFieldAction(
  courseId: string,
  stageId: 'stage_4' | 'stage_5' | 'stage_6',
  fieldPath: string,
  value: unknown
) {
  if (stageId === 'stage_6') {
    throw new Error('Field updates for stage 6 are not yet supported')
  }
  try {
    const client = await getServerTrpcClient()
    const result = await client.generation.updateField.mutate({
      courseId,
      stageId,
      fieldPath,
      value,
    })
    revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
    return result
  } catch (error) {
    throw toActionError(error, 'Failed to update field')
  }
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
  try {
    const client = await getServerTrpcClient()
    const result = await client.generation.addElement.mutate({
      courseId,
      elementType,
      parentPath,
      position,
      userInstruction,
    })
    revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
    return result
  } catch (error) {
    throw toActionError(error, 'Failed to add element')
  }
}

/**
 * Regenerate a specific field/block using AI with smart context routing
 * Calls generation.regenerateBlock tRPC endpoint
 * Used by InlineRegenerateChat component for inline field regeneration
 */
export async function regenerateBlockAction(
  courseId: string,
  stageId: 'stage_4' | 'stage_5' | 'stage_6',
  blockPath: string,
  userInstruction: string
) {
  if (stageId === 'stage_6') {
    throw new Error('Block regeneration for stage 6 is not yet supported')
  }
  try {
    const client = await getServerTrpcClient()
    const result = await client.generation.regenerateBlock.mutate({
      courseId,
      stageId,
      blockPath,
      userInstruction,
    })
    revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
    return result
  } catch (error) {
    throw toActionError(error, 'Failed to regenerate block')
  }
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
  try {
    const client = await getServerTrpcClient()
    const result = await client.generation.cascadeUpdate.mutate({
      courseId,
      changedPath: blockPath,
      action: mode,
    })
    revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
    return result
  } catch (error) {
    throw toActionError(error, 'Failed to perform cascade update')
  }
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
  try {
    const client = await getServerTrpcClient()
    const result = await client.generation.deleteElement.mutate({
      courseId,
      elementPath,
      confirm,
    })
    revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
    return result
  } catch (error) {
    throw toActionError(error, 'Failed to delete element')
  }
}

/**
 * Switch course from automatic to manual (semi-automatic) generation mode
 * Calls generation.switchToManualMode tRPC endpoint
 * Used by AutomaticModeControlPanel when user wants to take manual control
 *
 * Preconditions:
 * - Course must be in automatic mode
 * - Course must be paused
 */
export async function switchToManualMode(courseId: string) {
  try {
    const client = await getServerTrpcClient()
    const result = await client.generation.switchToManualMode.mutate({ courseId })
    revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
    return result
  } catch (error) {
    throw toActionError(error, 'Failed to switch to manual mode')
  }
}

/**
 * Delete downstream stages data
 * fromStage=4: DELETE course_structure (set to null), DELETE lessons, DELETE sections
 * fromStage=5: DELETE lessons only
 * Used by CascadeStageDeleteModal after user confirms deletion
 * Calls generation.deleteDownstreamStages tRPC endpoint
 */
export async function deleteDownstreamStagesAction(courseId: string, fromStage: 4 | 5) {
  try {
    const client = await getServerTrpcClient()
    const result = await client.generation.deleteDownstreamStages.mutate({
      courseId,
      fromStage,
    })

    // Revalidate all course-related paths after cascade delete
    revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
    revalidatePath('/courses/[orgSlug]/[courseSlug]', 'layout') // Also revalidates nested pages
    revalidatePath('/admin/generation/[courseId]', 'page')

    return result
  } catch (error) {
    throw toActionError(error, 'Failed to delete downstream stages')
  }
}
