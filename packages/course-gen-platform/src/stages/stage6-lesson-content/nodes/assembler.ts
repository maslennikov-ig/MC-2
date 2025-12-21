/**
 * Assembler Node - Content assembly
 * @module stages/stage6-lesson-content/nodes/assembler
 *
 * Third node in the lesson generation pipeline.
 * Assembles expanded sections into cohesive lesson content with
 * introduction, section transitions, exercises, and conclusion.
 *
 * Input: expandedSections, outline, lessonSpec
 * Output: assembledContent (full markdown), durationMs
 */

import { ChatOpenAI } from '@langchain/openai';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import {
  getRecommendedTemperatureV2,
  type LessonSpecificationV2,
  type ExerciseSpecV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import { getLanguageName } from '@megacampus/shared-types';
import type {
  LessonGraphStateType,
  LessonGraphStateUpdate,
  ExpandedSection,
} from '../state';

// NOTE: Hardcoded model constants have been removed.
// Model selection is now entirely database-driven via ModelConfigService.
// See: packages/course-gen-platform/src/shared/llm/model-config-service.ts

/** Default max tokens for assembler output */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Build introduction prompt based on hook strategy
 *
 * @param lessonSpec - Lesson specification
 * @returns Prompt for generating introduction
 */
function buildIntroductionPrompt(lessonSpec: LessonSpecificationV2, language: string): string {
  const hookExamples = {
    analogy: 'Start with a relatable comparison that connects the topic to everyday experience',
    statistic: 'Lead with a surprising or compelling statistic that grabs attention',
    challenge: 'Present a problem or challenge that the lesson will help solve',
    question: 'Open with a thought-provoking question that engages curiosity',
  };

  return `<context>
<lesson>
<title>${lessonSpec.title}</title>
<description>${lessonSpec.description}</description>
<target_audience>${lessonSpec.metadata.target_audience}</target_audience>
<tone>${lessonSpec.metadata.tone}</tone>
</lesson>

<introduction_blueprint>
<hook_strategy>${lessonSpec.intro_blueprint.hook_strategy}</hook_strategy>
<hook_topic>${lessonSpec.intro_blueprint.hook_topic}</hook_topic>
<key_objectives>${lessonSpec.intro_blueprint.key_learning_objectives}</key_objectives>
</introduction_blueprint>
</context>

<instructions>
Write an engaging introduction for this lesson (150-250 words).

Hook Strategy: ${lessonSpec.intro_blueprint.hook_strategy}
- ${hookExamples[lessonSpec.intro_blueprint.hook_strategy]}
- Use the hook topic: "${lessonSpec.intro_blueprint.hook_topic}"

Structure:
1. Opening hook (2-3 sentences) using the ${lessonSpec.intro_blueprint.hook_strategy} approach
2. Bridge to the lesson topic (1-2 sentences)
3. Preview of what learners will gain (${lessonSpec.intro_blueprint.key_learning_objectives})

Tone: ${lessonSpec.metadata.tone}
Audience: ${lessonSpec.metadata.target_audience}

<output_language>
MANDATORY: Write ALL content in ${getLanguageName(language)}.
Every word, header, example, and explanation must be in ${getLanguageName(language)}.
DO NOT mix languages.
</output_language>

Write in markdown format. Do NOT include a header - just the introduction paragraphs.
</instructions>`;
}

/**
 * Build summary/conclusion prompt
 *
 * @param lessonSpec - Lesson specification
 * @param sectionTitles - Titles of all sections covered
 * @returns Prompt for generating summary
 */
function buildSummaryPrompt(
  lessonSpec: LessonSpecificationV2,
  sectionTitles: string[],
  language: string
): string {
  const objectivesList = lessonSpec.learning_objectives
    .map((lo) => `- ${lo.objective}`)
    .join('\n');

  return `<context>
<lesson>
<title>${lessonSpec.title}</title>
<target_audience>${lessonSpec.metadata.target_audience}</target_audience>
<tone>${lessonSpec.metadata.tone}</tone>
</lesson>

<sections_covered>
${sectionTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}
</sections_covered>

<learning_objectives>
${objectivesList}
</learning_objectives>
</context>

<instructions>
Write a concluding summary for this lesson (150-200 words).

Structure:
1. Brief recap of key concepts covered (2-3 sentences)
2. How the learning objectives were addressed (1-2 sentences)
3. Call to action or next steps (1-2 sentences)
4. Encouraging closing statement

Tone: ${lessonSpec.metadata.tone}
Audience: ${lessonSpec.metadata.target_audience}

<output_language>
MANDATORY: Write ALL content in ${getLanguageName(language)}.
Every word, header, example, and explanation must be in ${getLanguageName(language)}.
DO NOT mix languages.
</output_language>

Write in markdown format. Do NOT include a header - just the summary paragraphs.
</instructions>`;
}

/**
 * Format exercises from specification
 *
 * @param exercises - Exercise specifications (may be partial/simplified)
 * @returns Formatted markdown for exercises
 */
function formatExercises(exercises: ExerciseSpecV2[] | unknown[]): string {
  if (!exercises || exercises.length === 0) {
    return '';
  }

  const exerciseBlocks = exercises.map((exercise, index) => {
    // Handle both full ExerciseSpecV2 and simplified exercise objects
    const ex = exercise as Record<string, unknown>;
    const exerciseType = (ex.type as string) || 'exercise';
    const difficulty = (ex.difficulty as string) || 'medium';
    const learningObjectiveId = (ex.learning_objective_id as string) || (ex.learning_objective_ids as string[])?.[0] || 'N/A';
    const structureTemplate = (ex.structure_template as string) || (ex.prompt as string) || 'Complete the exercise.';
    const rubricCriteria = ex.rubric_criteria as Array<{ criteria: string[]; weight: number }> | undefined;

    // Build rubric items if available
    let rubricSection = '';
    if (rubricCriteria && Array.isArray(rubricCriteria) && rubricCriteria.length > 0) {
      const rubricItems = rubricCriteria
        .map((c) => (c.criteria || []).map((criterion: string) => `  - ${criterion} (${c.weight || 0}%)`).join('\n'))
        .join('\n');

      rubricSection = `
<details>
<summary>Assessment Rubric</summary>

${rubricItems}

</details>`;
    }

    return `### Exercise ${index + 1}: ${exerciseType.replace('_', ' ').toUpperCase()}

**Difficulty**: ${difficulty}

**Objective**: Assess learning objective ${learningObjectiveId}

**Task**:
${structureTemplate}${rubricSection}`;
  });

  return `## Exercises

${exerciseBlocks.join('\n\n---\n\n')}`;
}

/**
 * Assemble sections in order with proper formatting
 *
 * @param expandedSections - Map of expanded sections
 * @param sectionOrder - Order of sections from specification
 * @returns Assembled sections markdown
 */
function assembleSections(
  expandedSections: Map<string, ExpandedSection>,
  sectionOrder: string[]
): string {
  const sectionBlocks: string[] = [];

  sectionOrder.forEach((title) => {
    const section = expandedSections.get(title);
    if (section) {
      sectionBlocks.push(`## ${section.title}\n\n${section.content}`);
    } else {
      // Section not found - add placeholder
      sectionBlocks.push(
        `## ${title}\n\n*[Content generation pending for this section]*`
      );
    }
  });

  return sectionBlocks.join('\n\n');
}

/**
 * Parse token usage from ChatOpenAI response
 */
function extractTokenUsage(response: Awaited<ReturnType<ChatOpenAI['invoke']>>): number {
  const metadata = response.response_metadata;
  if (metadata && typeof metadata === 'object') {
    const usage = (metadata as Record<string, unknown>).usage;
    if (usage && typeof usage === 'object') {
      const totalTokens = (usage as Record<string, unknown>).total_tokens;
      if (typeof totalTokens === 'number') {
        return totalTokens;
      }
    }
  }
  return 0;
}

/**
 * Assembler Node - Assemble expanded sections into full lesson content
 *
 * This node combines all expanded sections with:
 * - Generated introduction based on hook strategy
 * - Sections in specification order
 * - Formatted exercises
 * - Generated summary/conclusion
 *
 * @param state - Current graph state with expandedSections and lessonSpec
 * @returns Updated state with assembledContent and metrics
 */
export async function assemblerNode(
  state: LessonGraphStateType
): Promise<LessonGraphStateUpdate> {
  const startTime = performance.now();
  const { lessonSpec, expandedSections, courseId, lessonUuid, language } = state;

  // Validate prerequisites
  if (expandedSections.size === 0) {
    logger.error(
      { lessonId: lessonSpec.lesson_id },
      'Assembler node: No expanded sections available'
    );
    return {
      errors: ['Assembler failed: No expanded sections available from expander'],
      currentNode: 'assembler',
    };
  }

  logger.info(
    {
      lessonId: lessonSpec.lesson_id,
      expandedSectionsCount: expandedSections.size,
      exercisesCount: lessonSpec.exercises.length,
    },
    'Assembler node: Starting content assembly'
  );

  // Log trace at start
  await logTrace({
    courseId,
    lessonId: lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'assembler',
    stepName: 'assembler_start',
    inputData: {
      lessonLabel: lessonSpec.lesson_id,
      expandedSectionsCount: expandedSections.size,
      exercisesCount: lessonSpec.exercises.length,
      language,
    },
    durationMs: 0,
  });

  try{
    // Get temperature based on content archetype
    const temperature = getRecommendedTemperatureV2(
      lessonSpec.metadata.content_archetype
    );

    // Get model from ModelConfigService (database-driven, throws on failure)
    // Use modelOverride if present (for fallback retry strategy)
    const modelConfigService = createModelConfigService();
    const modelId = state.modelOverride
      ?? (await modelConfigService.getModelForPhase('stage_6_refinement')).modelId;

    logger.info({
      lessonId: lessonSpec.lesson_id,
      modelId,
      source: state.modelOverride ? 'override' : 'database',
    }, 'Using model config for assembler');

    // Create LLM instance for intro and summary generation
    const model = createOpenRouterModel(
      modelId,
      temperature,
      DEFAULT_MAX_TOKENS
    );

    let totalTokens = 0;

    // Generate introduction
    const introPrompt = buildIntroductionPrompt(lessonSpec, language);
    const introResponse = await model.invoke(introPrompt);
    const introduction =
      typeof introResponse.content === 'string'
        ? introResponse.content
        : JSON.stringify(introResponse.content);
    totalTokens += extractTokenUsage(introResponse);

    // Get section order from specification
    const sectionOrder = lessonSpec.sections.map((s) => s.title);

    // Assemble main content
    const sectionsMarkdown = assembleSections(expandedSections, sectionOrder);

    // Format exercises (handle undefined/null exercises)
    const exercisesMarkdown = formatExercises(lessonSpec.exercises || []);

    // Generate summary
    const summaryPrompt = buildSummaryPrompt(lessonSpec, sectionOrder, language);
    const summaryResponse = await model.invoke(summaryPrompt);
    const summary =
      typeof summaryResponse.content === 'string'
        ? summaryResponse.content
        : JSON.stringify(summaryResponse.content);
    totalTokens += extractTokenUsage(summaryResponse);

    // Assemble complete lesson
    const assembledParts: string[] = [
      `# ${lessonSpec.title}`,
      '',
      '## Introduction',
      '',
      introduction,
      '',
      sectionsMarkdown,
    ];

    // Add exercises if present
    if (exercisesMarkdown) {
      assembledParts.push('', exercisesMarkdown);
    }

    // Add summary
    assembledParts.push('', '## Summary', '', summary);

    const assembledContent = assembledParts.join('\n');
    const durationMs = Math.round(performance.now() - startTime);

    // Calculate word count for trace
    const wordCount = assembledContent.split(/\s+/).filter(Boolean).length;
    const hasIntro = Boolean(introduction && introduction.length > 0);
    const hasSummary = Boolean(summary && summary.length > 0);

    // Build structure validation
    const hasSections = sectionOrder.length > 0;
    const hasExercises = lessonSpec.exercises.length > 0;
    const structureIssues: string[] = [];

    if (!hasIntro) {
      structureIssues.push('Missing introduction');
    }
    if (!hasSections) {
      structureIssues.push('No sections defined');
    }
    if (!hasExercises) {
      structureIssues.push('No exercises defined');
    }
    if (!hasSummary) {
      structureIssues.push('Missing summary');
    }

    const structureValidation = {
      hasIntro,
      hasSections,
      hasExercises,
      hasSummary,
      issues: structureIssues,
    };

    // Build transition points (section boundaries)
    const transitionPoints: string[] = [];
    for (let i = 1; i < sectionOrder.length; i++) {
      const prevTitle = sectionOrder[i - 1];
      const currTitle = sectionOrder[i];
      transitionPoints.push(`${prevTitle} → ${currTitle}`);
    }

    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        contentLength: assembledContent.length,
        sectionsAssembled: sectionOrder.length,
        exercisesIncluded: lessonSpec.exercises.length,
        tokensUsed: totalTokens,
        durationMs,
      },
      'Assembler node: Content assembly complete'
    );

    // Log trace at completion
    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'assembler',
      stepName: 'assembler_complete',
      inputData: {
        lessonLabel: lessonSpec.lesson_id,
        language,
      },
      outputData: {
        contentLength: assembledContent.length,
        sectionsAssembled: sectionOrder.length,
        exercisesIncluded: lessonSpec.exercises.length,
        wordCount,
        hasIntro,
        hasSummary,
        structureValidation,
        transitionPoints,
      },
      tokensUsed: totalTokens,
      durationMs,
    });

    return {
      assembledContent,
      tokensUsed: totalTokens,
      durationMs,
      currentNode: 'smoother',
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const durationMs = Math.round(performance.now() - startTime);

    logger.error(
      {
        lessonId: lessonSpec.lesson_id,
        error: errorMessage,
      },
      'Assembler node: Content assembly failed'
    );

    // Log trace on error
    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'assembler',
      stepName: 'assembler_error',
      inputData: {
        lessonLabel: lessonSpec.lesson_id,
        language,
      },
      errorData: {
        error: errorMessage,
      },
      durationMs,
    });

    return {
      errors: [`Assembler failed: ${errorMessage}`],
      currentNode: 'assembler',
      durationMs,
    };
  }
}
