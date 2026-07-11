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
  isStage6EvidenceChunkAllowed,
  type Stage6EvidenceDecisionRow,
} from '@/stages/stage6-lesson-content/rag/evidence-context';
import { buildDocumentConflictSideHandle } from '@/stages/stage4-analysis/evidence/side-handle';

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
const sideHandleA = buildDocumentConflictSideHandle(id.conflict, [id.claimA]);
const sideHandleB = buildDocumentConflictSideHandle(id.conflict, [id.claimB]);

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
  }),
  card({
    documentId: id.documentC,
    versionHash: 'sha256:c',
    claimId: id.claimC,
    statement: 'Audit access monthly.',
  }),
];

const conflict: DocumentConflict = {
  conflict_id: id.conflict,
  conflict_fingerprint: 'sha256:conflict',
  topic: 'Retention period',
  severity: 'critical',
  sides: [
    {
      side_handle: sideHandleA,
      side_role: 'recommended',
      statement: 'Retain records for 30 days.',
      claim_ids: [id.claimA],
      document_ids: [id.documentA],
      source_refs: cards[0].key_claims[0].source_refs,
    },
    {
      side_handle: sideHandleB,
      side_role: 'alternative',
      alternative_index: 0,
      statement: 'Retain records for 365 days.',
      claim_ids: [id.claimB],
      document_ids: [id.documentB],
      source_refs: cards[1].key_claims[0].source_refs,
    },
  ],
  course_impact: 'Changes the retention guidance.',
  recommended_resolution: 'Retain records for 30 days.',
  recommended_side_handle: sideHandleA,
  recommendation_rationale: 'Organization policy wins.',
  alternatives: ['Retain records for 365 days.'],
  alternative_side_handles: [sideHandleB],
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
    selected_side_handle: sideHandleA,
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
          selected_side_handle: sideHandleB,
        }),
      ],
    });

    expect(result.allowedDocumentIds).toEqual([id.documentB, id.documentC]);
    expect(result.allowedDocumentIds).not.toContain(id.documentA);
  });

  it('honors remove_document while continue_limited preserves allowlisted degraded refs', () => {
    const degradedCards = structuredClone(cards);
    degradedCards[2].coverage_status = 'degraded';
    degradedCards[2].coverage_reason = 'limited_source';
    const continueLimited = decision({
      id: id.degradedDecision,
      subject_kind: 'degraded_evidence',
      conflict_id: null,
      document_id: id.documentC,
      selected_resolution: 'Continue with limited evidence',
      selected_recommendation_value: 'continue_limited',
      selected_side_handle: null,
      subject_key: 'subject-degraded',
    });
    const continued = build({
      snapshot: snapshot([id.conflictDecision, id.degradedDecision]),
      cards: degradedCards,
      decisions: [decision(), continueLimited],
    });
    expect(continued.allowedDocumentIds).toContain(id.documentC);

    const removed = build({
      snapshot: snapshot([id.conflictDecision, id.degradedDecision]),
      cards: degradedCards,
      decisions: [
        decision(),
        { ...continueLimited, selected_recommendation_value: 'remove_document' },
      ],
    });
    expect(removed.allowedDocumentIds).not.toContain(id.documentC);
  });

  it('requires one terminal degraded-evidence decision for every degraded or failed card', () => {
    const degradedCards = structuredClone(cards);
    degradedCards[2].coverage_status = 'failed';
    degradedCards[2].coverage_reason = 'parse_failed';
    degradedCards[2].summary = undefined;

    expect(() => build({ cards: degradedCards })).toThrow(/terminal.*degraded|degraded.*decision/i);
  });

  it('projects long persisted options by durable option value and fails visibly for unmapped custom text', () => {
    const longStatement = `${'Authoritative retention policy '.repeat(30)}365 days.`;
    const longCards = structuredClone(cards);
    longCards[0].key_claims[0].statement = longStatement;
    const longConflict = structuredClone(conflict);
    longConflict.sides[0].statement = longStatement.slice(0, 800);
    longConflict.recommended_resolution = longStatement.slice(0, 600);
    const result = buildStage6EvidenceContext({
      courseId: id.course,
      organizationId: id.organization,
      snapshot: snapshot([id.conflictDecision]),
      sourceManifest: manifest,
      cards: longCards,
      conflicts: [longConflict],
      decisions: [
        decision({
          selected_resolution: `recommendation:${id.conflict}`,
          selected_recommendation_value: `recommendation:${id.conflict}`,
        }),
      ],
    });
    expect(result.allowedDocumentIds).toContain(id.documentA);
    expect(result.allowedDocumentIds).not.toContain(id.documentB);

    expect(() =>
      build({
        decisions: [
          decision({
            selected_resolution: 'Create an entirely new compromise policy.',
            selected_recommendation_value: null,
            selected_side_handle: null,
          }),
        ],
      })
    ).toThrow(/custom.*project|selected.*side/i);
  });

  it('projects the exact durable side when both displays share the first 600 characters', () => {
    const commonPrefix = 'Retain data '.repeat(60);
    const ambiguousCards = structuredClone(cards);
    ambiguousCards[0].key_claims[0].statement = `${commonPrefix}for 30 days.`;
    ambiguousCards[1].key_claims[0].statement = `${commonPrefix}indefinitely.`;
    const ambiguousConflict = structuredClone(conflict);
    const handleA = sideHandleA;
    const handleB = sideHandleB;
    Object.assign(ambiguousConflict.sides[0], { side_handle: handleA });
    Object.assign(ambiguousConflict.sides[1], { side_handle: handleB });
    Object.assign(ambiguousConflict, {
      recommended_side_handle: handleA,
      alternative_side_handles: [handleB],
    });
    ambiguousConflict.recommended_resolution = ambiguousCards[0].key_claims[0].statement.slice(
      0,
      600
    );
    ambiguousConflict.alternatives = [ambiguousCards[1].key_claims[0].statement.slice(0, 600)];

    const result = buildStage6EvidenceContext({
      courseId: id.course,
      organizationId: id.organization,
      snapshot: snapshot([id.conflictDecision]),
      sourceManifest: manifest,
      cards: ambiguousCards,
      conflicts: [ambiguousConflict],
      decisions: [
        decision({
          selected_resolution: ambiguousConflict.alternatives[0],
          selected_recommendation_value: handleB,
          selected_side_handle: handleB,
        } as Partial<Stage6EvidenceDecisionRow>),
      ],
    });

    expect(result.allowedDocumentIds).toEqual([id.documentB, id.documentC]);
  });

  it('keeps selected and rejected chunks distinct when conflict sides share a document', () => {
    const sameDocumentCards = structuredClone(cards);
    sameDocumentCards[0].key_claims.push({
      ...sameDocumentCards[1].key_claims[0],
      source_refs: [
        {
          document_id: id.documentA,
          chunk_id: 'chunk-rejected-same-document',
          version_hash: 'sha256:a',
        },
      ],
    });
    sameDocumentCards[1].key_claims = [];
    const sameDocumentConflict = structuredClone(conflict);
    sameDocumentConflict.sides[1].document_ids = [id.documentA];
    sameDocumentConflict.sides[1].source_refs = sameDocumentCards[0].key_claims[1].source_refs;
    const context = buildStage6EvidenceContext({
      courseId: id.course,
      organizationId: id.organization,
      snapshot: snapshot([id.conflictDecision]),
      sourceManifest: manifest,
      cards: sameDocumentCards,
      conflicts: [sameDocumentConflict],
      decisions: [decision()],
    });

    expect(isStage6EvidenceChunkAllowed(context, id.documentA, `chunk-${id.claimA}`)).toBe(true);
    expect(
      isStage6EvidenceChunkAllowed(context, id.documentA, 'chunk-rejected-same-document')
    ).toBe(false);
    expect(isStage6EvidenceChunkAllowed(context, id.documentA, 'unknown-same-document')).toBe(
      false
    );
  });

  it('treats an accepted ref without chunk_id as document-level but still denies exact rejected refs', () => {
    const context = build();
    context.sourceRefs = [
      {
        document_id: id.documentA,
        page_number: 2,
        version_hash: 'sha256:a',
      },
    ];
    context.rejectedSourceRefs = [
      {
        document_id: id.documentA,
        chunk_id: 'chunk-rejected',
        version_hash: 'sha256:a',
      },
    ];

    expect(isStage6EvidenceChunkAllowed(context, id.documentA, 'any-accepted-version-chunk')).toBe(
      true
    );
    expect(isStage6EvidenceChunkAllowed(context, id.documentA, 'chunk-rejected')).toBe(false);
    expect(
      getStage6EvidenceProvenance(context, id.documentA, 'any-accepted-version-chunk').source_refs
    ).toEqual(context.sourceRefs);
  });

  it('builds a stable cache identity from sorted current decisions and source refs', () => {
    const degraded = decision({
      id: id.degradedDecision,
      subject_kind: 'degraded_evidence',
      conflict_id: null,
      document_id: id.documentC,
      selected_recommendation_value: 'continue_limited',
      selected_side_handle: null,
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
      decision_id_total: 1,
      decision_id_overflow_count: 0,
      decision_set_handle: expect.stringMatching(/^sha256:/),
      source_refs: [cards[0].key_claims[0].source_refs[0]],
      source_ref_total: 1,
      source_ref_overflow_count: 0,
      source_ref_set_handle: expect.stringMatching(/^sha256:/),
    });

    expect(getStage6EvidenceProvenance(context, id.documentA, 'neighboring-qdrant-chunk')).toEqual({
      accepted_run_id: id.run,
      decision_ids: [],
      decision_id_total: 0,
      decision_id_overflow_count: 0,
      decision_set_handle: expect.stringMatching(/^sha256:/),
      source_refs: [],
      source_ref_total: 0,
      source_ref_overflow_count: 0,
      source_ref_set_handle: expect.stringMatching(/^sha256:/),
    });
  });

  it('caps provenance to relevant decision IDs and emits totals, overflow and hash handles', () => {
    const context = build();
    const relevant = Array.from(
      { length: 12 },
      (_, index) => `70000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`
    );
    const unrelated = '70000000-0000-4000-8000-000000009999';
    context.decisionIds = [...relevant, unrelated];
    context.decisionIdsByDocumentId = {
      [id.documentA]: relevant,
      [id.documentB]: [unrelated],
    };
    context.globalDecisionIds = [];

    const provenance = getStage6EvidenceProvenance(context, id.documentA, `chunk-${id.claimA}`);
    expect(provenance.decision_ids).toHaveLength(8);
    expect(provenance.decision_ids).not.toContain(unrelated);
    expect(provenance.decision_id_total).toBe(12);
    expect(provenance.decision_id_overflow_count).toBe(4);
    expect(provenance.decision_set_handle).toMatch(/^sha256:/);
    expect(provenance.source_ref_total).toBe(1);
    expect(provenance.source_ref_overflow_count).toBe(0);
    expect(provenance.source_ref_set_handle).toMatch(/^sha256:/);
  });
});
