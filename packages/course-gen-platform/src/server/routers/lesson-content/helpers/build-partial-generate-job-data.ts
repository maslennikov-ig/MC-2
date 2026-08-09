import { JobType } from '@megacampus/shared-types';
import type { Language, CourseStyle } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type {
  Stage6JobInput,
  Stage6ExecutionContext,
} from '../../../../stages/stage6-lesson-content/types';

export interface BuildPartialGenerateJobDataInput {
  spec: LessonSpecificationV2;
  courseId: string;
  language: Language;
  style?: CourseStyle;
  skipCompletionCheck: boolean;
  organizationId: string;
  userId: string;
  manualTopRegeneration?: boolean;
  executionContext?: Stage6ExecutionContext;
}

export function buildPartialGenerateJobData({
  spec,
  courseId,
  language,
  style,
  skipCompletionCheck,
  organizationId,
  userId,
  manualTopRegeneration,
  executionContext,
}: BuildPartialGenerateJobDataInput): Stage6JobInput {
  return {
    lessonSpec: spec,
    courseId,
    language,
    style,
    ragChunks: [],
    ragContextId: null,
    skipCompletionCheck,
    executionContext:
      executionContext ?? (manualTopRegeneration ? 'manual_regeneration' : 'partial_regeneration'),
    executionPolicy: manualTopRegeneration
      ? {
          mode: 'manual_top_regeneration',
        }
      : undefined,
    organizationId,
    userId,
    jobType: JobType.LESSON_CONTENT,
  };
}
