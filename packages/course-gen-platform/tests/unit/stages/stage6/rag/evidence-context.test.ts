import { describe, expect, it } from 'vitest';
import type {
  DocumentConflict,
  DocumentEvidenceCard,
  DocumentEvidenceSnapshot,
  DocumentEvidenceSourceManifestEntry,
} from '@megacampus/shared-types';
import {
  buildStage6EvidenceContext,
  getStage6EvidenceProvenance,
  type Stage6EvidenceDecisionRow,
} from '@/stages/stage6-lesson-content/rag/evidence-context';

const id = {
  run: '10000000-0000-4000-8000-000000000001',
  course: '20000000-0000-4000-8000-000000000001',
  organization: '30000000-0000-4000-8000-000000000001',
  documentA: '40000000-0000-4000-8000-000000000001',
  documentB: '40000000-0000-4000-8000-000000000002',
  documentC: '40000000-0000-4000-8000-000000000003',
  claimA: '50000000-0000-4000-8000-000000000001',
  claimB: '50000000-0000-4000-8000-000000000002',
  claimC: '50000000-0000-4000-8000-000000000003',
  conflict: '60000000-0000-4000-8000-000000000001',
  conflictDecision: '70000000-0000-4000-8000-000000000001',
  degradedDecision: '70000000-0000-4000-8000-000000000002',
};

const manifest: DocumentEvidenceSourceManifestEntry[] = [
  { document_id: id.documentA, source_version_hash: 'sha256:a', document_name: 'A.pdf' },
  { document_id: id.documentB, source_version_hash: 'sha256:b', document_name: 'B.pdf' },
  { document_id: id.documentC, source_version_hash: 'sha256:c', document_name: 'C.pdf' },
];

function card(input: {
  documentId: string;
  versionHash: string;
  claimId: string;
  statement: string;
  coverageStatus?: 'assessed' | 'degraded';
}): DocumentEvidenceCard {
  return {
    document_id: input.documentId,
    document_name: `${input.documentId}.pdf`,
    priority: 'IMPORTANT',
    authority_scope: 'course_source',
    content_quality: 0.8,
    course_relevance: 0.9,
    processing_mode: 'summary',
    summary: `Summary ${input.documentId}`,
    key_claims: [
      {
        claim_id: input.claimId,
        statement: input.statement,
        confidence: 0.9,
        source_refs: [
          {
            document_id: input.documentId,
            chunk_id: `chunk-${input.claimId}`,
            version_hash: input.versionHash,
          },
        ],
      },
    ],
    terminology: [],
    constraints: [],
    limitations: [],
    coverage_status: input.coverageStatus ?? 'assessed',
    coverage_reason: input.coverageStatus === 'degraded' ? 'limited_source' : 'complete',
    token_counts: { original: 100, summary: 20, allocated: 20 },
  };
}

const cards: DocumentEvidenceCard[] = [
  card({
    documentId: id.documentA,
    versionHash: 'sha256:a',
    claimId: id.claimA,
    statement: 'Retain records for 30 days.',
  }),
  card({
    documentId: id.documentB,
    versionHash: 'sha256:b',
    claimId: id.claimB,
    statement: 'Retain records for 365 days.',
    coverageStatus: 'degraded',
  }),
  card({
    documentId: id.documentC,
    versionHash: 'sha256:c',
    claimId: id.claimC,
    statement: 'Audit access monthly.',
    coverageStatus: 'degraded',
  }),
];

const conflict: DocumentConflict = {
  conflict_id: id.conflict,
  conflict_fingerprint: 'sha256:conflict',
  topic: 'Retention period',
  severity: 'critical',
  sides: [
    {
      statement: 'Retain records for 30 days.',
      claim_ids: [id.claimA],
      document_ids: [id.documentA],
      source_refs: cards[0].key_claims[0].source_refs,
    },
    {
      statement: 'Retain records for 365 days.',
      claim_ids: [id.claimB],
      document_ids: [id.documentB],
      source_refs: cards[1].key_claims[0].source_refs,
    },
  ],
  course_impact: 'Changes the retention guidance.',
  recommended_resolution: 'Retain records for 30 days.',
  recommendation_rationale: 'Organization policy wins.',
  alternatives: ['Retain records for 365 days.'],
};

function snapshot(decisionIds: string[]): DocumentEvidenceSnapshot {
  return {
    accepted_run_id: id.run,
    coverage: { source_count: 3, assessed_count: 1, degraded_count: 2, failed_count: 0 },
    current_decision_ids: decisionIds,
    unresolved_informational_conflict_ids: [],
    enrichment_status: 'applied',
  };
}

function decision(overrides: Partial<Stage6EvidenceDecisionRow> = {}): Stage6EvidenceDecisionRow {
  return {
    id: id.conflictDecision,
    run_id: id.run,
    subject_kind: 'claim_conflict',
    conflict_id: id.conflict,
    document_id: null,
    selected_resolution: 'Retain records for 30 days.',
    selected_recommendation_value: `recommendation:${id.conflict}`,
    subject_key: 'subject-conflict',
    supersedes_decision_id: null,
    decided_at: '2026-07-11T12:00:00.000Z',
    ...overrides,
  };
}

function build(
  overrides: {
    snapshot?: DocumentEvidenceSnapshot;
    cards?: DocumentEvidenceCard[];
    decisions?: Stage6EvidenceDecisionRow[];
  } = {}
) {
  return buildStage6EvidenceContext({
    courseId: id.course,
    organizationId: id.organization,
    snapshot: overrides.snapshot ?? snapshot([id.conflictDecision]),
    sourceManifest: manifest,
    cards: overrides.cards ?? cards,
    conflicts: [conflict],
    decisions: overrides.decisions ?? [decision()],
  });
}

describe('buildStage6EvidenceContext', () => {
  it('includes the accepted conflict side and uncontested refs but excludes the rejected side', () => {
    const result = build();

    expect(result.decisionQueries).toEqual(['Retain records for 30 days.']);
    expect(result.sourceRefs.map(ref => ref.document_id)).toEqual([id.documentA, id.documentC]);
    expect(result.allowedDocumentIds).toEqual([id.documentA, id.documentC]);
    expect(result.decisionIds).toEqual([id.conflictDecision]);
  });

  it('uses the persisted selected option when a user modifies the displayed resolution text', () => {
    const result = build({
      decisions: [
        decision({
          selected_resolution: 'Use the 365-day rule, with an annual review.',
          selected_recommendation_value: `alternative:${id.conflict}:0`,
        }),
      ],
    });

    expect(result.allowedDocumentIds).toEqual([id.documentB, id.documentC]);
    expect(result.allowedDocumentIds).not.toContain(id.documentA);
  });

  it('honors remove_document while continue_limited preserves allowlisted degraded refs', () => {
    const continueLimited = decision({
      id: id.degradedDecision,
      subject_kind: 'degraded_evidence',
      conflict_id: null,
      document_id: id.documentC,
      selected_resolution: 'Continue with limited evidence',
      selected_recommendation_value: 'continue_limited',
      subject_key: 'subject-degraded',
    });
    const continued = build({
      snapshot: snapshot([id.conflictDecision, id.degradedDecision]),
      decisions: [decision(), continueLimited],
    });
    expect(continued.allowedDocumentIds).toContain(id.documentC);

    const removed = build({
      snapshot: snapshot([id.conflictDecision, id.degradedDecision]),
      decisions: [
        decision(),
        { ...continueLimited, selected_recommendation_value: 'remove_document' },
      ],
    });
    expect(removed.allowedDocumentIds).not.toContain(id.documentC);
  });

  it('builds a stable cache identity from sorted current decisions and source refs', () => {
    const degraded = decision({
      id: id.degradedDecision,
      subject_kind: 'degraded_evidence',
      conflict_id: null,
      document_id: id.documentC,
      selected_recommendation_value: 'continue_limited',
      subject_key: 'subject-degraded',
    });
    const first = build({
      snapshot: snapshot([id.degradedDecision, id.conflictDecision]),
      cards: [...cards].reverse(),
      decisions: [degraded, decision()],
    });
    const second = build({
      snapshot: snapshot([id.conflictDecision, id.degradedDecision]),
      decisions: [decision(), degraded],
    });

    expect(first.cacheIdentity).toBe(second.cacheIdentity);
    expect(first.decisionIds).toEqual([id.conflictDecision, id.degradedDecision]);
  });

  it('invalidates cache identity when a current decision or accepted ref changes', () => {
    const baseline = build();
    const changedDecisionId = '70000000-0000-4000-8000-000000000099';
    const decisionChanged = build({
      snapshot: snapshot([changedDecisionId]),
      decisions: [decision({ id: changedDecisionId })],
    });
    const changedCards = structuredClone(cards);
    changedCards[0].key_claims[0].source_refs[0].chunk_id = 'chunk-new-version';
    const refChanged = build({ cards: changedCards });

    expect(decisionChanged.cacheIdentity).not.toBe(baseline.cacheIdentity);
    expect(refChanged.cacheIdentity).not.toBe(baseline.cacheIdentity);
  });

  it('rejects stale decision snapshots and foreign or stale source refs', () => {
    expect(() => build({ snapshot: snapshot([]) })).toThrow(/decision snapshot/i);

    const foreign = structuredClone(cards);
    foreign[0].key_claims[0].source_refs[0].document_id = '40000000-0000-4000-8000-000000000099';
    expect(() => build({ cards: foreign })).toThrow(/source ref.*allowlist/i);

    const stale = structuredClone(cards);
    stale[0].key_claims[0].source_refs[0].version_hash = 'sha256:stale';
    expect(() => build({ cards: stale })).toThrow(/version/i);
  });

  it('projects only bounded structured provenance for a retrieved chunk', () => {
    const context = build();
    expect(getStage6EvidenceProvenance(context, id.documentA, `chunk-${id.claimA}`)).toEqual({
      accepted_run_id: id.run,
      decision_ids: [id.conflictDecision],
      source_refs: [cards[0].key_claims[0].source_refs[0]],
    });

    expect(getStage6EvidenceProvenance(context, id.documentA, 'neighboring-qdrant-chunk')).toEqual({
      accepted_run_id: id.run,
      decision_ids: [id.conflictDecision],
      source_refs: [cards[0].key_claims[0].source_refs[0]],
    });
  });
});
