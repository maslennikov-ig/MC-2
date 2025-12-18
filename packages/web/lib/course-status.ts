/**
 * Course status utilities
 */

export type CourseStatus = 
  | 'draft'
  | 'generating' 
  | 'processing'
  | 'structure_ready'
  | 'generating_structure'
  | 'generating_lessons'
  | 'completed'
  | 'generated'
  | 'failed'
  | 'mixed'

/**
 * Check if a course is ready to view
 */
export function isCourseReady(status: CourseStatus | null | undefined, progress?: { percentage?: number }): boolean {
  if (!status) return false
  
  // Multiple ways a course can be considered ready
  return (
    status === 'completed' ||
    status === 'generated' ||
    (status === 'generating_lessons' && progress?.percentage === 100)
  )
}

/**
 * Check if a course is still being generated
 */
export function isCourseGenerating(status: CourseStatus | null | undefined): boolean {
  if (!status) return false
  
  return (
    status === 'generating' ||
    status === 'processing' ||
    status === 'generating_structure' ||
    status === 'generating_lessons' ||
    status === 'structure_ready'
  )
}

/**
 * Get human-readable status message
 */
export function getStatusMessage(status: CourseStatus | null | undefined): string {
  switch (status) {
    case 'draft':
      return 'Черновик'
    case 'generating':
    case 'processing':
      return 'Генерируется...'
    case 'generating_structure':
      return 'Создание структуры...'
    case 'structure_ready':
      return 'Структура готова'
    case 'generating_lessons':
      return 'Создание уроков...'
    case 'completed':
    case 'generated':
      return 'Готов'
    case 'failed':
      return 'Ошибка'
    case 'mixed':
      return 'Частично готов'
    default:
      return 'Неизвестно'
  }
}

/**
 * Get status color for UI using semantic design tokens
 */
export function getStatusColor(status: CourseStatus | null | undefined): string {
  switch (status) {
    case 'completed':
    case 'generated':
      return 'text-[hsl(var(--status-completed))]'
    case 'generating':
    case 'processing':
    case 'generating_structure':
    case 'generating_lessons':
    case 'structure_ready':
      return 'text-[hsl(var(--status-processing))]'
    case 'failed':
      return 'text-[hsl(var(--status-failed))]'
    case 'mixed':
      return 'text-[hsl(var(--status-mixed))]'
    case 'draft':
      return 'text-[hsl(var(--status-draft))]'
    default:
      return 'text-muted-foreground'
  }
}