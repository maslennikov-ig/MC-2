/**
 * Generator Content Functions
 * @module stages/stage6-lesson-content/nodes/generator/generator-content
 *
 * Functions for generating introduction and summary sections.
 */

import { ChatOpenAI } from '@langchain/openai';
import { logger } from '@/shared/logger';
import { getLanguageName, getContentLabels } from '@megacampus/shared-types';
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
 * @param language - ISO language code (supports all 19 languages)
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

  // Get localized labels (supports all 19 languages via shared-types)
  const labels = getContentLabels(language);

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
**CRITICAL REQUIREMENT**: You MUST create EXACTLY 2 exercises. Not 1, not 3 - exactly 2 exercises.
This is a strict requirement that cannot be bypassed.

Exercise Types to Use (pick the most appropriate for this content):
1. **Reflection/Analysis** - Ask the learner to analyze a scenario or case study
2. **Application** - Present a situation and ask learner to apply learned concepts
3. **Classification** - Give examples and ask learner to categorize/classify them
4. **Short Answer** - Ask conceptual questions that test understanding

Format each exercise EXACTLY as shown (use ${getLanguageName(language)} labels):
### ${labels.exercise} [number]: [Exercise title in ${getLanguageName(language)}]

**${labels.task}:** [Clear description of what the learner should do - 2-4 sentences]

**${labels.scenario}:** [If applicable, provide a specific scenario - 2-3 sentences]

**${labels.yourAnswer}:**

> **${labels.hint}:** [Provide a helpful hint - 1-2 sentences]

> **${labels.sampleAnswer}:** [Provide a model answer - 2-4 sentences]

---

**MANDATORY Requirements**:
- EXACTLY 2 exercises - no more, no less (this is critical!)
- Each exercise should target at least one learning objective
- Use practical, real-world scenarios relevant to ${lessonSpec.metadata.target_audience}
- Difficulty: ${lessonSpec.difficulty_level}
- Exercises should be completable in 5-10 minutes each
- ALL labels (${labels.exercise}, ${labels.task}, ${labels.hint}, etc.) MUST be in ${getLanguageName(language)}
- DO NOT use HTML tags like <details> or <summary>

**Verification**: Before submitting, count your exercises. If you have fewer than 2 or more than 2, you must revise.

<output_language>
MANDATORY: Write ALL content in ${getLanguageName(language)}.
Every word, header, example, scenario, hint, and answer must be in ${getLanguageName(language)}.
DO NOT mix languages. DO NOT use English labels like "Exercise", "Hint", "Sample Answer" if language is Russian.
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

// ============================================================================
// OUTPUT VALIDATION
// ============================================================================

/**
 * Prompt template markers that should never appear in generated content.
 * These markers come from patcher-prompt.ts and indicate the model is
 * generating prompt structure instead of actual content.
 */
const PROMPT_TEMPLATE_MARKERS = [
  '## SECTION TITLE',
  '## ORIGINAL CONTENT',
  '## FIX INSTRUCTIONS',
  '## CONTEXT FOR COHERENCE',
  '## TARGET AREA',
  '## OUTPUT REQUIREMENTS',
  'COMPLETE CORRECTED SECTION:',
] as const;

/**
 * Validate generated content for prompt template markers
 *
 * Detects if LLM output contains patcher prompt structure,
 * which indicates the model is reproducing training data
 * instead of generating actual lesson content.
 *
 * @param content - Generated content to validate
 * @returns Object with isValid flag and detected markers
 */
export function validateGeneratedContent(content: string): {
  isValid: boolean;
  detectedMarkers: string[];
} {
  const detectedMarkers: string[] = [];

  for (const marker of PROMPT_TEMPLATE_MARKERS) {
    if (content.includes(marker)) {
      detectedMarkers.push(marker);
    }
  }

  return {
    isValid: detectedMarkers.length === 0,
    detectedMarkers,
  };
}
