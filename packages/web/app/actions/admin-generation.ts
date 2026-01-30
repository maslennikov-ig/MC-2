'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth'
import { extractApiError } from '@/lib/api-error-handler'
import { ENV } from '@/lib/env'

export async function triggerStage6ForLesson(lessonId: string) {
  const headers = await getBackendAuthHeaders()

  const response = await fetch(`${TRPC_URL}/admin.triggerStage6ForLesson`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ lessonId }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to trigger generation')
  }

  revalidatePath('/admin/generation/[courseId]', 'page')
  return response.json()
}

export async function regenerateLessonWithRefinement(
  lessonId: string,
  refinementType: 'fix' | 'add' | 'simplify' | 'restructure' | 'custom',
  userInstructions: string
) {
  const headers = await getBackendAuthHeaders()

  const response = await fetch(`${TRPC_URL}/admin.regenerateLessonWithRefinement`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ lessonId, refinementType, userInstructions }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to regenerate lesson')
  }

  revalidatePath('/admin/generation/[courseId]', 'page')
  return response.json()
}

export async function finalizeCourse(courseId: string) {
  const headers = await getBackendAuthHeaders()

  // Note: This endpoint might need to be created in admin router first if it doesn't exist
  // Assuming we will create admin.finalizeCourse
  const response = await fetch(`${TRPC_URL}/admin.finalizeCourse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to finalize course')
  }

  revalidatePath('/admin/generation/[courseId]', 'page')
  return response.json()
}

/**
 * Start course generation (Stage 0 approval)
 * Triggers the generation.initiate tRPC endpoint
 */
export async function startGeneration(courseId: string) {
  const headers = await getBackendAuthHeaders()

  const response = await fetch(`${TRPC_URL}/generation.initiate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId, webhookUrl: null }),
  })

  if (!response.ok) {
    await extractApiError(response, 'Failed to start generation')
  }

  revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
  return response.json()
}

/**
 * Approve a stage and continue to the next stage
 * Used by StageApprovalBanner component for staged generation gates
 */
export async function approveStage(courseId: string, currentStage: number) {
  const headers = await getBackendAuthHeaders()

  const response = await fetch(`${TRPC_URL}/generation.approveStage`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId, currentStage }),
  })

  if (!response.ok) {
    await extractApiError(response, 'Failed to approve stage')
  }

  revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
  return response.json()
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
    const headers = await getBackendAuthHeaders()
    const response = await fetch(`${TRPC_URL}/generation.cancelGeneration`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ courseId }),
    })

    if (!response.ok) {
      // Log but don't fail - status already updated
      console.error('Failed to cancel backend jobs:', await response.text())
    }
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
 */
export async function getStageResults(courseId: string, stage: number) {
  const headers = await getBackendAuthHeaders()

  const response = await fetch(
    `${TRPC_URL}/generation.getStageResults?input=${encodeURIComponent(JSON.stringify({ courseId, stage }))}`,
    {
      method: 'GET',
      headers,
    }
  )

  if (!response.ok) {
    await extractApiError(response, 'Failed to get stage results')
  }

  const data = await response.json()
  return data?.result?.data || data
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
  const headers = await getBackendAuthHeaders()

  const response = await fetch(`${TRPC_URL}/generation.updateField`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId, stageId, fieldPath, value }),
  })

  if (!response.ok) {
    await extractApiError(response, 'Failed to update field')
  }

  revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
  const data = await response.json()
  return data?.result?.data || data
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
  const headers = await getBackendAuthHeaders()

  const response = await fetch(`${TRPC_URL}/generation.addElement`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      courseId,
      elementType,
      parentPath,
      position,
      userInstruction,
    }),
  })

  if (!response.ok) {
    await extractApiError(response, 'Failed to add element')
  }

  revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
  const data = await response.json()
  return data?.result?.data || data
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
  const headers = await getBackendAuthHeaders()

  const response = await fetch(`${TRPC_URL}/generation.regenerateBlock`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      courseId,
      stageId,
      blockPath,
      userInstruction,
    }),
  })

  if (!response.ok) {
    await extractApiError(response, 'Failed to regenerate block')
  }

  revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
  const data = await response.json()
  return data?.result?.data || data
}

/**
 * Get block dependencies (upstream and downstream)
 * Calls generation.getBlockDependencies tRPC endpoint
 * Used by ImpactAnalysisModal to show how many elements will be affected
 */
export async function getBlockDependenciesAction(courseId: string, blockPath: string) {
  const headers = await getBackendAuthHeaders()

  const response = await fetch(
    `${TRPC_URL}/generation.getBlockDependencies?input=${encodeURIComponent(JSON.stringify({ courseId, blockPath }))}`,
    {
      method: 'GET',
      headers,
    }
  )

  if (!response.ok) {
    await extractApiError(response, 'Failed to get block dependencies')
  }

  const data = await response.json()
  return data?.result?.data || data
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
  const headers = await getBackendAuthHeaders()

  const response = await fetch(`${TRPC_URL}/generation.cascadeUpdate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      courseId,
      blockPath,
      mode,
    }),
  })

  if (!response.ok) {
    await extractApiError(response, 'Failed to perform cascade update')
  }

  revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
  const data = await response.json()
  return data?.result?.data || data
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
  const headers = await getBackendAuthHeaders()

  const response = await fetch(`${TRPC_URL}/generation.deleteElement`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      courseId,
      elementPath,
      confirm,
    }),
  })

  if (!response.ok) {
    await extractApiError(response, 'Failed to delete element')
  }

  revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
  const data = await response.json()
  return data?.result?.data || data
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
  const headers = await getBackendAuthHeaders()

  const response = await fetch(`${TRPC_URL}/generation.switchToManualMode`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId }),
  })

  if (!response.ok) {
    await extractApiError(response, 'Failed to switch to manual mode')
  }

  revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
  const data = await response.json()
  return data?.result?.data || data
}

/**
 * Get edit history for a course
 * Used by EditHistoryPanel to display all regeneration changes
 * Calls generation.getEditHistory tRPC endpoint
 */
export async function getEditHistoryAction(courseId: string, limit: number = 50) {
  const headers = await getBackendAuthHeaders()

  const response = await fetch(
    `${TRPC_URL}/generation.getEditHistory?input=${encodeURIComponent(JSON.stringify({ courseId, limit }))}`,
    {
      method: 'GET',
      headers,
    }
  )

  if (!response.ok) {
    await extractApiError(response, 'Failed to get edit history')
  }

  const data = await response.json()
  return data?.result?.data || data
}

/**
 * Check if downstream stages (5 and/or 6) exist for a course
 * Used by CascadeStageDeleteModal to determine what will be deleted
 * Calls generation.checkDownstreamStages tRPC endpoint
 */
export async function checkDownstreamStagesAction(courseId: string) {
  const headers = await getBackendAuthHeaders()

  const response = await fetch(
    `${TRPC_URL}/generation.checkDownstreamStages?input=${encodeURIComponent(JSON.stringify({ courseId }))}`,
    {
      method: 'GET',
      headers,
    }
  )

  if (!response.ok) {
    await extractApiError(response, 'Failed to check downstream stages')
  }

  const data = await response.json()
  return data?.result?.data || data
}

/**
 * Delete downstream stages data
 * fromStage=4: DELETE course_structure (set to null), DELETE lessons, DELETE sections
 * fromStage=5: DELETE lessons only
 * Used by CascadeStageDeleteModal after user confirms deletion
 * Calls generation.deleteDownstreamStages tRPC endpoint
 */
export async function deleteDownstreamStagesAction(courseId: string, fromStage: 4 | 5) {
  const headers = await getBackendAuthHeaders()

  const response = await fetch(`${TRPC_URL}/generation.deleteDownstreamStages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId, fromStage }),
  })

  if (!response.ok) {
    await extractApiError(response, 'Failed to delete downstream stages')
  }

  // Revalidate all course-related paths after cascade delete
  revalidatePath('/courses/[orgSlug]/[courseSlug]/generating', 'page')
  revalidatePath('/courses/[orgSlug]/[courseSlug]', 'layout') // Also revalidates nested pages
  revalidatePath('/admin/generation/[courseId]', 'page')

  const data = await response.json()
  return data?.result?.data || data
}
