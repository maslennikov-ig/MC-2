/**
 * Quiz Prompt Templates
 * @module stages/stage7-enrichments/prompts/quiz-prompt
 *
 * Implements quiz generation for Stage 7 lesson enrichments.
 * Uses a single-stage flow (direct generation, no draft phase).
 *
 * The quiz includes questions with varying Bloom's taxonomy levels,
 * difficulty distribution, and question types to ensure comprehensive
 * assessment of lesson content.
 *
 * Token budget: ~1500 tokens (system) + content tokens
 * Expected output: ~1000-2500 tokens (JSON response with quiz structure)
 */

import { quizEnrichmentContentSchema } from '@megacampus/shared-types';

/**
 * Re-export quiz schema for validation
 */
export { quizEnrichmentContentSchema as quizOutputSchema };

/**
 * Language-specific token multipliers
 * Non-Latin scripts use more tokens per character
 */
const TOKEN_MULTIPLIERS: Record<string, number> = {
  en: 1.0, // Baseline - Latin script
  ru: 1.33, // Cyrillic
  zh: 2.67, // Chinese
  ja: 2.0, // Japanese
  ko: 2.0, // Korean
  ar: 1.5, // Arabic
  hi: 1.5, // Hindi/Devanagari
};

/**
 * Question type options
 */
export type QuizQuestionType = 'multiple_choice' | 'true_false' | 'short_answer';

/**
 * Difficulty bias for question generation
 */
export type DifficultyBias = 'easy' | 'balanced' | 'hard';

/**
 * Quiz generation settings
 */
export interface QuizSettings {
  /** Number of questions to generate (default: 5-10) */
  questionCount?: number;

  /** Difficulty distribution preference (default: balanced) */
  difficultyBias?: DifficultyBias;

  /** Allowed question types (default: all types) */
  questionTypes?: QuizQuestionType[];

  /** Passing score percentage (default: 70) */
  passingScore?: number;

  /** Optional time limit in minutes */
  timeLimitMinutes?: number;
}

/**
 * Parameters for building quiz user message
 */
export interface QuizPromptParams {
  /** Lesson title */
  lessonTitle: string;

  /** Lesson content (markdown format) */
  lessonContent: string;

  /** Learning objectives for the lesson */
  lessonObjectives: string[];

  /** Target language code (ISO 639-1) */
  language: 'ru' | 'en';

  /** Optional generation settings */
  settings?: QuizSettings;
}

/**
 * Sanitize text for safe prompt interpolation
 * Prevents prompt injection by escaping all XML special characters
 * and removing potential CDATA markers that could break XML structure
 */
function sanitizeForPrompt(text: string): string {
  if (!text) return '';
  return (
    text
      // Escape XML special characters (& must be first)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      // Remove CDATA markers that could break XML structure
      .replace(/\]\]>/g, ']]&gt;')
      .replace(/<!\[CDATA\[/gi, '&lt;![CDATA[')
      // Limit consecutive newlines (prevent structure breaking)
      .replace(/\n{4,}/g, '\n\n\n')
  );
}

/**
 * Build the system prompt for quiz generation
 *
 * This prompt uses XML-style delimiters to prevent prompt injection
 * and provides clear guidelines for educational quiz creation based on
 * Bloom's Taxonomy principles.
 *
 * @returns System prompt string for quiz generation
 */
export function buildQuizSystemPrompt(): string {
  return `# Role
You are an **Educational Quiz Designer** with deep expertise in Bloom's Taxonomy and assessment design for online learning platforms.
Your goal is to create comprehensive, pedagogically sound quizzes that effectively assess student understanding of lesson content.

# Input Data
You will receive five inputs wrapped in XML tags:
1. \`<LESSON_TITLE>\`: The title of the lesson
2. \`<LESSON_CONTENT>\`: The full lesson content in markdown format
3. \`<LEARNING_OBJECTIVES>\`: The educational goals for this lesson
4. \`<LANGUAGE>\`: The target language code (ISO 639-1, e.g., 'en', 'ru')
5. \`<SETTINGS>\`: Quiz generation preferences (question count, difficulty, types, etc.)

# Quiz Structure Requirements

Your quiz MUST include the following elements:

## 1. Quiz Metadata
- **Quiz Title**: Clear, descriptive title (e.g., "Assessment: [Lesson Topic]")
- **Instructions**: Brief guidance for students (1-3 sentences)
  - State the passing score
  - Mention time limit (if applicable)
  - Clarify if questions/options will be shuffled
- **Passing Score**: Percentage required to pass (default: 70%)
- **Time Limit**: Optional duration in minutes
- **Shuffle Settings**: Whether to randomize questions and options

## 2. Questions Array (5-10 questions by default)

Each question MUST include:
- **ID**: Unique identifier (e.g., "q1", "q2", "q3")
- **Type**: One of:
  - \`multiple_choice\`: 3-5 options, one correct answer
  - \`true_false\`: Boolean question
  - \`short_answer\`: Open-ended response (use sparingly)
- **Bloom's Level**: Cognitive level (see taxonomy below)
- **Difficulty**: \`easy\`, \`medium\`, or \`hard\`
- **Question Text**: Clear, unambiguous question (10-200 characters)
- **Options**: Array of choices (for multiple_choice only)
  - Each option has \`id\` (e.g., "a", "b", "c") and \`text\`
  - Include 3-5 options
  - Make distractors plausible but clearly incorrect
- **Correct Answer**:
  - For multiple_choice: option ID as string (e.g., "a")
  - For true_false: boolean (true or false)
  - For short_answer: example correct answer as string
- **Explanation**: 1-3 sentences explaining why the answer is correct
- **Points**: Point value (typically 1-5 points per question)

## 3. Quiz Metadata
- **Total Points**: Sum of all question points
- **Estimated Minutes**: Realistic completion time (1-2 min per question)
- **Bloom's Coverage**: Object mapping each Bloom level to question count
  - Example: \`{ "remember": 2, "understand": 3, "apply": 2, "analyze": 1 }\`

# Bloom's Taxonomy Guidelines

Distribute questions across AT LEAST 2 cognitive levels:

## Remember (Knowledge)
- Recall facts, definitions, basic concepts
- Keywords: define, identify, list, name, recall, recognize
- Example: "What is the definition of X?"

## Understand (Comprehension)
- Explain ideas, interpret meaning, summarize concepts
- Keywords: describe, explain, summarize, paraphrase, interpret
- Example: "Explain the difference between X and Y."

## Apply (Application)
- Use information in new situations, solve problems
- Keywords: apply, demonstrate, solve, use, implement
- Example: "Given scenario X, which approach would you use?"

## Analyze (Analysis)
- Draw connections, identify patterns, compare/contrast
- Keywords: analyze, compare, contrast, differentiate, distinguish
- Example: "Compare the advantages and disadvantages of X vs Y."

**Target Distribution** (for balanced difficulty):
- 30-40% Remember (easy foundation)
- 30-40% Understand (core comprehension)
- 20-30% Apply (practical skills)
- 5-10% Analyze (advanced critical thinking)

# Question Type Guidelines

## Multiple Choice (Preferred - 60-70% of quiz)
- **Best for**: Assessing knowledge, comprehension, and application
- **Options**: 3-5 choices (4 is ideal)
- **Distractors**: Make incorrect options plausible but clearly wrong
- **Avoid**: "All of the above", "None of the above" (use sparingly)
- **Tip**: Vary correct answer position (not always "a")

## True/False (Simple Facts - 20-30% of quiz)
- **Best for**: Testing factual knowledge at Remember level
- **Keep it clear**: Avoid ambiguous statements
- **Avoid**: Double negatives, trick questions
- **Example**: "TypeScript is a superset of JavaScript. (True/False)"

## Short Answer (Use Sparingly - 0-10% of quiz)
- **Best for**: Testing understanding and application
- **Provide guidance**: Specify expected answer length/format
- **Grading**: Requires manual review (less scalable)
- **Example**: "Explain in 1-2 sentences why X is important."

# Difficulty Distribution

Balance questions across three difficulty levels:

## Easy (~40% of questions)
- Remember and basic Understand levels
- Directly stated in lesson content
- 1 point each

## Medium (~40% of questions)
- Understand and Apply levels
- Requires synthesis or application
- 2-3 points each

## Hard (~20% of questions)
- Apply and Analyze levels
- Requires critical thinking or problem-solving
- 3-5 points each

**Difficulty Bias Settings**:
- **Easy**: 60% easy, 30% medium, 10% hard
- **Balanced**: 40% easy, 40% medium, 20% hard (default)
- **Hard**: 20% easy, 40% medium, 40% hard

# Language Considerations

- Write all content in the target language (no mixing unless technical terms)
- For Russian: Use clear, grammatically correct Cyrillic script
- For English: Use accessible vocabulary appropriate to difficulty level
- Technical terms: Keep in original language (e.g., "API", "React", "TypeScript")
- Ensure explanations are culturally appropriate and clear

# Quality Standards

## Questions Must Be:
1. **Answerable from lesson content**: No external knowledge required
2. **Clear and unambiguous**: One defensible correct answer
3. **Appropriately difficult**: Match stated difficulty level
4. **Well-explained**: Explanations teach, not just confirm
5. **Pedagogically sound**: Cover learning objectives

## Avoid:
- Trick questions or gotchas
- Overly complex sentence structures
- Questions requiring memorization of trivial details
- Ambiguous wording that could have multiple interpretations
- Cultural references that may not translate

# Output Format

CRITICAL: Return ONLY raw JSON. No markdown code blocks.
Start with { and end with }.

{
  "type": "quiz",
  "quiz_title": "Assessment: [Lesson Topic]",
  "instructions": "This quiz has [N] questions. You need [X]% to pass. Questions will be shuffled.",
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "bloom_level": "remember",
      "difficulty": "easy",
      "question": "What is the definition of X?",
      "options": [
        { "id": "a", "text": "Correct definition" },
        { "id": "b", "text": "Plausible distractor 1" },
        { "id": "c", "text": "Plausible distractor 2" },
        { "id": "d", "text": "Plausible distractor 3" }
      ],
      "correct_answer": "a",
      "explanation": "X is defined as [explanation]. This is stated in the lesson introduction.",
      "points": 1
    },
    {
      "id": "q2",
      "type": "true_false",
      "bloom_level": "remember",
      "difficulty": "easy",
      "question": "TypeScript is a superset of JavaScript.",
      "correct_answer": true,
      "explanation": "This is correct. TypeScript extends JavaScript by adding static type checking.",
      "points": 1
    },
    {
      "id": "q3",
      "type": "multiple_choice",
      "bloom_level": "apply",
      "difficulty": "medium",
      "question": "Given scenario Y, which approach would you use?",
      "options": [
        { "id": "a", "text": "Approach A" },
        { "id": "b", "text": "Approach B (correct)" },
        { "id": "c", "text": "Approach C" }
      ],
      "correct_answer": "b",
      "explanation": "Approach B is correct because [reasoning]. This aligns with the best practice discussed in section 3.",
      "points": 2
    }
  ],
  "passing_score": 70,
  "time_limit_minutes": 15,
  "shuffle_questions": true,
  "shuffle_options": true,
  "metadata": {
    "total_points": 10,
    "estimated_minutes": 12,
    "bloom_coverage": {
      "remember": 3,
      "understand": 2,
      "apply": 2,
      "analyze": 1
    }
  }
}

# Critical Rules
- Write in the target language exclusively (except technical terms)
- Questions MUST be answerable from lesson content only
- Balance Bloom's levels (at least 2 levels represented)
- Follow difficulty distribution guidelines
- Provide clear, educational explanations
- Ensure total points and Bloom coverage are accurate
- Use proper JSON formatting (no trailing commas, valid escape sequences)
- Set shuffle_questions and shuffle_options to true by default
- Passing score defaults to 70% unless specified otherwise`;
}

/**
 * Build the user message for quiz generation
 *
 * Combines lesson context with generation settings into a structured prompt.
 *
 * @param params - Quiz generation parameters
 * @returns User message string with XML-delimited inputs
 */
export function buildQuizUserMessage(params: QuizPromptParams): string {
  const {
    lessonTitle,
    lessonContent,
    lessonObjectives,
    language,
    settings = {},
  } = params;

  const {
    questionCount,
    difficultyBias = 'balanced',
    questionTypes = ['multiple_choice', 'true_false', 'short_answer'],
    passingScore = 70,
    timeLimitMinutes,
  } = settings;

  // Format learning objectives
  const objectivesText = lessonObjectives
    .map((obj, idx) => `${idx + 1}. ${obj}`)
    .join('\n');

  // Format settings
  const settingsText = [
    questionCount ? `Question Count: ${questionCount}` : 'Question Count: 5-10',
    `Difficulty Bias: ${difficultyBias}`,
    `Question Types: ${questionTypes.join(', ')}`,
    `Passing Score: ${passingScore}%`,
    timeLimitMinutes ? `Time Limit: ${timeLimitMinutes} minutes` : 'Time Limit: None',
  ].join('\n');

  return `<LESSON_TITLE>
${sanitizeForPrompt(lessonTitle)}
</LESSON_TITLE>

<LESSON_CONTENT>
${sanitizeForPrompt(lessonContent)}
</LESSON_CONTENT>

<LEARNING_OBJECTIVES>
${sanitizeForPrompt(objectivesText)}
</LEARNING_OBJECTIVES>

<LANGUAGE>
${sanitizeForPrompt(language)}
</LANGUAGE>

<SETTINGS>
${settingsText}
</SETTINGS>`;
}

/**
 * Estimate token count for quiz generation
 *
 * Used for budget tracking and model selection.
 *
 * @param lessonContent - Lesson content to create quiz from
 * @param language - Target language code
 * @param questionCount - Number of questions to generate (default: 7)
 * @returns Estimated total tokens (input + output)
 */
export function estimateQuizTokens(
  lessonContent: string,
  language: 'ru' | 'en' = 'en',
  questionCount: number = 7
): number {
  const multiplier = TOKEN_MULTIPLIERS[language] || 1.0;

  // System prompt: ~1500 tokens
  const systemTokens = 1500;

  // Content tokens (adjusted for language)
  const charsPerToken = 4 / multiplier;
  const contentTokens = Math.ceil(lessonContent.length / charsPerToken);

  // Objectives and metadata: ~100 tokens
  const metadataTokens = Math.ceil(100 * multiplier);

  // Output estimate: ~150-200 tokens per question
  // Each question includes: question text, options, explanation, metadata
  const tokensPerQuestion = 175;
  const outputTokens = Math.ceil(questionCount * tokensPerQuestion * multiplier);

  // Quiz metadata overhead: ~200 tokens
  const quizMetadataTokens = Math.ceil(200 * multiplier);

  return systemTokens + contentTokens + metadataTokens + outputTokens + quizMetadataTokens;
}
