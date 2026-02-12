/**
 * Trigger Stage 6 Lesson Generation
 * Usage: npx tsx scripts/trigger-lesson-gen.ts <lesson_uuid>
 */

import 'dotenv/config';
import { getSupabaseAdmin } from '../src/shared/supabase/admin';
import { addJob, closeQueue } from '../src/orchestrator/queue';
import { JobType, type LessonContentJobData } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { validateLocale } from '../src/shared/validation';
import type { Language } from '@megacampus/shared-types';

interface CourseStructure {
  sections: Array<{
    section_title: string;
    lessons: Array<{
      lesson_title: string;
      lesson_objectives?: string[];
      key_topics?: string[];
    }>;
  }>;
}

async function main() {
  const lessonId = process.argv[2];

  if (!lessonId) {
    console.error('Usage: npx tsx scripts/trigger-lesson-gen.ts <lesson_uuid>');
    process.exit(1);
  }

  console.log(`Triggering Stage 6 generation for lesson: ${lessonId}`);

  const supabase = getSupabaseAdmin();

  // Get lesson and course info
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, title, section_id, order_index, metadata, sections!inner(id, course_id, order_index, courses!inner(id, organization_id, user_id, language, course_structure))'
    )
    .eq('id', lessonId)
    .single();

  if (lessonError || !lesson) {
    console.error('Failed to fetch lesson:', lessonError?.message);
    process.exit(1);
  }

  const section = lesson.sections as unknown as {
    id: string;
    course_id: string;
    order_index: number;
    courses: {
      id: string;
      organization_id: string;
      user_id: string;
      language: string | null;
      course_structure: CourseStructure | null;
    };
  };

  const course = section.courses;
  const language = (course.language || 'ru') as Language;
  const lessonLabel = `${section.order_index}.${lesson.order_index}`;

  console.log(`Lesson: ${lesson.title} (${lessonLabel})`);
  console.log(`Course ID: ${course.id}`);
  console.log(`Language: ${language}`);

  // Build lesson spec from course_structure - must be complete LessonSpecificationV2
  const courseStructure = course.course_structure;
  let lessonSpec: LessonSpecificationV2 | null = null;

  if (courseStructure && courseStructure.sections) {
    for (const sec of courseStructure.sections) {
      const found = sec.lessons.find(l => l.lesson_title === lesson.title);
      if (found) {
        const objectives = found.lesson_objectives || [];
        const keyTopics = found.key_topics || [];

        lessonSpec = {
          lesson_id: lessonLabel, // Use label like "3.4"
          title: lesson.title,
          description: `Урок ${lessonLabel}: ${lesson.title}. ${objectives.slice(0, 2).join('. ')}`,
          difficulty_level: 'intermediate',
          estimated_duration_minutes: 30,

          // Metadata required for V2
          metadata: {
            target_audience: 'practitioner',
            tone: 'conversational-professional',
            compliance_level: 'standard',
            content_archetype: 'concept_explainer',
          },

          // Introduction blueprint - required for generator-content.ts
          intro_blueprint: {
            hook_strategy: 'challenge',
            hook_topic: objectives[0] || lesson.title,
            key_learning_objectives: objectives.join(', '),
          },

          // Learning objectives with Bloom levels
          learning_objectives: objectives.map((obj: string, i: number) => ({
            id: `LO-${lessonLabel}.${i + 1}`,
            objective: obj,
            bloom_level: 'apply' as const,
          })),

          // Sections with proper V2 structure
          sections: keyTopics.map((topic: string, i: number) => ({
            title: topic,
            content_archetype: 'concept_explainer' as const,
            rag_context_id: `rag_${lessonLabel}_sec${i + 1}`,
            key_points_to_cover: [topic], // Topic as key point to cover
            constraints: {
              min_words: 200,
              max_words: 500,
              required_elements: ['explanation', 'example'],
              prohibited_elements: [],
            },
          })),

          // Exercises - empty for now, will be generated
          exercises: [],

          // RAG context for the lesson
          rag_context: {
            course_id: course.id,
            lesson_id: lessonLabel,
            document_ids: [],
            min_relevance_score: 0.5,
          },
        };
        break;
      }
    }
  }

  if (!lessonSpec) {
    console.error(`Lesson spec not found for ${lesson.title} in course_structure`);
    process.exit(1);
  }

  console.log('Lesson spec created:');
  console.log(`  - Objectives: ${lessonSpec.learning_objectives.length}`);
  console.log(`  - Sections: ${lessonSpec.sections.length}`);
  console.log('Enqueuing job...');

  const jobData: LessonContentJobData = {
    organizationId: course.organization_id,
    courseId: course.id,
    userId: course.user_id,
    jobType: JobType.LESSON_CONTENT,
    createdAt: new Date().toISOString(),
    lessonSpec: lessonSpec,
    ragChunks: [],
    ragContextId: null,
    language,
    locale: validateLocale(language),
  };

  const job = await addJob(JobType.LESSON_CONTENT, jobData, {
    priority: 5,
    deduplication: {
      id: `stage6:${course.id}:${lessonLabel}:${Date.now()}`,
      ttl: 150000,
    },
  });

  console.log(`Job enqueued: ${job.id}`);
  console.log('Closing queue...');

  await closeQueue();
  console.log('Done! Monitor logs at: /home/me/code/mc2/logs/dev/worker-latest.log');
}

main().catch(console.error);
