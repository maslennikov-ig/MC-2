/**
 * Heuristic helper functions for cascade evaluation
 * @module stages/stage6-lesson-content/judge/cascade/heuristic-helpers
 */

import type { LessonContentBody } from '@megacampus/shared-types/lesson-content';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { calculateWordCountThresholds } from '@megacampus/shared-types/judge-thresholds';
import { logger } from '@/shared/logger';
import { calculateFleschKincaid } from './text-utils';
import { CONCLUSION_MARKERS, CONCLUSION_REGEX, DEFAULT_HEURISTIC_THRESHOLDS } from './constants';
import type { HeuristicThresholds, HeuristicResults } from './types';

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
  for (const section of content.sections ?? []) {
    parts.push(section.title);
    parts.push(section.content);
  }

  // Add examples
  for (const example of content.examples ?? []) {
    parts.push(example.title);
    parts.push(example.content);
    if (example.code) {
      parts.push(example.code);
    }
  }

  // Add exercises
  for (const exercise of content.exercises ?? []) {
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
  const sectionTitles = content.sections.map(s => s.title.toLowerCase());
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
      const hasConclusion =
        content.sections.length >= 3 ||
        sectionTitles.some(title => allMarkers.some(marker => title.includes(marker))) ||
        // Also check if last section title contains conclusion-like patterns
        (sectionTitles.length > 0 &&
          CONCLUSION_REGEX.test(sectionTitles[sectionTitles.length - 1]));

      if (!hasConclusion) {
        missing.push(required);
      }
      continue;
    }

    // Special handling for "exercises" - check content.exercises array
    if (requiredLower === 'exercises') {
      const hasExercises = content.exercises && content.exercises.length >= 2;
      if (!hasExercises) {
        missing.push(required);
      }
      continue;
    }

    // Default behavior for other required sections
    const found =
      sectionTitles.some(title => title.includes(requiredLower)) || allText.includes(requiredLower);

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

  // Extract keywords from learning objectives (supports Latin and Cyrillic)
  const keywords = new Set<string>();

  // Common words to exclude (English and Russian)
  const commonWords = new Set([
    // English
    'that',
    'this',
    'with',
    'from',
    'have',
    'will',
    'able',
    'about',
    'which',
    'their',
    'when',
    'what',
    'your',
    'more',
    'been',
    'some',
    // Russian
    'этот',
    'этой',
    'этих',
    'этим',
    'этого',
    'который',
    'которая',
    'которое',
    'которые',
    'которых',
    'более',
    'менее',
    'также',
    'между',
    'через',
    'после',
    'перед',
    'около',
    'вместе',
    'быть',
    'было',
    'были',
    'будет',
    'будут',
    'можно',
    'нужно',
    'должен',
    'должна',
    'должны',
    'своих',
    'свою',
    'свои',
    'своей',
    'своего',
    'всех',
    'всей',
    'всего',
  ]);

  for (const objective of lessonSpec.learning_objectives) {
    const text = objective.objective.toLowerCase();

    // Extract Latin words (>3 chars)
    const latinWords = text.match(/\b[a-z]{4,}\b/g) || [];

    // Extract Cyrillic words (>3 chars) using Unicode property
    const cyrillicWords = text.match(/[а-яёА-ЯЁ]{4,}/g) || [];

    for (const word of [...latinWords, ...cyrillicWords]) {
      const normalizedWord = word.toLowerCase();
      if (!commonWords.has(normalizedWord)) {
        keywords.add(normalizedWord);
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

  logger.debug({
    msg: 'Keyword coverage calculation',
    totalKeywords: keywords.size,
    foundKeywords: foundCount,
    coverage: ((foundCount / keywords.size) * 100).toFixed(0) + '%',
    sampleKeywords: Array.from(keywords).slice(0, 5),
  });

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
  return cleanedText.split(/\s+/).filter(word => word.length > 0).length;
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
    failureReasons.push(`Missing required sections: ${sectionsCheck.missing.join(', ')}`);
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
