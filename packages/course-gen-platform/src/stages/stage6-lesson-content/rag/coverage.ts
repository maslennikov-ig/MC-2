import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { TECHNICAL_SHORT_TERMS } from './constants';

/**
 * Check if a term matches in content using prefix matching
 * This handles Russian morphology where word endings change based on grammatical case.
 *
 * Examples:
 * - "работать" matches "работы" (both start with "работ")
 * - "возражениями" matches "возражений" (both start with "возражени")
 *
 * @param term - Search term from objective
 * @param contentPool - Combined content to search in
 * @returns True if term or its prefix matches
 */
export function termMatchesInContent(term: string, contentPool: string): boolean {
  // 1. Try exact match first
  if (contentPool.includes(term)) {
    return true;
  }

  // 2. For longer terms (5+ chars), try prefix matching
  // This handles Russian morphology (word stem + various endings)
  if (term.length >= 5) {
    // Use first 4 characters as stem for short words, more for longer
    const stemLength = Math.min(Math.max(4, Math.floor(term.length * 0.6)), term.length - 1);
    const stem = term.slice(0, stemLength);

    // Check if stem appears in content
    if (contentPool.includes(stem)) {
      return true;
    }
  }

  // 3. For terms 4-5 chars, try matching first 3 chars (handles short Russian words)
  if (term.length >= 4 && term.length <= 5) {
    const shortStem = term.slice(0, 3);
    // Only match if the stem is followed by word boundary or more letters
    const stemRegex = new RegExp(shortStem + '[а-яёa-z]*', 'i');
    if (stemRegex.test(contentPool)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate how well retrieved chunks cover lesson objectives
 *
 * Checks if key terms from learning objectives appear in retrieved content.
 * Uses a 50% term coverage threshold per objective.
 *
 * @param chunks - Retrieved RAG chunks
 * @param lessonSpec - Lesson specification
 * @returns Coverage score between 0 and 1
 */
export function calculateLessonCoverage(
  chunks: RAGChunk[],
  lessonSpec: LessonSpecificationV2
): number {
  if (!lessonSpec.learning_objectives || lessonSpec.learning_objectives.length === 0) {
    return 1.0; // No objectives = full coverage
  }

  if (!chunks || chunks.length === 0) {
    return 0.0; // No chunks = no coverage
  }

  // Combine all chunk content for searching
  const contentPool = chunks.map(c => c.content.toLowerCase()).join(' ');
  const objectives = lessonSpec.learning_objectives.map(o => o.objective.toLowerCase());

  let totalScore = 0;
  for (const obj of objectives) {
    // Extract key terms: either longer than 3 characters OR in technical whitelist
    const words = obj.split(/\s+/).filter(t => t.length > 0);
    const keyTerms = words.filter(t => t.length > 3 || TECHNICAL_SHORT_TERMS.has(t.toLowerCase()));

    if (keyTerms.length === 0) {
      totalScore += 1.0; // No key terms = consider fully covered
      continue;
    }

    // Check term coverage with prefix matching (handles Russian morphology)
    const termsCovered = keyTerms.filter(term => termMatchesInContent(term, contentPool)).length;
    const coverageRatio = termsCovered / keyTerms.length;

    // Use sliding scale instead of hard threshold:
    // 0% coverage = 0.0, 30% = 0.3, 50% = 0.7, 100% = 1.0
    if (coverageRatio >= 0.3) {
      // Partial credit: 30% threshold for minimum score
      totalScore += Math.min(1.0, coverageRatio * 1.4); // Scale up to give credit for partial matches
    }
    // Below 30% = 0 score for this objective
  }

  return objectives.length > 0 ? totalScore / objectives.length : 0;
}
