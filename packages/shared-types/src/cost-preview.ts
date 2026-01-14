/**
 * Cost Preview Service
 *
 * Provides cost estimation for course generation before starting.
 * Based on MODEL_PRICING from cost-tracker.ts and historical data.
 *
 * This is in shared-types to be available for both frontend and backend.
 */

export interface CostBreakdown {
  stage2_embeddings: number;
  stage4_analysis: number;
  stage5_structure: number;
  stage6_lessons: number;
}

export interface CostEstimate {
  totalUsd: number;
  minUsd: number;
  maxUsd: number;
  breakdown: CostBreakdown;
  confidence: 'low' | 'medium' | 'high';
}

export interface EstimateCostInput {
  documentCount: number;
  estimatedLessons: number;
  hasDocuments: boolean;
}

/**
 * Cost coefficients based on historical data and MODEL_PRICING
 */
export const COST_COEFFICIENTS = {
  // Stage 2: Document embeddings (~$0.0005 per document)
  STAGE2_PER_DOC: 0.0005,

  // Stage 4: Analysis (higher with documents due to RAG)
  STAGE4_WITH_DOCS: 0.05,
  STAGE4_NO_DOCS: 0.02,

  // Stage 5: Structure generation base + per lesson
  STAGE5_BASE: 0.05,
  STAGE5_PER_LESSON: 0.002,

  // Stage 6: Lesson content generation per lesson
  STAGE6_PER_LESSON: 0.08,

  // Variance multipliers for min/max estimation
  MIN_MULTIPLIER: 0.8,
  MAX_MULTIPLIER: 1.3,
} as const;

/**
 * Estimate the cost of course generation
 *
 * @param input - Document count, estimated lessons, and whether documents are present
 * @returns Cost estimate with breakdown and confidence level
 *
 * @example
 * ```typescript
 * const estimate = estimateCost({
 *   documentCount: 5,
 *   estimatedLessons: 15,
 *   hasDocuments: true
 * });
 * // { totalUsd: 1.35, minUsd: 1.14, maxUsd: 1.65, ... }
 * ```
 */
export function estimateCost(input: EstimateCostInput): CostEstimate {
  const { documentCount, estimatedLessons, hasDocuments } = input;

  // Calculate individual stage costs
  const stage2Cost = hasDocuments ? documentCount * COST_COEFFICIENTS.STAGE2_PER_DOC : 0;

  const stage4Cost = hasDocuments
    ? COST_COEFFICIENTS.STAGE4_WITH_DOCS
    : COST_COEFFICIENTS.STAGE4_NO_DOCS;

  const stage5Cost =
    COST_COEFFICIENTS.STAGE5_BASE + estimatedLessons * COST_COEFFICIENTS.STAGE5_PER_LESSON;

  const stage6Cost = estimatedLessons * COST_COEFFICIENTS.STAGE6_PER_LESSON;

  // Calculate totals with variance
  const baseTotal = stage2Cost + stage4Cost + stage5Cost + stage6Cost;
  const minTotal =
    stage2Cost + stage4Cost + stage5Cost + stage6Cost * COST_COEFFICIENTS.MIN_MULTIPLIER;
  const maxTotal =
    stage2Cost + stage4Cost + stage5Cost + stage6Cost * COST_COEFFICIENTS.MAX_MULTIPLIER;

  // Determine confidence based on input completeness
  let confidence: CostEstimate['confidence'];
  if (estimatedLessons === 0) {
    // No lessons estimate = very unreliable
    confidence = 'low';
  } else if (hasDocuments && documentCount >= 3 && estimatedLessons >= 5) {
    // Has documents AND enough data for accurate estimate
    confidence = 'high';
  } else if (estimatedLessons >= 5 || (hasDocuments && documentCount >= 1)) {
    // Decent estimate with either lessons or documents
    confidence = 'medium';
  } else {
    // Limited data
    confidence = 'low';
  }

  return {
    totalUsd: baseTotal,
    minUsd: minTotal,
    maxUsd: maxTotal,
    breakdown: {
      stage2_embeddings: stage2Cost,
      stage4_analysis: stage4Cost,
      stage5_structure: stage5Cost,
      stage6_lessons: stage6Cost,
    },
    confidence,
  };
}

/**
 * Format cost estimate for display
 *
 * @param estimate - Cost estimate from estimateCost()
 * @returns Formatted string like "~$0.85 - $1.20"
 */
export function formatCostRange(estimate: CostEstimate): string {
  return `~$${estimate.minUsd.toFixed(2)} - $${estimate.maxUsd.toFixed(2)}`;
}
