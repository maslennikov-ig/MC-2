/**
 * Bloom's Taxonomy Level Validator
 *
 * Validates whether regenerated content preserves the cognitive level
 * according to Bloom's Taxonomy (revised version).
 *
 * Bloom's Taxonomy Levels (lowest to highest):
 * 1. Remember - Recall facts and basic concepts
 * 2. Understand - Explain ideas or concepts
 * 3. Apply - Use information in new situations
 * 4. Analyze - Draw connections among ideas
 * 5. Evaluate - Justify a decision or course of action
 * 6. Create - Produce new or original work
 */

/**
 * Bloom's Taxonomy cognitive levels
 */
export type BloomLevel =
  | 'remember'
  | 'understand'
  | 'apply'
  | 'analyze'
  | 'evaluate'
  | 'create';

/**
 * Result of Bloom's level validation
 */
export interface BloomValidationResult {
  /** Whether the Bloom's level is preserved within tolerance */
  isPreserved: boolean;
  /** Detected Bloom's level in original content */
  originalLevel: BloomLevel | null;
  /** Detected Bloom's level in regenerated content */
  newLevel: BloomLevel | null;
  /** Confidence score for the validation (0-1) */
  confidence: number;
  /** Human-readable explanation of the result */
  message: string;
}

/**
 * Result of Bloom's level detection
 */
export interface BloomDetectionResult {
  /** Detected Bloom's level */
  level: BloomLevel | null;
  /** Confidence score for the detection (0-1) */
  confidence: number;
}

/**
 * Configuration for Bloom's level preservation validation
 */
export interface BloomValidationConfig {
  /** Maximum allowed difference in levels (default: 1) */
  levelTolerance?: number;
  /** Minimum confidence threshold to consider detection valid (default: 0.3) */
  minConfidence?: number;
}

/**
 * Action verbs associated with each Bloom's level
 * Supports both English and Russian verbs
 */
const BLOOM_VERB_PATTERNS: Record<BloomLevel, string[]> = {
  remember: [
    // English verbs
    'list',
    'define',
    'recall',
    'identify',
    'name',
    'recognize',
    'state',
    'label',
    'match',
    'memorize',
    'repeat',
    'reproduce',
    // Russian verbs
    'перечислить',
    'перечисли',
    'определить',
    'определи',
    'вспомнить',
    'вспомни',
    'назвать',
    'назови',
    'узнать',
    'узнай',
    'обозначить',
    'обозначь',
    'запомнить',
    'запомни',
    'повторить',
    'повтори',
  ],
  understand: [
    // English verbs
    'explain',
    'describe',
    'summarize',
    'interpret',
    'classify',
    'discuss',
    'clarify',
    'illustrate',
    'paraphrase',
    'translate',
    'compare',
    'infer',
    // Russian verbs
    'объяснить',
    'объясни',
    'описать',
    'опиши',
    'суммировать',
    'суммируй',
    'интерпретировать',
    'интерпретируй',
    'классифицировать',
    'классифицируй',
    'обсудить',
    'обсуди',
    'проиллюстрировать',
    'проиллюстрируй',
    'перефразировать',
    'перефразируй',
    'сравнить',
    'сравни',
  ],
  apply: [
    // English verbs
    'implement',
    'execute',
    'use',
    'solve',
    'demonstrate',
    'apply',
    'calculate',
    'operate',
    'practice',
    'employ',
    'illustrate',
    'sketch',
    // Russian verbs
    'применить',
    'примени',
    'выполнить',
    'выполни',
    'использовать',
    'используй',
    'решить',
    'реши',
    'продемонстрировать',
    'продемонстрируй',
    'вычислить',
    'вычисли',
    'практиковать',
    'практикуй',
    'реализовать',
    'реализуй',
  ],
  analyze: [
    // English verbs
    'analyze',
    'compare',
    'contrast',
    'differentiate',
    'examine',
    'organize',
    'deconstruct',
    'distinguish',
    'investigate',
    'categorize',
    'dissect',
    'relate',
    // Russian verbs
    'анализировать',
    'анализируй',
    'сравнить',
    'сравни',
    'противопоставить',
    'противопоставь',
    'исследовать',
    'исследуй',
    'различать',
    'различай',
    'категоризировать',
    'категоризируй',
    'разобрать',
    'разбери',
    'соотнести',
    'соотнеси',
  ],
  evaluate: [
    // English verbs
    'evaluate',
    'assess',
    'critique',
    'judge',
    'justify',
    'argue',
    'defend',
    'recommend',
    'support',
    'validate',
    'prioritize',
    'rate',
    // Russian verbs
    'оценить',
    'оцени',
    'критиковать',
    'критикуй',
    'судить',
    'суди',
    'обосновать',
    'обоснуй',
    'аргументировать',
    'аргументируй',
    'защитить',
    'защити',
    'рекомендовать',
    'рекомендуй',
    'проверить',
    'проверь',
    'приоритизировать',
    'приоритизируй',
  ],
  create: [
    // English verbs
    'create',
    'design',
    'develop',
    'construct',
    'produce',
    'plan',
    'compose',
    'formulate',
    'generate',
    'invent',
    'devise',
    'build',
    // Russian verbs
    'создать',
    'создай',
    'разработать',
    'разработай',
    'спроектировать',
    'спроектируй',
    'составить',
    'составь',
    'сконструировать',
    'сконструируй',
    'произвести',
    'произведи',
    'сформулировать',
    'сформулируй',
    'изобрести',
    'изобрети',
    'построить',
    'построй',
  ],
};

/**
 * Numeric values for Bloom's levels (for comparison)
 */
const BLOOM_LEVEL_VALUES: Record<BloomLevel, number> = {
  remember: 1,
  understand: 2,
  apply: 3,
  analyze: 4,
  evaluate: 5,
  create: 6,
};

/**
 * Detects the Bloom's Taxonomy level from text content
 *
 * Algorithm:
 * 1. Normalize text to lowercase
 * 2. Extract words (split by whitespace and punctuation)
 * 3. For each Bloom's level, count matching action verbs
 * 4. Calculate score for each level (matches / total verbs in level)
 * 5. Select level with highest score
 * 6. Confidence = (top score - second score) / top score
 *
 * @param text - Text content to analyze (learning objective, description, etc.)
 * @returns Detection result with level and confidence
 *
 * @example
 * ```typescript
 * const result = detectBloomLevel("Students will analyze and compare different algorithms");
 * // { level: 'analyze', confidence: 0.85 }
 * ```
 */
export function detectBloomLevel(text: string): BloomDetectionResult {
  if (!text || text.trim().length === 0) {
    return { level: null, confidence: 0 };
  }

  // Normalize text: lowercase, remove punctuation
  const normalizedText = text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ') // Remove punctuation, keep Unicode letters
    .replace(/\s+/g, ' ')
    .trim();

  // Extract words
  const words = normalizedText.split(' ');

  // Score each Bloom's level
  const scores: Record<BloomLevel, number> = {
    remember: 0,
    understand: 0,
    apply: 0,
    analyze: 0,
    evaluate: 0,
    create: 0,
  };

  for (const [level, patterns] of Object.entries(BLOOM_VERB_PATTERNS)) {
    let matches = 0;
    for (const pattern of patterns) {
      const normalizedPattern = pattern.toLowerCase();
      // Count occurrences of the pattern in words
      for (const word of words) {
        if (word === normalizedPattern || word.startsWith(normalizedPattern)) {
          matches++;
        }
      }
    }
    // Normalize score by number of patterns for this level
    scores[level as BloomLevel] = matches / patterns.length;
  }

  // Find top two levels
  const sortedLevels = (Object.keys(scores) as BloomLevel[]).sort(
    (a, b) => scores[b] - scores[a]
  );

  const topLevel = sortedLevels[0];
  const topScore = scores[topLevel];
  const secondScore = scores[sortedLevels[1]];

  // If no verbs matched, return null
  if (topScore === 0) {
    return { level: null, confidence: 0 };
  }

  // Calculate confidence as separation between top and second
  // Higher separation = higher confidence
  const confidence =
    secondScore === 0 ? 1.0 : Math.min(1.0, (topScore - secondScore) / topScore);

  return {
    level: topLevel,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

/**
 * Validates whether regenerated content preserves the Bloom's level
 *
 * Preservation rules:
 * - Level is preserved if difference <= levelTolerance (default: 1)
 * - Confidence must be >= minConfidence for both detections (default: 0.3)
 * - If either detection has low confidence, validation is inconclusive
 *
 * @param original - Original content text
 * @param regenerated - Regenerated content text
 * @param config - Validation configuration
 * @returns Validation result with preservation status and details
 *
 * @example
 * ```typescript
 * const result = validateBloomPreservation(
 *   "Students will analyze the algorithm",
 *   "Students will examine and compare the algorithm"
 * );
 * // { isPreserved: true, originalLevel: 'analyze', newLevel: 'analyze', ... }
 * ```
 */
export function validateBloomPreservation(
  original: string,
  regenerated: string,
  config: BloomValidationConfig = {}
): BloomValidationResult {
  const { levelTolerance = 1, minConfidence = 0.3 } = config;

  // Detect levels
  const originalDetection = detectBloomLevel(original);
  const newDetection = detectBloomLevel(regenerated);

  // Handle cases where detection failed
  if (originalDetection.level === null || newDetection.level === null) {
    return {
      isPreserved: false,
      originalLevel: originalDetection.level,
      newLevel: newDetection.level,
      confidence: Math.min(originalDetection.confidence, newDetection.confidence),
      message:
        originalDetection.level === null && newDetection.level === null
          ? 'Could not detect Bloom\'s level in either original or regenerated content'
          : originalDetection.level === null
            ? 'Could not detect Bloom\'s level in original content'
            : 'Could not detect Bloom\'s level in regenerated content',
    };
  }

  // Check confidence threshold
  const minDetectionConfidence = Math.min(
    originalDetection.confidence,
    newDetection.confidence
  );

  if (minDetectionConfidence < minConfidence) {
    return {
      isPreserved: false,
      originalLevel: originalDetection.level,
      newLevel: newDetection.level,
      confidence: minDetectionConfidence,
      message: `Detection confidence too low (${minDetectionConfidence.toFixed(2)} < ${minConfidence})`,
    };
  }

  // Calculate level difference
  const originalValue = BLOOM_LEVEL_VALUES[originalDetection.level];
  const newValue = BLOOM_LEVEL_VALUES[newDetection.level];
  const levelDifference = Math.abs(originalValue - newValue);

  // Check if level is preserved
  const isPreserved = levelDifference <= levelTolerance;

  // Generate message
  let message: string;
  if (isPreserved) {
    if (originalDetection.level === newDetection.level) {
      message = `Bloom's level preserved: ${originalDetection.level}`;
    } else {
      const direction = newValue > originalValue ? 'increased' : 'decreased';
      message = `Bloom's level ${direction} by ${levelDifference} level(s): ${originalDetection.level} → ${newDetection.level} (within tolerance)`;
    }
  } else {
    const direction = newValue > originalValue ? 'increased' : 'decreased';
    message = `Bloom's level NOT preserved: ${direction} by ${levelDifference} level(s): ${originalDetection.level} → ${newDetection.level} (exceeds tolerance of ${levelTolerance})`;
  }

  return {
    isPreserved,
    originalLevel: originalDetection.level,
    newLevel: newDetection.level,
    confidence: minDetectionConfidence,
    message,
  };
}

/**
 * Gets the numeric value for a Bloom's level (for comparison/sorting)
 *
 * @param level - Bloom's level
 * @returns Numeric value (1-6)
 *
 * @example
 * ```typescript
 * getBloomLevelValue('analyze'); // Returns 4
 * ```
 */
export function getBloomLevelValue(level: BloomLevel): number {
  return BLOOM_LEVEL_VALUES[level];
}

/**
 * Compares two Bloom's levels
 *
 * @param level1 - First Bloom's level
 * @param level2 - Second Bloom's level
 * @returns Negative if level1 < level2, positive if level1 > level2, 0 if equal
 *
 * @example
 * ```typescript
 * compareBloomLevels('apply', 'analyze'); // Returns -1 (apply < analyze)
 * ```
 */
export function compareBloomLevels(level1: BloomLevel, level2: BloomLevel): number {
  return BLOOM_LEVEL_VALUES[level1] - BLOOM_LEVEL_VALUES[level2];
}
