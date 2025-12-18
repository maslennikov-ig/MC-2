/**
 * Logprob Entropy Calculator for Hallucination Pre-filtering
 * @module stages/stage6-lesson-content/judge/entropy-detector
 *
 * Detects potential hallucinations by analyzing token-level entropy from LLM logprobs.
 * High entropy indicates model uncertainty, which correlates with confabulated content.
 *
 * Algorithm:
 * 1. Calculate per-token entropy from logprobs: H = -sum(p_i * log(p_i))
 * 2. Identify spans with high entropy (threshold ~2.0)
 * 3. Flag sentences containing high-entropy spans
 * 4. Return flagged content for RAG verification
 *
 * NOTE: Not all LLM APIs return logprobs. Functions gracefully handle missing
 * logprobs by returning neutral results (assume content is fine).
 */

import { logger } from '@/shared/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for entropy-based hallucination detection
 */
export interface EntropyConfig {
  /** Entropy threshold above which content is flagged (default: 2.0) */
  entropyThreshold: number;
  /** Number of tokens to average over for sliding window (default: 5) */
  windowSize: number;
  /** Minimum tokens required to form a flagged span (default: 3) */
  minSpanLength: number;
  /** Confidence level affecting threshold strictness */
  confidenceLevel: 'strict' | 'moderate' | 'lenient';
}

/**
 * Represents a span of tokens with high entropy
 */
export interface EntropySpan {
  /** Start token index in the sequence */
  startToken: number;
  /** End token index in the sequence (exclusive) */
  endToken: number;
  /** Average entropy value for this span */
  averageEntropy: number;
  /** Reconstructed text for this span */
  text: string;
  /** Index of the sentence containing this span */
  sentenceIndex: number;
}

/**
 * Result of entropy analysis on content
 */
export interface EntropyAnalysisResult {
  /** Average entropy across all tokens */
  overallEntropy: number;
  /** Spans identified as having high entropy */
  flaggedSpans: EntropySpan[];
  /** Percentage of content flagged (0-1) */
  highEntropyRatio: number;
  /** Whether content should be sent for RAG verification */
  requiresVerification: boolean;
  /** Confidence score (0-1, inverse relationship with entropy) */
  confidenceScore: number;
}

/**
 * Token with associated log probability data
 */
export interface TokenLogprob {
  /** The token string */
  token: string;
  /** Log probability of selected token */
  logprob: number;
  /** Optional: top alternative tokens with their log probabilities */
  topLogprobs?: Array<{
    token: string;
    logprob: number;
  }>;
}

/**
 * Mapping of token indices to sentence boundaries
 */
interface SentenceMapping {
  /** Sentence index */
  sentenceIndex: number;
  /** Sentence text */
  sentence: string;
  /** Start token index */
  startToken: number;
  /** End token index */
  endToken: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default configuration for entropy detection
 */
const DEFAULT_CONFIG: EntropyConfig = {
  entropyThreshold: 2.0,
  windowSize: 5,
  minSpanLength: 3,
  confidenceLevel: 'moderate',
};

/**
 * Threshold multipliers based on confidence level
 */
const CONFIDENCE_MULTIPLIERS: Record<EntropyConfig['confidenceLevel'], number> = {
  strict: 0.8,    // Lower threshold = more flagging
  moderate: 1.0,  // Default threshold
  lenient: 1.2,   // Higher threshold = less flagging
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Calculate Shannon entropy from log probabilities for a single token
 *
 * Entropy formula: H = -sum(p_i * log2(p_i))
 *
 * For tokens with top_logprobs available, uses all alternatives.
 * For single logprob, estimates entropy from the logprob value.
 *
 * @param logprob - Log probability of selected token
 * @param topLogprobs - Optional array of alternative token log probabilities
 * @returns Entropy value (0 = certain, higher = uncertain)
 */
export function calculateTokenEntropy(
  logprob: number,
  topLogprobs?: Array<{ token: string; logprob: number }>
): number {
  // Handle edge cases
  if (!Number.isFinite(logprob)) {
    logger.warn({ msg: 'Invalid logprob value', logprob });
    return 0;
  }

  // If we have multiple alternatives, calculate full entropy
  if (topLogprobs && topLogprobs.length > 0) {
    return calculateEntropyFromDistribution(topLogprobs.map((t) => t.logprob));
  }

  // Single logprob case: estimate entropy
  // Convert logprob to probability: p = exp(logprob)
  const p = Math.exp(logprob);

  // For a single token, estimate entropy using binary entropy approximation
  // High probability (p close to 1) = low entropy
  // Low probability (p close to 0) = could indicate high entropy
  //
  // Binary entropy: H = -p*log2(p) - (1-p)*log2(1-p)
  // But we only have p for selected token, so we estimate:
  // H_estimate = -log2(p) for practical purposes
  if (p <= 0 || p > 1) {
    return 0;
  }

  // Return negative log2 of probability (information content)
  // This gives us bits of information needed to encode this choice
  return -Math.log2(p);
}

/**
 * Calculate entropy from a distribution of log probabilities
 *
 * @param logprobs - Array of log probabilities
 * @returns Shannon entropy in bits
 */
function calculateEntropyFromDistribution(logprobs: number[]): number {
  if (logprobs.length === 0) return 0;

  // Convert logprobs to probabilities
  const probs = logprobs.map((lp) => Math.exp(lp));

  // Normalize to ensure they sum to 1 (in case of numerical issues)
  const sum = probs.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;

  const normalizedProbs = probs.map((p) => p / sum);

  // Calculate Shannon entropy: H = -sum(p * log2(p))
  let entropy = 0;
  for (const p of normalizedProbs) {
    if (p > 0 && p <= 1) {
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}

/**
 * Detect high-entropy spans in token sequence using sliding window
 *
 * @param tokenEntropies - Per-token entropy values
 * @param tokens - Original tokens for text reconstruction
 * @param config - Detection configuration
 * @returns Array of high-entropy spans
 */
export function detectHighEntropySpans(
  tokenEntropies: number[],
  tokens: string[],
  config: EntropyConfig = DEFAULT_CONFIG
): EntropySpan[] {
  if (tokenEntropies.length === 0 || tokens.length === 0) {
    return [];
  }

  const adjustedThreshold =
    config.entropyThreshold * CONFIDENCE_MULTIPLIERS[config.confidenceLevel];

  const spans: EntropySpan[] = [];
  const sentenceMap = mapTokensToSentences(tokens);

  // Sliding window to find high-entropy regions
  let spanStart: number | null = null;
  let spanEntropies: number[] = [];

  for (let i = 0; i <= tokenEntropies.length; i++) {
    // Calculate window average entropy
    const windowEnd = Math.min(i + config.windowSize, tokenEntropies.length);
    const windowEntropies = tokenEntropies.slice(i, windowEnd);
    const windowAvg =
      windowEntropies.length > 0
        ? windowEntropies.reduce((a, b) => a + b, 0) / windowEntropies.length
        : 0;

    const isHighEntropy = windowAvg >= adjustedThreshold;

    if (isHighEntropy) {
      // Start or continue a span
      if (spanStart === null) {
        spanStart = i;
        spanEntropies = [];
      }
      spanEntropies.push(tokenEntropies[i] ?? 0);
    } else if (spanStart !== null) {
      // End current span
      const spanEnd = i;
      const spanLength = spanEnd - spanStart;

      // Only record if span meets minimum length
      if (spanLength >= config.minSpanLength) {
        const avgEntropy =
          spanEntropies.reduce((a, b) => a + b, 0) / spanEntropies.length;
        const spanText = tokens.slice(spanStart, spanEnd).join('');
        const sentenceIndex = findSentenceIndex(spanStart, sentenceMap);

        spans.push({
          startToken: spanStart,
          endToken: spanEnd,
          averageEntropy: avgEntropy,
          text: spanText,
          sentenceIndex,
        });
      }

      spanStart = null;
      spanEntropies = [];
    }
  }

  logger.debug({
    msg: 'High entropy spans detected',
    totalTokens: tokenEntropies.length,
    spansFound: spans.length,
    threshold: adjustedThreshold,
  });

  return spans;
}

/**
 * Map token indices to sentence boundaries
 *
 * @param tokens - Array of tokens
 * @returns Array of sentence mappings
 */
export function mapTokensToSentences(tokens: string[]): SentenceMapping[] {
  const mappings: SentenceMapping[] = [];
  const text = tokens.join('');

  // Split text into sentences using common delimiters
  const sentencePattern = /[^.!?]+[.!?]+|[^.!?]+$/g;
  const sentences = text.match(sentencePattern) || [text];

  let tokenIndex = 0;
  let charIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    if (!sentence) continue;

    const sentenceStart = tokenIndex;

    // Find tokens that belong to this sentence
    let sentenceCharCount = 0;
    while (sentenceCharCount < sentence.length && tokenIndex < tokens.length) {
      sentenceCharCount += tokens[tokenIndex]?.length ?? 0;
      tokenIndex++;
    }

    mappings.push({
      sentenceIndex: i,
      sentence: sentence.trim(),
      startToken: sentenceStart,
      endToken: tokenIndex,
    });

    charIndex += sentence.length;
  }

  return mappings;
}

/**
 * Find the sentence index for a given token position
 */
function findSentenceIndex(
  tokenIndex: number,
  sentenceMap: SentenceMapping[]
): number {
  for (const mapping of sentenceMap) {
    if (tokenIndex >= mapping.startToken && tokenIndex < mapping.endToken) {
      return mapping.sentenceIndex;
    }
  }
  return sentenceMap.length > 0 ? sentenceMap[sentenceMap.length - 1].sentenceIndex : 0;
}

/**
 * Analyze content entropy from LLM response logprobs
 *
 * Main entry point for entropy-based hallucination detection.
 * If logprobs are not available, returns a neutral result.
 *
 * @param content - Generated text content
 * @param logprobs - Optional array of token logprobs from LLM
 * @param config - Detection configuration
 * @returns Analysis result with flagged spans and confidence
 */
export function analyzeContentEntropy(
  content: string,
  logprobs?: TokenLogprob[] | null,
  config: Partial<EntropyConfig> = {}
): EntropyAnalysisResult {
  const fullConfig: EntropyConfig = { ...DEFAULT_CONFIG, ...config };

  // Handle missing logprobs gracefully
  if (!logprobs || logprobs.length === 0) {
    logger.info({
      msg: 'No logprobs available for entropy analysis, returning neutral result',
      contentLength: content.length,
    });

    return createNeutralResult();
  }

  const startTime = Date.now();

  // Calculate per-token entropy
  const tokenEntropies = logprobs.map((tp) =>
    calculateTokenEntropy(tp.logprob, tp.topLogprobs)
  );

  const tokens = logprobs.map((tp) => tp.token);

  // Calculate overall entropy
  const overallEntropy =
    tokenEntropies.length > 0
      ? tokenEntropies.reduce((a, b) => a + b, 0) / tokenEntropies.length
      : 0;

  // Detect high-entropy spans
  const flaggedSpans = detectHighEntropySpans(tokenEntropies, tokens, fullConfig);

  // Calculate high entropy ratio
  const flaggedTokenCount = flaggedSpans.reduce(
    (sum, span) => sum + (span.endToken - span.startToken),
    0
  );
  const highEntropyRatio =
    tokenEntropies.length > 0 ? flaggedTokenCount / tokenEntropies.length : 0;

  // Determine if verification is needed
  const requiresVerification = shouldTriggerRAGVerification({
    overallEntropy,
    flaggedSpans,
    highEntropyRatio,
    requiresVerification: false, // Will be set below
    confidenceScore: 0, // Will be set below
  });

  // Calculate confidence score (inverse of normalized entropy)
  // Map entropy 0-4 to confidence 1-0
  const normalizedEntropy = Math.min(overallEntropy / 4, 1);
  const confidenceScore = 1 - normalizedEntropy;

  const duration = Date.now() - startTime;

  logger.info({
    msg: 'Entropy analysis complete',
    contentLength: content.length,
    tokenCount: logprobs.length,
    overallEntropy: overallEntropy.toFixed(4),
    flaggedSpans: flaggedSpans.length,
    highEntropyRatio: (highEntropyRatio * 100).toFixed(2) + '%',
    confidenceScore: confidenceScore.toFixed(4),
    requiresVerification,
    durationMs: duration,
  });

  return {
    overallEntropy,
    flaggedSpans,
    highEntropyRatio,
    requiresVerification,
    confidenceScore,
  };
}

/**
 * Determine if RAG verification should be triggered based on entropy analysis
 *
 * Decision logic:
 * - If high entropy ratio > 10%: verify
 * - If any critical span (avg entropy > 3.0): verify
 * - If overall entropy > threshold * 1.5: verify
 *
 * @param result - Entropy analysis result
 * @returns Whether RAG verification is needed
 */
export function shouldTriggerRAGVerification(
  result: EntropyAnalysisResult
): boolean {
  const HIGH_RATIO_THRESHOLD = 0.1; // 10% of content flagged
  const CRITICAL_ENTROPY = 3.0; // Individual span threshold
  const OVERALL_THRESHOLD_MULTIPLIER = 1.5;

  // Check high entropy ratio
  if (result.highEntropyRatio > HIGH_RATIO_THRESHOLD) {
    logger.debug({
      msg: 'RAG verification triggered by high entropy ratio',
      ratio: result.highEntropyRatio,
    });
    return true;
  }

  // Check for critical spans
  const criticalSpan = result.flaggedSpans.find(
    (span) => span.averageEntropy > CRITICAL_ENTROPY
  );
  if (criticalSpan) {
    logger.debug({
      msg: 'RAG verification triggered by critical span',
      spanEntropy: criticalSpan.averageEntropy,
      spanText: criticalSpan.text.slice(0, 50) + '...',
    });
    return true;
  }

  // Check overall entropy
  if (result.overallEntropy > DEFAULT_CONFIG.entropyThreshold * OVERALL_THRESHOLD_MULTIPLIER) {
    logger.debug({
      msg: 'RAG verification triggered by high overall entropy',
      overall: result.overallEntropy,
    });
    return true;
  }

  return false;
}

/**
 * Create a neutral result for when logprobs are unavailable
 * Assumes content is fine since we cannot analyze it
 */
function createNeutralResult(): EntropyAnalysisResult {
  return {
    overallEntropy: 0,
    flaggedSpans: [],
    highEntropyRatio: 0,
    requiresVerification: false,
    confidenceScore: 1.0, // Assume high confidence when we can't measure
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract sentences containing flagged spans for RAG verification
 *
 * @param content - Original content
 * @param result - Entropy analysis result
 * @returns Array of sentences that need verification
 */
export function extractFlaggedSentences(
  content: string,
  result: EntropyAnalysisResult
): string[] {
  if (result.flaggedSpans.length === 0) {
    return [];
  }

  // Split content into sentences
  const sentences = content.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];

  // Get unique sentence indices from flagged spans
  const flaggedIndices = new Set(
    result.flaggedSpans.map((span) => span.sentenceIndex)
  );

  return Array.from(flaggedIndices)
    .filter((idx) => idx >= 0 && idx < sentences.length)
    .map((idx) => sentences[idx]?.trim() ?? '')
    .filter((s) => s.length > 0);
}

/**
 * Get a human-readable summary of the entropy analysis
 *
 * @param result - Entropy analysis result
 * @returns Summary string
 */
export function getEntropyAnalysisSummary(result: EntropyAnalysisResult): string {
  const confidence = result.confidenceScore >= 0.8
    ? 'high'
    : result.confidenceScore >= 0.5
      ? 'moderate'
      : 'low';

  const lines = [
    `Entropy Analysis Summary:`,
    `- Overall entropy: ${result.overallEntropy.toFixed(3)} bits`,
    `- Confidence: ${confidence} (${(result.confidenceScore * 100).toFixed(1)}%)`,
    `- Flagged spans: ${result.flaggedSpans.length}`,
    `- High-entropy content: ${(result.highEntropyRatio * 100).toFixed(1)}%`,
    `- Requires verification: ${result.requiresVerification ? 'Yes' : 'No'}`,
  ];

  if (result.flaggedSpans.length > 0) {
    lines.push('', 'Top flagged spans:');
    const topSpans = result.flaggedSpans
      .sort((a, b) => b.averageEntropy - a.averageEntropy)
      .slice(0, 3);
    for (const span of topSpans) {
      const preview = span.text.length > 40
        ? span.text.slice(0, 40) + '...'
        : span.text;
      lines.push(`  - "${preview}" (entropy: ${span.averageEntropy.toFixed(2)})`);
    }
  }

  return lines.join('\n');
}
