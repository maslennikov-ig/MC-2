import type { JobData } from '@megacampus/shared-types';

interface LegacyJobDataFields {
  course_id?: string;
}

export function getJobCourseId(data: JobData | null | undefined): string | undefined {
  if (!data) return undefined;
  if ('courseId' in data) return data.courseId;

  return (data as unknown as LegacyJobDataFields).course_id;
}
