/**
 * Prompt Caching for Judge System
 * @module stages/stage6-lesson-content/judge/prompt-cache
 *
 * Provides prompt caching for 60-90% cost reduction on Judge evaluations.
 * Static prompt portions (instructions, rubric, examples) are cached
 * while dynamic content (lesson to evaluate) is inserted per-request.
 *
 * Cost savings by provider:
 * - Anthropic: 90% cheaper for cached tokens
 * - OpenAI: 50% cheaper for cached tokens
 *
 * Cache strategy:
 * - LRU (Least Recently Used) eviction
 * - Configurable TTL (default 5 minutes)
 * - Token counting for cost estimation
 *
 * Reference:
 * - docs/research/010-stage6-generation-strategy/ (cascade research)
 * - specs/010-stages-456-pipeline/data-model.md
 */

import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { DEFAULT_OSCQR_RUBRIC, type OSCQRRubric, type CriterionConfig } from '@megacampus/shared-types';
import { logger } from '@/shared/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for prompt caching
 */
export interface PromptCacheConfig {
  /** Whether caching is enabled (default: true) */
  enabled: boolean;
  /** Time to live in milliseconds (default: 5 minutes) */
  ttlMs: number;
  /** Maximum number of cache entries (default: 100) */
  maxCacheSize: number;
}

/**
 * Cached prompt part with metadata
 */
export interface CachedPromptPart {
  /** Cache key for this prompt part */
  key: string;
  /** The cached content */
  content: string;
  /** Estimated token count */
  tokenCount: number;
  /** When this entry was created */
  createdAt: Date;
  /** When this entry was last accessed */
  lastUsedAt: Date;
  /** Number of times this entry has been used */
  useCount: number;
}

/**
 * Result from building a cached prompt
 */
export interface CachedPromptResult {
  /** The complete prompt with static and dynamic parts */
  prompt: string;
  /** Number of tokens from cache (cheaper) */
  cachedTokens: number;
  /** Number of new tokens (full price) */
  newTokens: number;
  /** Whether cache was used */
  cacheHit: boolean;
  /** Cache key used */
  cacheKey: string;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Current number of entries */
  entryCount: number;
  /** Total cached tokens */
  totalCachedTokens: number;
  /** Estimated tokens saved */
  tokensSaved: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: PromptCacheConfig = {
  enabled: true,
  ttlMs: 5 * 60 * 1000, // 5 minutes
  maxCacheSize: 100,
};

/**
 * Static prompt parts for Judge system
 * These are the expensive parts that benefit from caching
 */
export const JUDGE_STATIC_PROMPTS = {
  /**
   * Full OSCQR rubric text for evaluation
   * ~2000 tokens, benefits greatly from caching
   */
  rubric: buildRubricPrompt(DEFAULT_OSCQR_RUBRIC),

  /**
   * Judge system instructions
   * ~500 tokens
   */
  instructions: `You are an expert educational content evaluator for the MegaCampus AI learning platform.
Your task is to evaluate AI-generated lesson content against the OSCQR (Online Student Course Quality Rubric) standards.

## EVALUATION GUIDELINES

1. **Objectivity**: Evaluate based solely on the rubric criteria, not personal preferences
2. **Evidence-Based**: Support all scores with specific examples from the content
3. **Constructive**: Provide actionable feedback for any scores below 0.8
4. **Consistency**: Apply the same standards across all evaluations
5. **RAG Grounding**: For factual accuracy, only verify claims against provided source materials

## SCORING SCALE

- 0.90-1.00: Excellent - Exceeds expectations, ready for publication
- 0.75-0.89: Good - Meets expectations with minor improvements possible
- 0.60-0.74: Fair - Acceptable but needs targeted improvements
- 0.40-0.59: Poor - Significant issues requiring regeneration
- 0.00-0.39: Unacceptable - Fundamental problems, must regenerate

## OUTPUT FORMAT

You MUST respond with valid JSON in the exact format specified.
Do not include any text outside the JSON object.
All scores must be between 0.0 and 1.0.`,

  /**
   * Few-shot examples demonstrating evaluation quality
   * ~1500 tokens, shows expected evaluation format and reasoning
   */
  fewShotExamples: `## EXAMPLE EVALUATIONS

### Example 1: High Quality Content (Score: 0.92)

**Learning Objectives Evaluated**:
- LO1: Explain the fundamentals of machine learning
- LO2: Differentiate between supervised and unsupervised learning

**Evaluation**:
\`\`\`json
{
  "overallScore": 0.92,
  "passed": true,
  "confidence": "high",
  "criteriaScores": {
    "learning_objective_alignment": 0.95,
    "pedagogical_structure": 0.90,
    "factual_accuracy": 0.92,
    "clarity_readability": 0.94,
    "engagement_examples": 0.88,
    "completeness": 0.91
  },
  "issues": [
    {
      "criterion": "engagement_examples",
      "severity": "minor",
      "location": "Section 3, Example 2",
      "description": "The clustering example could be more relatable to beginners",
      "suggestedFix": "Replace the abstract clustering example with a customer segmentation scenario"
    }
  ],
  "strengths": [
    "Clear progression from basic concepts to advanced topics",
    "Excellent real-world applications in Section 2",
    "Well-structured exercises that reinforce each learning objective"
  ],
  "recommendation": "ACCEPT"
}
\`\`\`

**Reasoning**: Content excellently addresses both learning objectives with clear explanations and practical examples. The minor issue with one example doesn't significantly impact learning outcomes.

---

### Example 2: Content Needing Refinement (Score: 0.68)

**Learning Objectives Evaluated**:
- LO1: Implement basic data validation in Python
- LO2: Handle common input errors gracefully

**Evaluation**:
\`\`\`json
{
  "overallScore": 0.68,
  "passed": false,
  "confidence": "high",
  "criteriaScores": {
    "learning_objective_alignment": 0.75,
    "pedagogical_structure": 0.70,
    "factual_accuracy": 0.85,
    "clarity_readability": 0.65,
    "engagement_examples": 0.55,
    "completeness": 0.60
  },
  "issues": [
    {
      "criterion": "engagement_examples",
      "severity": "major",
      "location": "Throughout content",
      "description": "Only 2 code examples provided, neither shows error handling",
      "suggestedFix": "Add 3-4 practical examples showing try/except blocks with common validation patterns"
    },
    {
      "criterion": "completeness",
      "severity": "major",
      "location": "Section 4",
      "description": "Error handling (LO2) is mentioned but not explained in depth",
      "suggestedFix": "Expand Section 4 to cover try/except, raise statements, and custom exceptions"
    },
    {
      "criterion": "clarity_readability",
      "severity": "minor",
      "location": "Section 2, paragraph 3",
      "description": "Technical jargon used without definition",
      "suggestedFix": "Define 'type coercion' and 'sanitization' when first introduced"
    }
  ],
  "strengths": [
    "Factually accurate explanations",
    "Good introduction to the topic"
  ],
  "recommendation": "ITERATIVE_REFINEMENT"
}
\`\`\`

**Reasoning**: Content covers basics but lacks sufficient examples and depth for the error handling objective. Two iterations of targeted refinement should address the gaps without full regeneration.

---

### Example 3: Content Requiring Regeneration (Score: 0.45)

**Learning Objectives Evaluated**:
- LO1: Design responsive web layouts using CSS Grid
- LO2: Apply mobile-first design principles

**Evaluation**:
\`\`\`json
{
  "overallScore": 0.45,
  "passed": false,
  "confidence": "medium",
  "criteriaScores": {
    "learning_objective_alignment": 0.40,
    "pedagogical_structure": 0.50,
    "factual_accuracy": 0.60,
    "clarity_readability": 0.45,
    "engagement_examples": 0.35,
    "completeness": 0.40
  },
  "issues": [
    {
      "criterion": "learning_objective_alignment",
      "severity": "critical",
      "location": "Entire content",
      "description": "Content focuses on Flexbox instead of CSS Grid (LO1 not addressed)",
      "suggestedFix": "Regenerate with focus on CSS Grid: grid-template-columns/rows, grid-area, fr units"
    },
    {
      "criterion": "completeness",
      "severity": "critical",
      "location": "Missing section",
      "description": "Mobile-first principles (LO2) are completely absent",
      "suggestedFix": "Add section on mobile-first approach: min-width media queries, progressive enhancement"
    },
    {
      "criterion": "engagement_examples",
      "severity": "critical",
      "location": "Examples section",
      "description": "No code examples or interactive exercises provided",
      "suggestedFix": "Include 3+ CSS Grid examples with varying complexity"
    }
  ],
  "strengths": [
    "Writing style is appropriate for target audience"
  ],
  "recommendation": "REGENERATE"
}
\`\`\`

**Reasoning**: Fundamental misalignment with learning objectives - content is about the wrong topic (Flexbox vs Grid). Targeted fixes cannot salvage this; full regeneration with correct focus is required.`,
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build rubric prompt from OSCQRRubric configuration
 *
 * @param rubric - OSCQR rubric configuration
 * @returns Formatted rubric prompt text
 */
function buildRubricPrompt(rubric: OSCQRRubric): string {
  const criteriaText = rubric.criteria
    .map(
      (c: CriterionConfig) => `### ${formatCriterionName(c.criterion)} (${(c.weight * 100).toFixed(0)}% weight)
**Reliability**: ${c.reliability} | **Requires RAG**: ${c.requiresRag ? 'Yes' : 'No'}

${c.description}

**Evaluation Points**:
${c.evaluationPoints.map((p: string) => `- ${p}`).join('\n')}`
    )
    .join('\n\n');

  return `## OSCQR EVALUATION RUBRIC v${rubric.version}

${rubric.description}

**Overall Passing Threshold**: ${(rubric.passingThreshold * 100).toFixed(0)}%
**Per-Criterion Minimum**: ${(rubric.criterionPassingThreshold * 100).toFixed(0)}%

${criteriaText}`;
}

/**
 * Format criterion name for display
 */
function formatCriterionName(criterion: string): string {
  return criterion
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Estimate token count for text
 * Uses rough approximation: ~4 characters per token for English
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokenCount(text: string): number {
  // Average ~4 characters per token for English text
  // This is a rough approximation; actual varies by tokenizer
  return Math.ceil(text.length / 4);
}

// ============================================================================
// PROMPT CACHE SERVICE
// ============================================================================

/**
 * PromptCacheService - LRU cache for static prompt parts
 *
 * Provides significant cost savings by caching expensive static portions
 * of evaluation prompts (rubric, instructions, examples).
 *
 * @example
 * ```typescript
 * const cache = new PromptCacheService();
 *
 * // Build prompt with caching
 * const result = cache.buildPromptWithCache(
 *   'judge-rubric-v1',
 *   JUDGE_STATIC_PROMPTS.rubric,
 *   dynamicLessonContent
 * );
 *
 * console.log(`Cached: ${result.cachedTokens}, New: ${result.newTokens}`);
 * ```
 */
export class PromptCacheService {
  private cache: Map<string, CachedPromptPart> = new Map();
  private config: PromptCacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    tokensSaved: 0,
  };

  constructor(config: Partial<PromptCacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Get a cached prompt part by key
   *
   * @param key - Cache key
   * @returns Cached prompt part or null if not found/expired
   */
  get(key: string): CachedPromptPart | null {
    if (!this.config.enabled) {
      return null;
    }

    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    const now = new Date();
    const age = now.getTime() - entry.createdAt.getTime();

    if (age > this.config.ttlMs) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access metadata
    entry.lastUsedAt = now;
    entry.useCount++;
    this.stats.hits++;
    this.stats.tokensSaved += entry.tokenCount;

    return entry;
  }

  /**
   * Set a cached prompt part
   *
   * @param key - Cache key
   * @param content - Content to cache
   * @param tokenCount - Token count for this content
   */
  set(key: string, content: string, tokenCount: number): void {
    if (!this.config.enabled) {
      return;
    }

    // Evict if at capacity (LRU eviction)
    if (this.cache.size >= this.config.maxCacheSize) {
      this.evictLRU();
    }

    const now = new Date();
    this.cache.set(key, {
      key,
      content,
      tokenCount,
      createdAt: now,
      lastUsedAt: now,
      useCount: 1,
    });
  }

  /**
   * Build a complete prompt with caching for static parts
   *
   * @param staticKey - Cache key for static content
   * @param staticContent - Static content (rubric, instructions, etc.)
   * @param dynamicContent - Dynamic content (lesson to evaluate)
   * @returns Prompt result with cache metrics
   */
  buildPromptWithCache(
    staticKey: string,
    staticContent: string,
    dynamicContent: string
  ): CachedPromptResult {
    const staticTokens = estimateTokenCount(staticContent);
    const dynamicTokens = estimateTokenCount(dynamicContent);

    // Try to get from cache
    let cached = this.get(staticKey);
    let cacheHit = false;

    if (cached) {
      cacheHit = true;
    } else {
      // Cache miss - store the static content
      this.set(staticKey, staticContent, staticTokens);
      cached = this.get(staticKey);
    }

    const prompt = `${staticContent}\n\n---\n\n${dynamicContent}`;

    return {
      prompt,
      cachedTokens: cacheHit ? staticTokens : 0,
      newTokens: cacheHit ? dynamicTokens : staticTokens + dynamicTokens,
      cacheHit,
      cacheKey: staticKey,
    };
  }

  /**
   * Get cache statistics
   *
   * @returns Current cache statistics
   */
  getCacheStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    let totalCachedTokens = 0;
    Array.from(this.cache.values()).forEach((entry) => {
      totalCachedTokens += entry.tokenCount;
    });

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      entryCount: this.cache.size,
      totalCachedTokens,
      tokensSaved: this.stats.tokensSaved,
    };
  }

  /**
   * Clear expired entries from cache
   *
   * @returns Number of entries removed
   */
  clearExpired(): number {
    const now = new Date().getTime();
    let removedCount = 0;

    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      const age = now - entry.createdAt.getTime();
      if (age > this.config.ttlMs) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug({
        msg: 'Cleared expired cache entries',
        removedCount,
        remainingCount: this.cache.size,
      });
    }

    return removedCount;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    const previousSize = this.cache.size;
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, tokensSaved: 0 };

    logger.info({
      msg: 'Prompt cache cleared',
      previousSize,
    });
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (entry.lastUsedAt.getTime() < oldestTime) {
        oldestTime = entry.lastUsedAt.getTime();
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug({
        msg: 'Evicted LRU cache entry',
        key: oldestKey,
      });
    }
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Build a complete Judge evaluation prompt with caching
 *
 * Combines all static parts (instructions, rubric, examples) with
 * dynamic lesson content for evaluation.
 *
 * @param lessonContent - The lesson content to evaluate (markdown)
 * @param lessonSpec - Lesson specification for context
 * @param cacheService - Optional cache service instance
 * @returns Complete prompt with caching metrics
 */
export function buildCachedJudgePrompt(
  lessonContent: string,
  lessonSpec: LessonSpecificationV2,
  cacheService?: PromptCacheService
): CachedPromptResult {
  // Build static portion
  const staticParts = [
    JUDGE_STATIC_PROMPTS.instructions,
    JUDGE_STATIC_PROMPTS.rubric,
    JUDGE_STATIC_PROMPTS.fewShotExamples,
  ].join('\n\n');

  // Build dynamic portion
  const objectives = lessonSpec.learning_objectives
    .map((lo) => `- [${lo.id}] ${lo.objective} (Bloom: ${lo.bloom_level})`)
    .join('\n');

  const dynamicParts = `## CONTENT TO EVALUATE

### Lesson Specification
**Title**: ${lessonSpec.title}
**Description**: ${lessonSpec.description}
**Difficulty**: ${lessonSpec.difficulty_level}
**Target Audience**: ${lessonSpec.metadata.target_audience}
**Content Archetype**: ${lessonSpec.metadata.content_archetype}

### Learning Objectives
${objectives}

### Content
${lessonContent}

## YOUR EVALUATION

Evaluate the content above against the OSCQR rubric. Respond ONLY with valid JSON:`;

  // Use provided cache service or create temporary one
  const cache = cacheService || new PromptCacheService();
  const cacheKey = `judge-prompt-v${DEFAULT_OSCQR_RUBRIC.version}`;

  return cache.buildPromptWithCache(cacheKey, staticParts, dynamicParts);
}

/**
 * Create a singleton cache service for the application
 */
let defaultCacheService: PromptCacheService | null = null;

/**
 * Get the default cache service singleton
 *
 * @returns Default PromptCacheService instance
 */
export function getDefaultCacheService(): PromptCacheService {
  if (!defaultCacheService) {
    defaultCacheService = new PromptCacheService();
  }
  return defaultCacheService;
}

/**
 * Reset the default cache service (useful for testing)
 */
export function resetDefaultCacheService(): void {
  if (defaultCacheService) {
    defaultCacheService.clear();
  }
  defaultCacheService = null;
}
