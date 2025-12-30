import type { Section, GenerationJobInput, Lesson } from '@megacampus/shared-types';
import type {
  LessonSpecificationV2,
  BloomLevelV2,
  ExerciseTypeV2,
  ExerciseDifficultyV2,
  LessonRAGContextV2,
  LessonContext,
  AdjacentLessonContext,
} from '@megacampus/shared-types/lesson-specification-v2';
import logger from '@/shared/logger';
import { inferSemanticScaffolding } from '../semantic-scaffolding';

const BLOOM_KEYWORDS: Record<BloomLevelV2, string[]> = {
  create: ['create', 'design', 'build', 'develop', 'construct', 'compose', 'invent', 'formulate'],
  evaluate: ['evaluate', 'assess', 'judge', 'critique', 'justify', 'recommend', 'defend', 'argue'],
  analyze: ['analyze', 'compare', 'contrast', 'differentiate', 'examine', 'investigate', 'distinguish', 'organize'],
  apply: ['apply', 'implement', 'use', 'execute', 'solve', 'demonstrate', 'calculate', 'operate'],
  understand: ['explain', 'describe', 'summarize', 'interpret', 'classify', 'discuss', 'illustrate', 'paraphrase'],
  remember: [] 
};

function inferBloomLevel(objective: string): BloomLevelV2 {
  const text = objective.toLowerCase();
  
  const levels: BloomLevelV2[] = ['create', 'evaluate', 'analyze', 'apply', 'understand'];
  
  for (const level of levels) {
    if (BLOOM_KEYWORDS[level].some(keyword => text.includes(keyword))) {
      return level;
    }
  }

  return 'remember';
}

function mapExerciseType(type: string): ExerciseTypeV2 {
  const t = (type || '').toLowerCase();

  if (t.includes('code') || t.includes('coding') || t.includes('programming') || t.includes('implement')) return 'coding';
  if (t.includes('debug') || t.includes('debugging') || t.includes('troubleshoot') || t.includes('fix')) return 'debugging';
  if (t.includes('design') || t.includes('architect') || t.includes('plan') || t.includes('blueprint')) return 'design';
  if (t.includes('case') || t.includes('study') || t.includes('scenario') || t.includes('real-world') || t.includes('practical')) return 'case_study';

  return 'conceptual';
}

function mapDifficulty(diff: string): ExerciseDifficultyV2 {
  const d = (diff || '').toLowerCase();

  if (d === 'beginner' || d === 'easy' || d === 'basic') return 'easy';
  if (d === 'advanced' || d === 'hard' || d === 'expert') return 'hard';

  return 'medium';
}

function buildRAGContext(
  sectionId: number,
  analysisResult: GenerationJobInput['analysis_result']
): LessonRAGContextV2 {
  const ragPlan = analysisResult?.document_relevance_mapping?.[String(sectionId)];

  if (!ragPlan) {
    return {
      primary_documents: ['default'],
      search_queries: ['course content'],
      expected_chunks: 7,
    };
  }

  return {
    primary_documents: ragPlan.primary_documents?.length > 0 ? ragPlan.primary_documents : ['default'],
    search_queries: ragPlan.search_queries?.length > 0 ? ragPlan.search_queries : (ragPlan.key_search_terms || ['course content']),
    expected_chunks: ragPlan.confidence === 'high' ? 10 : 7,
  };
}

/**
 * Build inter-lesson context for a specific lesson
 *
 * Provides information about:
 * - Previous lesson (if exists) with key concepts and summary
 * - Next lesson (if exists) with title and preview
 * - All concepts covered in previous lessons
 * - Terms already defined in previous lessons
 *
 * @param sectionIndex - Current section index (0-based)
 * @param lessonIndex - Current lesson index within section (0-based)
 * @param allSections - All sections with their lessons
 * @returns LessonContext or undefined if first lesson
 */
function buildLessonContext(
  sectionIndex: number,
  lessonIndex: number,
  allSections: Section[]
): LessonContext | undefined {
  // Helper to get lesson ID
  const getLessonId = (secIdx: number, lesIdx: number) => `${secIdx + 1}.${lesIdx + 1}`;

  // Collect all lessons in order with their section indices
  const allLessons: Array<{ lesson: Lesson; sectionIdx: number; lessonIdx: number }> = [];
  allSections.forEach((section, sIdx) => {
    (section.lessons || []).forEach((lesson, lIdx) => {
      allLessons.push({ lesson, sectionIdx: sIdx, lessonIdx: lIdx });
    });
  });

  // Find current lesson position in the flat list
  const currentFlatIndex = allLessons.findIndex(
    l => l.sectionIdx === sectionIndex && l.lessonIdx === lessonIndex
  );

  if (currentFlatIndex === -1) {
    return undefined;
  }

  // Get previous lesson (if exists)
  let previousLesson: AdjacentLessonContext | null = null;
  if (currentFlatIndex > 0) {
    const prev = allLessons[currentFlatIndex - 1];
    previousLesson = {
      lesson_id: getLessonId(prev.sectionIdx, prev.lessonIdx),
      title: prev.lesson.lesson_title,
      key_concepts: (prev.lesson.key_topics || []).slice(0, 5),
      summary_preview: (prev.lesson.lesson_objectives || []).slice(0, 2).join('. ') || undefined,
    };
  }

  // Get next lesson (if exists)
  let nextLesson: Omit<AdjacentLessonContext, 'summary_preview'> | null = null;
  if (currentFlatIndex < allLessons.length - 1) {
    const next = allLessons[currentFlatIndex + 1];
    nextLesson = {
      lesson_id: getLessonId(next.sectionIdx, next.lessonIdx),
      title: next.lesson.lesson_title,
      key_concepts: (next.lesson.key_topics || []).slice(0, 3),
    };
  }

  // Accumulate concepts from all previous lessons (max 20)
  const conceptsAlreadyCovered: string[] = [];
  for (let i = 0; i < currentFlatIndex && conceptsAlreadyCovered.length < 20; i++) {
    const prevLesson = allLessons[i].lesson;
    const topics = prevLesson.key_topics || [];
    for (const topic of topics) {
      if (!conceptsAlreadyCovered.includes(topic) && conceptsAlreadyCovered.length < 20) {
        conceptsAlreadyCovered.push(topic);
      }
    }
  }

  // Extract terms from previous lesson only (for recency)
  const termsAlreadyDefined: string[] = [];
  if (currentFlatIndex > 0) {
    const prev = allLessons[currentFlatIndex - 1].lesson;
    termsAlreadyDefined.push(...(prev.key_topics || []).slice(0, 10));
  }

  // Only return context if there's something useful
  if (!previousLesson && !nextLesson && conceptsAlreadyCovered.length === 0) {
    return undefined;
  }

  return {
    previous_lesson: previousLesson,
    next_lesson: nextLesson,
    concepts_already_covered: conceptsAlreadyCovered,
    terms_already_defined: termsAlreadyDefined,
  };
}

/**
 * Convert a Section to LessonSpecificationV2[] output
 */
export function convertSectionToV2Specs(
  section: Section,
  sectionIndex: number,
  input: GenerationJobInput,
  allSections?: Section[]
): LessonSpecificationV2[] {
  const analysisResult = input.analysis_result;
  const sectionBreakdown = analysisResult?.recommended_structure?.sections_breakdown?.[sectionIndex];
  const scaffolding = sectionBreakdown ? inferSemanticScaffolding(sectionBreakdown, analysisResult) : null;

  logger.debug({
    msg: 'Converting section to V2 specs',
    sectionNumber: section.section_number,
    lessonCount: section.lessons?.length || 0,
    scaffolding: scaffolding ? {
      archetype: scaffolding.contentArchetype,
      hookStrategy: scaffolding.hookStrategy,
      depth: scaffolding.depth,
      targetAudience: scaffolding.targetAudience,
    } : 'unavailable',
  });

  return (section.lessons || []).map((lesson, lessonIndex) => {
    const lessonId = `${sectionIndex + 1}.${lessonIndex + 1}`;

    const learningObjectives = (lesson.lesson_objectives || []).map((obj, i) => ({
      id: `LO-${lessonId}.${i + 1}`,
      objective: obj,
      bloom_level: inferBloomLevel(obj),
    }));

    const sections = (lesson.key_topics || []).map((topic) => ({
      title: topic,
      content_archetype: (scaffolding?.contentArchetype || 'concept_explainer'),
      rag_context_id: `${sectionIndex + 1}`,
      constraints: {
        depth: scaffolding?.depth || 'detailed_analysis',
        required_keywords: [] as string[],
        prohibited_terms: [] as string[],
      },
      key_points_to_cover: [topic],
    }));

    const exercises = (lesson.practical_exercises || []).slice(0, 2).map((ex) => ({
      type: mapExerciseType(ex.exercise_type || ''),
      difficulty: mapDifficulty(lesson.difficulty_level || 'intermediate'),
      learning_objective_id: learningObjectives[0]?.id || `LO-${lessonId}.1`,
      structure_template: ex.exercise_description || ex.exercise_title || 'Complete the exercise as described.',
      rubric_criteria: [{ criteria: ['Completeness', 'Correctness'], weight: 100 }],
    }));

    const ragContext = buildRAGContext(sectionIndex + 1, analysisResult);
    const description = (lesson.lesson_objectives || []).slice(0, 2).join('. ') || `Learn about ${lesson.lesson_title}`;

    const lessonSpec: LessonSpecificationV2 = {
      lesson_id: lessonId,
      title: lesson.lesson_title,
      description: description.length >= 20 ? description : `This lesson covers ${lesson.lesson_title} through practical examples and exercises.`,
      metadata: {
        target_audience: scaffolding?.targetAudience || 'practitioner',
        tone: 'conversational-professional',
        compliance_level: 'standard',
        content_archetype: (scaffolding?.contentArchetype || 'concept_explainer'),
      },
      learning_objectives: learningObjectives,
      intro_blueprint: {
        hook_strategy: scaffolding?.hookStrategy || 'question',
        hook_topic: (lesson.key_topics || [])[0] || lesson.lesson_title,
        key_learning_objectives: (lesson.lesson_objectives || []).slice(0, 3).join(', ') || lesson.lesson_title,
      },
      sections: sections.length > 0 ? sections : [{
        title: lesson.lesson_title,
        content_archetype: (scaffolding?.contentArchetype || 'concept_explainer'),
        rag_context_id: `${sectionIndex + 1}`,
        constraints: {
          depth: scaffolding?.depth || 'detailed_analysis',
          required_keywords: [],
          prohibited_terms: [],
        },
        key_points_to_cover: lesson.lesson_objectives?.slice(0, 2) || [lesson.lesson_title],
      }],
      exercises: exercises,
      rag_context: ragContext,
      estimated_duration_minutes: lesson.estimated_duration_minutes || 15,
      difficulty_level: (lesson.difficulty_level || 'intermediate'),
    };

    // Build inter-lesson context if allSections is provided
    if (allSections) {
      const lessonContext = buildLessonContext(sectionIndex, lessonIndex, allSections);
      if (lessonContext) {
        lessonSpec.lesson_context = lessonContext;
      }
    }

    return lessonSpec;
  });
}
