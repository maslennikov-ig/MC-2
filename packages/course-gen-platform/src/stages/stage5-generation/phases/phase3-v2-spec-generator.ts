/**
 * Phase 3 V2 - LessonSpecificationV2 Generator with Semantic Scaffolding
 * @module stages/stage5-generation/phases/phase3-v2-spec-generator
 *
 * Generates V2 LessonSpecifications for Stage 6 lesson content generation.
 * Uses Semantic Scaffolding to provide structured blueprints that guide LLM
 * content generation while preserving creative flexibility within constraints.
 *
 * Key Features:
 * - Maps SectionBreakdown from analysis_result to LessonSpecificationV2[]
 * - Integrates document_relevance_mapping for RAG context
 * - Infers content archetypes, hook strategies, and depth levels
 * - Generates learning objectives with Bloom's Taxonomy levels
 * - Creates exercise specifications with rubric criteria
 *
 * @see specs/010-stages-456-pipeline/data-model.md
 * @see packages/shared-types/src/lesson-specification-v2.ts
 */

import type { GenerationState } from '../utils/generation-state';
import type {
  LessonSpecificationV2,
  SectionSpecV2,
  LessonRAGContextV2,
  LearningObjectiveV2,
  IntroBlueprintV2,
  SectionConstraintsV2,
  BloomLevelV2,
  HookStrategyV2,
  SectionDepthV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import type { SectionBreakdown, AnalysisResult } from '@megacampus/shared-types/analysis-result';
import { inferSemanticScaffolding } from '../utils/semantic-scaffolding';
import { buildFallbackSearchQueries } from '../utils/rag-fallback-queries';
import logger from '@/shared/logger';
import {
  V2_SPEC_DEFAULTS,
  BLOOM_VERB_MAP,
  validateKeyTopicsAlignment,
} from './phase3-v2-spec-generator/constants';
import { generateExerciseSpecs } from './phase3-v2-spec-generator/exercise-helpers';
import {
  buildLessonMetadata,
  estimateLessonDuration,
  generateLessonTitle,
  generateLessonDescription,
  distributeLearningObjectives,
} from './phase3-v2-spec-generator/lesson-helpers';

export { V2_SPEC_DEFAULTS, validateKeyTopicsAlignment } from './phase3-v2-spec-generator/constants';

// ============================================================================
// V2 LESSON SPEC GENERATOR CLASS
// ============================================================================

/**
 * V2LessonSpecGenerator - Generates LessonSpecificationV2 from GenerationState
 *
 * This class maps Stage 4 analysis results to V2 lesson specifications that
 * include semantic scaffolding for Stage 6 content generation.
 *
 * @example
 * ```typescript
 * const generator = new V2LessonSpecGenerator();
 * const specs = await generator.generateV2Specs(state);
 * // Returns: LessonSpecificationV2[] for all lessons in the course
 * ```
 */
export class V2LessonSpecGenerator {
  /**
   * Generate V2 LessonSpecifications for all sections in the course
   *
   * Processes each section breakdown from the analysis result and generates
   * the corresponding lesson specifications with semantic scaffolding.
   *
   * @param state - Current generation state with input containing analysis_result
   * @returns Array of LessonSpecificationV2 for all lessons
   */
  generateV2Specs(state: GenerationState): LessonSpecificationV2[] {
    const startTime = Date.now();
    const allSpecs: LessonSpecificationV2[] = [];

    // Validate input
    if (!state.input.analysis_result) {
      logger.error(
        { courseId: state.input.course_id },
        '[V2SpecGenerator] Cannot generate V2 specs: analysis_result is null'
      );
      throw new Error('Cannot generate V2 specs: analysis_result is required');
    }

    const analysisResult = state.input.analysis_result;
    const courseId = state.input.course_id;
    const sectionsBreakdown = analysisResult.recommended_structure.sections_breakdown;

    logger.info(
      {
        courseId,
        totalSections: sectionsBreakdown.length,
      },
      '[V2SpecGenerator] Starting V2 lesson specification generation'
    );

    // Process each section
    for (let sectionIndex = 0; sectionIndex < sectionsBreakdown.length; sectionIndex++) {
      const section = sectionsBreakdown[sectionIndex];

      try {
        const sectionSpecs = this.generateSectionSpecs(
          section,
          sectionIndex,
          analysisResult,
          courseId
        );
        allSpecs.push(...sectionSpecs);

        logger.debug(
          {
            courseId,
            sectionIndex,
            sectionArea: section.area,
            lessonsGenerated: sectionSpecs.length,
          },
          '[V2SpecGenerator] Section specs generated'
        );
      } catch (error) {
        logger.error(
          {
            courseId,
            sectionIndex,
            sectionArea: section.area,
            error: error instanceof Error ? error.message : String(error),
          },
          '[V2SpecGenerator] Failed to generate specs for section'
        );
        throw error;
      }
    }

    const duration = Date.now() - startTime;

    logger.info(
      {
        courseId,
        totalLessons: allSpecs.length,
        totalSections: sectionsBreakdown.length,
        durationMs: duration,
      },
      '[V2SpecGenerator] V2 lesson specification generation complete'
    );

    return allSpecs;
  }

  /**
   * Generate lesson specifications for a single section
   *
   * Creates one LessonSpecificationV2 per estimated lesson in the section.
   * Each lesson includes semantic scaffolding (archetype, hook, depth) and
   * RAG context from document_relevance_mapping.
   *
   * @param section - Section breakdown from analysis result
   * @param sectionIndex - Zero-based section index
   * @param analysisResult - Full analysis result for context
   * @param courseId - Course UUID for logging
   * @returns Array of LessonSpecificationV2 for this section
   */
  generateSectionSpecs(
    section: SectionBreakdown,
    sectionIndex: number,
    analysisResult: AnalysisResult,
    courseId: string
  ): LessonSpecificationV2[] {
    const specs: LessonSpecificationV2[] = [];

    // Determine section ID (1-indexed)
    const sectionId = section.section_id || String(sectionIndex + 1);

    // Determine number of lessons
    const lessonCount = Math.min(
      Math.max(
        section.estimated_lessons || V2_SPEC_DEFAULTS.DEFAULT_LESSONS_PER_SECTION,
        V2_SPEC_DEFAULTS.MIN_LESSONS_PER_SECTION
      ),
      V2_SPEC_DEFAULTS.MAX_LESSONS_PER_SECTION
    );

    // Infer semantic scaffolding for this section
    const scaffolding = inferSemanticScaffolding(section, analysisResult);

    // Validate key_topics/learning_objectives alignment
    const alignmentCheck = validateKeyTopicsAlignment(section);
    if (!alignmentCheck.passed) {
      logger.warn(
        {
          courseId,
          sectionIndex,
          sectionArea: section.area,
          coverage: alignmentCheck.coverage,
          warningMessage: alignmentCheck.warningMessage,
        },
        '[V2SpecGenerator] Key topics / learning objectives alignment warning'
      );
    }

    // Build RAG context from document_relevance_mapping
    const ragContext = this.buildRAGContext(sectionId, analysisResult);

    // Generate specs for each lesson in this section
    for (let lessonIndex = 0; lessonIndex < lessonCount; lessonIndex++) {
      const lessonId = `${sectionId}.${lessonIndex + 1}`;

      // Distribute learning objectives across lessons
      const lessonObjectives = distributeLearningObjectives(
        section.learning_objectives || [],
        lessonIndex,
        lessonCount
      );

      // Map learning objectives to V2 format
      const learningObjectivesV2 = this.mapLearningObjectives(
        lessonObjectives,
        sectionId,
        lessonIndex + 1
      );

      // Build introduction blueprint
      const introBlueprint = this.buildIntroBlueprintV2(
        section,
        scaffolding.hookStrategy,
        learningObjectivesV2
      );

      // Build section specifications from key_topics
      const sectionSpecs = this.buildSectionSpecs(
        section,
        sectionId,
        analysisResult,
        scaffolding.contentArchetype,
        scaffolding.depth
      );

      // Generate exercise specifications
      const exercises = generateExerciseSpecs(section, learningObjectivesV2, analysisResult);

      // Build metadata
      const metadata = buildLessonMetadata(
        scaffolding.targetAudience,
        scaffolding.contentArchetype,
        analysisResult
      );

      // Estimate lesson duration
      const estimatedDuration = estimateLessonDuration(section, learningObjectivesV2.length);

      // Determine difficulty level
      const difficultyLevel = section.difficulty || 'intermediate';

      // Build the complete lesson specification
      const lessonSpec: LessonSpecificationV2 = {
        lesson_id: lessonId,
        title: generateLessonTitle(section.area, lessonIndex + 1, lessonCount),
        description: generateLessonDescription(
          section,
          lessonIndex + 1,
          lessonCount,
          learningObjectivesV2
        ),
        metadata,
        learning_objectives: learningObjectivesV2,
        intro_blueprint: introBlueprint,
        sections: sectionSpecs,
        exercises,
        rag_context: ragContext,
        estimated_duration_minutes: estimatedDuration,
        difficulty_level: difficultyLevel,
      };

      specs.push(lessonSpec);

      logger.debug(
        {
          courseId,
          lessonId,
          objectivesCount: learningObjectivesV2.length,
          sectionsCount: sectionSpecs.length,
          exercisesCount: exercises.length,
        },
        '[V2SpecGenerator] Lesson spec created'
      );
    }

    return specs;
  }

  /**
   * Build LessonRAGContextV2 from document_relevance_mapping
   *
   * Extracts RAG planning data for the section and formats it for
   * the V2 lesson specification schema.
   *
   * @param sectionId - Section identifier
   * @param analysisResult - Full analysis result containing document_relevance_mapping
   * @returns RAG context specification for the lesson
   */
  private buildRAGContext(sectionId: string, analysisResult: AnalysisResult): LessonRAGContextV2 {
    const ragPlan = analysisResult.document_relevance_mapping?.[sectionId];

    // Build search queries - use search_queries or fallback to key_search_terms (legacy)
    const searchQueries = ragPlan?.search_queries ||
      ragPlan?.key_search_terms || [
        `${analysisResult.topic_analysis.determined_topic} section ${sectionId}`,
      ];

    // Determine expected chunks based on confidence
    const expectedChunks =
      ragPlan?.confidence === 'high'
        ? V2_SPEC_DEFAULTS.DEFAULT_RAG_CHUNKS_HIGH
        : V2_SPEC_DEFAULTS.DEFAULT_RAG_CHUNKS_MEDIUM;

    // Build primary documents list
    const primaryDocuments = ragPlan?.primary_documents || [];

    // Empty array = search all course documents (do not use 'default' sentinel)
    const finalPrimaryDocs = primaryDocuments.length > 0 ? primaryDocuments : [];

    // Use section-specific topics for better search queries
    const sectionBreakdown = analysisResult.recommended_structure?.sections_breakdown?.find(
      s => s.section_id === sectionId
    );
    const fallbackQueries = buildFallbackSearchQueries(
      sectionBreakdown,
      analysisResult.topic_analysis.determined_topic,
      sectionId
    );

    const finalSearchQueries =
      searchQueries.length > 0 && searchQueries[0].length >= 3 ? searchQueries : fallbackQueries;

    return {
      primary_documents: finalPrimaryDocs,
      search_queries: finalSearchQueries,
      expected_chunks: expectedChunks,
    };
  }

  /**
   * Map section learning objectives to V2 format with Bloom's levels
   *
   * Parses objective strings to extract action verbs and determine
   * the appropriate Bloom's Taxonomy level.
   *
   * @param objectives - Array of objective strings
   * @param sectionId - Section identifier for ID generation
   * @param lessonIndex - Lesson number within section
   * @returns Array of V2 learning objectives with Bloom's levels
   */
  private mapLearningObjectives(
    objectives: string[],
    sectionId: string,
    lessonIndex: number
  ): LearningObjectiveV2[] {
    return objectives.map((objective, index) => {
      const id = `LO-${sectionId}.${lessonIndex}.${index + 1}`;
      const bloomLevel = this.inferBloomLevel(objective);

      return {
        id,
        objective: objective.length >= 10 ? objective : `Understand ${objective}`,
        bloom_level: bloomLevel,
      };
    });
  }

  /**
   * Infer Bloom's Taxonomy level from an objective string
   *
   * Extracts the first word (action verb) and maps it to a Bloom's level.
   * Falls back to 'understand' if no match is found.
   *
   * @param objective - Learning objective string
   * @returns Bloom's Taxonomy level
   */
  private inferBloomLevel(objective: string): BloomLevelV2 {
    const normalizedObjective = objective.toLowerCase().trim();

    // Check each verb in the map
    for (const [verb, level] of Object.entries(BLOOM_VERB_MAP)) {
      if (normalizedObjective.startsWith(verb)) {
        return level;
      }
    }

    // Check if any verb appears in the objective (not just at start)
    for (const [verb, level] of Object.entries(BLOOM_VERB_MAP)) {
      if (normalizedObjective.includes(verb)) {
        return level;
      }
    }

    // Default to understand
    return 'understand';
  }

  /**
   * Build introduction blueprint from section data
   *
   * Creates a structured blueprint for the lesson introduction based on
   * the inferred hook strategy and learning objectives.
   *
   * @param section - Section breakdown
   * @param hookStrategy - Inferred hook strategy
   * @param objectives - V2 learning objectives
   * @returns Introduction blueprint for the lesson
   */
  private buildIntroBlueprintV2(
    section: SectionBreakdown,
    hookStrategy: HookStrategyV2,
    objectives: LearningObjectiveV2[]
  ): IntroBlueprintV2 {
    // Generate hook topic based on strategy
    const hookTopic = this.generateHookTopic(section, hookStrategy);

    // Format key learning objectives as comma-separated string
    const keyObjectives = objectives
      .slice(0, 3) // Take top 3 objectives
      .map(obj => obj.objective)
      .join(', ');

    return {
      hook_strategy: hookStrategy,
      hook_topic: hookTopic,
      key_learning_objectives:
        keyObjectives.length >= 10 ? keyObjectives : `Master the fundamentals of ${section.area}`,
    };
  }

  /**
   * Generate hook topic based on strategy and section
   *
   * @param section - Section breakdown
   * @param strategy - Hook strategy
   * @returns Topic string for the hook
   */
  private generateHookTopic(section: SectionBreakdown, strategy: HookStrategyV2): string {
    const topics = section.key_topics || [];
    const mainTopic = topics[0] || section.area;

    switch (strategy) {
      case 'analogy':
        return `Relating ${mainTopic} to familiar concepts`;
      case 'statistic':
        return `Key metrics and data about ${mainTopic}`;
      case 'challenge':
        return `Common challenges when learning ${mainTopic}`;
      case 'question':
      default:
        return `Understanding the importance of ${mainTopic}`;
    }
  }

  /**
   * Build section specifications from key_topics
   *
   * Creates SectionSpecV2 entries for each key topic in the section,
   * with appropriate content archetypes and constraints.
   *
   * @param section - Section breakdown
   * @param sectionId - Section identifier for RAG context reference
   * @param analysisResult - Full analysis result
   * @param contentArchetype - Default content archetype for sections
   * @param depth - Default depth level
   * @returns Array of V2 section specifications
   */
  private buildSectionSpecs(
    section: SectionBreakdown,
    sectionId: string,
    analysisResult: AnalysisResult,
    contentArchetype: 'code_tutorial' | 'concept_explainer' | 'case_study' | 'legal_warning',
    depth: SectionDepthV2
  ): SectionSpecV2[] {
    const keyTopics = section.key_topics || [];
    const specs: SectionSpecV2[] = [];

    // Build main content sections from key topics
    if (keyTopics.length === 0) {
      specs.push({
        title: section.area,
        content_archetype: contentArchetype,
        rag_context_id: sectionId,
        constraints: this.buildSectionConstraints(depth, analysisResult),
        key_points_to_cover: [`Understand the core concepts of ${section.area}`],
      });
    } else {
      for (let index = 0; index < keyTopics.length; index++) {
        const topic = keyTopics[index];
        const sectionArchetype =
          index === 0 ? contentArchetype : this.inferTopicArchetype(topic, contentArchetype);

        specs.push({
          title: topic,
          content_archetype: sectionArchetype,
          rag_context_id: sectionId,
          constraints: this.buildSectionConstraints(depth, analysisResult),
          key_points_to_cover: this.generateKeyPoints(topic, section.learning_objectives || []),
        });
      }
    }

    return specs;
  }

  /**
   * Infer archetype for a specific topic
   *
   * @param topic - Topic string
   * @param defaultArchetype - Fallback archetype
   * @returns Appropriate content archetype
   */
  private inferTopicArchetype(
    topic: string,
    defaultArchetype: 'code_tutorial' | 'concept_explainer' | 'case_study' | 'legal_warning'
  ): 'code_tutorial' | 'concept_explainer' | 'case_study' | 'legal_warning' {
    const normalizedTopic = topic.toLowerCase();

    if (normalizedTopic.includes('example') || normalizedTopic.includes('case')) {
      return 'case_study';
    }
    if (normalizedTopic.includes('code') || normalizedTopic.includes('implement')) {
      return 'code_tutorial';
    }
    if (normalizedTopic.includes('legal') || normalizedTopic.includes('compliance')) {
      return 'legal_warning';
    }

    return defaultArchetype;
  }

  /**
   * Build section constraints based on depth and analysis
   *
   * @param depth - Section depth level
   * @param analysisResult - Full analysis for jargon terms
   * @returns Section constraints specification
   */
  private buildSectionConstraints(
    depth: SectionDepthV2,
    analysisResult: AnalysisResult
  ): SectionConstraintsV2 {
    const avoidJargon = analysisResult.generation_guidance?.avoid_jargon || [];

    return {
      depth,
      required_keywords: [],
      prohibited_terms: avoidJargon,
    };
  }

  /**
   * Generate key points to cover for a topic
   *
   * @param topic - Topic string
   * @param objectives - Learning objectives for context
   * @returns Array of key points
   */
  private generateKeyPoints(topic: string, objectives: string[]): string[] {
    const points: string[] = [];

    // Add topic-specific point
    points.push(`Define and explain ${topic}`);

    // Add related objective if available
    const relatedObjective = objectives.find(obj =>
      obj.toLowerCase().includes(topic.toLowerCase().split(' ')[0])
    );
    if (relatedObjective) {
      points.push(relatedObjective);
    } else if (objectives.length > 0) {
      points.push(objectives[0]);
    }

    // Ensure at least one point meets minimum length
    if (points.length === 0 || points.every(p => p.length < 5)) {
      points.push(`Understand the fundamentals and applications of ${topic}`);
    }

    return points.filter(p => p.length >= 5);
  }
}
