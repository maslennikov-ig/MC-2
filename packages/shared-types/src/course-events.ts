/**
 * Course Event Types
 * Types for cross-component communication events
 * @module @megacampus/shared-types/course-events
 */

/**
 * Event name constant for course data updates
 * Use this instead of hardcoding the string 'course-data-updated'
 */
export const COURSE_DATA_UPDATED_EVENT = 'course-data-updated' as const;

/**
 * Fields that trigger UI refresh when updated
 */
export const COURSE_RELEVANT_FIELDS = [
  'analysis_result',
  'course_structure',
  'visual_style',
  'style',
] as const;

export type CourseRelevantField = (typeof COURSE_RELEVANT_FIELDS)[number];

/**
 * Event source indicating where the update originated
 */
export type CourseDataUpdateSource = 'realtime' | 'manual' | 'polling';

/**
 * Detail payload for course-data-updated CustomEvent
 */
export interface CourseDataUpdatedDetail {
  /** UUID of the course that was updated */
  courseId: string;
  /** List of field names that were updated */
  updatedFields: string[];
  /** Source of the update */
  source: CourseDataUpdateSource;
}

/**
 * Type guard to validate CourseDataUpdatedDetail
 * @param detail - The detail object to validate
 * @returns True if detail conforms to CourseDataUpdatedDetail interface
 */
export function isCourseDataUpdatedDetail(
  detail: unknown
): detail is CourseDataUpdatedDetail {
  if (!detail || typeof detail !== 'object') return false;

  const d = detail as Record<string, unknown>;

  return (
    typeof d.courseId === 'string' &&
    d.courseId.length > 0 &&
    Array.isArray(d.updatedFields) &&
    d.updatedFields.every((f) => typeof f === 'string') &&
    (d.source === 'realtime' || d.source === 'manual' || d.source === 'polling')
  );
}

/**
 * Type guard to validate course-data-updated CustomEvent
 * @param event - The event to validate
 * @returns True if event is a valid course-data-updated CustomEvent
 */
export function isCourseDataUpdatedEvent(
  event: Event
): event is CustomEvent<CourseDataUpdatedDetail> {
  if (!(event instanceof CustomEvent)) return false;
  return isCourseDataUpdatedDetail(event.detail);
}

/**
 * Helper to create a typed course-data-updated event
 * @param detail - The event detail payload
 * @returns A properly typed CustomEvent
 */
export function createCourseDataUpdatedEvent(
  detail: CourseDataUpdatedDetail
): CustomEvent<CourseDataUpdatedDetail> {
  return new CustomEvent(COURSE_DATA_UPDATED_EVENT, { detail });
}

/**
 * Helper to check if updated fields contain any relevant fields
 * @param updatedFields - List of updated field names
 * @returns True if any relevant fields were updated
 */
export function hasRelevantFieldChanges(updatedFields: string[]): boolean {
  if (updatedFields.length === 0) return true; // No fields = assume all changed
  return updatedFields.some((f) =>
    (COURSE_RELEVANT_FIELDS as readonly string[]).includes(f)
  );
}
