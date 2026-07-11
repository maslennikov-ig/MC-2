import { describe, expect, it } from 'vitest';
import type { AnalysisResult, Stage5DocumentEvidenceEnrichment } from '@megacampus/shared-types';
import { buildEvidenceAnalysisResultUpdate } from '@/stages/stage5-generation/evidence/persistence';

const runId = '10000000-0000-4000-8000-000000000001';
const decisionId = '20000000-0000-4000-8000-000000000001';

function analysis(): AnalysisResult {
  return {
    document_evidence: {
      accepted_run_id: runId,
      coverage: { source_count: 1, assessed_count: 1, degraded_count: 0, failed_count: 0 },
      current_decision_ids: [decisionId],
      unresolved_informational_conflict_ids: [],
      enrichment_status: 'not_applicable',
    },
  } as AnalysisResult;
}

function enrichment(
  overrides: Partial<Stage5DocumentEvidenceEnrichment> = {}
): Stage5DocumentEvidenceEnrichment {
  return {
    schema_version: 'stage5-document-evidence-enrichment-v1',
    status: 'applied',
    accepted_run_id: runId,
    accepted_decision_ids: [decisionId],
    section_evidence: [],
    provenance_hash: `sha256:${'a'.repeat(64)}`,
    attempted_patches: 1,
    retrieved_ref_count: 0,
    ...overrides,
  };
}

describe('Stage 5 evidence persistence snapshot', () => {
  it('updates only the compact enrichment status for the same accepted snapshot', () => {
    const original = analysis();
    const updated = buildEvidenceAnalysisResultUpdate(original, enrichment());

    expect(updated).not.toBe(original);
    expect(updated?.document_evidence).toEqual({
      ...original.document_evidence,
      enrichment_status: 'applied',
    });
    expect(original.document_evidence?.enrichment_status).toBe('not_applicable');
  });

  it('does not write analysis_result for a no-document result', () => {
    expect(
      buildEvidenceAnalysisResultUpdate(
        undefined,
        enrichment({
          status: 'not_applicable',
          accepted_run_id: null,
          accepted_decision_ids: [],
          attempted_patches: 0,
        })
      )
    ).toBeUndefined();
  });

  it.each([
    ['stale run', { accepted_run_id: '10000000-0000-4000-8000-000000000099' }],
    ['stale decisions', { accepted_decision_ids: [] }],
  ])('rejects a %s instead of overwriting analysis_result', (_name, overrides) => {
    expect(() => buildEvidenceAnalysisResultUpdate(analysis(), enrichment(overrides))).toThrow(
      /snapshot mismatch/i
    );
  });
});
