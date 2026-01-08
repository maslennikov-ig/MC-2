/**
 * Generator Content Functions
 * @module stages/stage6-lesson-content/nodes/generator/generator-content
 *
 * Functions for generating introduction and summary sections.
 */

import { ChatOpenAI } from '@langchain/openai';
import { logger } from '@/shared/logger';
import { getLanguageName } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { extractTokenUsageWithFallback } from './generator-helpers';

// ============================================================================
// INTRODUCTION GENERATION
// ============================================================================

/**
 * Generate introduction using intro_blueprint
 * Creates engaging opening content with hook strategy.
 *
 * @param lessonSpec - Full lesson specification with intro_blueprint
 * @param language - ISO language code ('en', 'ru')
 * @param model - ChatOpenAI model instance
 * @returns Generated introduction content and token usage
 */
export async function generateIntroduction(
  lessonSpec: LessonSpecificationV2,
  language: string,
  model: ChatOpenAI
): Promise<{ content: string; tokensUsed: number }> {
  const hookExamples = {
    analogy: 'Start with a relatable comparison that connects the topic to everyday experience',
    statistic: 'Lead with a surprising or compelling statistic that grabs attention',
    challenge: 'Present a problem or challenge that the lesson will help solve',
    question: 'Open with a thought-provoking question that engages curiosity',
  };

  const prompt = `<context>
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

  const response = await model.invoke(prompt);
  const content =
    typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

  const tokenResult = extractTokenUsageWithFallback(response, prompt, language);
  if (tokenResult.isEstimated) {
    logger.debug(
      { phase: 'introduction', estimatedTokens: tokenResult.tokens },
      'Token usage estimated from content length (model did not report usage)'
    );
  }

  return {
    content,
    tokensUsed: tokenResult.tokens,
  };
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

/**
 * Generate summary/conclusion for the lesson
 * Creates concluding content with recap and next steps.
 *
 * @param lessonSpec - Full lesson specification
 * @param sectionTitles - Array of section titles covered
 * @param language - ISO language code ('en', 'ru')
 * @param model - ChatOpenAI model instance
 * @returns Generated summary content and token usage
 */
export async function generateSummary(
  lessonSpec: LessonSpecificationV2,
  sectionTitles: string[],
  language: string,
  model: ChatOpenAI
): Promise<{ content: string; tokensUsed: number }> {
  const objectivesList = lessonSpec.learning_objectives
    .map((lo) => `- ${lo.objective}`)
    .join('\n');

  const prompt = `<context>
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

  const response = await model.invoke(prompt);
  const content =
    typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

  const tokenResult = extractTokenUsageWithFallback(response, prompt, language);
  if (tokenResult.isEstimated) {
    logger.debug(
      { phase: 'summary', estimatedTokens: tokenResult.tokens },
      'Token usage estimated from content length (model did not report usage)'
    );
  }

  return {
    content,
    tokensUsed: tokenResult.tokens,
  };
}
