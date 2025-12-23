/**
 * Smoother Node - Transition refinement
 * @module stages/stage6-lesson-content/nodes/smoother
 *
 * Fourth node in the lesson generation pipeline.
 * Refines transitions between sections for flow and coherence,
 * then produces the final LessonContent structure.
 *
 * Input: assembledContent, lessonSpec, ragChunks
 * Output: smoothedContent, lessonContent (final structured output), tokensUsed, durationMs
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
import type {
  LessonContent,
  LessonContentBody,
  ContentSection,
  ContentExercise,
  RAGChunk,
  Citation,
} from '@megacampus/shared-types/lesson-content';
import type {
  LessonGraphStateType,
  LessonGraphStateUpdate,
} from '../state';

// NOTE: Hardcoded model constants have been removed.
// Model selection is now entirely database-driven via ModelConfigService.
// See: packages/course-gen-platform/src/shared/llm/model-config-service.ts

/** Default max tokens for smoother output */
const DEFAULT_MAX_TOKENS = 8000;

/**
 * Build transition refinement prompt
 *
 * @param assembledContent - Content to refine
 * @param lessonSpec - Lesson specification for context
 * @returns Prompt for transition refinement
 */
function buildSmootherPrompt(
  assembledContent: string,
  lessonSpec: LessonSpecificationV2,
  language: string
): string {
  return `<context>
<lesson_metadata>
<title>${lessonSpec.title}</title>
<target_audience>${lessonSpec.metadata.target_audience}</target_audience>
<tone>${lessonSpec.metadata.tone}</tone>
<difficulty>${lessonSpec.difficulty_level}</difficulty>
</lesson_metadata>

<current_content>
${assembledContent}
</current_content>
</context>

<instructions>
Review and refine the lesson content to improve flow and transitions. Your task:

1. **Transition Refinement**:
   - Add smooth transitions between sections (1-2 sentences at section boundaries)
   - Ensure logical flow from one concept to the next
   - Add forward/backward references where appropriate ("As we'll see in...", "Building on...")

2. **Consistency Check**:
   - Ensure consistent tone (${lessonSpec.metadata.tone}) throughout
   - Verify appropriate complexity for ${lessonSpec.metadata.target_audience} audience
   - Check terminology consistency

3. **Knowledge Checks** (optional):
   - Add brief rhetorical questions to engage readers
   - Include "Think about..." prompts where appropriate

4. **Polish**:
   - Fix any awkward phrasing
   - Improve sentence variety
   - Ensure headers and subheaders are clear

**Important**:
- Preserve ALL existing content and structure
- Do NOT change section headers or remove content
- Only ADD transitions and polish existing prose
- Keep the same markdown formatting
<output_language>
MANDATORY: Write ALL content in ${getLanguageName(language)}.
Every word, header, example, and explanation must be in ${getLanguageName(language)}.
DO NOT mix languages.
</output_language>

Return the complete refined content in markdown format.
</instructions>`;
}

/**
 * Parse section content from markdown
 *
 * @param markdown - Full markdown content
 * @returns Array of content sections
 */
function parseSectionsFromMarkdown(markdown: string): ContentSection[] {
  const sections: ContentSection[] = [];

  // Split by H2 headers (## Section Title)
  const sectionRegex = /^## (.+?)$/gm;
  const matches = [...markdown.matchAll(sectionRegex)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const title = match[1].trim();

    // Skip Introduction and Summary sections (handled separately)
    if (title.toLowerCase() === 'introduction' || title.toLowerCase() === 'summary' || title.toLowerCase() === 'exercises') {
      continue;
    }

    // Get content between this header and the next
    const startIndex = match.index + match[0].length;
    const endIndex = matches[i + 1]?.index ?? markdown.length;
    const content = markdown.slice(startIndex, endIndex).trim();

    sections.push({
      title,
      content,
      citations: [], // Citations will be extracted separately
    });
  }

  return sections;
}

/**
 * Extract introduction from markdown
 *
 * @param markdown - Full markdown content
 * @returns Introduction text
 */
function extractIntroduction(markdown: string): string {
  const introMatch = markdown.match(/^## Introduction\s*\n([\s\S]*?)(?=\n## |\n#[^#]|$)/m);
  return introMatch ? introMatch[1].trim() : '';
}

/**
 * Build citations from RAG chunks used
 *
 * @param ragChunks - RAG chunks used for generation
 * @returns Array of citations
 */
function buildCitations(ragChunks: RAGChunk[]): Citation[] {
  // Get unique document references
  const uniqueDocs = new Map<string, Citation>();

  ragChunks.forEach((chunk) => {
    const key = `${chunk.document_name}-${chunk.page_or_section || 'main'}`;
    if (!uniqueDocs.has(key)) {
      uniqueDocs.set(key, {
        document: chunk.document_name,
        page_or_section: chunk.page_or_section || 'main',
      });
    }
  });

  return Array.from(uniqueDocs.values());
}

/**
 * Parse exercises from markdown (placeholder - exercises come from spec)
 *
 * @param lessonSpec - Lesson specification with exercises (may have simplified structure)
 * @returns Array of content exercises
 */
function buildExercises(lessonSpec: LessonSpecificationV2): ContentExercise[] {
  const exercises = lessonSpec.exercises || [];

  return exercises.map((exercise) => {
    // Handle both full ExerciseSpecV2 and simplified exercise objects
    const ex = exercise as Record<string, unknown>;
    const structureTemplate = (ex.structure_template as string) || (ex.prompt as string) || 'Complete the exercise.';
    const learningObjectiveId = (ex.learning_objective_id as string) || (ex.learning_objective_ids as string[])?.[0] || 'N/A';
    const rubricCriteria = ex.rubric_criteria as Array<{ criteria: string[]; weight: number }> | undefined;

    return {
      question: structureTemplate,
      hints: [], // Could be generated in future
      solution: `[Solution based on ${learningObjectiveId}]`, // Placeholder
      grading_rubric: rubricCriteria && Array.isArray(rubricCriteria) && rubricCriteria.length > 0
        ? {
            criteria: rubricCriteria
              .flatMap((c) => c.criteria || [])
              .join('; '),
            points: 100,
          }
        : undefined,
    };
  });
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
 * Count words in markdown content
 *
 * @param content - Markdown content
 * @returns Word count
 */
function countWords(content: string): number {
  // Remove markdown syntax for accurate count
  const plainText = content
    .replace(/```[\s\S]*?```/g, ' ') // Remove code blocks
    .replace(/`[^`]+`/g, ' ') // Remove inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
    .replace(/[#*_~`]/g, '') // Remove markdown symbols
    .trim();

  return plainText.split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Build final LessonContent structure
 *
 * @param smoothedContent - Refined markdown content
 * @param lessonSpec - Lesson specification
 * @param ragChunks - RAG chunks used
 * @param metadata - Generation metadata
 * @returns Complete LessonContent object
 */
function buildLessonContent(
  smoothedContent: string,
  lessonSpec: LessonSpecificationV2,
  ragChunks: RAGChunk[],
  metadata: {
    tokensUsed: number;
    durationMs: number;
    modelUsed: string;
    temperature: number;
  }
): LessonContent {
  const now = new Date();
  const wordCount = countWords(smoothedContent);

  // Parse content components
  const intro = extractIntroduction(smoothedContent);
  const sections = parseSectionsFromMarkdown(smoothedContent);
  const exercises = buildExercises(lessonSpec);

  // Build content body
  const contentBody: LessonContentBody = {
    intro: intro || lessonSpec.description,
    sections,
    examples: [], // Could be extracted from content in future
    exercises,
    interactive_elements: [],
  };

  // Build citations
  const citations = buildCitations(ragChunks);

  // Add citations to sections that used RAG
  if (citations.length > 0) {
    contentBody.sections = contentBody.sections.map((section) => ({
      ...section,
      citations,
    }));
  }

  return {
    lesson_id: lessonSpec.lesson_id,
    course_id: '', // Will be set by caller
    content: contentBody,
    metadata: {
      total_words: wordCount,
      total_tokens: metadata.tokensUsed,
      cost_usd: 0, // Cost calculation done by orchestrator
      quality_score: 0, // Will be set by judge node
      rag_chunks_used: ragChunks.length,
      generation_duration_ms: metadata.durationMs,
      model_used: metadata.modelUsed,
      archetype_used: lessonSpec.metadata.content_archetype,
      temperature_used: metadata.temperature,
    },
    status: 'generating', // Will be updated by judge
    created_at: now,
    updated_at: now,
  };
}

/**
 * Smoother Node - Refine transitions and produce final LessonContent
 *
 * This node:
 * 1. Analyzes transitions between sections
 * 2. Uses LLM to refine awkward transitions
 * 3. Builds final LessonContent object with all metadata
 * 4. Passes content to judge for quality validation
 *
 * @param state - Current graph state with assembledContent
 * @returns Updated state with smoothedContent and lessonContent
 */
export async function smootherNode(
  state: LessonGraphStateType
): Promise<LessonGraphStateUpdate> {
  const startTime = performance.now();
  const { lessonSpec, assembledContent, ragChunks, courseId, lessonUuid, language, tokensUsed: prevTokens, durationMs: prevDuration, modelUsed: prevModel } = state;

  // Validate prerequisites
  if (!assembledContent) {
    logger.error(
      { lessonId: lessonSpec.lesson_id },
      'Smoother node: No assembled content available'
    );
    return {
      errors: ['Smoother failed: No assembled content available from assembler'],
      currentNode: 'smoother',
    };
  }

  logger.info(
    {
      lessonId: lessonSpec.lesson_id,
      contentLength: assembledContent.length,
    },
    'Smoother node: Starting transition refinement'
  );

  // Log trace at start
  await logTrace({
    courseId,
    lessonId: lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'smoother',
    stepName: 'smoother_start',
    inputData: {
      lessonLabel: lessonSpec.lesson_id,
      lessonTitle: lessonSpec.title,
      moduleNumber: lessonSpec.lesson_id.split('.')[0],
      contentLength: assembledContent.length,
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
    }, 'Using model config for smoother');

    // Create LLM instance
    const model = createOpenRouterModel(
      modelId,
      temperature,
      DEFAULT_MAX_TOKENS
    );

    // Build prompt and refine content
    const prompt = buildSmootherPrompt(assembledContent, lessonSpec, language);
    const response = await model.invoke(prompt);
    const smoothedContent =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    const smootherTokens = extractTokenUsage(response);
    const smootherDuration = Math.round(performance.now() - startTime);

    // Calculate totals
    const totalTokens = prevTokens + smootherTokens;
    const totalDuration = prevDuration + smootherDuration;

    // Build final LessonContent structure
    const lessonContent = buildLessonContent(
      smoothedContent,
      lessonSpec,
      ragChunks,
      {
        tokensUsed: totalTokens,
        durationMs: totalDuration,
        modelUsed: prevModel || modelId, // Use current modelId if prevModel not set
        temperature,
      }
    );

    // Set course_id from state
    lessonContent.course_id = courseId;

    // Calculate length change metrics for trace
    const originalLength = assembledContent.length;
    const lengthChange = smoothedContent.length - originalLength;
    const lengthChangePercent = originalLength > 0
      ? Math.round((lengthChange / originalLength) * 100)
      : 0;

    // Calculate additional metrics for trace
    const transitionsAdded = Math.max(0, lessonContent.content.sections.length - 1);
    const styleAdjustments = ['tone_normalization', 'flow_improvement', 'formatting_cleanup'];

    // Estimate Flesch-Kincaid readability score
    const sentences = smoothedContent.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const avgWordsPerSentence = lessonContent.metadata.total_words / Math.max(1, sentences);
    const readabilityScore = Math.max(1, Math.min(16, Math.round(0.39 * avgWordsPerSentence + 2)));

    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        smoothedLength: smoothedContent.length,
        wordCount: lessonContent.metadata.total_words,
        sectionsCount: lessonContent.content.sections.length,
        tokensUsed: smootherTokens,
        durationMs: smootherDuration,
      },
      'Smoother node: Transition refinement complete'
    );

    // Log trace at completion
    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'smoother',
      stepName: 'smoother_complete',
      inputData: {
        lessonLabel: lessonSpec.lesson_id,
        lessonTitle: lessonSpec.title,
        moduleNumber: lessonSpec.lesson_id.split('.')[0],
        language,
      },
      outputData: {
        smoothedLength: smoothedContent.length,
        wordCount: lessonContent.metadata.total_words,
        sectionsCount: lessonContent.content.sections.length,
        lengthChange,
        lengthChangePercent,
        modelUsed: modelId,
        transitionsAdded,
        styleAdjustments,
        readabilityScore,
      },
      tokensUsed: smootherTokens,
      durationMs: smootherDuration,
    });

    return {
      smoothedContent,
      lessonContent,
      tokensUsed: smootherTokens,
      durationMs: smootherDuration,
      currentNode: 'judge',
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
      'Smoother node: Transition refinement failed'
    );

    // Log trace on error
    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'smoother',
      stepName: 'smoother_error',
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
      errors: [`Smoother failed: ${errorMessage}`],
      currentNode: 'smoother',
      durationMs,
    };
  }
}
