/**
 * Factual Verifier for Stage 6 Lesson Content Generation
 * @module stages/stage6-lesson-content/judge/factual-verifier
 *
 * Implements RAG-based factual verification with optional entropy prioritization.
 * RAG verification runs unconditionally when chunks are available.
 * Entropy scores (when provided) are used to prioritize claims for verification.
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
import { extractFlaggedSentences, shouldTriggerRAGVerification } from './entropy-detector';
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
  /** If true, always verify regardless of entropy (default: true for backward compatibility) */
  alwaysVerify: boolean;
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
  alwaysVerify: true, // Always verify when RAG available (cost optimization disabled)
};

// Re-export extracted functions for external consumers
export {
  VERIFICATION_WEIGHTS,
  extractVerifiableClaims,
  verifyClaimWithRAG,
  splitIntoSentences,
} from './claim-extraction';

// Import for internal use
import {
  VERIFICATION_WEIGHTS,
  extractVerifiableClaims,
  verifyClaimWithRAG,
  splitIntoSentences,
} from './claim-extraction';

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
 * @param entropyResult - Optional entropy analysis. Used ONLY for claim prioritization
 *   in extractVerifiableClaims(), NOT for gating verification. RAG verification runs
 *   unconditionally when ragChunks are available.
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

  const hasRagContext = ragChunks.length > 0;

  if (!hasRagContext) {
    logger.info({
      msg: 'RAG verification skipped: no reference chunks available',
    });

    return {
      claims: [],
      overallAccuracyScore: 0.8,
      contradictedClaims: 0,
      unverifiedClaims: 0,
      verifiedClaims: 0,
      noEvidenceClaims: 0,
      requiresHumanReview: false,
      flaggedSentences: [],
    };
  }

  // Check if we should skip based on entropy (when alwaysVerify is false)
  if (!fullConfig.alwaysVerify && entropyResult) {
    if (!shouldTriggerRAGVerification(entropyResult)) {
      logger.info({
        msg: 'RAG verification skipped: entropy confidence high',
        confidenceScore: entropyResult.confidenceScore,
      });

      return {
        claims: [],
        overallAccuracyScore: entropyResult.confidenceScore ?? 0.9,
        contradictedClaims: 0,
        unverifiedClaims: 0,
        verifiedClaims: 0,
        noEvidenceClaims: 0,
        requiresHumanReview: false,
        flaggedSentences: [],
      };
    }
  }

  // Proceed with verification
  logger.info({
    msg: fullConfig.alwaysVerify
      ? 'Performing unconditional RAG-based factual verification'
      : 'Performing entropy-triggered RAG verification',
    ragChunksCount: ragChunks.length,
    entropyDataAvailable: !!entropyResult,
    alwaysVerify: fullConfig.alwaysVerify,
  });

  // Extract claims
  const extractedClaims = extractVerifiableClaims(content, entropyResult, fullConfig);

  // Verify each claim
  const verifiedClaims: VerificationClaim[] = extractedClaims.map(claim => {
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
      const matchingIndex = sentences.findIndex(s => s.text === flaggedText);
      if (matchingIndex >= 0) {
        flaggedSentenceIndices.add(matchingIndex);
      }
    }
  }

  // Extract flagged sentence texts
  const sentences = splitIntoSentences(content);
  const flaggedSentences = Array.from(flaggedSentenceIndices)
    .filter(idx => idx < sentences.length)
    .map(idx => sentences[idx].text);

  // Determine if human review is needed
  // Criteria: accuracy < 0.7 OR any contradicted claims OR >30% unverified
  const unverifiedRatio =
    verifiedClaims.length > 0
      ? (statusCounts.unverified + statusCounts.contradicted) / verifiedClaims.length
      : 0;

  const requiresHumanReview =
    overallAccuracyScore < 0.7 || statusCounts.contradicted > 0 || unverifiedRatio > 0.3;

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
  const accuracy =
    result.overallAccuracyScore >= 0.85
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
      .filter(c => c.verificationStatus === 'contradicted')
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
