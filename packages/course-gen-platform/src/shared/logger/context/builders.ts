/**
 * Context Builders
 *
 * Фабрики для создания типизированного контекста логирования.
 */

export interface CourseContext {
  courseId: string;
  userId?: string;
  organizationId?: string;
}

export interface JobContextBase {
  jobId: string;
  jobType: string;
  courseId?: string;
}

export interface PipelineContextBase {
  courseId: string;
  stage: string;
  phase: string;
}

/**
 * Создаёт контекст для course-related операций.
 */
export function createCourseContext(params: CourseContext): CourseContext {
  return {
    courseId: params.courseId,
    ...(params.userId && { userId: params.userId }),
    ...(params.organizationId && { organizationId: params.organizationId }),
  };
}

/**
 * Создаёт контекст для job операций.
 */
export function createJobContext(params: JobContextBase): JobContextBase {
  return {
    jobId: params.jobId,
    jobType: params.jobType,
    ...(params.courseId && { courseId: params.courseId }),
  };
}

/**
 * Создаёт контекст для pipeline операций.
 */
export function createPipelineContext(params: PipelineContextBase): PipelineContextBase {
  return {
    courseId: params.courseId,
    stage: params.stage,
    phase: params.phase,
  };
}
