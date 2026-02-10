/**
 * Text readability metrics calculations
 * @module stages/stage6-lesson-content/judge/filters/text-metrics
 */

// ============================================================================
// SYLLABLE AND READABILITY CALCULATIONS
// ============================================================================

/**
 * Count syllables in a word using vowel group approximation
 *
 * Algorithm:
 * 1. Count vowel groups (a, e, i, o, u, y)
 * 2. Subtract 1 for silent 'e' at end
 * 3. Handle common suffixes
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
export function calculateFleschKincaidGrade(text: string): number {
  // Split into sentences
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceCount = Math.max(1, sentences.length);

  // Split into words
  const words = text.match(/\b[a-zA-Z]+\b/g) || [];
  const wordCount = Math.max(1, words.length);

  // Count total syllables
  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);

  // Calculate Flesch-Kincaid Grade Level
  const gradeLevel =
    0.39 * (wordCount / sentenceCount) + 11.8 * (syllableCount / wordCount) - 15.59;

  // Clamp to reasonable range
  return Math.max(1, Math.min(20, gradeLevel));
}

/**
 * Calculate Flesch Reading Ease score
 *
 * Formula: 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
 *
 * Result interpretation:
 * - 90-100: Very easy (5th grade)
 * - 60-70: Standard (8th-9th grade)
 * - 30-50: Difficult (college level)
 * - 0-30: Very difficult (graduate level)
 *
 * @param text - Text content to analyze
 * @returns Flesch Reading Ease score (0-100)
 */
export function calculateFleschReadingEase(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceCount = Math.max(1, sentences.length);

  const words = text.match(/\b[a-zA-Z]+\b/g) || [];
  const wordCount = Math.max(1, words.length);

  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);

  const fleschScore =
    206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllableCount / wordCount);

  return Math.max(0, Math.min(100, fleschScore));
}
