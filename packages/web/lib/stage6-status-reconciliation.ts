import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import type { Database } from '@/types/database.generated'

type CourseRow = Database['public']['Tables']['courses']['Row']
type CourseUpdate = Database['public']['Tables']['courses']['Update']
type GenerationStatus = Database['public']['Enums']['generation_status']
type LessonContentStatus = Database['public']['Enums']['lesson_content_status']

type Stage6LessonContentRow = Pick<
  Database['public']['Tables']['lesson_contents']['Row'],
  'lesson_id' | 'status' | 'created_at'
>

type Stage6CourseStructure = {
  sections?: Array<{
    lessons?: Array<{
      id?: string | null
    }>
  }>
} | null

type ReconciliationTargetStatus = Extract<GenerationStatus, 'stage_6_complete' | 'completed'>

const STAGE6_TERMINAL_LESSON_STATUSES = new Set<LessonContentStatus | 'approved'>([
  'completed',
  'review_required',
  'failed',
  'approved',
])

const STAGE6_FULLY_COMPLETED_STATUSES = new Set<LessonContentStatus | 'approved'>([
  'completed',
  'approved',
])

function extractExpectedLessonIds(courseStructure: Stage6CourseStructure): string[] {
  if (!courseStructure?.sections) {
    return []
  }

  const lessonIds = courseStructure.sections.flatMap((section) =>
    (section.lessons || [])
      .map((lesson) => lesson.id)
      .filter((lessonId): lessonId is string => typeof lessonId === 'string' && lessonId.length > 0)
  )

  return Array.from(new Set(lessonIds))
}

function sortByCreatedAtDesc(rows: Stage6LessonContentRow[]): Stage6LessonContentRow[] {
  return [...rows].sort((left, right) => {
    const leftTime = new Date(left.created_at || 0).getTime()
    const rightTime = new Date(right.created_at || 0).getTime()
    return rightTime - leftTime
  })
}

export interface Stage6ReconciliationDecision {
  shouldReconcile: boolean
  targetStatus: ReconciliationTargetStatus | null
  reason: string | null
  expectedLessonsCount: number
  latestLessonsCount: number
  terminalLessonsCount: number
  fullyCompletedLessonsCount: number
}

export function evaluateStage6Reconciliation(args: {
  course: Pick<CourseRow, 'generation_status' | 'auto_finalize_after_stage6' | 'course_structure'>
  lessonContents: Stage6LessonContentRow[]
}): Stage6ReconciliationDecision {
  const { course, lessonContents } = args

  if (course.generation_status !== 'stage_6_generating') {
    return {
      shouldReconcile: false,
      targetStatus: null,
      reason: null,
      expectedLessonsCount: 0,
      latestLessonsCount: 0,
      terminalLessonsCount: 0,
      fullyCompletedLessonsCount: 0,
    }
  }

  const expectedLessonIds = extractExpectedLessonIds(course.course_structure as Stage6CourseStructure)
  if (expectedLessonIds.length === 0) {
    return {
      shouldReconcile: false,
      targetStatus: null,
      reason: null,
      expectedLessonsCount: 0,
      latestLessonsCount: 0,
      terminalLessonsCount: 0,
      fullyCompletedLessonsCount: 0,
    }
  }

  const expectedLessonIdSet = new Set(expectedLessonIds)
  const latestRowByLesson = new Map<string, Stage6LessonContentRow>()

  for (const row of sortByCreatedAtDesc(lessonContents)) {
    if (!expectedLessonIdSet.has(row.lesson_id) || latestRowByLesson.has(row.lesson_id)) {
      continue
    }
    latestRowByLesson.set(row.lesson_id, row)
  }

  let terminalLessonsCount = 0
  let fullyCompletedLessonsCount = 0

  for (const latestRow of latestRowByLesson.values()) {
    const latestStatus = latestRow.status as LessonContentStatus | 'approved'
    if (STAGE6_TERMINAL_LESSON_STATUSES.has(latestStatus)) {
      terminalLessonsCount++
    }
    if (STAGE6_FULLY_COMPLETED_STATUSES.has(latestStatus)) {
      fullyCompletedLessonsCount++
    }
  }

  if (latestRowByLesson.size < expectedLessonIds.length || terminalLessonsCount < expectedLessonIds.length) {
    return {
      shouldReconcile: false,
      targetStatus: null,
      reason: null,
      expectedLessonsCount: expectedLessonIds.length,
      latestLessonsCount: latestRowByLesson.size,
      terminalLessonsCount,
      fullyCompletedLessonsCount,
    }
  }

  const targetStatus: ReconciliationTargetStatus =
    course.auto_finalize_after_stage6 === true &&
    fullyCompletedLessonsCount >= expectedLessonIds.length
      ? 'completed'
      : 'stage_6_complete'

  return {
    shouldReconcile: true,
    targetStatus,
    reason:
      targetStatus === 'completed'
        ? 'All latest Stage 6 lesson rows are fully completed and auto-finalize is enabled'
        : 'All latest Stage 6 lesson rows reached terminal status',
    expectedLessonsCount: expectedLessonIds.length,
    latestLessonsCount: latestRowByLesson.size,
    terminalLessonsCount,
    fullyCompletedLessonsCount,
  }
}

export interface Stage6ReconciliationResult extends Stage6ReconciliationDecision {
  applied: boolean
  updateError: string | null
}

export async function reconcileStage6CourseStatus(args: {
  supabase: Pick<SupabaseClient<Database>, 'from'>
  course: Pick<
    CourseRow,
    'id' | 'generation_status' | 'auto_finalize_after_stage6' | 'course_structure'
  >
  persist?: boolean
  now?: string
}): Promise<Stage6ReconciliationResult> {
  const { supabase, course, persist = false, now = new Date().toISOString() } = args

  const { data: lessonContents, error: lessonContentsError } = await supabase
    .from('lesson_contents')
    .select('lesson_id, status, created_at')
    .eq('course_id', course.id)
    .order('created_at', { ascending: false })

  if (lessonContentsError) {
    logger.warn('Failed to load Stage 6 lesson contents for reconciliation', {
      courseId: course.id,
      error: lessonContentsError.message,
    })

    return {
      shouldReconcile: false,
      targetStatus: null,
      reason: null,
      expectedLessonsCount: 0,
      latestLessonsCount: 0,
      terminalLessonsCount: 0,
      fullyCompletedLessonsCount: 0,
      applied: false,
      updateError: lessonContentsError.message,
    }
  }

  const decision = evaluateStage6Reconciliation({
    course,
    lessonContents: (lessonContents || []) as Stage6LessonContentRow[],
  })

  if (!persist || !decision.shouldReconcile || !decision.targetStatus) {
    return {
      ...decision,
      applied: false,
      updateError: null,
    }
  }

  const updates: CourseUpdate = {
    generation_status: decision.targetStatus,
    updated_at: now,
    ...(decision.targetStatus === 'completed'
      ? {
          generation_completed_at: now,
          status: 'published' as const,
        }
      : {}),
  }

  const { error: updateError } = await supabase
    .from('courses')
    .update(updates)
    .eq('id', course.id)
    .eq('generation_status', 'stage_6_generating')

  if (updateError) {
    logger.warn('Failed to persist Stage 6 reconciliation', {
      courseId: course.id,
      targetStatus: decision.targetStatus,
      error: updateError.message,
    })
  }

  return {
    ...decision,
    applied: !updateError,
    updateError: updateError?.message ?? null,
  }
}
