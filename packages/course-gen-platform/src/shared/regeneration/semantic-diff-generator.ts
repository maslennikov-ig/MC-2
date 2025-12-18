/**
 * Semantic Diff Generator
 *
 * Generates SemanticDiff objects that describe conceptual changes
 * after content regeneration. Tracks pedagogical intent preservation
 * across Russian and English content.
 *
 * @module shared/regeneration/semantic-diff-generator
 */

import { franc } from 'franc-min';
import { validateBloomsTaxonomy } from '@/stages/stage5-generation/validators/blooms-validators';
import type { SemanticDiff } from '@megacampus/shared-types/regeneration-types';
import logger from '@/shared/logger';

/**
 * Input for semantic diff generation
 */
export interface SemanticDiffInput {
  /** Original content before regeneration */
  original: unknown;
  /** Regenerated content */
  regenerated: unknown;
  /** JSON path to the field (e.g., "learning_objectives", "description") */
  fieldPath: string;
  /** Type of block being compared (e.g., "learning_objectives", "key_topics") */
  blockType: string;
  /** Optional LLM-provided pedagogical change log */
  llmChangeLog?: string;
}

/**
 * Language detection result
 */
interface LanguageInfo {
  code: string; // ISO 639-1 or 639-3
  confidence: number;
}

// ============================================================================
// Language Detection
// ============================================================================

/**
 * Detect language from text using franc-min
 *
 * @param text - Text to analyze
 * @returns Language info with ISO code and confidence
 */
function detectLanguage(text: string): LanguageInfo {
  if (!text || text.trim().length === 0) {
    return { code: 'und', confidence: 0 }; // undefined
  }

  const langCode = franc(text);

  // franc-min uses ISO 639-3, map to ISO 639-1 for common languages
  const lang3to1Map: Record<string, string> = {
    'eng': 'en',
    'rus': 'ru',
    'spa': 'es',
    'fra': 'fr',
    'deu': 'de',
    'und': 'en', // Default to English
  };

  const isoCode = lang3to1Map[langCode] || langCode;

  return {
    code: isoCode,
    confidence: langCode === 'und' ? 0 : 1,
  };
}

/**
 * Detect primary language from content (handles mixed content)
 *
 * @param content - Content to analyze (string, array of strings, or object)
 * @returns ISO 639-1 language code
 */
function detectContentLanguage(content: unknown): string {
  if (typeof content === 'string') {
    return detectLanguage(content).code;
  }

  if (Array.isArray(content)) {
    // For arrays, detect from concatenated text
    const combined = content
      .filter(item => typeof item === 'string')
      .join(' ');
    return detectLanguage(combined).code;
  }

  if (typeof content === 'object' && content !== null) {
    // For objects, detect from all string values
    const values = Object.values(content)
      .filter(v => typeof v === 'string')
      .join(' ');
    return detectLanguage(values).code;
  }

  return 'en'; // Default
}

// ============================================================================
// Concept Extraction
// ============================================================================

/**
 * Extract key concepts from text
 *
 * For Russian and English:
 * - Extract noun phrases (simple heuristic: 2-4 word sequences)
 * - Extract capitalized terms
 * - Extract quoted terms
 *
 * @param text - Text to analyze
 * @returns Array of extracted concepts
 */
function extractConceptsFromText(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const concepts: Set<string> = new Set();

  // 1. Extract quoted terms (both "" and «»)
  const quotedTerms = text.match(/["«]([^"»]+)["»]/g);
  if (quotedTerms) {
    quotedTerms.forEach(term => {
      const cleaned = term.replace(/["«»]/g, '').trim();
      if (cleaned.length > 2) {
        concepts.add(cleaned.toLowerCase());
      }
    });
  }

  // 2. Extract capitalized terms (likely proper nouns or technical terms)
  // Skip first word of sentence
  const words = text.split(/\s+/);
  words.forEach((word, index) => {
    // Skip first word, short words, and words after punctuation
    if (index === 0 || word.length < 3) return;

    const prevChar = text[text.indexOf(word) - 2];
    if (prevChar && /[.!?]/.test(prevChar)) return;

    // Check if capitalized (works for both Latin and Cyrillic)
    if (/^[A-ZА-ЯЁ]/.test(word)) {
      concepts.add(word.toLowerCase());
    }
  });

  // 3. Extract multi-word phrases (2-4 words)
  // This is a simple heuristic for noun phrases
  for (let i = 0; i < words.length - 1; i++) {
    // 2-word phrases
    if (i < words.length - 1) {
      const phrase = `${words[i]} ${words[i + 1]}`.toLowerCase();
      if (phrase.length > 5 && phrase.length < 40) {
        concepts.add(phrase);
      }
    }

    // 3-word phrases
    if (i < words.length - 2) {
      const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`.toLowerCase();
      if (phrase.length > 8 && phrase.length < 60) {
        concepts.add(phrase);
      }
    }
  }

  // 4. Extract individual significant words (4+ characters)
  words.forEach(word => {
    const cleaned = word.replace(/[^\wа-яёА-ЯЁ]/g, '').toLowerCase();
    if (cleaned.length >= 4) {
      concepts.add(cleaned);
    }
  });

  // Limit to most meaningful concepts (avoid noise)
  return Array.from(concepts).slice(0, 20);
}

/**
 * Extract concepts from array content (e.g., learning objectives, key topics)
 *
 * @param items - Array of strings
 * @returns Array of concepts
 */
function extractConceptsFromArray(items: string[]): string[] {
  const allConcepts = items.flatMap(item => extractConceptsFromText(item));
  return [...new Set(allConcepts)]; // Deduplicate
}

/**
 * Extract concepts from unknown content type
 *
 * @param content - Content to analyze
 * @returns Array of extracted concepts
 */
function extractConcepts(content: unknown): string[] {
  if (typeof content === 'string') {
    return extractConceptsFromText(content);
  }

  if (Array.isArray(content)) {
    const stringItems = content.filter(item => typeof item === 'string');
    return extractConceptsFromArray(stringItems);
  }

  if (typeof content === 'object' && content !== null) {
    // For objects, extract from all string values
    const stringValues = Object.values(content).filter(v => typeof v === 'string');
    return extractConceptsFromArray(stringValues);
  }

  return [];
}

/**
 * Compare concept sets and find added/removed concepts
 *
 * @param originalConcepts - Concepts from original content
 * @param regeneratedConcepts - Concepts from regenerated content
 * @returns Object with added and removed concepts
 */
function compareConceptSets(
  originalConcepts: string[],
  regeneratedConcepts: string[]
): { added: string[]; removed: string[] } {
  const originalSet = new Set(originalConcepts);
  const regeneratedSet = new Set(regeneratedConcepts);

  const added = regeneratedConcepts.filter(c => !originalSet.has(c));
  const removed = originalConcepts.filter(c => !regeneratedSet.has(c));

  return { added, removed };
}

// ============================================================================
// Change Type Detection
// ============================================================================

/**
 * Calculate content length (handles strings, arrays, objects)
 *
 * Uses word count for better cross-type comparison
 *
 * @param content - Content to measure
 * @returns Length metric (word count)
 */
function getContentLength(content: unknown): number {
  if (typeof content === 'string') {
    // Count words in string
    return content.split(/\s+/).filter(w => w.length > 0).length;
  }

  if (Array.isArray(content)) {
    // Count total words in all array items
    const stringItems = content.filter(item => typeof item === 'string');
    return stringItems.reduce((total, item) => {
      return total + item.split(/\s+/).filter(w => w.length > 0).length;
    }, 0);
  }

  if (typeof content === 'object' && content !== null) {
    // Count words in all object values
    const stringValues = Object.values(content).filter(v => typeof v === 'string');
    return stringValues.reduce((total, value) => {
      return total + value.split(/\s+/).filter(w => w.length > 0).length;
    }, 0);
  }

  return 0;
}

/**
 * Detect change type based on content comparison
 *
 * Change types:
 * - simplified: Shorter content, fewer concepts
 * - expanded: Longer content, more concepts
 * - restructured: Similar length but different organization
 * - refined: Similar content with improved wording
 *
 * @param original - Original content
 * @param regenerated - Regenerated content
 * @param conceptsAdded - Number of concepts added
 * @param conceptsRemoved - Number of concepts removed
 * @returns Change type
 */
function detectChangeType(
  original: unknown,
  regenerated: unknown,
  conceptsAdded: number,
  conceptsRemoved: number
): SemanticDiff['changeType'] {
  const originalLength = getContentLength(original);
  const regeneratedLength = getContentLength(regenerated);

  const lengthRatio = regeneratedLength / (originalLength || 1);
  const conceptDelta = conceptsAdded - conceptsRemoved;

  // Simplified: Shorter content OR significantly fewer concepts
  if (lengthRatio < 0.7 || conceptDelta < -3) {
    return 'simplified';
  }

  // Expanded: Longer content OR significantly more concepts
  if (lengthRatio > 1.5 || conceptDelta > 3) {
    return 'expanded';
  }

  // Restructured: Similar length but significant concept changes (both added and removed)
  if (conceptsAdded > 2 && conceptsRemoved > 2) {
    return 'restructured';
  }

  // Refined: Minor changes (default)
  return 'refined';
}

// ============================================================================
// Alignment Score Calculation
// ============================================================================

/**
 * Calculate alignment score (1-5) based on content similarity
 *
 * Score meanings:
 * - 5: Perfect alignment, minimal changes (<10% concept change)
 * - 4: Good alignment, minor adjustments (10-25% concept change)
 * - 3: Moderate changes, core intent preserved (25-50% concept change)
 * - 2: Significant changes, some intent drift (50-75% concept change)
 * - 1: Major changes, intent may differ (>75% concept change)
 *
 * @param originalConcepts - Concepts from original
 * @param _regeneratedConcepts - Concepts from regenerated (reserved for future use)
 * @param conceptsAdded - Concepts added
 * @param conceptsRemoved - Concepts removed
 * @returns Alignment score (1-5)
 */
function calculateAlignmentScore(
  originalConcepts: string[],
  _regeneratedConcepts: string[],
  conceptsAdded: string[],
  conceptsRemoved: string[]
): 1 | 2 | 3 | 4 | 5 {
  const totalOriginalConcepts = originalConcepts.length || 1;
  const changeRatio = (conceptsAdded.length + conceptsRemoved.length) / totalOriginalConcepts;

  if (changeRatio < 0.1) return 5; // Perfect alignment
  if (changeRatio < 0.25) return 4; // Good alignment
  if (changeRatio < 0.5) return 3; // Moderate changes
  if (changeRatio < 0.75) return 2; // Significant changes
  return 1; // Major changes
}

// ============================================================================
// Bloom's Level Preservation
// ============================================================================

/**
 * Check if Bloom's taxonomy level is preserved between original and regenerated
 *
 * Only applicable for learning objectives and similar pedagogical content.
 *
 * @param original - Original content
 * @param regenerated - Regenerated content
 * @param blockType - Type of block
 * @param language - Language code
 * @returns True if Bloom's level preserved
 */
function isBloomLevelPreserved(
  original: unknown,
  regenerated: unknown,
  blockType: string,
  language: string
): boolean {
  // Bloom's validation only applies to learning objectives
  if (!blockType.includes('objective') && !blockType.includes('learning')) {
    return true; // Not applicable, return true
  }

  // Extract first objective/learning statement for comparison
  let originalText = '';
  let regeneratedText = '';

  if (typeof original === 'string') {
    originalText = original;
  } else if (Array.isArray(original) && original.length > 0) {
    originalText = String(original[0]);
  }

  if (typeof regenerated === 'string') {
    regeneratedText = regenerated;
  } else if (Array.isArray(regenerated) && regenerated.length > 0) {
    regeneratedText = String(regenerated[0]);
  }

  if (!originalText || !regeneratedText) {
    return true; // Cannot compare, assume preserved
  }

  // Validate both with Bloom's taxonomy
  const originalValidation = validateBloomsTaxonomy(originalText, language);
  const regeneratedValidation = validateBloomsTaxonomy(regeneratedText, language);

  // If neither passed validation, consider preserved (both invalid)
  if (!originalValidation.passed && !regeneratedValidation.passed) {
    return true;
  }

  // If original passed but regenerated failed, not preserved
  if (originalValidation.passed && !regeneratedValidation.passed) {
    return false;
  }

  // If both passed, check if same level
  const originalLevel = originalValidation.metadata?.level;
  const regeneratedLevel = regeneratedValidation.metadata?.level;

  if (originalLevel && regeneratedLevel) {
    return originalLevel === regeneratedLevel;
  }

  // Default: assume preserved if we can't determine
  return true;
}

// ============================================================================
// Human-Readable Change Description
// ============================================================================

/**
 * Generate human-readable change description
 *
 * Supports Russian and English descriptions.
 *
 * @param changeType - Type of change
 * @param conceptsAdded - Concepts added
 * @param conceptsRemoved - Concepts removed
 * @param language - Language code
 * @param llmChangeLog - Optional LLM-provided change log
 * @returns Human-readable description
 */
function generateChangeDescription(
  changeType: SemanticDiff['changeType'],
  conceptsAdded: string[],
  conceptsRemoved: string[],
  language: string,
  llmChangeLog?: string
): string {
  // If LLM provided a change log, use it
  if (llmChangeLog && llmChangeLog.trim().length > 0) {
    return llmChangeLog.trim();
  }

  const addedCount = conceptsAdded.length;
  const removedCount = conceptsRemoved.length;

  // Russian descriptions
  if (language === 'ru') {
    switch (changeType) {
      case 'simplified':
        if (removedCount > 0) {
          return `Упрощено: убраны ${removedCount} концепций для улучшения понятности`;
        }
        return 'Упрощено: улучшена ясность изложения';

      case 'expanded':
        if (addedCount > 0) {
          return `Расширено: добавлены ${addedCount} новых концепций`;
        }
        return 'Расширено: добавлены дополнительные детали';

      case 'restructured':
        return `Реструктурировано: изменена организация содержания (${addedCount} добавлено, ${removedCount} убрано)`;

      case 'refined':
        return 'Уточнено: улучшена формулировка без изменения смысла';
    }
  }

  // English descriptions (default)
  switch (changeType) {
    case 'simplified':
      if (removedCount > 0) {
        return `Simplified: removed ${removedCount} concepts for clarity`;
      }
      return 'Simplified: improved clarity and readability';

    case 'expanded':
      if (addedCount > 0) {
        return `Expanded: added ${addedCount} new concepts`;
      }
      return 'Expanded: added additional details';

    case 'restructured':
      return `Restructured: reorganized content (${addedCount} added, ${removedCount} removed)`;

    case 'refined':
      return 'Refined: improved wording without changing meaning';
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Generate semantic diff for regenerated content
 *
 * Analyzes original and regenerated content to produce a SemanticDiff
 * that describes the conceptual changes.
 *
 * @param input - Semantic diff input
 * @returns Semantic diff describing the changes
 */
export async function generateSemanticDiff(
  input: SemanticDiffInput
): Promise<SemanticDiff> {
  const { original, regenerated, fieldPath, blockType, llmChangeLog } = input;

  logger.debug(
    { fieldPath, blockType },
    'Generating semantic diff'
  );

  // Detect language
  const language = detectContentLanguage(regenerated) || detectContentLanguage(original);

  // Extract concepts
  const originalConcepts = extractConcepts(original);
  const _regeneratedConcepts = extractConcepts(regenerated);

  // Compare concepts
  const { added: conceptsAdded, removed: conceptsRemoved } = compareConceptSets(
    originalConcepts,
    _regeneratedConcepts
  );

  // Detect change type
  const changeType = detectChangeType(
    original,
    regenerated,
    conceptsAdded.length,
    conceptsRemoved.length
  );

  // Calculate alignment score
  const alignmentScore = calculateAlignmentScore(
    originalConcepts,
    _regeneratedConcepts,
    conceptsAdded,
    conceptsRemoved
  );

  // Check Bloom's level preservation
  const bloomLevelPreserved = isBloomLevelPreserved(
    original,
    regenerated,
    blockType,
    language
  );

  // Generate change description
  const changeDescription = generateChangeDescription(
    changeType,
    conceptsAdded,
    conceptsRemoved,
    language,
    llmChangeLog
  );

  const diff: SemanticDiff = {
    changeType,
    conceptsAdded: conceptsAdded.slice(0, 10), // Limit for readability
    conceptsRemoved: conceptsRemoved.slice(0, 10),
    alignmentScore,
    bloomLevelPreserved,
    changeDescription,
  };

  logger.debug(
    {
      fieldPath,
      changeType: diff.changeType,
      alignmentScore: diff.alignmentScore,
      bloomLevelPreserved: diff.bloomLevelPreserved,
      conceptsAdded: diff.conceptsAdded.length,
      conceptsRemoved: diff.conceptsRemoved.length,
    },
    'Semantic diff generated'
  );

  return diff;
}
