'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { DocumentPriorityLevelSchema } from '@megacampus/shared-types'
import { extractDocumentUUID } from '@/lib/generation-graph/utils'
import crypto from 'crypto'
import {
  CreateCourseResponse,
  CreateCourseError,
  GenerationStep
} from '@/types/course-generation'
import { logger } from '@/lib/logger'
import type { Json } from '@/types/database.generated'
import { generateSlug } from '@/lib/utils/slug'

// Zod schema for course validation - only topic is required
const courseSchema = z.object({
  topic: z.string().min(3, 'Название курса должно быть не менее 3 символов').max(200, 'Название курса должно быть менее 200 символов'),
  course_description: z.string().optional(), // Made optional
  target_audience: z.string().optional(),
  style: z.string().optional().default('professional'),
  language: z.string().optional().default('en'), // Course content language
  output_formats: z.array(z.enum(['text', 'audio', 'video', 'presentation', 'test'])).optional().default(['text']),
  estimated_lessons: z.number().min(10).max(100).optional(),
  estimated_sections: z.number().min(3).max(30).optional(),
  lesson_duration_minutes: z.number().min(3).max(45).optional().default(15),
  content_strategy: z.enum(['auto', 'create_from_scratch', 'expand_and_enhance']).optional().default('auto'),
  prerequisites: z.string().optional(),
  learning_outcomes: z.string().optional(),
})



/**
 * Create initial generation progress structure
 */
function createInitialProgress(): GenerationStep[] {
  return [
    {
      id: 1,
      name: 'Запуск генерации',
      status: 'in_progress',
      started_at: new Date().toISOString()
    },
    {
      id: 2,
      name: 'Анализ задачи',
      status: 'pending'
    },
    {
      id: 3,
      name: 'Генерация структуры',
      status: 'pending'
    },
    {
      id: 4,
      name: 'Создание контента',
      status: 'pending'
    },
    {
      id: 5,
      name: 'Финализация',
      status: 'pending'
    }
  ]
}

/**
 * Trigger course generation via new backend endpoint
 * Stage 1 - Main Entry Orchestrator
 * Exported for potential direct use (e.g., retry scenarios)
 */
export async function triggerCourseGeneration(
  courseId: string,
  userId: string,
  accessToken: string
): Promise<{ success: boolean; error?: string; errorCode?: string }> {
  try {
    // Call tRPC endpoint directly on the backend server
    const backendUrl = process.env.COURSEGEN_BACKEND_URL || 'http://localhost:3456'
    const endpoint = `${backendUrl}/trpc/generation.initiate`

    logger.info('Triggering course generation via tRPC backend', {
      courseId,
      userId,
      endpoint: endpoint.substring(0, 50) + '...',
      hasAccessToken: !!accessToken
    })

    // tRPC v11 expects plain input data for mutations
    const payload = {
      courseId,
      webhookUrl: null
    }

    // Call tRPC backend with JWT authentication
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))

      // Handle concurrency limit (429)
      if (response.status === 429) {
        logger.warn('Concurrency limit reached', { courseId, userId })
        return {
          success: false,
          error: 'Достигнут лимит одновременных генераций. Пожалуйста, дождитесь завершения текущих курсов.',
          errorCode: 'CONCURRENCY_LIMIT'
        }
      }

      // Extract error message from tRPC error format
      const errorMessage = errorData?.error?.message || errorData?.message || errorData?.error || `Backend failed with status ${response.status}`
      const errorCode = errorData?.error?.data?.code || errorData?.code || 'BACKEND_ERROR'

      logger.error('tRPC generation.initiate failed', {
        status: response.status,
        error: errorData,
        courseId
      })

      return {
        success: false,
        error: errorMessage,
        errorCode: errorCode
      }
    }

    // tRPC returns data in { result: { data: ... } } format
    const responseData = await response.json()
    const result = responseData?.result?.data || responseData

    logger.info('Course generation triggered successfully', {
      courseId,
      result
    })

    return { success: true }

  } catch (error) {
    logger.error('Failed to trigger course generation', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      courseId,
      userId
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'NETWORK_ERROR'
    }
  }
}

/**
 * Check if current user can create courses
 */
export async function canCreateCourses(): Promise<{ canCreate: boolean; role: string }> {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { canCreate: false, role: 'unauthenticated' }
    }

    // Get user's role from JWT token
    const { data: { session } } = await supabase.auth.getSession()
    let userRole: string = 'unknown'

    if (session?.access_token) {
      try {
        const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64').toString())
        userRole = payload.role || 'unknown'
      } catch (err) {
        logger.error('Failed to decode JWT for role check', { err })
      }
    }

    // If not in JWT, get from users table
    if (userRole === 'unknown') {
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (userData?.role) {
        userRole = userData.role
      }
    }

    // Students cannot create courses
    const canCreate = userRole === 'instructor' || userRole === 'admin' || userRole === 'superadmin'
    return { canCreate, role: userRole }

  } catch (error) {
    logger.error('Error checking course creation permission', { error })
    return { canCreate: false, role: 'unknown' }
  }
}

/**
 * Create a draft course to get a real ID for file uploads
 */
export async function createDraftCourse(topic: string): Promise<{ id: string; slug: string } | { error: string }> {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.error('User not authenticated for draft course creation', { authError })
      return { error: 'Authentication required' }
    }

    // Get user's organization_id from JWT token
    const { data: { session } } = await supabase.auth.getSession()
    let organizationId: string | null = null
    let userRole: string = 'unknown'

    logger.info('Getting organization_id', { userId: user.id, hasSession: !!session })

    if (session?.access_token) {
      try {
        const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64').toString())
        organizationId = payload.organization_id
        userRole = payload.role || 'unknown'

        logger.info('JWT payload decoded', {
          organizationId,
          role: userRole,
          userId: payload.sub,
          hasOrgId: !!payload.organization_id,
          hasRole: !!payload.role,
          fullPayload: payload
        })
      } catch (err) {
        logger.error('Failed to decode JWT for organization_id', { err })
      }
    } else {
      logger.warn('No access token in session')
    }

    // If not in JWT, get from users table
    if (!organizationId || userRole === 'unknown') {
      logger.info('Missing data in JWT, querying users table', {
        needsOrgId: !organizationId,
        needsRole: userRole === 'unknown'
      })

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('organization_id, role')
        .eq('id', user.id)
        .single()

      if (userError || !userData) {
        logger.error('Failed to get user data', {
          error: userError,
          errorCode: userError?.code,
          errorMessage: userError?.message,
          userData
        })
        return { error: 'User data not found' }
      }

      if (!organizationId && userData.organization_id) {
        organizationId = userData.organization_id
        logger.info('Got organization_id from users table', { organizationId })
      }

      if (userRole === 'unknown' && userData.role) {
        userRole = userData.role
        logger.info('Got role from users table', { role: userRole })
      }
    }

    // Check if user has permission to create courses (RLS will also enforce this)
    if (userRole === 'student') {
      logger.info('Student attempted to create course', { userId: user.id, role: userRole })
      return { error: 'STUDENT_ROLE_RESTRICTION' } // Special error code for UI handling
    }

    if (userRole === 'unknown' || !userRole) {
      logger.warn('User role is unknown, may cause RLS issues', { userId: user.id, role: userRole })
    }

    // Generate unique slug
    let slug: string = ''
    let slugAttempts = 0
    const maxSlugAttempts = 5

    while (slugAttempts < maxSlugAttempts) {
      const uniqueSuffix = slugAttempts === 0
        ? '' // First try without suffix for cleaner URLs
        : crypto.randomBytes(4).toString('hex')

      slug = generateSlug(topic, uniqueSuffix)

      // Check if slug already exists
      const { data: existingCourse } = await supabase
        .from('courses')
        .select('id')
        .eq('slug', slug)
        .single()

      if (!existingCourse) {
        // Slug is unique, we can use it
        break
      }

      slugAttempts++
    }

    // If we still have collision after max attempts, use timestamp
    if (slugAttempts === maxSlugAttempts) {
      const timestamp = Date.now().toString(36)
      slug = generateSlug(topic, timestamp)
    }

    // Validate organization_id is present
    if (!organizationId) {
      logger.error('Missing organization_id for course creation', { userId: user.id })
      return { error: 'Organization ID not found' }
    }

    // Create draft course with minimal data (including required organization_id)
    logger.info('Creating draft course', {
      userId: user.id,
      organizationId,
      topic,
      slug
    })

    const { data: course, error: insertError } = await supabase
      .from('courses')
      .insert({
        title: topic,
        slug,
        status: 'draft',
        user_id: user.id,
        organization_id: organizationId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id, slug')
      .single()

    if (insertError || !course) {
      logger.error('Failed to create draft course', {
        error: insertError,
        errorCode: insertError?.code,
        errorMessage: insertError?.message,
        errorDetails: insertError?.details,
        errorHint: insertError?.hint
      })
      return { error: `Failed to create draft course: ${insertError?.message || 'Unknown error'}` }
    }

    logger.info('Draft course created', { courseId: course.id, slug: course.slug })
    return { id: course.id, slug: course.slug || '' }

  } catch (error) {
    logger.error('Error creating draft course', { error })
    return { error: 'Failed to create draft course' }
  }
}

/**
 * Update draft course and start generation
 */
export async function updateDraftAndStartGeneration(
  courseId: string,
  formData: FormData
): Promise<CreateCourseResponse | CreateCourseError> {
  try {
    const supabase = await createClient()

    // Get authenticated user and session with access token
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (authError || !user || sessionError || !session) {
      logger.error('User not authenticated', { authError, sessionError })
      return {
        error: 'Authentication required to update course',
        code: 'AUTHENTICATION_ERROR'
      }
    }

    // accessToken is available in session.access_token if needed for direct calls

    // Validate the form data
    const validationResult = courseSchema.safeParse({
      topic: formData.get('topic'),
      course_description: formData.get('course_description') || undefined,
      target_audience: formData.get('target_audience') || undefined,
      style: formData.get('style') || undefined,
      language: formData.get('language') || undefined,
      output_formats: formData.getAll('output_formats').length > 0
        ? formData.getAll('output_formats')
        : undefined,
      estimated_lessons: formData.get('estimated_lessons')
        ? parseInt(formData.get('estimated_lessons') as string)
        : undefined,
      estimated_sections: formData.get('estimated_sections')
        ? parseInt(formData.get('estimated_sections') as string)
        : undefined,
      lesson_duration_minutes: formData.get('lesson_duration_minutes')
        ? parseInt(formData.get('lesson_duration_minutes') as string)
        : undefined,
      content_strategy: formData.get('content_strategy') || undefined,
      prerequisites: formData.get('prerequisites') || undefined,
      learning_outcomes: formData.get('learning_outcomes') || undefined,
    })

    if (!validationResult.success) {
      const firstError = validationResult.error.issues[0]
      return {
        error: firstError.message,
        code: 'VALIDATION_ERROR',
        details: { errors: validationResult.error.issues }
      }
    }

    const validatedData = validationResult.data

    // Handle file metadata
    const fileIds = formData.getAll('file_ids') as string[]
    let fileMetadata: Array<{ url: string; name: string; size: number; type: string; fileId?: string }> = []

    if (fileIds.length > 0) {
      // Fetch file metadata from file_catalog
      const { data: fileDetails } = await supabase
        .from('file_catalog')
        .select('id, original_name, file_size, mime_type')
        .in('id', fileIds)

      if (fileDetails) {
        fileMetadata = fileDetails.map(f => ({
          url: '',
          name: f.original_name || 'File',
          size: f.file_size || 0,
          type: f.mime_type || 'application/octet-stream',
          fileId: f.id || undefined
        }))
      }
    }

    const hasFiles = fileIds.length > 0

    // Update the draft course to start generation
    const { data: course, error: updateError } = await supabase
      .from('courses')
      .update({
        status: 'draft', // Publication status remains draft until published
        generation_status: 'pending', // Generation workflow starts as pending
        course_description: validatedData.course_description || '',
        target_audience: validatedData.target_audience || null,
        style: validatedData.style || 'professional',
        language: validatedData.language || 'en', // Course content language
        output_formats: validatedData.output_formats || ['text'],
        estimated_lessons: validatedData.estimated_lessons || null,
        estimated_sections: validatedData.estimated_sections || null,
        content_strategy: validatedData.content_strategy || 'auto',
        prerequisites: validatedData.prerequisites || null,
        learning_outcomes: validatedData.learning_outcomes || null,
        has_files: hasFiles,
        generation_progress: {
          steps: createInitialProgress(),
          message: 'Запуск генерации курса...',
          percentage: 0,
          current_step: 1,
          total_steps: 5,
          has_documents: hasFiles,
          document_size: hasFiles ? fileMetadata.reduce((acc, f) => acc + f.size, 0) : null,
          files: fileMetadata,
          file_count: fileMetadata.length,
          total_file_size: fileMetadata.reduce((acc, f) => acc + f.size, 0)
        } as unknown as Json,
        generation_started_at: new Date().toISOString(),
        estimated_completion_minutes: hasFiles ? 8 : 5,
        updated_at: new Date().toISOString(),
        settings: {
          lesson_duration_minutes: validatedData.lesson_duration_minutes || 15,
        } as unknown as Json
      })
      .eq('id', courseId)
      .eq('user_id', user.id) // Security check
      .select()
      .single()

    if (updateError || !course) {
      logger.error('Failed to update draft course', { error: updateError, courseId })
      return {
        error: 'Failed to update course',
        code: 'DATABASE_ERROR'
      }
    }

    // NOTE: Generation is NOT auto-triggered anymore
    // User must click "Start" button on the generation page (approval gate)
    // This was changed to implement proper stage gates from the beginning
    logger.info('Course draft updated, awaiting user approval to start generation', { courseId: course.id, slug: course.slug })

    revalidatePath('/courses')
    revalidatePath(`/courses/${course.slug}`)

    return {
      id: course.id,
      courseId: course.id, // For compatibility with CreateCourseResponse interface
      slug: course.slug || ''
    }

  } catch (error) {
    logger.error('Error updating draft course', { error })
    return {
      error: 'Failed to start course generation',
      code: 'UNKNOWN_ERROR'
    }
  }
}


/**
 * Cancel a course generation
 */
export async function cancelCourseGeneration(courseId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Authentication required' }
    }
    
    // Check course ownership and generation status
    const { data: course, error: fetchError } = await supabase
      .from('courses')
      .select('user_id, generation_status')
      .eq('id', courseId)
      .single()

    if (fetchError || !course) {
      return { success: false, error: 'Course not found' }
    }

    if (course.user_id !== user.id) {
      return { success: false, error: 'You do not have permission to cancel this course' }
    }

    const generationStatus = course.generation_status || ''

    // Check if cancellation is allowed
    const cancellableStatuses = ['pending', 'initializing', 'processing_documents', 'analyzing_task', 'generating_structure']
    if (!cancellableStatuses.includes(generationStatus)) {
      return {
        success: false,
        error: 'Cannot cancel at this stage. The course generation is too far along.'
      }
    }

    // Update generation status to cancelled
    const { error: updateError } = await supabase
      .from('courses')
      .update({
        generation_status: 'cancelled',
        error_message: 'Отменено пользователем',
        generation_completed_at: new Date().toISOString()
      })
      .eq('id', courseId)
    
    if (updateError) {
      logger.error('Failed to cancel course', { error: updateError, courseId })
      return { success: false, error: 'Failed to cancel course generation' }
    }

    logger.info('Course generation cancelled', { courseId, userId: user.id })
    
    // Revalidate the course page
    revalidatePath('/courses')
    
    return { success: true }
    
  } catch (error) {
    logger.error('Unexpected error in cancelCourseGeneration', { error, courseId })
    return {
      success: false,
      error: 'An unexpected error occurred while cancelling the course'
    }
  }
}

/**
 * Update document priority for a specific document node
 * @param courseId - Course UUID
 * @param documentNodeId - Document node ID (e.g., "stage_2_doc_abc123")
 * @param priority - New priority level (CORE, IMPORTANT, or SUPPLEMENTARY)
 */
export async function updateDocumentPriority(
  courseId: string,
  documentNodeId: string,
  priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY'
): Promise<{ success: boolean; error?: string }> {
  try {
    // VALIDATION: Extract UUID from node ID format "doc_<uuid>" or "doc-<uuid>"
    const fileId = extractDocumentUUID(documentNodeId);
    if (!fileId) {
      logger.warn('Invalid document node ID format', { documentNodeId });
      return { success: false, error: 'Invalid document node ID format' };
    }

    // VALIDATION: Validate priority with Zod schema (runtime type safety)
    const priorityResult = DocumentPriorityLevelSchema.safeParse(priority);
    if (!priorityResult.success) {
      logger.warn('Invalid priority value', { priority, errors: priorityResult.error.errors });
      return { success: false, error: 'Invalid priority value' };
    }
    const validatedPriority = priorityResult.data;

    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      logger.error('User not authenticated', { error: userError })
      return { success: false, error: 'Authentication required' }
    }

    // Verify user owns this course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, user_id')
      .eq('id', courseId)
      .single()

    if (courseError || !course) {
      logger.error('Course not found', { error: courseError, courseId })
      return { success: false, error: 'Course not found' }
    }

    if (course.user_id !== user.id) {
      logger.error('User does not own this course', { userId: user.id, courseId })
      return { success: false, error: 'Unauthorized' }
    }

    // CONSTRAINT: Only 1 CORE document allowed per course
    // If setting to CORE, demote any existing CORE to IMPORTANT
    // Note: Database also enforces this via unique partial index idx_one_core_per_course
    if (validatedPriority === 'CORE') {
      const { error: demoteError } = await supabase
        .from('file_catalog')
        .update({ priority: 'IMPORTANT' })
        .eq('course_id', courseId)
        .eq('priority', 'CORE')
        .neq('id', fileId)

      if (demoteError) {
        logger.warn('Failed to demote existing CORE document', { error: demoteError, courseId })
        // Continue anyway - the new CORE will be set
      }
    }

    // Update file_catalog.priority
    const { error: updateError } = await supabase
      .from('file_catalog')
      .update({
        priority: validatedPriority,
        updated_at: new Date().toISOString()
      })
      .eq('id', fileId)
      .eq('course_id', courseId)

    if (updateError) {
      logger.error('Failed to update document priority', {
        error: updateError,
        fileId,
        courseId,
        priority: validatedPriority
      })
      return { success: false, error: 'Failed to update priority in database' }
    }

    logger.info('Document priority updated', {
      courseId,
      fileId,
      priority: validatedPriority,
      userId: user.id
    })

    return { success: true }

  } catch (error) {
    logger.error('Unexpected error in updateDocumentPriority', {
      error,
      courseId,
      documentNodeId,
      priority
    })
    return {
      success: false,
      error: 'An unexpected error occurred while updating document priority'
    }
  }
}