/**
 * Constants and helpers for Phase 3 V2 Spec Generator
 * @module stages/stage5-generation/phases/phase3-v2-spec-generator/constants
 *
 * Extracted from phase3-v2-spec-generator.ts to comply with max-lines rule.
 */

import type { BloomLevelV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { SectionBreakdown } from '@megacampus/shared-types/analysis-result';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default configuration for V2 spec generation
 */
export const V2_SPEC_DEFAULTS = {
  /** Default lessons per section when estimated_lessons is not specified */
  DEFAULT_LESSONS_PER_SECTION: 3,
  /** Minimum lessons per section */
  MIN_LESSONS_PER_SECTION: 1,
  /** Maximum lessons per section */
  MAX_LESSONS_PER_SECTION: 10,
  /** Default estimated duration per lesson in minutes */
  DEFAULT_LESSON_DURATION_MINUTES: 15,
  /** Default expected RAG chunks for high confidence */
  DEFAULT_RAG_CHUNKS_HIGH: 10,
  /** Default expected RAG chunks for medium confidence */
  DEFAULT_RAG_CHUNKS_MEDIUM: 7,
} as const;

/**
 * Bloom's Taxonomy action verb mapping for learning objectives
 * Maps common action verbs to their Bloom's level
 */
export const BLOOM_VERB_MAP: Record<string, BloomLevelV2> = {
  // Remember level
  define: 'remember',
  list: 'remember',
  recall: 'remember',
  identify: 'remember',
  name: 'remember',
  state: 'remember',
  describe: 'remember',

  // Understand level
  explain: 'understand',
  summarize: 'understand',
  interpret: 'understand',
  classify: 'understand',
  compare: 'understand',
  contrast: 'understand',
  discuss: 'understand',

  // Apply level
  apply: 'apply',
  demonstrate: 'apply',
  implement: 'apply',
  use: 'apply',
  execute: 'apply',
  solve: 'apply',
  calculate: 'apply',

  // Analyze level
  analyze: 'analyze',
  differentiate: 'analyze',
  examine: 'analyze',
  investigate: 'analyze',
  distinguish: 'analyze',
  organize: 'analyze',

  // Evaluate level
  evaluate: 'evaluate',
  assess: 'evaluate',
  critique: 'evaluate',
  judge: 'evaluate',
  justify: 'evaluate',
  recommend: 'evaluate',

  // Create level
  create: 'create',
  design: 'create',
  develop: 'create',
  construct: 'create',
  produce: 'create',
  compose: 'create',
  build: 'create',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate alignment between key_topics and learning_objectives
 *
 * Ensures that section titles (from key_topics) have semantic overlap
 * with learning objectives to prevent Stage 6 regeneration loops.
 *
 * @param section - Section breakdown to validate
 * @returns Object with passed flag and warning message
 */
export function validateKeyTopicsAlignment(section: SectionBreakdown): {
  passed: boolean;
  warningMessage: string | null;
  coverage: number;
} {
  const keyTopics = section.key_topics || [];
  const objectives = section.learning_objectives || [];

  if (keyTopics.length === 0 || objectives.length === 0) {
    return { passed: true, warningMessage: null, coverage: 1.0 };
  }

  // Extract significant words from objectives (4+ chars, not common words)
  const commonWords = new Set([
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
    'использовать',
    'применять',
    'понимать',
    'уметь',
    'знать',
    'научиться',
    'освоить',
  ]);

  const objectiveKeywords = new Set<string>();
  for (const obj of objectives) {
    const words = obj.toLowerCase().match(/[a-zа-яё]{4,}/g) || [];
    for (const word of words) {
      if (!commonWords.has(word)) {
        objectiveKeywords.add(word);
      }
    }
  }

  // Check how many key_topics have overlap with objective keywords
  let matchedTopics = 0;
  for (const topic of keyTopics) {
    const topicWords = topic.toLowerCase().match(/[a-zа-яё]{4,}/g) || [];
    const hasOverlap = topicWords.some(word => objectiveKeywords.has(word));
    if (hasOverlap) {
      matchedTopics++;
    }
  }

  const coverage = matchedTopics / keyTopics.length;
  const passed = coverage >= 0.5; // At least 50% of topics should align

  const warningMessage = passed
    ? null
    : `Low key_topics/learning_objectives alignment: ${(coverage * 100).toFixed(0)}% ` +
      `(${matchedTopics}/${keyTopics.length} topics match). ` +
      `This may cause Stage 6 regeneration loops.`;

  return { passed, warningMessage, coverage };
}
