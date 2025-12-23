/**
 * Debug script for Stage 6 lesson generation
 *
 * Tests Stage 6 directly without BullMQ queue to isolate issues.
 * Uses real test data from the database.
 *
 * Usage:
 *   cd packages/course-gen-platform
 *   pnpm tsx tools/debug/debug-stage6-generation.ts
 */

import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

import { executeStage6, type Stage6Input } from '../../src/stages/stage6-lesson-content/orchestrator';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import type { LessonSpecificationV2, ContentArchetype, SectionDepthV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { retrieveLessonContext } from '../../src/stages/stage6-lesson-content/utils/lesson-rag-retriever';
import { resolveLessonUuid } from '../../src/shared/database/lesson-resolver';
import {
  inferTargetAudience,
  mapTone,
  inferBloomLevel,
  inferContentArchetype,
  inferHookStrategy,
  mapDepth,
} from '../../src/stages/stage5-generation/utils/semantic-scaffolding';
import type { SectionBreakdown } from '@megacampus/shared-types/analysis-schemas';

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_CONFIG = {
  courseId: '9762b2f3-1420-4a67-a662-81b882dc7b5a',
  organizationId: '9b98a7d5-27ea-4441-81dc-de79d488e5db',
  userId: 'ca704da8-5522-4a39-9691-23f36b85d0ce',
  // Test lesson "1.1" (swapped models: DeepSeek generation, Qwen judge)
  lessonLabel: '1.1',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create test section and lesson if they don't exist
 * Used by debug script to ensure test data is available
 */
async function ensureTestLesson(
  courseId: string,
  lessonLabel: string,
  lessonTitle: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const parts = lessonLabel.split('.');
  if (parts.length !== 2) return null;

  const sectionOrder = parseInt(parts[0], 10);
  const lessonOrder = parseInt(parts[1], 10);

  // Try to find existing section
  let { data: section } = await supabase
    .from('sections')
    .select('id')
    .eq('course_id', courseId)
    .eq('order_index', sectionOrder)
    .single();

  // Create section if missing
  if (!section) {
    console.log(`  Creating test section ${sectionOrder}...`);
    const { data: newSection, error: sectionError } = await supabase
      .from('sections')
      .insert({
        course_id: courseId,
        title: `Test Section ${sectionOrder}`,
        order_index: sectionOrder,
      })
      .select('id')
      .single();

    if (sectionError) {
      console.error(`  Failed to create section: ${sectionError.message}`);
      return null;
    }
    section = newSection;
  }

  // Try to find existing lesson
  let { data: lesson } = await supabase
    .from('lessons')
    .select('id')
    .eq('section_id', section.id)
    .eq('order_index', lessonOrder)
    .single();

  // Create lesson if missing
  if (!lesson) {
    console.log(`  Creating test lesson ${lessonLabel}...`);
    const { data: newLesson, error: lessonError } = await supabase
      .from('lessons')
      .insert({
        section_id: section.id,
        title: lessonTitle,
        order_index: lessonOrder,
        lesson_type: 'text', // Required enum: text, video, quiz, assignment, interactive
      })
      .select('id')
      .single();

    if (lessonError) {
      console.error(`  Failed to create lesson: ${lessonError.message}`);
      return null;
    }
    lesson = newLesson;
  }

  return lesson.id;
}

/**
 * Build sections array from key_topics (consistent with helpers.ts)
 */
function buildSectionsFromKeyTopics(
  keyTopics: string[],
  lessonTitle: string,
  contentArchetype: ContentArchetype = 'concept_explainer',
  depth: SectionDepthV2 = 'detailed_analysis'
): LessonSpecificationV2['sections'] {
  const sections: LessonSpecificationV2['sections'] = [];

  if (keyTopics.length === 0) {
    // No key_topics: use lesson title as the single content section
    sections.push({
      title: lessonTitle,
      content_archetype: contentArchetype,
      rag_context_id: 'default',
      constraints: {
        depth,
        required_keywords: [],
        prohibited_terms: [],
      },
      key_points_to_cover: [`Understand the core concepts of ${lessonTitle}`],
    });
  } else {
    // Create a section for each key_topic
    for (const topic of keyTopics) {
      sections.push({
        title: topic,
        content_archetype: contentArchetype,
        rag_context_id: 'default',
        constraints: {
          depth,
          required_keywords: [],
          prohibited_terms: [],
        },
        key_points_to_cover: [`Define and explain ${topic}`],
      });
    }
  }

  // Always add Conclusion section
  sections.push({
    title: 'Conclusion',
    content_archetype: contentArchetype,
    rag_context_id: 'default',
    constraints: { depth: 'summary', required_keywords: [], prohibited_terms: [] },
    key_points_to_cover: ['Key takeaways from this lesson', 'Next steps for learners'],
  });

  return sections;
}

/**
 * Build minimal LessonSpecificationV2 from course_structure
 *
 * Uses the same schema as buildMinimalLessonSpec in lesson-content.ts
 */
async function buildLessonSpec(
  courseId: string,
  lessonLabel: string
): Promise<LessonSpecificationV2 | null> {
  const supabase = getSupabaseAdmin();

  const { data: course, error } = await supabase
    .from('courses')
    .select('course_structure, title, difficulty, target_audience, language')
    .eq('id', courseId)
    .single();

  if (error || !course?.course_structure) {
    console.error('Failed to fetch course:', error?.message);
    return null;
  }

  const structure = course.course_structure as {
    sections: Array<{
      section_number: number;
      section_title: string;
      lessons: Array<{
        lesson_number: number;
        lesson_title: string;
        lesson_objectives: string[];
        key_topics: string[];
        practical_exercises?: Array<{
          exercise_type: string;
          exercise_title: string;
          exercise_description: string;
        }>;
        estimated_duration_minutes?: number;
        difficulty_level?: string;
      }>;
    }>;
  };

  const parts = lessonLabel.split('.');
  const sectionNum = parseInt(parts[0], 10);
  const lessonNum = parseInt(parts[1], 10);

  const section = structure.sections.find(s => s.section_number === sectionNum);
  if (!section) {
    console.error(`Section ${sectionNum} not found`);
    return null;
  }

  const lesson = section.lessons.find(l => l.lesson_number === lessonNum);
  if (!lesson) {
    console.error(`Lesson ${lessonNum} not found in section ${sectionNum}`);
    return null;
  }

  // Create minimal SectionBreakdown for inference
  const sectionBreakdown: SectionBreakdown = {
    area: lesson.lesson_title,
    estimated_lessons: 1,
    importance: 'important',
    learning_objectives: lesson.lesson_objectives || [],
    key_topics: lesson.key_topics || [],
    pedagogical_approach: '',
    difficulty_progression: 'flat',
    difficulty: (lesson.difficulty_level as 'beginner' | 'intermediate' | 'advanced') || 'intermediate',
  };

  // Infer metadata (no analysisResult available in debug tool, use defaults)
  const inferredContentArchetype = inferContentArchetype(sectionBreakdown);
  const inferredHookStrategy = inferHookStrategy(
    lesson.lesson_objectives || [],
    lesson.key_topics || []
  );
  const inferredTargetAudience = inferTargetAudience(null); // No analysis, use default
  const inferredTone = mapTone(undefined); // No analysis, use default
  const inferredComplianceLevel = inferredContentArchetype === 'legal_warning' ? 'strict' : 'standard';
  const inferredDepth = mapDepth(
    (lesson.difficulty_level as 'beginner' | 'intermediate' | 'advanced') || 'intermediate',
    'important'
  );

  // Build learning objectives with minimal structure
  const learningObjectives = (lesson.lesson_objectives || ['Complete this lesson']).map((text, idx) => ({
    id: `LO-${lessonLabel}-${idx + 1}`,
    objective: text.length >= 10 ? text : `Learn about ${lesson.lesson_title}`,
    bloom_level: inferBloomLevel(text),
  }));

  // Build exercises from practical_exercises in course_structure
  // Using ExerciseSpecV2 format from lesson-specification-v2.ts
  const exercises = (lesson.practical_exercises || []).map((ex, idx) => ({
    type: 'case_study' as const, // Map to valid ExerciseTypeV2
    difficulty: 'medium' as const,
    learning_objective_id: learningObjectives.length > 0 ? learningObjectives[idx % learningObjectives.length].id : `LO-${lessonLabel}-1`,
    structure_template: `${ex.exercise_title}: ${ex.exercise_description}`.slice(0, 1000),
    rubric_criteria: [
      { criterion: 'Completeness', weight: 50, description: 'All required elements are present' },
      { criterion: 'Accuracy', weight: 50, description: 'Information is correct and well-reasoned' },
    ],
  }));

  // If no exercises in course_structure, add a default one for testing
  if (exercises.length === 0) {
    exercises.push({
      type: 'conceptual' as const,
      difficulty: 'easy' as const,
      learning_objective_id: learningObjectives.length > 0 ? learningObjectives[0].id : `LO-${lessonLabel}-1`,
      structure_template: `Reflect on what you learned about ${lesson.lesson_title}. Describe the key concepts and how they apply to your work.`,
      rubric_criteria: [
        { criterion: 'Understanding', weight: 50, description: 'Demonstrates understanding of key concepts' },
        { criterion: 'Application', weight: 50, description: 'Shows ability to apply concepts' },
      ],
    });
  }

  // Build LessonSpecificationV2 using correct schema
  const spec: LessonSpecificationV2 = {
    lesson_id: lessonLabel,
    title: lesson.lesson_title,
    description: (lesson.lesson_objectives || [])[0] || `This lesson covers ${lesson.lesson_title}`,
    metadata: {
      target_audience: inferredTargetAudience,
      tone: inferredTone,
      compliance_level: inferredComplianceLevel,
      content_archetype: inferredContentArchetype,
    },
    learning_objectives: learningObjectives,
    intro_blueprint: {
      hook_strategy: inferredHookStrategy,
      hook_topic: lesson.lesson_title,
      key_learning_objectives: learningObjectives.map(lo => lo.objective).join(', '),
    },
    sections: buildSectionsFromKeyTopics(lesson.key_topics || [], lesson.lesson_title, inferredContentArchetype, inferredDepth),
    exercises,
    rag_context: {
      primary_documents: [],  // Empty = no document filter (use all indexed documents)
      search_queries: lesson.key_topics || [lesson.lesson_title],
      expected_chunks: 7,
    },
    estimated_duration_minutes: lesson.estimated_duration_minutes || 15,
    difficulty_level: (lesson.difficulty_level as 'beginner' | 'intermediate' | 'advanced') || 'intermediate',
  };

  return spec;
}

/**
 * Save lesson content to database
 */
async function saveLessonContent(
  courseId: string,
  lessonUuid: string,
  lessonLabel: string,
  content: unknown,
  metrics: { tokensUsed: number; modelUsed: string | null; qualityScore: number; durationMs: number }
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('lesson_contents')
    .insert({
      lesson_id: lessonUuid,
      course_id: courseId,
      content: JSON.parse(JSON.stringify(content)),
      metadata: {
        lessonLabel,
        tokensUsed: metrics.tokensUsed,
        modelUsed: metrics.modelUsed,
        qualityScore: metrics.qualityScore,
        durationMs: metrics.durationMs,
        generatedAt: new Date().toISOString(),
        source: 'debug-script',
      },
      status: 'completed',
      generation_attempt: 1,
    });

  if (error) {
    console.error('Failed to save lesson content:', error.message);
    return false;
  }

  return true;
}

// ============================================================================
// Main Debug Function
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Stage 6 Debug Script');
  console.log('='.repeat(60));
  console.log(`Course ID: ${TEST_CONFIG.courseId}`);
  console.log(`Lesson: ${TEST_CONFIG.lessonLabel}`);
  console.log('');

  // Step 1: Build lesson spec
  console.log('[1/4] Building lesson specification...');
  const lessonSpec = await buildLessonSpec(TEST_CONFIG.courseId, TEST_CONFIG.lessonLabel);
  if (!lessonSpec) {
    console.error('FAILED: Could not build lesson spec');
    process.exit(1);
  }
  console.log(`  Title: ${lessonSpec.title}`);
  console.log(`  Description: ${lessonSpec.description?.substring(0, 60)}...`);
  console.log(`  Content Archetype: ${lessonSpec.metadata.content_archetype}`);
  console.log(`  Learning Objectives: ${lessonSpec.learning_objectives.length}`);
  console.log(`  Sections: ${lessonSpec.sections.length}`);
  console.log(`  Exercises: ${lessonSpec.exercises.length}`);
  console.log('');

  // Step 2: Resolve lesson UUID (create test records if needed)
  console.log('[2/4] Resolving lesson UUID...');

  // First, ensure test lesson exists in database
  await ensureTestLesson(TEST_CONFIG.courseId, TEST_CONFIG.lessonLabel, lessonSpec.title);

  // Then resolve using shared resolver (with caching)
  const lessonUuid = await resolveLessonUuid(TEST_CONFIG.courseId, TEST_CONFIG.lessonLabel);

  if (!lessonUuid) {
    console.error('FAILED: Could not resolve lesson UUID');
    console.log('  Continuing without DB save...');
  } else {
    console.log(`  UUID: ${lessonUuid}`);
  }
  console.log('');

  // Step 3: Retrieve RAG context from Qdrant
  console.log('[3/5] Retrieving RAG context from Qdrant...');
  let ragChunks: Stage6Input['ragChunks'] = [];
  let ragContextId: string | undefined = undefined;

  try {
    const ragResult = await retrieveLessonContext({
      courseId: TEST_CONFIG.courseId,
      lessonSpec,
      targetChunks: 7,
      useCache: true,
    });

    ragChunks = ragResult.chunks;
    ragContextId = ragResult.cached ? `cached_${ragResult.lessonId}` : `fresh_${ragResult.lessonId}`;

    console.log(`  Retrieved: ${ragResult.chunks.length} chunks`);
    console.log(`  Queries used: ${ragResult.queriesUsed.length}`);
    console.log(`  Coverage score: ${(ragResult.coverageScore * 100).toFixed(0)}%`);
    console.log(`  Cached: ${ragResult.cached}`);
    console.log(`  Duration: ${ragResult.retrievalDurationMs}ms`);

    if (ragResult.chunks.length > 0) {
      console.log('  Top chunks:');
      ragResult.chunks.slice(0, 3).forEach((chunk, i) => {
        console.log(`    ${i + 1}. [${chunk.relevance_score.toFixed(2)}] ${chunk.document_name} - ${chunk.page_or_section?.substring(0, 50) || 'N/A'}`);
      });
    }
  } catch (ragError) {
    console.warn(`  RAG retrieval failed: ${ragError instanceof Error ? ragError.message : String(ragError)}`);
    console.log('  Continuing without RAG context...');
  }
  console.log('');

  // Step 4: Execute Stage 6
  console.log('[4/5] Executing Stage 6 generation...');
  console.log('  This may take 1-3 minutes...');
  const startTime = Date.now();

  const input: Stage6Input = {
    lessonSpec,
    courseId: TEST_CONFIG.courseId,
    language: 'ru', // Russian course
    ragChunks,
    ragContextId,
  };

  try {
    const result = await executeStage6(input);
    const durationMs = Date.now() - startTime;

    console.log('');
    console.log('  Generation Result:');
    console.log(`    Success: ${result.success}`);
    console.log(`    Duration: ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`    Tokens Used: ${result.metrics.tokensUsed}`);
    console.log(`    Model Used: ${result.metrics.modelUsed}`);
    console.log(`    Quality Score: ${result.metrics.qualityScore}`);
    console.log(`    Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log('');
      console.log('  Errors:');
      result.errors.forEach((err, i) => {
        console.log(`    ${i + 1}. ${err}`);
      });
    }

    if (result.lessonContent) {
      console.log('');
      console.log('  Content Preview:');
      console.log(`    Intro length: ${result.lessonContent.content.intro?.length || 0} chars`);
      console.log(`    Sections: ${result.lessonContent.content.sections.length}`);
      console.log(`    Examples: ${result.lessonContent.content.examples.length}`);
      console.log(`    Exercises: ${result.lessonContent.content.exercises.length}`);
    }
    console.log('');

    // Step 5: Save to database
    if (lessonUuid && result.lessonContent) {
      console.log('[5/5] Saving to database...');
      const saved = await saveLessonContent(
        TEST_CONFIG.courseId,
        lessonUuid,
        TEST_CONFIG.lessonLabel,
        result.lessonContent,
        { ...result.metrics, durationMs }
      );

      if (saved) {
        console.log('  SUCCESS: Lesson content saved to lesson_contents table');
      } else {
        console.log('  FAILED: Could not save to database');
      }
    } else {
      console.log('[5/5] Skipping database save (no UUID or no content)');
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('Debug complete!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('');
    console.error('EXCEPTION during generation:');
    console.error(error);
    process.exit(1);
  }
}

// Run
main().catch(console.error);
