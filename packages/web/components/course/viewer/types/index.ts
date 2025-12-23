import type { Course, Section, Lesson, Asset, LessonActivity } from "@/types/database";

export interface CourseViewerProps {
  course: Course;
  sections: Section[];
  lessons: Lesson[];
  assets?: Record<string, Asset[]>;
}

export function isActivityObject(activity: string | LessonActivity): activity is LessonActivity {
  return typeof activity === 'object' && activity !== null && 'exercise_title' in activity;
}
