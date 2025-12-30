import type { Course, Section, Lesson, Asset, LessonActivity } from "@/types/database";
import type { Database } from "@/types/database.generated";

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row'];

export interface CourseViewerProps {
  course: Course;
  sections: Section[];
  lessons: Lesson[];
  assets?: Record<string, Asset[]>;
  /** Enrichments grouped by lesson_id (video, audio, quiz, presentation, document) */
  enrichments?: Record<string, EnrichmentRow[]>;
  /** Error message if enrichments failed to load */
  enrichmentsLoadError?: string;
  /** Read-only mode for shared/public course viewing (hides edit buttons, generation panel) */
  readOnly?: boolean;
}

export function isActivityObject(activity: string | LessonActivity): activity is LessonActivity {
  return typeof activity === 'object' && activity !== null && 'exercise_title' in activity;
}
