import { describe, expect, it } from 'vitest';
import { GenerationMetadataSchema } from '../src/generation-result';

const RUN_ID = '10000000-0000-4000-8000-000000000001';
const DECISION_A = '20000000-0000-4000-8000-000000000001';
const DECISION_B = '20000000-0000-4000-8000-000000000002';
const DOCUMENT_ID = '30000000-0000-4000-8000-000000000001';

function metadata() {
  return {
    model_used: { metadata: 'metadata-model', sections: 'sections-model' },
    total_tokens: { metadata: 1, sections: 2, validation: 0, total: 3 },
    cost_usd: 0,
    duration_ms: { metadata: 1, sections: 2, validation: 0, total: 3 },
    quality_scores: { metadata_similarity: 1, sections_similarity: [1], overall: 1 },
    batch_count: 1,
    retry_count: { metadata: 0, sections: [0] },
    created_at: '2026-07-11T12:00:00.000Z',
  };
}

describe('Stage 5 document evidence enrichment metadata', () => {
  it('keeps the enrichment record backward-compatible and optional', () => {
    expect(GenerationMetadataSchema.safeParse(metadata()).success).toBe(true);
  });

  it('accepts a bounded canonical applied result', () => {
    const parsed = GenerationMetadataSchema.parse({
      ...metadata(),
      document_evidence_enrichment: {
        schema_version: 'stage5-document-evidence-enrichment-v1',
        status: 'applied',
        accepted_run_id: RUN_ID,
        accepted_decision_ids: [DECISION_A, DECISION_B],
        section_evidence: [
          {
            section_number: 1,
            search_queries: ['retention policy basics'],
            evidence_refs: [
              {
                document_id: DOCUMENT_ID,
                chunk_id: 'chunk-1',
                page_number: 2,
                version_hash: 'sha256:source-a',
              },
            ],
          },
        ],
        provenance_hash: `sha256:${'a'.repeat(64)}`,
        attempted_patches: 1,
        retrieved_ref_count: 1,
      },
    });

    expect(parsed.document_evidence_enrichment?.status).toBe('applied');
  });

  it('allows not_applicable only without an accepted run or evidence', () => {
    expect(
      GenerationMetadataSchema.safeParse({
        ...metadata(),
        document_evidence_enrichment: {
          schema_version: 'stage5-document-evidence-enrichment-v1',
          status: 'not_applicable',
          accepted_run_id: null,
          accepted_decision_ids: [],
          section_evidence: [],
          provenance_hash: `sha256:${'0'.repeat(64)}`,
          attempted_patches: 0,
          retrieved_ref_count: 0,
        },
      }).success
    ).toBe(true);
  });

  it.each([
    {
      name: 'unsorted decisions',
      change: { accepted_decision_ids: [DECISION_B, DECISION_A] },
    },
    {
      name: 'duplicate decisions',
      change: { accepted_decision_ids: [DECISION_A, DECISION_A] },
    },
    {
      name: 'too many section queries',
      change: {
        section_evidence: [
          {
            section_number: 1,
            search_queries: Array.from({ length: 5 }, (_, index) => `query ${index} valid`),
            evidence_refs: [],
          },
        ],
      },
    },
  ])('rejects non-canonical or unbounded $name', ({ change }) => {
    const result = GenerationMetadataSchema.safeParse({
      ...metadata(),
      document_evidence_enrichment: {
        schema_version: 'stage5-document-evidence-enrichment-v1',
        status: 'applied',
        accepted_run_id: RUN_ID,
        accepted_decision_ids: [DECISION_A],
        section_evidence: [],
        provenance_hash: `sha256:${'a'.repeat(64)}`,
        attempted_patches: 1,
        retrieved_ref_count: 0,
        ...change,
      },
    });

    expect(result.success).toBe(false);
  });
});
