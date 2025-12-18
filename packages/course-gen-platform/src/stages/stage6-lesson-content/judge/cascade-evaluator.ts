/**
 * Cascading Evaluation Logic for Stage 6 Lesson Content
 * @module stages/stage6-lesson-content/judge/cascade-evaluator
 *
 * Implements efficient 3-stage cascading evaluation:
 * 1. Heuristic pre-filters (FREE) - filters 30-50% instantly
 * 2. Single cheap judge (50-70% of content passing Stage 1)
 * 3. CLEV voting (15-20% of content with low confidence)
 *
 * This approach optimizes cost by only invoking expensive CLEV voting
 * for borderline cases that require multiple judge consensus.
 *
 * Reference:
 * - docs/research/010-stage6-generation-strategy/ (cascade research)
 * - specs/010-stages-456-pipeline/data-model.md
 */

import type {
  JudgeVerdict,
  JudgeAggregatedResult,
  JudgeRecommendation,
  JudgeConfidence,
  CriteriaScores,
} from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { LessonContentBody, RAGChunk } from '@megacampus/shared-types/lesson-content';
import {
  executeCLEVVoting,
  selectJudgeModels,
  type CLEVEvaluationInput,
} from './clev-voter';
import {
  executeFactualVerification,
  type FactualVerificationResult,
  type FactualVerificationConfig,
  DEFAULT_FACTUAL_VERIFICATION_CONFIG,
} from './factual-verifier';
import { LLMClient, type LLMResponse } from '@/shared/llm';
import { logger } from '@/shared/logger';
import { DEFAULT_OSCQR_RUBRIC, type OSCQRRubric, type CriterionConfig } from '@megacampus/shared-types';
import { determineRecommendation } from '@megacampus/shared-types';
import { calculateWordCountThresholds } from '@megacampus/shared-types/judge-thresholds';

// ============================================================================
// TYPES
// ============================================================================

interface RawJudgeIssue {
  criterion: string;
  severity: string;
  location: string;
  description: string;
  suggestedFix: string;
}

interface RawJudgeResponse {
  overallScore: number;
  passed: boolean;
  confidence: string;
  criteriaScores: CriteriaScores;
  issues?: RawJudgeIssue[];
  strengths?: string[];
}

/**
 * Cascade evaluation stages
 */
export type CascadeStage = 'heuristic' | 'single_judge' | 'clev_voting';

/**
 * Heuristic thresholds for pre-filtering
 */
export interface HeuristicThresholds {
  /** Minimum word count (default: 500) */
  minWordCount: number;
  /** Maximum word count (default: 10000) */
  maxWordCount: number;
  /** Target Flesch-Kincaid grade level range (default: 8-12) */
  targetFleschKincaid: { min: number; max: number };
  /** Required section headers that must be present */
  requiredSections: string[];
  /** Minimum number of examples (default: 1) */
  minExamples: number;
  /** Minimum number of exercises (default: 1) */
  minExercises: number;
}

/**
 * Configuration for cascade evaluation
 */
export interface CascadeConfig {
  /** Heuristic thresholds for Stage 1 */
  heuristicThresholds: HeuristicThresholds;
  /** Confidence threshold for single judge to accept (default: 0.8) */
  singleJudgeConfidenceThreshold: number;
  /** Skip heuristic pre-filters (default: false) */
  skipHeuristics: boolean;
  /** Skip single judge and go directly to CLEV (default: false) */
  skipSingleJudge: boolean;
  /** Skip factual verification against RAG (default: false) */
  skipFactualVerification: boolean;
  /** Factual verification configuration */
  factualVerificationConfig: FactualVerificationConfig;
  /** Minimum factual accuracy score to pass (default: 0.6) */
  minFactualAccuracyScore: number;
  /** OSCQR rubric to use for evaluation */
  rubric?: OSCQRRubric;
}

/**
 * Results from heuristic pre-filter stage
 */
export interface HeuristicResults {
  /** Whether content passed all heuristic checks */
  passed: boolean;
  /** Actual word count */
  wordCount: number;
  /** Calculated Flesch-Kincaid grade level (0 if skipped for non-English) */
  fleschKincaid: number;
  /** Whether Flesch-Kincaid was skipped (non-English language) */
  fleschKincaidSkipped: boolean;
  /** Whether all required sections are present */
  sectionsPresent: boolean;
  /** List of missing required sections */
  missingSections: string[];
  /** Keyword coverage ratio (0-1) */
  keywordCoverage: number;
  /** Number of examples found */
  examplesCount: number;
  /** Number of exercises found */
  exercisesCount: number;
  /** Detailed failure reasons (blocking) */
  failureReasons: string[];
  /** Warnings (non-blocking, informational) */
  warnings: string[];
}

/**
 * Input for cascade evaluation
 */
export interface CascadeEvaluationInput {
  /** Lesson content to evaluate */
  lessonContent: LessonContentBody;
  /** Lesson specification for context */
  lessonSpec: LessonSpecificationV2;
  /** RAG chunks used in generation for fact verification */
  ragChunks: RAGChunk[];
  /** Content language for judge selection */
  language?: string;
}

/**
 * Result from cascade evaluation
 */
export interface CascadeResult {
  /** Which stage produced the final result */
  stage: CascadeStage;
  /** Whether content passed evaluation */
  passed: boolean;
  /** Results from heuristic stage (if run) */
  heuristicResults?: HeuristicResults;
  /** Results from factual verification against RAG (if run) */
  factualVerificationResult?: FactualVerificationResult;
  /** Single judge verdict (if run) */
  singleJudgeVerdict?: JudgeVerdict;
  /** CLEV voting result (if run) */
  clevResult?: JudgeAggregatedResult;
  /** Final overall score (0-1) */
  finalScore: number;
  /** Final recommendation */
  finalRecommendation: JudgeRecommendation;
  /** Total tokens used across all stages */
  totalTokensUsed: number;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Cost savings achieved by cascade (0-1) */
  costSavingsRatio: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Conclusion section markers by language
 * Used by checkRequiredSections to detect conclusion presence
 */
const CONCLUSION_MARKERS = {
  en: ['conclusion', 'summary', 'recap', 'takeaway', 'final thoughts'],
  ru: ['заключение', 'итоги', 'выводы', 'резюме', 'подведение', 'подытож'],
} as const;

/**
 * Regex pattern for conclusion detection (combines all languages)
 * Used for last-section fallback check
 */
const CONCLUSION_REGEX = /итог|вывод|заключ|резюме|summary|conclusion|подвед|recap|takeaway/i;

/**
 * Default heuristic thresholds
 */
const DEFAULT_HEURISTIC_THRESHOLDS: HeuristicThresholds = {
  minWordCount: 500,
  maxWordCount: 10000,
  targetFleschKincaid: { min: 8, max: 12 },
  requiredSections: ['introduction', 'conclusion'],
  minExamples: 0, // Disabled: examples extraction not implemented yet (smoother.ts line 268)
  minExercises: 0, // TODO: Re-enable when exercises generation is implemented in smoother.ts
};

/**
 * Default cascade configuration
 */
export const DEFAULT_CASCADE_CONFIG: CascadeConfig = {
  heuristicThresholds: DEFAULT_HEURISTIC_THRESHOLDS,
  singleJudgeConfidenceThreshold: 0.8,
  skipHeuristics: false,
  skipSingleJudge: false,
  skipFactualVerification: false,
  factualVerificationConfig: DEFAULT_FACTUAL_VERIFICATION_CONFIG,
  minFactualAccuracyScore: 0.6,
  rubric: DEFAULT_OSCQR_RUBRIC,
};

// ============================================================================
// FLESCH-KINCAID CALCULATOR
// ============================================================================

/**
 * Count syllables in a word using vowel group approximation
 *
 * Algorithm:
 * 1. Count vowel groups (a, e, i, o, u, y)
 * 2. Subtract 1 for silent 'e' at end
 * 3. Add 1 for 'le' endings
 * 4. Minimum 1 syllable per word
 *
 * @param word - Word to count syllables for
 * @returns Estimated syllable count
 */
export function countSyllables(word: string): number {
  const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');

  if (cleanWord.length === 0) return 0;
  if (cleanWord.length <= 3) return 1;

  // Count vowel groups
  const vowelGroups = cleanWord.match(/[aeiouy]+/g) || [];
  let count = vowelGroups.length;

  // Subtract for silent 'e' at end
  if (cleanWord.endsWith('e') && !cleanWord.endsWith('le')) {
    count = Math.max(1, count - 1);
  }

  // Handle common suffixes that don't add syllables
  if (cleanWord.endsWith('es') || cleanWord.endsWith('ed')) {
    const beforeSuffix = cleanWord.slice(0, -2);
    if (!beforeSuffix.match(/[aeiouy]$/)) {
      count = Math.max(1, count - 1);
    }
  }

  return Math.max(1, count);
}

/**
 * Calculate Flesch-Kincaid Grade Level
 *
 * Formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 *
 * Result interpretation:
 * - 5-6: Elementary school
 * - 7-8: Middle school
 * - 9-12: High school
 * - 13-16: College level
 * - 17+: Graduate level
 *
 * @param text - Text content to analyze
 * @returns Flesch-Kincaid grade level
 */
export function calculateFleschKincaid(text: string): number {
  // Split into sentences
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentenceCount = Math.max(1, sentences.length);

  // Split into words
  const words = text.match(/\b[a-zA-Z]+\b/g) || [];
  const wordCount = Math.max(1, words.length);

  // Count total syllables
  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);

  // Calculate Flesch-Kincaid Grade Level
  const gradeLevel =
    0.39 * (wordCount / sentenceCount) +
    11.8 * (syllableCount / wordCount) -
    15.59;

  // Clamp to reasonable range
  return Math.max(1, Math.min(20, gradeLevel));
}

// ============================================================================
// HEURISTIC PRE-FILTERS
// ============================================================================

/**
 * Extract all text content from lesson body for analysis
 *
 * @param content - Lesson content body
 * @returns Combined text content
 */
function extractTextContent(content: LessonContentBody): string {
  const parts: string[] = [];

  // Add intro
  if (content.intro) {
    parts.push(content.intro);
  }

  // Add all sections
  for (const section of content.sections) {
    parts.push(section.title);
    parts.push(section.content);
  }

  // Add examples
  for (const example of content.examples) {
    parts.push(example.title);
    parts.push(example.content);
    if (example.code) {
      parts.push(example.code);
    }
  }

  // Add exercises
  for (const exercise of content.exercises) {
    parts.push(exercise.question);
    if (exercise.hints) {
      parts.push(...exercise.hints);
    }
    if (exercise.solution) {
      parts.push(exercise.solution);
    }
  }

  return parts.join(' ');
}

/**
 * Check if required sections are present
 *
 * For language-agnostic support:
 * - "introduction" requirement is satisfied by non-empty intro field
 * - "conclusion" requirement is satisfied by having at least one section
 * - Other requirements check section titles and content
 *
 * @param content - Lesson content
 * @param requiredSections - List of required section keywords
 * @returns Object with presence info and missing sections
 */
function checkRequiredSections(
  content: LessonContentBody,
  requiredSections: string[]
): { present: boolean; missing: string[] } {
  const sectionTitles = content.sections.map((s) => s.title.toLowerCase());
  const allText = extractTextContent(content).toLowerCase();

  const missing: string[] = [];

  for (const required of requiredSections) {
    const requiredLower = required.toLowerCase();

    // Special handling for "introduction" - check if intro field exists and has content
    if (requiredLower === 'introduction') {
      const hasIntro = content.intro && content.intro.trim().length > 50;
      if (!hasIntro) {
        missing.push(required);
      }
      continue;
    }

    // Special handling for "conclusion" - check if we have sections
    // For Russian content and smoother outputs: 3+ sections OR explicit conclusion markers
    if (requiredLower === 'conclusion') {
      const allMarkers = [...CONCLUSION_MARKERS.en, ...CONCLUSION_MARKERS.ru];
      // Assumes 3+ sections includes intro + body + conclusion structure (common educational pattern)
      const hasConclusion = content.sections.length >= 3 ||
        sectionTitles.some((title) =>
          allMarkers.some(marker => title.includes(marker))
        ) ||
        // Also check if last section title contains conclusion-like patterns
        (sectionTitles.length > 0 &&
          CONCLUSION_REGEX.test(sectionTitles[sectionTitles.length - 1]));

      if (!hasConclusion) {
        missing.push(required);
      }
      continue;
    }

    // Default behavior for other required sections
    const found = sectionTitles.some((title) => title.includes(requiredLower)) ||
      allText.includes(requiredLower);

    if (!found) {
      missing.push(required);
    }
  }

  return {
    present: missing.length === 0,
    missing,
  };
}

/**
 * Calculate keyword coverage from learning objectives
 *
 * @param content - Lesson content
 * @param lessonSpec - Lesson specification with objectives
 * @returns Coverage ratio (0-1)
 */
function calculateKeywordCoverage(
  content: LessonContentBody,
  lessonSpec: LessonSpecificationV2
): number {
  const allText = extractTextContent(content).toLowerCase();

  // Extract keywords from learning objectives
  const keywords = new Set<string>();
  for (const objective of lessonSpec.learning_objectives) {
    // Extract significant words (>3 chars, not common words)
    const words = objective.objective.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const commonWords = new Set(['that', 'this', 'with', 'from', 'have', 'will', 'able', 'about']);
    for (const word of words) {
      if (!commonWords.has(word)) {
        keywords.add(word);
      }
    }
  }

  if (keywords.size === 0) return 1.0;

  // Count how many keywords are present
  let foundCount = 0;
  for (const keyword of keywords) {
    if (allText.includes(keyword)) {
      foundCount++;
    }
  }

  return foundCount / keywords.size;
}

/**
 * Count words in text content (language-agnostic)
 *
 * Uses whitespace splitting to count words in any language,
 * including Cyrillic, Chinese, etc.
 *
 * @param text - Text content to count words in
 * @returns Word count
 */
function countWordsInText(text: string): number {
  // Remove markdown/code artifacts that shouldn't be counted as words
  const cleanedText = text
    .replace(/```[\s\S]*?```/g, ' ') // Remove code blocks
    .replace(/`[^`]+`/g, ' ') // Remove inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
    .replace(/[#*_~`]/g, '') // Remove markdown symbols
    .trim();

  // Split on whitespace and filter empty strings
  return cleanedText.split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Run heuristic pre-filters on content
 *
 * Stage 1 of cascade evaluation - filters 30-50% of content instantly.
 * Checks: word count, Flesch-Kincaid, required sections, keywords, examples, exercises
 *
 * Note: Flesch-Kincaid readability is ONLY valid for English text.
 * For non-English languages (ru, es, de, etc.), this check is skipped because the
 * algorithm counts English syllables using vowel patterns that don't apply to other languages.
 *
 * @param content - Lesson content to evaluate
 * @param lessonSpec - Lesson specification
 * @param thresholds - Heuristic thresholds
 * @param language - Content language (default: 'en'). Flesch-Kincaid skipped for non-English.
 * @returns Heuristic results
 */
export function runHeuristicFilters(
  content: LessonContentBody,
  lessonSpec: LessonSpecificationV2,
  thresholds: HeuristicThresholds = DEFAULT_HEURISTIC_THRESHOLDS,
  language: string = 'en'
): HeuristicResults {
  const startTime = Date.now();
  const failureReasons: string[] = [];
  const warnings: string[] = [];

  // Extract text for analysis
  const fullText = extractTextContent(content);

  // Check word count - use language-agnostic counting
  const wordCount = countWordsInText(fullText);

  // Calculate dynamic word count thresholds based on lesson duration
  // Default to 15 minutes if not specified
  const durationMinutes = lessonSpec.estimated_duration_minutes || 15;
  const dynamicThresholds = calculateWordCountThresholds(durationMinutes);

  logger.debug({
    msg: 'Using dynamic word count thresholds',
    lessonId: lessonSpec.lesson_id,
    durationMinutes,
    minWordCount: dynamicThresholds.minWordCount,
    maxWordCount: dynamicThresholds.maxWordCount,
    actualWordCount: wordCount,
  });

  // Word count checks are WARNINGS, not blockers
  // We care more about content being too short, but still don't block
  if (wordCount < dynamicThresholds.minWordCount) {
    warnings.push(
      `Word count (${wordCount}) below minimum (${dynamicThresholds.minWordCount}) for ${durationMinutes}min lesson`
    );
  }
  if (wordCount > dynamicThresholds.maxWordCount) {
    warnings.push(
      `Word count (${wordCount}) exceeds maximum (${dynamicThresholds.maxWordCount}) for ${durationMinutes}min lesson`
    );
  }

  // Calculate Flesch-Kincaid grade level (ONLY for English)
  // Flesch-Kincaid uses English syllable counting (/[aeiouy]+/g) which doesn't work for:
  // - Russian (Cyrillic): а, е, и, о, у, ы, э, ю, я
  // - Spanish, German, French, etc. (different vowel patterns)
  const isEnglish = language === 'en' || language === 'english';
  const fleschKincaidSkipped = !isEnglish;
  let fleschKincaid = 0;

  if (isEnglish) {
    fleschKincaid = calculateFleschKincaid(fullText);

    if (fleschKincaid < thresholds.targetFleschKincaid.min) {
      failureReasons.push(
        `Flesch-Kincaid grade level (${fleschKincaid.toFixed(1)}) below target minimum (${thresholds.targetFleschKincaid.min})`
      );
    }
    if (fleschKincaid > thresholds.targetFleschKincaid.max) {
      failureReasons.push(
        `Flesch-Kincaid grade level (${fleschKincaid.toFixed(1)}) exceeds target maximum (${thresholds.targetFleschKincaid.max})`
      );
    }
  } else {
    logger.debug({
      msg: 'Flesch-Kincaid check skipped for non-English content',
      language,
      lessonId: lessonSpec.lesson_id,
    });
  }

  // Check required sections
  const sectionsCheck = checkRequiredSections(content, thresholds.requiredSections);

  if (!sectionsCheck.present) {
    failureReasons.push(
      `Missing required sections: ${sectionsCheck.missing.join(', ')}`
    );
  }

  // Calculate keyword coverage
  const keywordCoverage = calculateKeywordCoverage(content, lessonSpec);

  if (keywordCoverage < 0.5) {
    failureReasons.push(
      `Keyword coverage (${(keywordCoverage * 100).toFixed(0)}%) below 50% threshold`
    );
  }

  // Check examples count
  const examplesCount = content.examples.length;
  if (examplesCount < thresholds.minExamples) {
    failureReasons.push(
      `Examples count (${examplesCount}) below minimum (${thresholds.minExamples})`
    );
  }

  // Check exercises count
  const exercisesCount = content.exercises.length;
  if (exercisesCount < thresholds.minExercises) {
    failureReasons.push(
      `Exercises count (${exercisesCount}) below minimum (${thresholds.minExercises})`
    );
  }

  const passed = failureReasons.length === 0;
  const durationMs = Date.now() - startTime;

  logger.info({
    msg: 'Heuristic pre-filter complete',
    passed,
    wordCount,
    fleschKincaid: fleschKincaid.toFixed(1),
    sectionsPresent: sectionsCheck.present,
    keywordCoverage: (keywordCoverage * 100).toFixed(0) + '%',
    examplesCount,
    exercisesCount,
    failureCount: failureReasons.length,
    warningsCount: warnings.length,
    durationMs,
  });

  // Log warnings separately if any
  if (warnings.length > 0) {
    logger.warn({
      msg: 'Heuristic warnings (non-blocking)',
      lessonId: lessonSpec.lesson_id,
      warnings,
    });
  }

  return {
    passed,
    wordCount,
    fleschKincaid,
    fleschKincaidSkipped,
    sectionsPresent: sectionsCheck.present,
    missingSections: sectionsCheck.missing,
    keywordCoverage,
    examplesCount,
    exercisesCount,
    failureReasons,
    warnings,
  };
}

// ============================================================================
// SINGLE JUDGE EXECUTION
// ============================================================================

/**
 * Build evaluation prompt for single judge
 */
function buildSingleJudgePrompt(
  input: CascadeEvaluationInput,
  rubric: OSCQRRubric
): string {
  const { lessonContent, lessonSpec, ragChunks } = input;

  // Format learning objectives
  const objectives = lessonSpec.learning_objectives
    .map((lo) => `- [${lo.id}] ${lo.objective} (Bloom: ${lo.bloom_level})`)
    .join('\n');

  // Format RAG context for fact verification
  const ragContext = ragChunks.length > 0
    ? ragChunks
        .slice(0, 5)
        .map((chunk) => `[${chunk.document_name}]: ${chunk.content.slice(0, 500)}...`)
        .join('\n\n')
    : 'No RAG context provided.';

  // Format content for evaluation
  const contentSummary = `
## Introduction
${lessonContent.intro.slice(0, 500)}...

## Sections (${lessonContent.sections.length} total)
${lessonContent.sections.map((s) => `### ${s.title}\n${s.content.slice(0, 300)}...`).join('\n\n')}

## Examples (${lessonContent.examples.length} total)
${lessonContent.examples.map((e) => `- ${e.title}`).join('\n')}

## Exercises (${lessonContent.exercises.length} total)
${lessonContent.exercises.map((e) => `- ${e.question.slice(0, 100)}...`).join('\n')}
`;

  // Format rubric criteria
  const rubricCriteria = rubric.criteria
    .map((c: CriterionConfig) => `- **${c.criterion}** (${(c.weight * 100).toFixed(0)}% weight): ${c.description}`)
    .join('\n');

  return `You are an expert educational content evaluator. Evaluate the following lesson content against the OSCQR-based rubric.

## LESSON SPECIFICATION

**Title**: ${lessonSpec.title}
**Description**: ${lessonSpec.description}
**Difficulty**: ${lessonSpec.difficulty_level}
**Target Audience**: ${lessonSpec.metadata.target_audience}
**Content Archetype**: ${lessonSpec.metadata.content_archetype}

### Learning Objectives
${objectives}

## LESSON CONTENT TO EVALUATE
${contentSummary}

## REFERENCE MATERIALS (for fact verification)
${ragContext}

## EVALUATION RUBRIC

Evaluate against these 6 criteria (scores 0.0-1.0):
${rubricCriteria}

**Passing Threshold**: ${rubric.passingThreshold}

## OUTPUT FORMAT

Respond ONLY with valid JSON in this exact format:
{
  "overallScore": <number 0-1>,
  "passed": <boolean>,
  "confidence": "<high|medium|low>",
  "criteriaScores": {
    "learning_objective_alignment": <number 0-1>,
    "pedagogical_structure": <number 0-1>,
    "factual_accuracy": <number 0-1>,
    "clarity_readability": <number 0-1>,
    "engagement_examples": <number 0-1>,
    "completeness": <number 0-1>
  },
  "issues": [
    {
      "criterion": "<criterion_name>",
      "severity": "<critical|major|minor>",
      "location": "<where in content>",
      "description": "<what is wrong>",
      "suggestedFix": "<how to fix>"
    }
  ],
  "strengths": ["<strength 1>", "<strength 2>"]
}

Evaluate objectively, focusing on educational quality and alignment with objectives.`;
}

/**
 * Parse single judge JSON response
 */
function parseSingleJudgeResponse(content: string): {
  overallScore: number;
  passed: boolean;
  confidence: JudgeConfidence;
  criteriaScores: CriteriaScores;
  issues: Array<{
    criterion: string;
    severity: string;
    location: string;
    description: string;
    suggestedFix: string;
  }>;
  strengths: string[];
} | null {
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content;

    // Remove markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Try to find JSON object in response
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    const parsed = JSON.parse(jsonStr) as unknown as RawJudgeResponse;

    // Validate required fields
    if (
      typeof parsed.overallScore !== 'number' ||
      typeof parsed.passed !== 'boolean' ||
      typeof parsed.confidence !== 'string' ||
      !parsed.criteriaScores
    ) {
      return null;
    }

    return {
      overallScore: parsed.overallScore,
      passed: parsed.passed,
      confidence: parsed.confidence as JudgeConfidence,
      criteriaScores: parsed.criteriaScores,
      issues: parsed.issues || [],
      strengths: parsed.strengths || [],
    };
  } catch {
    return null;
  }
}

/**
 * Execute single judge evaluation (Stage 2)
 *
 * Uses the cheapest available judge model for initial evaluation.
 * If confidence is high enough, this is the final result.
 *
 * @param input - Evaluation input
 * @param config - Cascade configuration
 * @returns Judge verdict or null on failure
 */
async function executeSingleJudge(
  input: CascadeEvaluationInput,
  config: CascadeConfig
): Promise<JudgeVerdict | null> {
  const llmClient = new LLMClient();
  const startTime = Date.now();
  const rubric = config.rubric || DEFAULT_OSCQR_RUBRIC;

  // Select cheapest judge model based on language
  const language = input.language || 'en';
  const judgeModels = await selectJudgeModels(language);

  // Use secondary judge (cheaper) for single pass
  const modelConfig = judgeModels.secondary;

  const prompt = buildSingleJudgePrompt(input, rubric);

  logger.info({
    msg: 'Executing single judge evaluation',
    judge: modelConfig.displayName,
    lessonId: input.lessonSpec.lesson_id,
  });

  try {
    const response: LLMResponse = await llmClient.generateCompletion(prompt, {
      model: modelConfig.modelId,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
      systemPrompt: 'You are a precise educational content evaluator. Output only valid JSON.',
    });

    const durationMs = Date.now() - startTime;

    // Parse JSON response
    const parsed = parseSingleJudgeResponse(response.content);

    if (!parsed) {
      logger.warn({
        msg: 'Failed to parse single judge response',
        judge: modelConfig.displayName,
        responseLength: response.content.length,
      });
      return null;
    }

    // Build verdict
    const verdict: JudgeVerdict = {
      overallScore: parsed.overallScore,
      passed: parsed.passed,
      confidence: parsed.confidence,
      criteriaScores: parsed.criteriaScores,
      issues: parsed.issues.map((issue) => ({
        criterion: issue.criterion as keyof CriteriaScores,
        severity: issue.severity as 'critical' | 'major' | 'minor',
        location: issue.location,
        description: issue.description,
        suggestedFix: issue.suggestedFix,
      })),
      strengths: parsed.strengths,
      recommendation: determineRecommendation(
        parsed.overallScore,
        parsed.issues.map((issue) => ({
          criterion: issue.criterion as keyof CriteriaScores,
          severity: issue.severity as 'critical' | 'major' | 'minor',
          location: issue.location,
          description: issue.description,
          suggestedFix: issue.suggestedFix,
        })),
        parsed.confidence
      ),
      judgeModel: modelConfig.modelId,
      temperature: modelConfig.temperature,
      tokensUsed: response.totalTokens,
      durationMs,
    };

    logger.info({
      msg: 'Single judge evaluation complete',
      judge: modelConfig.displayName,
      overallScore: verdict.overallScore,
      passed: verdict.passed,
      confidence: verdict.confidence,
      recommendation: verdict.recommendation,
      tokensUsed: verdict.tokensUsed,
      durationMs,
    });

    return verdict;
  } catch (error) {
    logger.error({
      msg: 'Single judge evaluation failed',
      judge: modelConfig.displayName,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ============================================================================
// MAIN CASCADE EVALUATION
// ============================================================================

/**
 * Execute cascading evaluation
 *
 * Three-stage cascade for cost-efficient content evaluation:
 *
 * Stage 1: Heuristic pre-filters (FREE)
 * - Length checks (min/max word count)
 * - Flesch-Kincaid readability (target grade level)
 * - Keyword coverage (required terms present)
 * - Structure validation (sections present)
 * - Filters 30-50% of content instantly
 *
 * Stage 2: Single cheap judge (50-70% of content passing Stage 1)
 * - If confidence score >= threshold -> ACCEPT/REJECT
 * - If confidence score < threshold -> proceed to Stage 3
 *
 * Stage 3: CLEV conditional 3x voting (15-20% of content)
 * - Invoked only for low-confidence cases
 * - Full CLEV voting with consensus
 *
 * @param input - Evaluation input (lesson content, spec, RAG chunks)
 * @param config - Cascade configuration (optional, uses defaults)
 * @returns CascadeResult with final verdict and stage information
 */
export async function executeCascadeEvaluation(
  input: CascadeEvaluationInput,
  config: Partial<CascadeConfig> = {}
): Promise<CascadeResult> {
  const finalConfig: CascadeConfig = {
    ...DEFAULT_CASCADE_CONFIG,
    ...config,
    heuristicThresholds: {
      ...DEFAULT_HEURISTIC_THRESHOLDS,
      ...config.heuristicThresholds,
    },
    factualVerificationConfig: {
      ...DEFAULT_FACTUAL_VERIFICATION_CONFIG,
      ...config.factualVerificationConfig,
    },
  };

  const startTime = Date.now();
  let totalTokensUsed = 0;

  logger.info({
    msg: 'Starting cascade evaluation',
    lessonId: input.lessonSpec.lesson_id,
    skipHeuristics: finalConfig.skipHeuristics,
    skipSingleJudge: finalConfig.skipSingleJudge,
    confidenceThreshold: finalConfig.singleJudgeConfidenceThreshold,
  });

  // =========================================================================
  // STAGE 1: Heuristic Pre-filters (FREE)
  // =========================================================================

  let heuristicResults: HeuristicResults | undefined;

  if (!finalConfig.skipHeuristics) {
    // Pass language to heuristic filters - Flesch-Kincaid is skipped for non-English
    const language = input.language || 'en';
    heuristicResults = runHeuristicFilters(
      input.lessonContent,
      input.lessonSpec,
      finalConfig.heuristicThresholds,
      language
    );

    if (!heuristicResults.passed) {
      logger.info({
        msg: 'Content failed heuristic pre-filters, recommending REGENERATE',
        lessonId: input.lessonSpec.lesson_id,
        failureReasons: heuristicResults.failureReasons,
      });

      return {
        stage: 'heuristic',
        passed: false,
        heuristicResults,
        finalScore: 0,
        finalRecommendation: 'REGENERATE',
        totalTokensUsed: 0,
        totalDurationMs: Date.now() - startTime,
        costSavingsRatio: 1.0, // 100% savings - no LLM calls
      };
    }

    logger.info({
      msg: 'Content passed heuristic pre-filters, proceeding to factual verification',
      lessonId: input.lessonSpec.lesson_id,
    });
  }

  // =========================================================================
  // STAGE 1.5: Factual Verification against RAG (FREE - no LLM calls)
  // =========================================================================

  let factualVerificationResult: FactualVerificationResult | undefined;

  if (!finalConfig.skipFactualVerification && input.ragChunks.length > 0) {
    const textContent = extractTextContent(input.lessonContent);

    factualVerificationResult = executeFactualVerification(
      textContent,
      input.ragChunks,
      undefined, // No entropy result yet - could be added later
      finalConfig.factualVerificationConfig
    );

    logger.info({
      msg: 'Factual verification complete',
      lessonId: input.lessonSpec.lesson_id,
      accuracyScore: factualVerificationResult.overallAccuracyScore.toFixed(3),
      claimsVerified: factualVerificationResult.verifiedClaims,
      claimsContradicted: factualVerificationResult.contradictedClaims,
      claimsUnverified: factualVerificationResult.unverifiedClaims,
      requiresHumanReview: factualVerificationResult.requiresHumanReview,
    });

    // Factual verification failure logic:
    // - FAIL if there are actual contradictions with source material
    // - PASS if only "no evidence" claims (unverifiable ≠ wrong)
    // - Log warning for review but don't block generation
    const hasActualContradictions = factualVerificationResult.contradictedClaims > 0;
    const hasSignificantUnverified = factualVerificationResult.unverifiedClaims > 2;

    if (hasActualContradictions) {
      logger.warn({
        msg: 'Content failed factual verification - contradictions found with source materials',
        lessonId: input.lessonSpec.lesson_id,
        accuracyScore: factualVerificationResult.overallAccuracyScore,
        minRequired: finalConfig.minFactualAccuracyScore,
        contradictedClaims: factualVerificationResult.contradictedClaims,
        flaggedSentences: factualVerificationResult.flaggedSentences.slice(0, 3),
      });

      return {
        stage: 'heuristic', // Still considered heuristic stage (pre-LLM)
        passed: false,
        heuristicResults,
        factualVerificationResult,
        finalScore: factualVerificationResult.overallAccuracyScore,
        finalRecommendation: 'REGENERATE',
        totalTokensUsed: 0,
        totalDurationMs: Date.now() - startTime,
        costSavingsRatio: 1.0, // 100% savings - no LLM calls
      };
    }

    // Log info when claims couldn't be verified (but no contradictions)
    if (factualVerificationResult.noEvidenceClaims > 0 || hasSignificantUnverified) {
      logger.info({
        msg: 'Factual verification: some claims unverifiable (no contradictions found)',
        lessonId: input.lessonSpec.lesson_id,
        noEvidenceClaims: factualVerificationResult.noEvidenceClaims,
        unverifiedClaims: factualVerificationResult.unverifiedClaims,
        note: 'Proceeding to LLM judge - no factual errors detected',
      });
    }
  } else if (!finalConfig.skipFactualVerification && input.ragChunks.length === 0) {
    logger.debug({
      msg: 'Skipping factual verification - no RAG chunks available',
      lessonId: input.lessonSpec.lesson_id,
    });
  }

  // =========================================================================
  // STAGE 2: Single Cheap Judge (50-70% of content)
  // =========================================================================

  let singleJudgeVerdict: JudgeVerdict | undefined;

  if (!finalConfig.skipSingleJudge) {
    singleJudgeVerdict = await executeSingleJudge(input, finalConfig) || undefined;

    if (singleJudgeVerdict) {
      totalTokensUsed += singleJudgeVerdict.tokensUsed;

      // Check confidence threshold
      const confidenceRank: Record<JudgeConfidence, number> = { high: 2, medium: 1, low: 0 };
      const isHighConfidence = confidenceRank[singleJudgeVerdict.confidence] >= 1; // medium or high
      const isAboveThreshold = singleJudgeVerdict.overallScore >= finalConfig.singleJudgeConfidenceThreshold ||
        singleJudgeVerdict.overallScore < (1 - finalConfig.singleJudgeConfidenceThreshold);

      if (isHighConfidence && isAboveThreshold) {
        logger.info({
          msg: 'Single judge verdict accepted with high confidence',
          lessonId: input.lessonSpec.lesson_id,
          score: singleJudgeVerdict.overallScore,
          confidence: singleJudgeVerdict.confidence,
          recommendation: singleJudgeVerdict.recommendation,
        });

        return {
          stage: 'single_judge',
          passed: singleJudgeVerdict.passed,
          heuristicResults,
          factualVerificationResult,
          singleJudgeVerdict,
          finalScore: singleJudgeVerdict.overallScore,
          finalRecommendation: singleJudgeVerdict.recommendation,
          totalTokensUsed,
          totalDurationMs: Date.now() - startTime,
          costSavingsRatio: 0.67, // 67% savings - 1 judge instead of 3
        };
      }

      logger.info({
        msg: 'Single judge has low confidence, proceeding to CLEV voting',
        lessonId: input.lessonSpec.lesson_id,
        score: singleJudgeVerdict.overallScore,
        confidence: singleJudgeVerdict.confidence,
      });
    } else {
      logger.warn({
        msg: 'Single judge failed, proceeding to CLEV voting',
        lessonId: input.lessonSpec.lesson_id,
      });
    }
  }

  // =========================================================================
  // STAGE 3: CLEV Voting (15-20% of content)
  // =========================================================================

  const clevInput: CLEVEvaluationInput = {
    lessonContent: input.lessonContent,
    lessonSpec: input.lessonSpec,
    ragChunks: input.ragChunks,
    language: input.language,
  };

  const clevResult = await executeCLEVVoting(clevInput, {
    rubric: finalConfig.rubric,
  });

  // Sum tokens from all CLEV verdicts
  const clevTokens = clevResult.verdicts.reduce((sum, v) => sum + v.tokensUsed, 0);
  totalTokensUsed += clevTokens;

  logger.info({
    msg: 'CLEV voting complete',
    lessonId: input.lessonSpec.lesson_id,
    aggregatedScore: clevResult.aggregatedScore,
    finalRecommendation: clevResult.finalRecommendation,
    votingMethod: clevResult.votingMethod,
    consensusReached: clevResult.consensusReached,
    judgesUsed: clevResult.verdicts.length,
  });

  return {
    stage: 'clev_voting',
    passed: clevResult.aggregatedScore >= (finalConfig.rubric?.passingThreshold ?? 0.7),
    heuristicResults,
    factualVerificationResult,
    singleJudgeVerdict,
    clevResult,
    finalScore: clevResult.aggregatedScore,
    finalRecommendation: clevResult.finalRecommendation,
    totalTokensUsed,
    totalDurationMs: Date.now() - startTime,
    costSavingsRatio: 0, // No savings - full CLEV voting
  };
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

/**
 * Re-export CLEV voting functions from clev-voter module.
 *
 * These are re-exported here for convenience so consumers can import
 * all judge-related functions from a single module (cascade-evaluator).
 *
 * Alternative: Import directly from './clev-voter' for explicit dependency.
 *
 * @example
 * // Option 1: Import from cascade-evaluator (convenience)
 * import { executeCascadeEvaluation, executeCLEVVoting } from './cascade-evaluator';
 *
 * // Option 2: Import from specific modules (explicit)
 * import { executeCascadeEvaluation } from './cascade-evaluator';
 * import { executeCLEVVoting } from './clev-voter';
 */
export { executeCLEVVoting, selectJudgeModels } from './clev-voter';
export {
  executeFactualVerification,
  getFactualVerificationSummary,
  type FactualVerificationResult,
  type FactualVerificationConfig,
} from './factual-verifier';
