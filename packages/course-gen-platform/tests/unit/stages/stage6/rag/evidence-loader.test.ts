import { describe, expect, it, vi } from 'vitest';
import { loadStage6EvidenceForCourse } from '@/stages/stage6-lesson-content/rag/evidence-loader';

const id = {
  run: '10000000-0000-4000-8000-000000000001',
  course: '20000000-0000-4000-8000-000000000001',
  organization: '30000000-0000-4000-8000-000000000001',
  document: '40000000-0000-4000-8000-000000000001',
  claim: '50000000-0000-4000-8000-000000000001',
};

const snapshot = {
  accepted_run_id: id.run,
  coverage: { source_count: 1, assessed_count: 1, degraded_count: 0, failed_count: 0 },
  current_decision_ids: [],
  unresolved_informational_conflict_ids: [],
  enrichment_status: 'applied',
} as const;

describe('loadStage6EvidenceForCourse', () => {
  it('loads the current database snapshot and builds its accepted-run projection', async () => {
    const loadAcceptedEvidence = vi.fn(async () => ({
      sourceManifest: [
        {
          document_id: id.document,
          source_version_hash: 'sha256:current',
          document_name: 'Current.pdf',
        },
      ],
      cards: [
        {
          document_id: id.document,
          document_name: 'Current.pdf',
          priority: 'CORE' as const,
          authority_scope: 'course_source' as const,
          content_quality: 0.9,
          course_relevance: 1,
          processing_mode: 'summary' as const,
          summary: 'Current summary',
          key_claims: [
            {
              claim_id: id.claim,
              statement: 'Current accepted claim.',
              confidence: 0.9,
              source_refs: [
                {
                  document_id: id.document,
                  chunk_id: 'chunk-current',
                  version_hash: 'sha256:current',
                },
              ],
            },
          ],
          terminology: [],
          constraints: [],
          limitations: [],
          coverage_status: 'assessed' as const,
          coverage_reason: 'complete',
          token_counts: { original: 100, summary: 20, allocated: 20 },
        },
      ],
      conflicts: [],
      decisions: [],
    }));

    const result = await loadStage6EvidenceForCourse(
      {
        courseId: id.course,
        requestedOrganizationId: id.organization,
        providedAnalysisResult: {
          document_evidence: {
            ...snapshot,
            accepted_run_id: '10000000-0000-4000-8000-000000000099',
          },
        },
      },
      {
        loadCourseScope: async () => ({
          organizationId: id.organization,
          analysisResult: { document_evidence: snapshot },
        }),
        loadAcceptedEvidence,
      }
    );

    expect(loadAcceptedEvidence).toHaveBeenCalledWith({
      runId: id.run,
      courseId: id.course,
      organizationId: id.organization,
    });
    expect(result.organizationId).toBe(id.organization);
    expect(result.evidenceContext?.acceptedRunId).toBe(id.run);
    expect(result.evidenceContext?.allowedDocumentIds).toEqual([id.document]);
  });

  it('keeps no-document courses optional without loading evidence tables', async () => {
    const loadAcceptedEvidence = vi.fn();
    const result = await loadStage6EvidenceForCourse(
      { courseId: id.course },
      {
        loadCourseScope: async () => ({ organizationId: id.organization, analysisResult: {} }),
        loadAcceptedEvidence,
      }
    );

    expect(result).toEqual({ organizationId: id.organization, evidenceContext: undefined });
    expect(loadAcceptedEvidence).not.toHaveBeenCalled();
  });

  it('rejects a requested organization that does not own the course', async () => {
    await expect(
      loadStage6EvidenceForCourse(
        { courseId: id.course, requestedOrganizationId: '30000000-0000-4000-8000-000000000099' },
        {
          loadCourseScope: async () => ({ organizationId: id.organization, analysisResult: {} }),
          loadAcceptedEvidence: vi.fn(),
        }
      )
    ).rejects.toThrow(/organization.*scope/i);
  });
});
