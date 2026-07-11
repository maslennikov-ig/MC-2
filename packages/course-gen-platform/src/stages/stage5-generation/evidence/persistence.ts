import type { AnalysisResult, Stage5DocumentEvidenceEnrichment } from '@megacampus/shared-types';

function sameSortedIds(left: string[], right: string[]): boolean {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}

/**
 * Build the narrow Stage 5 update for the compact Stage 4 evidence snapshot.
 * Full cards, decisions and refs remain in their durable owning stores.
 */
export function buildEvidenceAnalysisResultUpdate(
  analysisResult: AnalysisResult | null | undefined,
  enrichment: Stage5DocumentEvidenceEnrichment | undefined
): AnalysisResult | undefined {
  if (!analysisResult?.document_evidence || !enrichment || enrichment.status === 'not_applicable') {
    return undefined;
  }
  const snapshot = analysisResult.document_evidence;
  if (
    enrichment.accepted_run_id !== snapshot.accepted_run_id ||
    !sameSortedIds(enrichment.accepted_decision_ids, snapshot.current_decision_ids)
  ) {
    throw new Error('Stage 5 document evidence snapshot mismatch');
  }
  return {
    ...analysisResult,
    document_evidence: {
      ...snapshot,
      enrichment_status: enrichment.status,
    },
  };
}
