/**
 * Planner Node - Generate lesson outline
 * @module stages/stage6-lesson-content/nodes/planner
 *
 * First node in the lesson generation pipeline.
 * Generates a structured outline based on LessonSpecificationV2 and RAG context.
 *
 * Input: lessonSpec, ragChunks, courseId
 * Output: outline (markdown), modelUsed, tokensUsed, durationMs
 */

import { ChatOpenAI } from '@langchain/openai';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import {
  getRecommendedTemperatureV2,
  type LessonSpecificationV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import { getLanguageName } from '@megacampus/shared-types';
import type { LessonGraphStateType, LessonGraphStateUpdate } from '../state';
import { createPromptService } from '@/shared/prompts/prompt-service';
import { formatRAGContextXML } from '@/shared/prompts';

// NOTE: Hardcoded model constants have been removed.
// Model selection is now entirely database-driven via ModelConfigService.
// See: packages/course-gen-platform/src/shared/llm/model-config-service.ts

/** Default max tokens for planner output */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Format learning objectives as XML list
 *
 * @param learningObjectives - Learning objectives from lesson spec
 * @returns XML-formatted string
 */
function formatLearningObjectivesXML(
  learningObjectives: LessonSpecificationV2['learning_objectives']
): string {
  return learningObjectives
    .map((lo) => `    <objective bloom_level="${lo.bloom_level}">${lo.objective}</objective>`)
    .join('\n');
}

/**
 * Format sections overview as XML list
 *
 * @param sections - Sections from lesson spec
 * @returns XML-formatted string
 */
function formatSectionsXML(sections: LessonSpecificationV2['sections']): string {
  return sections
    .map((section) => {
      const depth = section.constraints?.depth || 'detailed_analysis';
      return `    <section>
      <title>${section.title}</title>
      <archetype>${section.content_archetype}</archetype>
      <depth>${depth}</depth>
    </section>`;
    })
    .join('\n');
}


/**
 * Parse token usage from ChatOpenAI response
 *
 * @param response - LLM response with usage metadata
 * @returns Token count or 0 if not available
 */
function extractTokenUsage(response: Awaited<ReturnType<ChatOpenAI['invoke']>>): number {
  // LangChain response includes usage_metadata
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
 * Extract key points count per section from markdown outline
 *
 * Parses a markdown outline to identify sections (## headers) and count
 * the number of bullet points under "### Key Points" subsections.
 * Validates regex matches to ensure non-empty, reasonably-sized section titles.
 *
 * @param outline - Generated markdown outline
 * @returns Record mapping section titles to key point counts
 */
function extractKeyPointsPerSection(outline: string): Record<string, number> {
  const result: Record<string, number> = {};
  const lines = outline.split('\n');
  let currentSection: string | null = null;
  let inKeyPoints = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Match section headers: "## Section 1: Title" or "## Title"
    const sectionMatch = trimmedLine.match(/^##\s+(?:Section\s+\d+:\s*)?(.+)$/i);
    if (sectionMatch) {
      const sectionTitle = sectionMatch[1]?.trim();
      // Validate: non-empty string, reasonable length
      if (sectionTitle && sectionTitle.length > 0 && sectionTitle.length < 200) {
        currentSection = sectionTitle;
        inKeyPoints = false;
        if (!result[currentSection]) {
          result[currentSection] = 0;
        }
      } else {
        // Invalid section title - skip
        currentSection = null;
        inKeyPoints = false;
      }
      continue;
    }

    // Match "### Key Points" header
    if (trimmedLine.match(/^###\s+Key\s+Points/i)) {
      inKeyPoints = true;
      continue;
    }

    // Match next subsection - exit key points mode
    if (trimmedLine.match(/^###\s+/)) {
      inKeyPoints = false;
      continue;
    }

    // Count bullet points under Key Points
    if (inKeyPoints && currentSection && trimmedLine.match(/^[-*]\s+/)) {
      result[currentSection]++;
    }
  }

  return result;
}

/**
 * Planner Node - Generate structured outline for lesson content
 *
 * This is the first node in the lesson generation pipeline.
 * It analyzes the lesson specification and RAG context to create
 * a detailed outline that guides subsequent generation phases.
 *
 * @param state - Current graph state with lessonSpec and ragChunks
 * @returns Updated state with outline, model info, and metrics
 */
export async function plannerNode(
  state: LessonGraphStateType
): Promise<LessonGraphStateUpdate> {
  const startTime = performance.now();
  const { lessonSpec, ragChunks, courseId, lessonUuid, language } = state;

  logger.info(
    {
      lessonId: lessonSpec.lesson_id,
      courseId,
      title: lessonSpec.title,
      ragChunksCount: ragChunks.length,
    },
    'Planner node: Starting outline generation'
  );

  // Log trace at start
  await logTrace({
    courseId,
    lessonId: lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'planner',
    stepName: 'planner_start',
    inputData: {
      lessonLabel: lessonSpec.lesson_id,
      lessonTitle: lessonSpec.title,
      moduleNumber: lessonSpec.lesson_id.split('.')[0],
      ragChunksCount: ragChunks.length,
      language,
    },
    durationMs: 0,
  });

  try {
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
    }, 'Using model config for planner');

    // Create LLM instance
    const model = createOpenRouterModel(
      modelId,
      temperature,
      DEFAULT_MAX_TOKENS
    );

    // Build prompt with RAG context using centralized prompt service
    const promptService = createPromptService();
    const ragContextXML = formatRAGContextXML(ragChunks, 20000);

    const prompt = await promptService.renderPrompt('stage6_planner', {
      lessonId: lessonSpec.lesson_id,
      lessonTitle: lessonSpec.title,
      lessonDescription: lessonSpec.description,
      difficulty: lessonSpec.difficulty_level,
      durationMinutes: String(lessonSpec.estimated_duration_minutes),
      targetAudience: lessonSpec.metadata.target_audience,
      tone: lessonSpec.metadata.tone,
      contentArchetype: lessonSpec.metadata.content_archetype,
      outputLanguage: getLanguageName(language),
      learningObjectives: formatLearningObjectivesXML(lessonSpec.learning_objectives),
      hookStrategy: lessonSpec.intro_blueprint.hook_strategy,
      hookTopic: lessonSpec.intro_blueprint.hook_topic,
      keyObjectives: lessonSpec.intro_blueprint.key_learning_objectives,
      sections: formatSectionsXML(lessonSpec.sections),
      ragContext: ragContextXML,
      userRefinementPrompt: state.userRefinementPrompt || '',
    });

    // Generate outline
    const response = await model.invoke(prompt);
    const outline =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    // Extract metrics
    const tokensUsed = extractTokenUsage(response);
    const durationMs = Math.round(performance.now() - startTime);

    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        outlineLength: outline.length,
        tokensUsed,
        durationMs,
      },
      'Planner node: Outline generation complete'
    );

    // Extract key points per section from outline
    const keyPointsPerSection = extractKeyPointsPerSection(outline);

    // Log trace at completion
    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'planner',
      stepName: 'planner_complete',
      inputData: {
        lessonLabel: lessonSpec.lesson_id,
        lessonTitle: lessonSpec.title,
        moduleNumber: lessonSpec.lesson_id.split('.')[0],
        language,
        temperature,
      },
      outputData: {
        outlineLength: outline.length,
        sectionsPlanned: lessonSpec.sections.length,
        planningStrategy: 'standard',
        hasLearningObjectives: Boolean(lessonSpec.learning_objectives.length),
        objectivesCount: lessonSpec.learning_objectives.length,
        keyPointsPerSection,
        ragChunksUsed: ragChunks.length,
        outline: outline.slice(0, 2000),
      },
      modelUsed: modelId,
      tokensUsed,
      durationMs,
    });

    return {
      outline,
      modelUsed: modelId,
      tokensUsed,
      durationMs,
      temperature,
      currentNode: 'expander',
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
      'Planner node: Outline generation failed'
    );

    // Log trace on error
    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'planner',
      stepName: 'planner_error',
      inputData: {
        lessonLabel: lessonSpec.lesson_id,
        lessonTitle: lessonSpec.title,
        moduleNumber: lessonSpec.lesson_id.split('.')[0],
        language,
      },
      errorData: {
        error: errorMessage,
      },
      durationMs,
    });

    return {
      errors: [`Planner failed: ${errorMessage}`],
      currentNode: 'planner', // Stay on planner for retry
      durationMs,
    };
  }
}
