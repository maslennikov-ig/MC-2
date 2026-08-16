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

/**
 * Either both halves of the compare-and-swap are present, or neither is. The
 * guarded write needs the new value and the snapshot it replaces together.
 */
export type EvidencePersistencePlan =
  | { analysisResultUpdate: AnalysisResult; expectedAnalysisResult: AnalysisResult }
  | { analysisResultUpdate?: undefined; expectedAnalysisResult?: undefined };

/**
 * Pair the narrow update with its exact source snapshot so the database write
 * can use optimistic compare-and-swap and cannot erase a concurrent decision.
 *
 * The snapshot stays an object: it used to be serialised here and handed to
 * PostgREST as a URL filter, which turned a ten-kilobyte document into a
 * request line no server would accept (mc2-2pplo, 2026-08-15). It now travels
 * in the request body and is compared as jsonb.
 */
export function buildEvidencePersistencePlan(
  analysisResult: AnalysisResult | null | undefined,
  enrichment: Stage5DocumentEvidenceEnrichment | undefined
): EvidencePersistencePlan {
  const analysisResultUpdate = buildEvidenceAnalysisResultUpdate(analysisResult, enrichment);
  return analysisResultUpdate && analysisResult
    ? { analysisResultUpdate, expectedAnalysisResult: analysisResult }
    : {};
}
