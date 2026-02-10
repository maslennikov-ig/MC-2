/**
 * Text analysis utilities for cascade evaluation
 * @module stages/stage6-lesson-content/judge/cascade/text-utils
 */

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
