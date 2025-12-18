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
  ExerciseSpecV2,
  LessonMetadataV2,
  SectionConstraintsV2,
  BloomLevelV2,
  HookStrategyV2,
  ExerciseTypeV2,
  ExerciseDifficultyV2,
  ContentToneV2,
  ComplianceLevelV2,
  TargetAudienceV2,
  SectionDepthV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import type {
  SectionBreakdown,
  AnalysisResult,
} from '@megacampus/shared-types/analysis-result';
import { inferSemanticScaffolding } from '../utils/semantic-scaffolding';
import logger from '@/shared/logger';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default configuration for V2 spec generation
 */
const V2_SPEC_DEFAULTS = {
  /** Default lessons per section when estimated_lessons is not specified */
  DEFAULT_LESSONS_PER_SECTION: 3,
  /** Minimum lessons per section */
  MIN_LESSONS_PER_SECTION: 1,
  /** Maximum lessons per section */
  MAX_LESSONS_PER_SECTION: 10,
  /** Default estimated duration per lesson in minutes */
  DEFAULT_LESSON_DURATION_MINUTES: 15,
  /** Default expected RAG chunks for high confidence */
  DEFAULT_RAG_CHUNKS_HIGH: 10,
  /** Default expected RAG chunks for medium confidence */
  DEFAULT_RAG_CHUNKS_MEDIUM: 7,
} as const;

/**
 * Bloom's Taxonomy action verb mapping for learning objectives
 * Maps common action verbs to their Bloom's level
 */
const BLOOM_VERB_MAP: Record<string, BloomLevelV2> = {
  // Remember level
  define: 'remember',
  list: 'remember',
  recall: 'remember',
  identify: 'remember',
  name: 'remember',
  state: 'remember',
  describe: 'remember',

  // Understand level
  explain: 'understand',
  summarize: 'understand',
  interpret: 'understand',
  classify: 'understand',
  compare: 'understand',
  contrast: 'understand',
  discuss: 'understand',

  // Apply level
  apply: 'apply',
  demonstrate: 'apply',
  implement: 'apply',
  use: 'apply',
  execute: 'apply',
  solve: 'apply',
  calculate: 'apply',

  // Analyze level
  analyze: 'analyze',
  differentiate: 'analyze',
  examine: 'analyze',
  investigate: 'analyze',
  distinguish: 'analyze',
  organize: 'analyze',

  // Evaluate level
  evaluate: 'evaluate',
  assess: 'evaluate',
  critique: 'evaluate',
  judge: 'evaluate',
  justify: 'evaluate',
  recommend: 'evaluate',

  // Create level
  create: 'create',
  design: 'create',
  develop: 'create',
  construct: 'create',
  produce: 'create',
  compose: 'create',
  build: 'create',
};

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
  async generateV2Specs(state: GenerationState): Promise<LessonSpecificationV2[]> {
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
        const sectionSpecs = await this.generateSectionSpecs(
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
  async generateSectionSpecs(
    section: SectionBreakdown,
    sectionIndex: number,
    analysisResult: AnalysisResult,
    courseId: string
  ): Promise<LessonSpecificationV2[]> {
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

    // Build RAG context from document_relevance_mapping
    const ragContext = this.buildRAGContext(sectionId, analysisResult);

    // Generate specs for each lesson in this section
    for (let lessonIndex = 0; lessonIndex < lessonCount; lessonIndex++) {
      const lessonId = `${sectionId}.${lessonIndex + 1}`;

      // Distribute learning objectives across lessons
      const lessonObjectives = this.distributeLearningObjectives(
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
      const exercises = this.generateExerciseSpecs(
        section,
        learningObjectivesV2,
        analysisResult
      );

      // Build metadata
      const metadata = this.buildLessonMetadata(
        scaffolding.targetAudience,
        scaffolding.contentArchetype,
        analysisResult
      );

      // Estimate lesson duration
      const estimatedDuration = this.estimateLessonDuration(
        section,
        learningObjectivesV2.length
      );

      // Determine difficulty level
      const difficultyLevel = section.difficulty || 'intermediate';

      // Build the complete lesson specification
      const lessonSpec: LessonSpecificationV2 = {
        lesson_id: lessonId,
        title: this.generateLessonTitle(section.area, lessonIndex + 1, lessonCount),
        description: this.generateLessonDescription(
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
  private buildRAGContext(
    sectionId: string,
    analysisResult: AnalysisResult
  ): LessonRAGContextV2 {
    const ragPlan = analysisResult.document_relevance_mapping?.[sectionId];

    // Build search queries - use search_queries or fallback to key_search_terms (legacy)
    const searchQueries = ragPlan?.search_queries ||
      ragPlan?.key_search_terms ||
      [`${analysisResult.topic_analysis.determined_topic} section ${sectionId}`];

    // Determine expected chunks based on confidence
    const expectedChunks = ragPlan?.confidence === 'high'
      ? V2_SPEC_DEFAULTS.DEFAULT_RAG_CHUNKS_HIGH
      : V2_SPEC_DEFAULTS.DEFAULT_RAG_CHUNKS_MEDIUM;

    // Build primary documents list
    const primaryDocuments = ragPlan?.primary_documents || [];

    // Ensure we have at least one primary document or fallback
    const finalPrimaryDocs = primaryDocuments.length > 0
      ? primaryDocuments
      : ['default-course-document'];

    // Ensure we have at least one search query
    const finalSearchQueries = searchQueries.length > 0 && searchQueries[0].length >= 3
      ? searchQueries
      : [`${analysisResult.topic_analysis.determined_topic} fundamentals`];

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
      .map((obj) => obj.objective)
      .join(', ');

    return {
      hook_strategy: hookStrategy,
      hook_topic: hookTopic,
      key_learning_objectives: keyObjectives.length >= 10
        ? keyObjectives
        : `Master the fundamentals of ${section.area}`,
    };
  }

  /**
   * Generate hook topic based on strategy and section
   *
   * @param section - Section breakdown
   * @param strategy - Hook strategy
   * @returns Topic string for the hook
   */
  private generateHookTopic(
    section: SectionBreakdown,
    strategy: HookStrategyV2
  ): string {
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
        const sectionArchetype = index === 0 ? contentArchetype :
          this.inferTopicArchetype(topic, contentArchetype);

        specs.push({
          title: topic,
          content_archetype: sectionArchetype,
          rag_context_id: sectionId,
          constraints: this.buildSectionConstraints(depth, analysisResult),
          key_points_to_cover: this.generateKeyPoints(topic, section.learning_objectives || []),
        });
      }
    }

    // Always add Conclusion section (required by heuristic filter)
    specs.push({
      title: 'Conclusion',
      content_archetype: 'concept_explainer',
      rag_context_id: sectionId,
      constraints: { depth: 'summary', required_keywords: [], prohibited_terms: [] },
      key_points_to_cover: ['Key takeaways from this lesson', 'Next steps for learners'],
    });

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
    const relatedObjective = objectives.find((obj) =>
      obj.toLowerCase().includes(topic.toLowerCase().split(' ')[0])
    );
    if (relatedObjective) {
      points.push(relatedObjective);
    } else if (objectives.length > 0) {
      points.push(objectives[0]);
    }

    // Ensure at least one point meets minimum length
    if (points.length === 0 || points.every((p) => p.length < 5)) {
      points.push(`Understand the fundamentals and applications of ${topic}`);
    }

    return points.filter((p) => p.length >= 5);
  }

  /**
   * Generate exercise specifications with rubric criteria
   *
   * Creates 1-2 exercises per lesson linked to learning objectives.
   * Exercises include type, difficulty, and weighted rubric criteria.
   *
   * @param section - Section breakdown for context
   * @param objectives - V2 learning objectives to link
   * @param analysisResult - Full analysis for exercise type hints
   * @returns Array of V2 exercise specifications
   */
  private generateExerciseSpecs(
    section: SectionBreakdown,
    objectives: LearningObjectiveV2[],
    analysisResult: AnalysisResult
  ): ExerciseSpecV2[] {
    if (objectives.length === 0) {
      return [];
    }

    const exercises: ExerciseSpecV2[] = [];
    const exerciseTypes = analysisResult.generation_guidance?.exercise_types || [];

    // Generate 1-2 exercises based on objectives
    const numExercises = Math.min(2, objectives.length);

    for (let i = 0; i < numExercises; i++) {
      const objective = objectives[i];
      const exerciseType = this.mapExerciseType(
        exerciseTypes[i % exerciseTypes.length],
        objective.bloom_level
      );
      const difficulty = this.inferExerciseDifficulty(objective.bloom_level, i);

      exercises.push({
        type: exerciseType,
        difficulty,
        learning_objective_id: objective.id,
        structure_template: this.generateExerciseTemplate(
          exerciseType,
          section.area,
          objective.objective
        ),
        rubric_criteria: this.generateRubricCriteria(exerciseType, objective.bloom_level),
      });
    }

    return exercises;
  }

  /**
   * Map analysis exercise type to V2 exercise type
   *
   * @param analysisType - Exercise type from analysis
   * @param bloomLevel - Bloom's level for fallback selection
   * @returns V2 exercise type
   */
  private mapExerciseType(
    analysisType: string | undefined,
    bloomLevel: BloomLevelV2
  ): ExerciseTypeV2 {
    // Direct mapping from analysis types
    if (analysisType) {
      const typeMap: Record<string, ExerciseTypeV2> = {
        coding: 'coding',
        debugging: 'debugging',
        refactoring: 'coding',
        analysis: 'conceptual',
        derivation: 'conceptual',
        interpretation: 'case_study',
      };
      if (typeMap[analysisType]) {
        return typeMap[analysisType];
      }
    }

    // Infer from Bloom's level
    const bloomTypeMap: Record<BloomLevelV2, ExerciseTypeV2> = {
      remember: 'conceptual',
      understand: 'conceptual',
      apply: 'coding',
      analyze: 'case_study',
      evaluate: 'design',
      create: 'design',
    };

    return bloomTypeMap[bloomLevel];
  }

  /**
   * Infer exercise difficulty from Bloom's level and position
   *
   * @param bloomLevel - Bloom's Taxonomy level
   * @param position - Exercise position (0 = first, 1 = second)
   * @returns Exercise difficulty
   */
  private inferExerciseDifficulty(
    bloomLevel: BloomLevelV2,
    position: number
  ): ExerciseDifficultyV2 {
    // Higher Bloom's levels = harder exercises
    const difficultyMap: Record<BloomLevelV2, ExerciseDifficultyV2> = {
      remember: 'easy',
      understand: 'easy',
      apply: 'medium',
      analyze: 'medium',
      evaluate: 'hard',
      create: 'hard',
    };

    // Second exercise is slightly harder
    const baseDifficulty = difficultyMap[bloomLevel];
    if (position > 0 && baseDifficulty === 'easy') {
      return 'medium';
    }
    if (position > 0 && baseDifficulty === 'medium') {
      return 'hard';
    }

    return baseDifficulty;
  }

  /**
   * Generate exercise structure template
   *
   * @param exerciseType - Type of exercise
   * @param area - Section area for context
   * @param objective - Learning objective
   * @returns Structure template string
   */
  private generateExerciseTemplate(
    exerciseType: ExerciseTypeV2,
    area: string,
    objective: string
  ): string {
    const templates: Record<ExerciseTypeV2, string> = {
      coding: `Given a [specific scenario related to ${area}], implement a solution that [requirement based on: ${objective}]. Your code should [acceptance criteria].`,
      conceptual: `Based on your understanding of ${area}, explain [key concept] and describe how it relates to [application]. Your answer should demonstrate [criterion based on: ${objective}].`,
      case_study: `Analyze the following case study about ${area}: [scenario description]. Identify the key challenges and propose solutions that address [requirement based on: ${objective}].`,
      debugging: `The following code related to ${area} contains errors: [code snippet]. Identify and fix the bugs to make it correctly [expected behavior based on: ${objective}].`,
      design: `Design a solution for ${area} that addresses [problem statement]. Your design should include [components] and meet [requirements based on: ${objective}].`,
    };

    return templates[exerciseType];
  }

  /**
   * Generate rubric criteria for an exercise
   *
   * Creates weighted criteria that sum to 100.
   *
   * @param exerciseType - Type of exercise
   * @param bloomLevel - Bloom's level for criteria focus
   * @returns Array of rubric criteria
   */
  private generateRubricCriteria(
    exerciseType: ExerciseTypeV2,
    _bloomLevel: BloomLevelV2
  ): ExerciseSpecV2['rubric_criteria'] {
    // Define criteria based on exercise type
    const criteriaByType: Record<ExerciseTypeV2, { criteria: string[]; weight: number }[]> = {
      coding: [
        { criteria: ['Code correctness and functionality'], weight: 40 },
        { criteria: ['Code quality and readability'], weight: 30 },
        { criteria: ['Handling edge cases'], weight: 30 },
      ],
      conceptual: [
        { criteria: ['Accuracy of explanation'], weight: 40 },
        { criteria: ['Depth of understanding demonstrated'], weight: 35 },
        { criteria: ['Clarity and organization'], weight: 25 },
      ],
      case_study: [
        { criteria: ['Analysis quality and insights'], weight: 40 },
        { criteria: ['Proposed solutions relevance'], weight: 35 },
        { criteria: ['Supporting evidence and reasoning'], weight: 25 },
      ],
      debugging: [
        { criteria: ['Bug identification accuracy'], weight: 40 },
        { criteria: ['Fix correctness'], weight: 40 },
        { criteria: ['Explanation of root cause'], weight: 20 },
      ],
      design: [
        { criteria: ['Design completeness and feasibility'], weight: 40 },
        { criteria: ['Meeting requirements'], weight: 35 },
        { criteria: ['Innovation and best practices'], weight: 25 },
      ],
    };

    return criteriaByType[exerciseType];
  }

  /**
   * Build lesson metadata
   *
   * @param targetAudience - Target audience type
   * @param contentArchetype - Content archetype for the lesson
   * @param analysisResult - Full analysis for tone inference
   * @returns Lesson metadata
   */
  private buildLessonMetadata(
    targetAudience: TargetAudienceV2,
    contentArchetype: 'code_tutorial' | 'concept_explainer' | 'case_study' | 'legal_warning',
    analysisResult: AnalysisResult
  ): LessonMetadataV2 {
    // Infer tone from analysis
    const analysisTone = analysisResult.generation_guidance?.tone;
    const tone: ContentToneV2 = analysisTone === 'formal academic'
      ? 'formal'
      : 'conversational-professional';

    // Legal content requires strict compliance
    const complianceLevel: ComplianceLevelV2 = contentArchetype === 'legal_warning'
      ? 'strict'
      : 'standard';

    return {
      target_audience: targetAudience,
      tone,
      compliance_level: complianceLevel,
      content_archetype: contentArchetype,
    };
  }

  /**
   * Estimate lesson duration based on section data
   *
   * @param section - Section breakdown
   * @param objectiveCount - Number of learning objectives
   * @returns Estimated duration in minutes (3-45)
   */
  private estimateLessonDuration(
    section: SectionBreakdown,
    objectiveCount: number
  ): number {
    // Base calculation from section estimated_duration_hours
    if (section.estimated_duration_hours) {
      const sectionMinutes = section.estimated_duration_hours * 60;
      const lessonCount = section.estimated_lessons || V2_SPEC_DEFAULTS.DEFAULT_LESSONS_PER_SECTION;
      const baseMinutes = Math.floor(sectionMinutes / lessonCount);
      return Math.min(45, Math.max(3, baseMinutes));
    }

    // Estimate based on objective count (more objectives = longer lesson)
    const baseMinutes = V2_SPEC_DEFAULTS.DEFAULT_LESSON_DURATION_MINUTES;
    const adjusted = baseMinutes + (objectiveCount * 3);

    return Math.min(45, Math.max(3, adjusted));
  }

  /**
   * Generate lesson title
   *
   * @param area - Section area
   * @param lessonNumber - Lesson number within section
   * @param totalLessons - Total lessons in section
   * @returns Generated lesson title
   */
  private generateLessonTitle(
    area: string,
    lessonNumber: number,
    totalLessons: number
  ): string {
    if (totalLessons === 1) {
      return area;
    }

    // Create progression-based titles
    const progressions = [
      'Introduction to',
      'Deep Dive:',
      'Advanced',
      'Practical Applications of',
      'Mastering',
    ];

    const progressionIndex = Math.min(lessonNumber - 1, progressions.length - 1);
    return `${progressions[progressionIndex]} ${area}`;
  }

  /**
   * Generate lesson description
   *
   * @param section - Section breakdown
   * @param lessonNumber - Lesson number
   * @param totalLessons - Total lessons
   * @param objectives - Learning objectives
   * @returns Generated description
   */
  private generateLessonDescription(
    section: SectionBreakdown,
    lessonNumber: number,
    totalLessons: number,
    objectives: LearningObjectiveV2[]
  ): string {
    const mainObjective = objectives[0]?.objective || section.area;

    if (totalLessons === 1) {
      return `This lesson covers ${section.area}. You will learn to ${mainObjective.toLowerCase()}.`;
    }

    return `Lesson ${lessonNumber} of ${totalLessons} in the ${section.area} series. Focus: ${mainObjective}`;
  }

  /**
   * Distribute learning objectives across lessons
   *
   * Divides the section's objectives among its lessons to ensure
   * each lesson has relevant objectives.
   *
   * @param objectives - All section objectives
   * @param lessonIndex - Zero-based lesson index
   * @param totalLessons - Total lessons in section
   * @returns Objectives for this lesson
   */
  private distributeLearningObjectives(
    objectives: string[],
    lessonIndex: number,
    totalLessons: number
  ): string[] {
    if (objectives.length === 0) {
      return [];
    }

    if (totalLessons === 1) {
      return objectives;
    }

    // Calculate objectives per lesson
    const objectivesPerLesson = Math.max(1, Math.ceil(objectives.length / totalLessons));
    const startIndex = lessonIndex * objectivesPerLesson;
    const endIndex = Math.min(startIndex + objectivesPerLesson, objectives.length);

    // Get slice for this lesson
    const lessonObjectives = objectives.slice(startIndex, endIndex);

    // If last lesson and no objectives assigned, give it the last one
    if (lessonObjectives.length === 0 && lessonIndex === totalLessons - 1) {
      return [objectives[objectives.length - 1]];
    }

    return lessonObjectives;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { V2_SPEC_DEFAULTS };
