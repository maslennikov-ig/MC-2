/**
 * Factual Verifier for Stage 6 Lesson Content Generation
 * @module stages/stage6-lesson-content/judge/factual-verifier
 *
 * Implements entropy-based conditional RAG verification for factual accuracy.
 * Uses entropy detection to identify uncertain spans, then verifies only those with RAG.
 *
 * Research findings:
 * - Factual accuracy without RAG: 30-40% detection rate
 * - Factual accuracy with RAG: 85% detection rate
 * - Strategy: Conditional RAG verification is more cost-effective than verifying everything
 *
 * Algorithm:
 * 1. Extract verifiable claims from content (dates, numbers, names, technical terms)
 * 2. If entropy analysis available, prioritize high-entropy claims
 * 3. Verify claims against RAG context using semantic similarity
 * 4. Calculate overall accuracy score with weighted scoring
 */

import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { EntropyAnalysisResult } from './entropy-detector';
import { shouldTriggerRAGVerification, extractFlaggedSentences } from './entropy-detector';
import { logger } from '@/shared/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for factual verification
 */
export interface FactualVerificationConfig {
  /** Entropy threshold above which claims are prioritized for verification (default: 2.0) */
  entropyThreshold: number;
  /** Maximum number of RAG chunks to use for verification (default: 10) */
  ragChunkLimit: number;
  /** Minimum confidence threshold for a claim to be considered verified (default: 0.7) */
  minConfidence: number;
  /** If true, verify all claims; if false, only verify high-entropy claims (default: false) */
  strictMode: boolean;
}

/**
 * Verification status for a claim
 */
export type VerificationStatus = 'verified' | 'unverified' | 'contradicted' | 'no_evidence';

/**
 * A claim extracted from content with verification result
 */
export interface VerificationClaim {
  /** The claim text being verified */
  text: string;
  /** Index of the sentence containing this claim */
  sentenceIndex: number;
  /** Entropy score from entropy analysis (0 if not available) */
  entropyScore: number;
  /** RAG chunks that support or contradict this claim */
  ragEvidence: RAGChunk[];
  /** Verification status after RAG check */
  verificationStatus: VerificationStatus;
  /** Confidence score of the verification (0-1) */
  confidence: number;
}

/**
 * Result of factual verification process
 */
export interface FactualVerificationResult {
  /** All claims extracted and verified */
  claims: VerificationClaim[];
  /** Overall accuracy score (0-1) */
  overallAccuracyScore: number;
  /** Number of claims that contradict RAG evidence */
  contradictedClaims: number;
  /** Number of claims that could not be verified (low confidence) */
  unverifiedClaims: number;
  /** Number of claims verified as accurate */
  verifiedClaims: number;
  /** Number of claims with no RAG evidence available */
  noEvidenceClaims: number;
  /** Whether content requires human review */
  requiresHumanReview: boolean;
  /** Sentences flagged for potential issues */
  flaggedSentences: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default configuration for factual verification
 */
export const DEFAULT_FACTUAL_VERIFICATION_CONFIG: FactualVerificationConfig = {
  entropyThreshold: 2.0,
  ragChunkLimit: 10,
  minConfidence: 0.7,
  strictMode: false,
};

/**
 * Weights for different verification statuses when calculating accuracy score
 */
const VERIFICATION_WEIGHTS: Record<VerificationStatus, number> = {
  verified: 1.0,
  no_evidence: 0.5, // Neutral - no evidence to support or contradict
  unverified: 0.3,  // Low confidence, potential issue
  contradicted: 0.0, // Clear factual error
};

/**
 * Patterns for identifying factual claims
 */
const FACTUAL_CLAIM_PATTERNS: RegExp[] = [
  // Dates and years
  /\b(in|during|since|from|until|by)\s+\d{4}\b/gi,
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi,

  // Numeric facts and statistics
  /\b\d+(?:\.\d+)?%\b/g,
  /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:million|billion|trillion|thousand|hundred)\b/gi,
  /\bapproximately\s+\d+/gi,
  /\babout\s+\d+/gi,

  // Named entities and technical terms
  /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, // Proper names (FirstName LastName)
  /\b(?:Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s+[A-Z][a-z]+/g, // Titles with names

  // Definitive statements
  /\bis\s+(?:the\s+)?(?:first|last|only|largest|smallest|most|least)\b/gi,
  /\bwas\s+(?:the\s+)?(?:first|last|only|largest|smallest|most|least)\b/gi,
  /\baccording\s+to\b/gi,
  /\bstudies\s+(?:show|have shown|indicate|suggest)\b/gi,
  /\bresearch\s+(?:shows|indicates|suggests|demonstrates)\b/gi,
];

// ============================================================================
// CLAIM EXTRACTION
// ============================================================================

/**
 * Split content into sentences
 *
 * @param content - Text content to split
 * @returns Array of sentences with their indices
 */
function splitIntoSentences(content: string): { text: string; index: number }[] {
  const sentencePattern = /[^.!?]+[.!?]+|[^.!?]+$/g;
  const matches = content.match(sentencePattern) || [];

  return matches.map((text, index) => ({
    text: text.trim(),
    index,
  }));
}

/**
 * Check if a sentence contains a factual claim
 *
 * @param sentence - Sentence to analyze
 * @returns True if sentence contains factual patterns
 */
function containsFactualClaim(sentence: string): boolean {
  return FACTUAL_CLAIM_PATTERNS.some((pattern) => {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    return pattern.test(sentence);
  });
}

/**
 * Get entropy score for a sentence based on entropy analysis
 *
 * @param sentenceIndex - Index of the sentence
 * @param entropyResult - Entropy analysis result (optional)
 * @returns Entropy score for the sentence (0 if not available)
 */
function getSentenceEntropyScore(
  sentenceIndex: number,
  entropyResult?: EntropyAnalysisResult
): number {
  if (!entropyResult || entropyResult.flaggedSpans.length === 0) {
    return 0;
  }

  // Find spans that belong to this sentence
  const sentenceSpans = entropyResult.flaggedSpans.filter(
    (span) => span.sentenceIndex === sentenceIndex
  );

  if (sentenceSpans.length === 0) {
    return 0;
  }

  // Return average entropy of spans in this sentence
  const totalEntropy = sentenceSpans.reduce((sum, span) => sum + span.averageEntropy, 0);
  return totalEntropy / sentenceSpans.length;
}

/**
 * Extract verifiable claims from content
 *
 * Identifies sentences containing factual claims (dates, numbers, names, technical terms).
 * If entropy analysis is provided, filters by entropy threshold in non-strict mode.
 *
 * @param content - Text content to analyze
 * @param entropyResult - Optional entropy analysis for prioritization
 * @param config - Verification configuration
 * @returns Array of extracted claims
 */
export function extractVerifiableClaims(
  content: string,
  entropyResult?: EntropyAnalysisResult,
  config: FactualVerificationConfig = DEFAULT_FACTUAL_VERIFICATION_CONFIG
): Omit<VerificationClaim, 'ragEvidence' | 'verificationStatus' | 'confidence'>[] {
  const sentences = splitIntoSentences(content);
  const claims: Omit<VerificationClaim, 'ragEvidence' | 'verificationStatus' | 'confidence'>[] = [];

  for (const { text, index } of sentences) {
    // Skip short sentences
    if (text.length < 20) {
      continue;
    }

    // Check if sentence contains factual patterns
    const hasFactualPattern = containsFactualClaim(text);
    if (!hasFactualPattern) {
      continue;
    }

    // Get entropy score for this sentence
    const entropyScore = getSentenceEntropyScore(index, entropyResult);

    // In non-strict mode, only include high-entropy claims
    if (!config.strictMode && entropyResult) {
      // Include if entropy is high OR if no entropy data (be conservative)
      const shouldInclude =
        entropyScore >= config.entropyThreshold ||
        entropyScore === 0; // No entropy data means we should verify

      if (!shouldInclude) {
        continue;
      }
    }

    claims.push({
      text,
      sentenceIndex: index,
      entropyScore,
    });
  }

  logger.debug({
    msg: 'Extracted verifiable claims',
    totalSentences: sentences.length,
    claimsFound: claims.length,
    strictMode: config.strictMode,
    hasEntropyData: !!entropyResult,
  });

  return claims;
}

// ============================================================================
// RAG VERIFICATION
// ============================================================================

/**
 * Calculate simple keyword overlap for semantic similarity
 *
 * Uses normalized keyword overlap as a proxy for semantic similarity.
 * This is a lightweight alternative to embedding-based similarity.
 *
 * @param text1 - First text
 * @param text2 - Second text
 * @returns Similarity score (0-1)
 */
function calculateKeywordSimilarity(text1: string, text2: string): number {
  // Tokenize and normalize - supports Cyrillic/Unicode text
  const tokenize = (text: string): Set<string> => {
    const words = text
      .toLowerCase()
      // Remove markdown formatting, punctuation, but keep Unicode letters (Cyrillic, etc.)
      .replace(/[#*_~`\[\](){}|\\<>!@$%^&=+;:'",.?\/\-—–]+/g, ' ')
      // Remove emojis and special Unicode symbols
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2); // Filter short words
    return new Set(words);
  };

  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);

  if (tokens1.size === 0 || tokens2.size === 0) {
    return 0;
  }

  // Calculate Jaccard similarity
  let intersection = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...tokens1, ...tokens2]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Find relevant RAG chunks for a claim
 *
 * @param claim - Claim text to verify
 * @param ragChunks - Available RAG chunks
 * @param limit - Maximum chunks to return
 * @returns Most relevant RAG chunks sorted by similarity
 */
function findRelevantChunks(
  claim: string,
  ragChunks: RAGChunk[],
  limit: number
): RAGChunk[] {
  if (ragChunks.length === 0) {
    return [];
  }

  // Calculate similarity for each chunk
  const scoredChunks = ragChunks.map((chunk) => ({
    chunk,
    similarity: calculateKeywordSimilarity(claim, chunk.content),
  }));

  // Debug: Log top similarities to verify matching works
  const topSimilarities = scoredChunks
    .map((sc) => sc.similarity)
    .sort((a, b) => b - a)
    .slice(0, 3);

  if (topSimilarities[0] > 0) {
    logger.debug({
      msg: 'Claim-chunk similarity scores',
      claimPreview: claim.slice(0, 50),
      topSimilarities: topSimilarities.map((s) => s.toFixed(3)),
      totalChunks: ragChunks.length,
    });
  }

  // Sort by similarity (descending) and take top N
  // Lower threshold (0.05) to handle different phrasings and multilingual text
  return scoredChunks
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .filter((sc) => sc.similarity > 0.05) // Minimum threshold - permissive for multilingual
    .map((sc) => sc.chunk);
}

/**
 * Check if evidence supports or contradicts a claim
 *
 * Analyzes RAG evidence to determine verification status.
 * Uses simple heuristics for support/contradiction detection.
 *
 * @param claim - Claim text
 * @param evidence - RAG chunks as evidence
 * @returns Verification status and confidence
 */
function analyzeEvidence(
  claim: string,
  evidence: RAGChunk[]
): { status: VerificationStatus; confidence: number } {
  if (evidence.length === 0) {
    return { status: 'no_evidence', confidence: 0.5 };
  }

  // Extract key terms from claim (numbers, dates, proper nouns)
  const extractKeyTerms = (text: string): string[] => {
    const terms: string[] = [];

    // Numbers and percentages
    const numbers = text.match(/\d+(?:\.\d+)?%?/g);
    if (numbers) terms.push(...numbers);

    // Proper nouns (capitalized words not at sentence start)
    const properNouns = text.match(/(?<!^|\. )[A-Z][a-z]+/g);
    if (properNouns) terms.push(...properNouns);

    // Years
    const years = text.match(/\b(19|20)\d{2}\b/g);
    if (years) terms.push(...years);

    return terms;
  };

  const claimTerms = extractKeyTerms(claim);

  let supportCount = 0;
  let contradictCount = 0;
  let totalRelevance = 0;

  for (const chunk of evidence) {
    const chunkLower = chunk.content.toLowerCase();

    // Check term overlap
    let matchingTerms = 0;
    for (const term of claimTerms) {
      if (chunk.content.includes(term) || chunkLower.includes(term.toLowerCase())) {
        matchingTerms++;
      }
    }

    // If we have matching key terms, check for contradiction patterns
    if (matchingTerms > 0) {
      totalRelevance += chunk.relevance_score;

      // Check for contradiction indicators
      const hasContradiction =
        (chunkLower.includes('not') || chunkLower.includes("n't")) &&
        calculateKeywordSimilarity(claim, chunk.content) > 0.2;

      // Check for support indicators
      const hasSupport = matchingTerms >= Math.min(2, claimTerms.length * 0.5);

      if (hasContradiction) {
        contradictCount++;
      } else if (hasSupport) {
        supportCount++;
      }
    }
  }

  // Determine final status
  if (contradictCount > supportCount && contradictCount > 0) {
    return {
      status: 'contradicted',
      confidence: Math.min(0.9, (contradictCount / evidence.length) * 0.8 + totalRelevance * 0.2),
    };
  }

  if (supportCount > 0) {
    const confidence = Math.min(0.95, (supportCount / evidence.length) * 0.7 + totalRelevance * 0.3);
    return {
      status: confidence >= 0.7 ? 'verified' : 'unverified',
      confidence,
    };
  }

  // Some evidence but no clear support or contradiction
  return {
    status: 'unverified',
    confidence: 0.4,
  };
}

/**
 * Verify a single claim against RAG context
 *
 * Finds relevant RAG chunks and determines if the claim is supported.
 *
 * @param claim - Claim text to verify
 * @param ragChunks - Available RAG context
 * @param config - Verification configuration
 * @returns Verification result with status and confidence
 */
export function verifyClaimWithRAG(
  claim: string,
  ragChunks: RAGChunk[],
  config: FactualVerificationConfig = DEFAULT_FACTUAL_VERIFICATION_CONFIG
): { ragEvidence: RAGChunk[]; verificationStatus: VerificationStatus; confidence: number } {
  // Find relevant chunks
  const relevantChunks = findRelevantChunks(claim, ragChunks, config.ragChunkLimit);

  if (relevantChunks.length === 0) {
    logger.debug({
      msg: 'No relevant RAG chunks found for claim',
      claimPreview: claim.slice(0, 100),
    });
    return {
      ragEvidence: [],
      verificationStatus: 'no_evidence',
      confidence: 0.5,
    };
  }

  // Analyze evidence
  const { status, confidence } = analyzeEvidence(claim, relevantChunks);

  // Apply minimum confidence threshold
  const finalStatus: VerificationStatus =
    status === 'verified' && confidence < config.minConfidence ? 'unverified' : status;

  logger.debug({
    msg: 'Claim verification complete',
    claimPreview: claim.slice(0, 100),
    status: finalStatus,
    confidence: confidence.toFixed(3),
    evidenceChunks: relevantChunks.length,
  });

  return {
    ragEvidence: relevantChunks,
    verificationStatus: finalStatus,
    confidence,
  };
}

// ============================================================================
// ACCURACY SCORING
// ============================================================================

/**
 * Calculate overall accuracy score from verified claims
 *
 * Uses weighted scoring based on verification status:
 * - verified: 1.0 (full confidence)
 * - no_evidence: 0.5 (neutral)
 * - unverified: 0.3 (potential issue)
 * - contradicted: 0.0 (factual error)
 *
 * @param claims - Array of verified claims
 * @returns Accuracy score (0-1)
 */
export function calculateAccuracyScore(claims: VerificationClaim[]): number {
  if (claims.length === 0) {
    // No claims = assume content is fine (no factual statements to verify)
    return 1.0;
  }

  let totalWeight = 0;
  let weightedScore = 0;

  for (const claim of claims) {
    // Weight by confidence - higher confidence = more impact on score
    const claimWeight = 0.5 + claim.confidence * 0.5;
    const statusScore = VERIFICATION_WEIGHTS[claim.verificationStatus];

    weightedScore += statusScore * claimWeight;
    totalWeight += claimWeight;
  }

  return totalWeight > 0 ? weightedScore / totalWeight : 1.0;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

/**
 * Execute factual verification on content
 *
 * Main entry point for the factual verification process.
 * Integrates entropy-based detection with RAG verification.
 *
 * Process:
 * 1. Extract verifiable claims from content
 * 2. If entropy result provided, prioritize high-entropy claims
 * 3. Verify claims against RAG context
 * 4. Calculate overall accuracy score
 * 5. Determine if human review is needed
 *
 * @param content - Text content to verify
 * @param ragChunks - RAG context for verification
 * @param entropyResult - Optional entropy analysis for prioritization
 * @param config - Verification configuration
 * @returns Complete factual verification result
 */
export function executeFactualVerification(
  content: string,
  ragChunks: RAGChunk[],
  entropyResult?: EntropyAnalysisResult,
  config: Partial<FactualVerificationConfig> = {}
): FactualVerificationResult {
  const startTime = Date.now();
  const fullConfig: FactualVerificationConfig = {
    ...DEFAULT_FACTUAL_VERIFICATION_CONFIG,
    ...config,
  };

  logger.info({
    msg: 'Starting factual verification',
    contentLength: content.length,
    ragChunksAvailable: ragChunks.length,
    hasEntropyResult: !!entropyResult,
    strictMode: fullConfig.strictMode,
  });

  // Check if RAG verification is recommended based on entropy
  const ragRecommended = entropyResult
    ? shouldTriggerRAGVerification(entropyResult)
    : true; // Default to verification if no entropy data

  if (!ragRecommended && !fullConfig.strictMode) {
    logger.info({
      msg: 'RAG verification not recommended by entropy analysis, returning high-confidence result',
    });

    return {
      claims: [],
      overallAccuracyScore: entropyResult?.confidenceScore ?? 0.9,
      contradictedClaims: 0,
      unverifiedClaims: 0,
      verifiedClaims: 0,
      noEvidenceClaims: 0,
      requiresHumanReview: false,
      flaggedSentences: [],
    };
  }

  // Extract claims
  const extractedClaims = extractVerifiableClaims(content, entropyResult, fullConfig);

  // Verify each claim
  const verifiedClaims: VerificationClaim[] = extractedClaims.map((claim) => {
    const verificationResult = verifyClaimWithRAG(claim.text, ragChunks, fullConfig);
    return {
      ...claim,
      ...verificationResult,
    };
  });

  // Count results by status
  const statusCounts = verifiedClaims.reduce(
    (counts, claim) => {
      counts[claim.verificationStatus]++;
      return counts;
    },
    { verified: 0, unverified: 0, contradicted: 0, no_evidence: 0 }
  );

  // Calculate accuracy score
  const overallAccuracyScore = calculateAccuracyScore(verifiedClaims);

  // Determine flagged sentences
  const flaggedSentenceIndices = new Set<number>();

  // Add sentences with contradicted or unverified claims
  for (const claim of verifiedClaims) {
    if (claim.verificationStatus === 'contradicted' || claim.verificationStatus === 'unverified') {
      flaggedSentenceIndices.add(claim.sentenceIndex);
    }
  }

  // Add sentences from entropy flagging
  if (entropyResult) {
    const entropyFlagged = extractFlaggedSentences(content, entropyResult);
    const sentences = splitIntoSentences(content);

    for (const flaggedText of entropyFlagged) {
      const matchingIndex = sentences.findIndex((s) => s.text === flaggedText);
      if (matchingIndex >= 0) {
        flaggedSentenceIndices.add(matchingIndex);
      }
    }
  }

  // Extract flagged sentence texts
  const sentences = splitIntoSentences(content);
  const flaggedSentences = Array.from(flaggedSentenceIndices)
    .filter((idx) => idx < sentences.length)
    .map((idx) => sentences[idx].text);

  // Determine if human review is needed
  // Criteria: accuracy < 0.7 OR any contradicted claims OR >30% unverified
  const unverifiedRatio = verifiedClaims.length > 0
    ? (statusCounts.unverified + statusCounts.contradicted) / verifiedClaims.length
    : 0;

  const requiresHumanReview =
    overallAccuracyScore < 0.7 ||
    statusCounts.contradicted > 0 ||
    unverifiedRatio > 0.3;

  const duration = Date.now() - startTime;

  logger.info({
    msg: 'Factual verification complete',
    totalClaims: verifiedClaims.length,
    verified: statusCounts.verified,
    unverified: statusCounts.unverified,
    contradicted: statusCounts.contradicted,
    noEvidence: statusCounts.no_evidence,
    overallAccuracyScore: overallAccuracyScore.toFixed(4),
    requiresHumanReview,
    flaggedSentences: flaggedSentences.length,
    durationMs: duration,
  });

  return {
    claims: verifiedClaims,
    overallAccuracyScore,
    contradictedClaims: statusCounts.contradicted,
    unverifiedClaims: statusCounts.unverified,
    verifiedClaims: statusCounts.verified,
    noEvidenceClaims: statusCounts.no_evidence,
    requiresHumanReview,
    flaggedSentences,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get a human-readable summary of the factual verification
 *
 * @param result - Factual verification result
 * @returns Summary string
 */
export function getFactualVerificationSummary(result: FactualVerificationResult): string {
  const accuracy = result.overallAccuracyScore >= 0.85
    ? 'high'
    : result.overallAccuracyScore >= 0.7
      ? 'moderate'
      : 'low';

  const lines = [
    'Factual Verification Summary:',
    `- Overall accuracy: ${accuracy} (${(result.overallAccuracyScore * 100).toFixed(1)}%)`,
    `- Total claims analyzed: ${result.claims.length}`,
    `- Verified claims: ${result.verifiedClaims}`,
    `- Unverified claims: ${result.unverifiedClaims}`,
    `- Contradicted claims: ${result.contradictedClaims}`,
    `- No evidence: ${result.noEvidenceClaims}`,
    `- Requires human review: ${result.requiresHumanReview ? 'Yes' : 'No'}`,
  ];

  if (result.flaggedSentences.length > 0) {
    lines.push('', 'Flagged sentences:');
    const topFlagged = result.flaggedSentences.slice(0, 3);
    for (const sentence of topFlagged) {
      const preview = sentence.length > 80 ? sentence.slice(0, 80) + '...' : sentence;
      lines.push(`  - "${preview}"`);
    }
    if (result.flaggedSentences.length > 3) {
      lines.push(`  ... and ${result.flaggedSentences.length - 3} more`);
    }
  }

  if (result.contradictedClaims > 0) {
    lines.push('', 'Contradicted claims:');
    const contradicted = result.claims
      .filter((c) => c.verificationStatus === 'contradicted')
      .slice(0, 3);
    for (const claim of contradicted) {
      const preview = claim.text.length > 80 ? claim.text.slice(0, 80) + '...' : claim.text;
      lines.push(`  - "${preview}"`);
    }
  }

  return lines.join('\n');
}

/**
 * Create an empty verification result for when verification is skipped
 *
 * @param confidenceScore - Optional confidence score to use
 * @returns Empty verification result
 */
export function createSkippedVerificationResult(
  confidenceScore: number = 0.9
): FactualVerificationResult {
  return {
    claims: [],
    overallAccuracyScore: confidenceScore,
    contradictedClaims: 0,
    unverifiedClaims: 0,
    verifiedClaims: 0,
    noEvidenceClaims: 0,
    requiresHumanReview: false,
    flaggedSentences: [],
  };
}
