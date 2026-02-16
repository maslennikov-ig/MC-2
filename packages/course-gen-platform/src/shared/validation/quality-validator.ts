/**
 * Quality Validator Service - Semantic Similarity Validation
 *
 * Implements RT-004 quality thresholds for semantic similarity validation using
 * Jina-v3 embeddings (768-dimensional vectors) and cosine similarity computation.
 *
 * Phase-specific thresholds:
 * - Phase 2 (Metadata): 0.80-0.90 semantic similarity
 * - Phase 3 (Sections): 0.75-0.85 semantic similarity
 * - Phase 3 (Lessons): 0.70-0.80 semantic similarity
 *
 * Language adjustments:
 * - Russian: -0.05 threshold adjustment (based on Jina-v3 MTEB scores)
 *
 * @module services/stage5/quality-validator
 * @see specs/008-generation-generation-json/research-decisions/rt-004-quality-thresholds.md
 * @see packages/course-gen-platform/src/shared/embeddings/jina-client.ts
 */

import { generateEmbedding, generateEmbeddings } from '@/shared/embeddings/jina-client';
import type { CourseMetadata, Section } from '@megacampus/shared-types';
import type { Logger } from 'pino';
import defaultLogger from '@/shared/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Quality validation result structure
 */
export interface QualityValidationResult {
  /** Whether the quality check passed the threshold */
  passed: boolean;
  /** Cosine similarity score (0.0-1.0) */
  score: number;
  /** Threshold used for validation */
  threshold: number;
  /** Language code used for threshold adjustment */
  language: string;
  /** Phase identifier (metadata|sections|content) */
  phase: string;
}

/**
 * Section quality validation result
 */
export interface SectionQualityResult {
  /** Section number (1-indexed) */
  sectionNumber: number;
  /** Whether the quality check passed the threshold */
  passed: boolean;
  /** Cosine similarity score (0.0-1.0) */
  score: number;
  /** Threshold used for validation */
  threshold: number;
}

/**
 * Cross-section overlap detection result
 * Detects when multiple sections have semantically similar content,
 * indicating potential lesson duplication.
 */
export interface CrossSectionOverlapResult {
  /** Whether any significant overlap was detected */
  hasOverlap: boolean;
  /** Number of section pairs with high similarity */
  overlapCount: number;
  /** Threshold used for overlap detection */
  overlapThreshold: number;
  /** Pairs of sections with detected overlap */
  overlappingPairs: Array<{
    sectionA: number;
    sectionB: number;
    similarity: number;
    sectionATitle: string;
    sectionBTitle: string;
  }>;
}

/**
 * Custom error class for quality validation failures
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * RT-004 Base quality thresholds by phase (without language adjustment)
 */
const BASE_THRESHOLDS = {
  metadata: 0.85, // Phase 2: 0.80-0.90 (using middle value)
  sections: 0.75, // Phase 3: 0.75-0.85 (using lower bound)
  content: 0.7, // Phase 3: 0.70-0.80 (using lower bound)
} as const;

/**
 * RT-004 Language-specific threshold adjustments
 *
 * Based on Jina-v3 MTEB performance:
 * - English: No adjustment (baseline)
 * - German/Spanish: No adjustment (high-resource languages)
 * - Russian: -0.05 (medium-resource language, slightly lower MTEB scores)
 */
const LANGUAGE_ADJUSTMENTS: Record<string, number> = {
  en: 0.0, // English (baseline)
  de: 0.0, // German (high-resource)
  es: 0.0, // Spanish (high-resource)
  ru: -0.05, // Russian (medium-resource, adjust threshold)
};

/**
 * Default overlap thresholds by stage.
 * Stage 4 sections are abstract (area + key_topics) → higher threshold to avoid false positives.
 * Stage 5 sections are detailed (title + description + lessons) → lower threshold catches more.
 */
export const OVERLAP_THRESHOLDS = {
  /** Stage 4: Abstract section breakdown (area, key_topics, learning_objectives) */
  stage4: 0.8,
  /** Stage 5: Detailed sections with lessons */
  stage5: 0.75,
  /** Legacy default for backward compatibility */
  default: 0.8,
} as const;

// Note: DEFAULT_OVERLAP_THRESHOLD removed — use OVERLAP_THRESHOLDS.stage4 or .stage5 directly

// ============================================================================
// QUALITY VALIDATOR CLASS
// ============================================================================

/**
 * QualityValidator - Semantic similarity validation for course generation
 *
 * Validates generated content against input requirements using:
 * 1. Jina-v3 embeddings (768-dimensional vectors)
 * 2. Cosine similarity computation
 * 3. Phase-specific quality thresholds
 * 4. Language-adjusted thresholds
 *
 * @example
 * ```typescript
 * const validator = new QualityValidator(logger);
 *
 * // Validate metadata
 * const metadataResult = await validator.validateMetadata(
 *   "Create a course about Python programming for beginners",
 *   generatedMetadata,
 *   "en"
 * );
 * console.log(metadataResult.passed); // true/false
 * console.log(metadataResult.score); // 0.87
 *
 * // Validate sections
 * const sectionResults = await validator.validateSections(
 *   ["Introduction to Python", "Variables and Data Types"],
 *   generatedSections,
 *   "en"
 * );
 * console.log(sectionResults[0].passed); // true/false
 * ```
 */
export class QualityValidator {
  constructor(private logger: Logger = defaultLogger) {}

  /**
   * Validate metadata quality against input requirements (Phase 2)
   *
   * Generates embeddings for:
   * - Input requirements (using "retrieval.query" task)
   * - Generated metadata concatenation (using "retrieval.passage" task)
   *
   * Computes cosine similarity and compares against language-adjusted threshold.
   *
   * @param inputRequirements - Original course requirements/description
   * @param generatedMetadata - Generated course metadata
   * @param language - Language code (en, de, es, ru) for threshold adjustment
   * @returns Quality validation result with pass/fail status and score
   * @throws ValidationError if embedding generation or validation fails
   *
   * @example
   * ```typescript
   * const result = await validator.validateMetadata(
   *   "Create an advanced Python course focusing on async programming",
   *   {
   *     course_title: "Advanced Python: Asynchronous Programming",
   *     course_description: "Master async/await, asyncio, and concurrent programming in Python",
   *     learning_outcomes: [
   *       { text: "Implement async functions using async/await syntax", ... },
   *       { text: "Build concurrent applications with asyncio", ... }
   *     ],
   *     // ... other metadata fields
   *   },
   *   "en"
   * );
   * // result.passed: true, result.score: 0.89
   * ```
   */
  async validateMetadata(
    inputRequirements: string,
    generatedMetadata: CourseMetadata,
    language: string = 'en'
  ): Promise<QualityValidationResult> {
    const phase = 'metadata';

    try {
      this.logger.info({
        msg: 'Starting metadata quality validation',
        phase,
        language,
        threshold: this.getThresholdForLanguage(language, phase),
      });

      // Generate embedding for input requirements (query-style)
      const inputEmbedding = await generateEmbedding(inputRequirements, 'retrieval.query');

      // Concatenate key metadata fields for embedding
      const metadataText = this.concatenateMetadataFields(generatedMetadata);

      // Generate embedding for metadata (passage-style)
      const metadataEmbedding = await generateEmbedding(metadataText, 'retrieval.passage');

      // Compute cosine similarity
      const score = this.cosineSimilarity(inputEmbedding, metadataEmbedding);

      // Get language-adjusted threshold
      const threshold = this.getThresholdForLanguage(language, phase);

      // Determine pass/fail
      const passed = score >= threshold;

      this.logger.info({
        msg: 'Metadata quality validation complete',
        phase,
        passed,
        score: score.toFixed(4),
        threshold,
        language,
      });

      return {
        passed,
        score,
        threshold,
        language,
        phase,
      };
    } catch (error) {
      this.logger.error({
        msg: 'Metadata quality validation failed',
        phase,
        language,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ValidationError(
        `Failed to validate metadata quality: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { phase, language }
      );
    }
  }

  /**
   * Validate sections quality against expected topics (Phase 3)
   *
   * For each section:
   * 1. Concatenate section content (title, description, lesson titles)
   * 2. Generate embeddings for section and corresponding expected topic
   * 3. Compute cosine similarity
   * 4. Compare against language-adjusted threshold
   *
   * @param expectedTopics - Array of expected topics (one per section)
   * @param generatedSections - Array of generated sections
   * @param language - Language code (en, de, es, ru) for threshold adjustment
   * @returns Array of section quality results (one per section)
   * @throws ValidationError if embedding generation or validation fails
   *
   * @example
   * ```typescript
   * const results = await validator.validateSections(
   *   [
   *     "Introduction to Python syntax and basic concepts",
   *     "Variables, data types, and type conversion"
   *   ],
   *   [
   *     {
   *       section_number: 1,
   *       section_title: "Getting Started with Python",
   *       section_description: "Learn Python basics including syntax, indentation, and first programs",
   *       lessons: [
   *         { lesson_title: "Python Installation and Setup", ... },
   *         { lesson_title: "Your First Python Program", ... }
   *       ],
   *       // ... other section fields
   *     },
   *     {
   *       section_number: 2,
   *       section_title: "Understanding Variables and Data Types",
   *       // ... other fields
   *     }
   *   ],
   *   "en"
   * );
   * // results[0].passed: true, results[0].score: 0.82
   * // results[1].passed: true, results[1].score: 0.79
   * ```
   */
  async validateSections(
    expectedTopics: string[],
    generatedSections: Section[],
    language: string = 'en'
  ): Promise<SectionQualityResult[]> {
    const phase = 'sections';

    try {
      this.logger.info({
        msg: 'Starting sections quality validation',
        phase,
        language,
        sectionCount: generatedSections.length,
        threshold: this.getThresholdForLanguage(language, phase),
      });

      // Validate array lengths match
      if (expectedTopics.length !== generatedSections.length) {
        throw new ValidationError(
          `Mismatch between expected topics count (${expectedTopics.length}) and generated sections count (${generatedSections.length})`,
          {
            phase,
            language,
            expectedTopics: expectedTopics.length,
            actualSections: generatedSections.length,
          }
        );
      }

      const results: SectionQualityResult[] = [];

      // Validate each section
      for (let i = 0; i < generatedSections.length; i++) {
        const section = generatedSections[i];
        const expectedTopic = expectedTopics[i];

        // Concatenate section content
        const sectionText = this.concatenateSectionFields(section);

        // Generate embeddings
        const [sectionEmbedding, topicEmbedding] = await Promise.all([
          generateEmbedding(sectionText, 'retrieval.passage'),
          generateEmbedding(expectedTopic, 'retrieval.query'),
        ]);

        // Compute cosine similarity
        const score = this.cosineSimilarity(sectionEmbedding, topicEmbedding);

        // Get language-adjusted threshold
        const threshold = this.getThresholdForLanguage(language, phase);

        // Determine pass/fail
        const passed = score >= threshold;

        results.push({
          sectionNumber: section.section_number ?? 0,
          passed,
          score,
          threshold,
        });

        this.logger.info({
          msg: 'Section quality validation complete',
          phase,
          sectionNumber: section.section_number,
          passed,
          score: score.toFixed(4),
          threshold,
        });
      }

      return results;
    } catch (error) {
      this.logger.error({
        msg: 'Sections quality validation failed',
        phase,
        language,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ValidationError(
        `Failed to validate sections quality: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { phase, language }
      );
    }
  }

  /**
   * Detect content overlap between Stage 5 generated sections.
   *
   * Thin wrapper over detectOverlapFromTexts() that extracts text from Section[].
   * Uses OVERLAP_THRESHOLDS.stage5 (0.75) by default.
   *
   * @param generatedSections - Array of generated sections to check
   * @param language - Language code for threshold adjustment
   * @param overlapThreshold - Override threshold (default: stage5 threshold 0.75)
   * @returns CrossSectionOverlapResult with detected overlapping pairs
   */
  async detectCrossSectionOverlap(
    generatedSections: Section[],
    language: string = 'en',
    overlapThreshold: number = OVERLAP_THRESHOLDS.stage5
  ): Promise<CrossSectionOverlapResult> {
    // Build text representations for each section
    const texts = generatedSections.map(section => {
      const text = this.concatenateSectionFields(section);
      return text.trim().length > 0 ? text : `Section ${section.section_number ?? 'unknown'}`;
    });

    const labels = generatedSections.map(
      section => section.section_title || `Section ${section.section_number ?? 'unknown'}`
    );

    // Delegate to unified core method
    const result = await this.detectOverlapFromTexts(texts, labels, language, overlapThreshold);

    // Remap indices to section_numbers for backward compatibility
    result.overlappingPairs = result.overlappingPairs.map(pair => ({
      ...pair,
      sectionA: generatedSections[pair.sectionA - 1]?.section_number ?? pair.sectionA,
      sectionB: generatedSections[pair.sectionB - 1]?.section_number ?? pair.sectionB,
    }));

    return result;
  }

  // ==========================================================================
  // UNIFIED OVERLAP DETECTION (shared by Stage 4 and Stage 5)
  // ==========================================================================

  /**
   * Core overlap detection from pre-built text representations.
   *
   * Unified method used by both Stage 4 (sections_breakdown) and Stage 5 (generated sections).
   * Each caller prepares texts and labels; this method handles:
   * - Batch embedding generation (1 API call via generateEmbeddings)
   * - Pairwise cosine similarity computation
   * - Language-adjusted threshold comparison
   *
   * Uses batch generateEmbeddings() for efficiency:
   * - 10 texts → 1 API call (vs 10 individual calls with generateEmbedding)
   * - Respects Jina distributed rate limits (100 RPM, 2 concurrent) automatically
   *
   * @param texts - Pre-concatenated text representations (one per item)
   * @param labels - Human-readable labels for reporting (e.g., section titles)
   * @param language - Language code for threshold adjustment (ru: -0.05)
   * @param overlapThreshold - Base threshold (default: OVERLAP_THRESHOLDS.default)
   * @returns CrossSectionOverlapResult with detected overlapping pairs
   */
  async detectOverlapFromTexts(
    texts: string[],
    labels: string[],
    language: string = 'en',
    overlapThreshold: number = OVERLAP_THRESHOLDS.default
  ): Promise<CrossSectionOverlapResult> {
    // Apply language adjustment
    const langCode = language.toLowerCase().slice(0, 2);
    const adjustment = LANGUAGE_ADJUSTMENTS[langCode] || 0.0;
    const effectiveThreshold = overlapThreshold + adjustment;

    try {
      this.logger.info({
        msg: 'Starting overlap detection from texts',
        itemCount: texts.length,
        baseThreshold: overlapThreshold,
        effectiveThreshold,
        language,
      });

      // Need at least 2 items for comparison
      if (texts.length < 2) {
        return {
          hasOverlap: false,
          overlapCount: 0,
          overlapThreshold: effectiveThreshold,
          overlappingPairs: [],
        };
      }

      // Validate texts/labels alignment
      if (texts.length !== labels.length) {
        this.logger.warn({
          msg: 'texts/labels length mismatch, using index as fallback labels',
          textsLength: texts.length,
          labelsLength: labels.length,
        });
      }

      // Generate embeddings in batch (single API call — efficient)
      const embeddings = await generateEmbeddings(texts, 'retrieval.passage');

      // Compute pairwise cosine similarity
      const overlappingPairs: CrossSectionOverlapResult['overlappingPairs'] = [];

      for (let i = 0; i < embeddings.length; i++) {
        for (let j = i + 1; j < embeddings.length; j++) {
          const similarity = this.cosineSimilarity(embeddings[i], embeddings[j]);

          if (similarity >= effectiveThreshold) {
            overlappingPairs.push({
              sectionA: i + 1,
              sectionB: j + 1,
              similarity,
              sectionATitle: labels[i] || `Item ${i + 1}`,
              sectionBTitle: labels[j] || `Item ${j + 1}`,
            });

            this.logger.warn({
              msg: 'Overlap detected',
              indexA: i + 1,
              indexB: j + 1,
              similarity: similarity.toFixed(4),
              threshold: effectiveThreshold,
              labelA: labels[i],
              labelB: labels[j],
            });
          }
        }
      }

      const result: CrossSectionOverlapResult = {
        hasOverlap: overlappingPairs.length > 0,
        overlapCount: overlappingPairs.length,
        overlapThreshold: effectiveThreshold,
        overlappingPairs,
      };

      this.logger.info({
        msg: 'Overlap detection complete',
        hasOverlap: result.hasOverlap,
        overlapCount: result.overlapCount,
        totalPairsChecked: (texts.length * (texts.length - 1)) / 2,
        language,
      });

      return result;
    } catch (error) {
      this.logger.error({
        msg: 'Overlap detection from texts failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Non-blocking: return no overlap on failure
      return {
        hasOverlap: false,
        overlapCount: 0,
        overlapThreshold: effectiveThreshold,
        overlappingPairs: [],
      };
    }
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  /**
   * Get language-adjusted quality threshold for a specific phase
   *
   * Applies RT-004 base thresholds with language-specific adjustments:
   * - Metadata (Phase 2): 0.85 base (Russian: 0.80)
   * - Sections (Phase 3): 0.75 base (Russian: 0.70)
   * - Content (Phase 3): 0.70 base (Russian: 0.65)
   *
   * @param language - Language code (en, de, es, ru)
   * @param phase - Validation phase (metadata|sections|content)
   * @returns Adjusted threshold value
   *
   * @private
   */
  private getThresholdForLanguage(
    language: string,
    phase: 'metadata' | 'sections' | 'content'
  ): number {
    const baseThreshold = BASE_THRESHOLDS[phase];

    // Normalize language code to lowercase 2-char code
    const normalizedLang = language.toLowerCase().slice(0, 2);

    // Get language adjustment (default to 0.00 for unknown languages)
    const adjustment = LANGUAGE_ADJUSTMENTS[normalizedLang] || 0.0;

    return baseThreshold + adjustment;
  }

  /**
   * Concatenate key metadata fields for embedding generation
   *
   * Creates a single text representation of metadata by concatenating:
   * - Course title
   * - Course description
   * - Learning outcomes (text field from each objective)
   *
   * @param metadata - Generated course metadata
   * @returns Concatenated metadata text
   *
   * @private
   */
  private concatenateMetadataFields(metadata: CourseMetadata): string {
    const parts: string[] = [];

    // Add course title and description
    if (metadata.course_title) {
      parts.push(metadata.course_title);
    }
    if (metadata.course_description) {
      parts.push(metadata.course_description);
    }

    // Add learning outcomes text
    // Note: At course level, learning_outcomes are strings, not LearningObjective objects
    if (metadata.learning_outcomes && metadata.learning_outcomes.length > 0) {
      const outcomes = metadata.learning_outcomes.map(String).join('\n');
      parts.push(outcomes);
    }

    return parts.join('\n');
  }

  /**
   * Concatenate section fields for embedding generation
   *
   * Creates a single text representation of section by concatenating:
   * - Section title
   * - Section description
   * - Lesson titles (from all lessons in section)
   *
   * @param section - Generated section
   * @returns Concatenated section text
   *
   * @private
   */
  private concatenateSectionFields(section: Section): string {
    const parts: string[] = [];

    // Add section title and description
    if (section.section_title) {
      parts.push(section.section_title);
    }
    if (section.section_description) {
      parts.push(section.section_description);
    }

    // Add lesson titles
    if (section.lessons && section.lessons.length > 0) {
      const lessonTitles = section.lessons.map(lesson => lesson.lesson_title).join('\n');
      parts.push(lessonTitles);
    }

    return parts.join('\n');
  }

  /**
   * Compute cosine similarity between two vectors
   *
   * Formula: cosine_similarity(A, B) = (A · B) / (||A|| * ||B||)
   *
   * Where:
   * - A · B = dot product of vectors A and B
   * - ||A|| = magnitude (L2 norm) of vector A
   * - ||B|| = magnitude (L2 norm) of vector B
   *
   * Result range: [-1, 1]
   * - 1.0 = identical vectors (same direction)
   * - 0.0 = orthogonal vectors (perpendicular)
   * - -1.0 = opposite vectors (opposite direction)
   *
   * For text embeddings, typical range is [0.0, 1.0]
   *
   * @param vecA - First embedding vector (768-dimensional for Jina-v3)
   * @param vecB - Second embedding vector (768-dimensional for Jina-v3)
   * @returns Cosine similarity score (0.0-1.0 for text embeddings)
   * @throws ValidationError if vector dimensions don't match or are invalid
   */
  public cosineSimilarity(vecA: number[], vecB: number[]): number {
    // Validate vector dimensions
    const lenA = vecA.length;
    const lenB = vecB.length;

    if (lenA !== 768 || lenB !== 768) {
      throw new ValidationError(
        `Invalid vector dimensions for Jina-v3: expected 768, got vecA=${lenA}, vecB=${lenB}`,
        { vecALength: lenA, vecBLength: lenB }
      );
    }

    if (vecA.length !== vecB.length) {
      throw new ValidationError(
        `Vector dimension mismatch: vecA.length=${vecA.length}, vecB.length=${vecB.length}`,
        { vecALength: vecA.length, vecBLength: vecB.length }
      );
    }

    // Compute dot product: A · B = Σ(a_i * b_i)
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);

    // Compute magnitude of A: ||A|| = √(Σ(a_i²))
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));

    // Compute magnitude of B: ||B|| = √(Σ(b_i²))
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

    // Prevent division by zero
    if (magnitudeA === 0 || magnitudeB === 0) {
      throw new ValidationError(
        'Cannot compute cosine similarity: one or both vectors have zero magnitude',
        { magnitudeA, magnitudeB }
      );
    }

    // Compute cosine similarity: (A · B) / (||A|| * ||B||)
    return dotProduct / (magnitudeA * magnitudeB);
  }
}

// ============================================================================
// LEGACY API (Stage 3 Summarization compatibility)
// ============================================================================

/**
 * Quality check result for Stage 3 Summarization
 * (legacy interface from orchestrator/services/quality-validator.ts)
 */
export interface QualityCheckResult {
  /** Cosine similarity score (0.0-1.0) */
  quality_score: number;
  /** True if score >= threshold */
  quality_check_passed: boolean;
  /** Threshold used for validation */
  threshold: number;
  /** Original text length (characters) */
  original_length: number;
  /** Summary length (characters) */
  summary_length: number;
  /** Compression ratio (summary_length / original_length) */
  compression_ratio: number;
}

/**
 * Validate summary quality via semantic similarity (Stage 3 Summarization)
 *
 * Legacy function from orchestrator/services/quality-validator.ts.
 * Uses simpler interface than QualityValidator class for backward compatibility.
 *
 * @param originalText - Original document text
 * @param summary - Generated summary text
 * @param config - Optional configuration {threshold?: number}
 * @returns Quality validation result with score and pass/fail
 *
 * @example
 * ```typescript
 * const result = await validateSummaryQuality(
 *   "Long document...",
 *   "Short summary..."
 * );
 *
 * if (result.quality_check_passed) {
 *   console.log(`Quality score: ${result.quality_score.toFixed(2)}`);
 * }
 * ```
 */
export async function validateSummaryQuality(
  originalText: string,
  summary: string,
  config: { threshold?: number } = {}
): Promise<QualityCheckResult> {
  const threshold = config.threshold ?? 0.75;
  const logger = defaultLogger;

  // Validation: Check for empty inputs
  if (!originalText || originalText.trim().length === 0) {
    throw new Error('Original text cannot be empty');
  }

  if (!summary || summary.trim().length === 0) {
    throw new Error('Summary cannot be empty');
  }

  logger.info(
    {
      originalTextLength: originalText.length,
      summaryLength: summary.length,
      threshold,
    },
    'Starting quality validation'
  );

  try {
    // Generate embeddings using Jina-v3
    const [originalEmbedding, summaryEmbedding] = await Promise.all([
      generateEmbedding(originalText, 'retrieval.passage'),
      generateEmbedding(summary, 'retrieval.passage'),
    ]);

    // Compute cosine similarity using QualityValidator's method
    const validator = new QualityValidator(logger);
    const similarity = validator.cosineSimilarity(originalEmbedding, summaryEmbedding);

    // Compare to threshold
    const passed = similarity >= threshold;
    const compressionRatio = summary.length / originalText.length;

    const result: QualityCheckResult = {
      quality_score: similarity,
      quality_check_passed: passed,
      threshold,
      original_length: originalText.length,
      summary_length: summary.length,
      compression_ratio: compressionRatio,
    };

    logger.info(
      {
        quality_score: similarity.toFixed(4),
        quality_check_passed: passed,
        threshold,
        compression_ratio: compressionRatio.toFixed(2),
      },
      'Quality validation complete'
    );

    return result;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        originalTextLength: originalText.length,
        summaryLength: summary.length,
      },
      'Quality validation failed'
    );

    throw new Error(
      `Quality validation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
