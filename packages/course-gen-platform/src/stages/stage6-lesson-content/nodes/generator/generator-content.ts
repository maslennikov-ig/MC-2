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
  // Defensive check for missing intro_blueprint
  if (!lessonSpec.intro_blueprint) {
    logger.warn(
      { lessonId: lessonSpec.lesson_id },
      'Missing intro_blueprint in lessonSpec, using defaults'
    );
    // Create minimal intro_blueprint with defaults
    lessonSpec.intro_blueprint = {
      hook_strategy: 'challenge',
      hook_topic: lessonSpec.title,
      key_learning_objectives: lessonSpec.learning_objectives
        .map((lo) => lo.objective)
        .join(', '),
    };
  }

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

// ============================================================================
// EXERCISES GENERATION
// ============================================================================

/**
 * Generate practical exercises for the lesson
 * Creates 2-3 exercises based on learning objectives and covered content.
 *
 * @param lessonSpec - Full lesson specification
 * @param sectionTitles - Array of section titles covered
 * @param language - ISO language code ('en', 'ru')
 * @param model - ChatOpenAI model instance
 * @returns Generated exercises content and token usage
 */
export async function generateExercises(
  lessonSpec: LessonSpecificationV2,
  sectionTitles: string[],
  language: string,
  model: ChatOpenAI
): Promise<{ content: string; tokensUsed: number }> {
  const objectivesList = lessonSpec.learning_objectives
    .map((lo, i) => `${i + 1}. ${lo.objective}`)
    .join('\n');

  const sectionsList = sectionTitles
    .map((t, i) => `${i + 1}. ${t}`)
    .join('\n');

  const prompt = `<context>
<lesson>
<title>${lessonSpec.title}</title>
<target_audience>${lessonSpec.metadata.target_audience}</target_audience>
<tone>${lessonSpec.metadata.tone}</tone>
<difficulty>${lessonSpec.difficulty_level}</difficulty>
</lesson>

<learning_objectives>
${objectivesList}
</learning_objectives>

<sections_covered>
${sectionsList}
</sections_covered>
</context>

<instructions>
Create 2-3 practical exercises that help reinforce the key concepts from this lesson.

Exercise Types to Use (pick the most appropriate for this content):
1. **Reflection/Analysis** - Ask the learner to analyze a scenario or case study
2. **Application** - Present a situation and ask learner to apply learned concepts
3. **Classification** - Give examples and ask learner to categorize/classify them
4. **Short Answer** - Ask conceptual questions that test understanding

Format each exercise as:
### Exercise [number]: [Exercise title]

**Task:** [Clear description of what the learner should do - 2-4 sentences]

**Scenario/Context:** [If applicable, provide a specific scenario - 2-3 sentences]

**Your Answer:** [Leave blank for learner response]

<details>
<summary>Hint</summary>
[Provide a helpful hint - 1-2 sentences]
</details>

<details>
<summary>Sample Answer</summary>
[Provide a model answer - 2-4 sentences]
</details>

---

Requirements:
- Each exercise should target at least one learning objective
- Use practical, real-world scenarios relevant to ${lessonSpec.metadata.target_audience}
- Difficulty: ${lessonSpec.difficulty_level}
- Exercises should be completable in 5-10 minutes each

<output_language>
MANDATORY: Write ALL content in ${getLanguageName(language)}.
Every word, header, example, scenario, hint, and answer must be in ${getLanguageName(language)}.
DO NOT mix languages.
</output_language>

Write the exercises in markdown format. Do NOT include a section header - just the exercises.
</instructions>`;

  const response = await model.invoke(prompt);
  const content =
    typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

  const tokenResult = extractTokenUsageWithFallback(response, prompt, language);
  if (tokenResult.isEstimated) {
    logger.debug(
      { phase: 'exercises', estimatedTokens: tokenResult.tokens },
      'Token usage estimated from content length (model did not report usage)'
    );
  }

  return {
    content,
    tokensUsed: tokenResult.tokens,
  };
}
