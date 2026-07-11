import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  AnswerSourceSchema,
  ClarifyingQuestionCategorySchema,
  type AnswerSource,
  type ClarifyingQuestionCategory,
} from '../src/clarifying-questions';
import { AnalysisResultSchema } from '../src/analysis-schemas';
import {
  DocumentAuthorityScopeSchema,
  DocumentConflictSchema,
  DocumentDecisionSubjectSchema,
  DocumentCoverageStatusSchema,
  DocumentDecisionSchema,
  DocumentEvidenceQuestionMetadataSchema,
  DocumentEvidenceCardSchema,
  DocumentEvidenceCardsSchema,
  DocumentEvidenceModeSchema,
  DocumentEvidenceRunSummarySchema,
  DocumentEvidenceSourceManifestSchema,
  DocumentEvidenceSnapshotSchema,
  EvidenceClaimSchema,
  EvidenceSourceRefSchema,
  type DocumentEvidenceCard,
} from '../src/document-evidence';

const ids = {
  documentA: '10000000-0000-4000-8000-000000000001',
  documentB: '10000000-0000-4000-8000-000000000002',
  documentC: '10000000-0000-4000-8000-000000000003',
  claimA: '20000000-0000-4000-8000-000000000001',
  claimB: '20000000-0000-4000-8000-000000000002',
  conflict: '30000000-0000-4000-8000-000000000001',
  decision: '40000000-0000-4000-8000-000000000001',
  priorDecision: '40000000-0000-4000-8000-000000000002',
  run: '50000000-0000-4000-8000-000000000001',
  course: '60000000-0000-4000-8000-000000000001',
  organization: '70000000-0000-4000-8000-000000000001',
};

const sourceRef = {
  document_id: ids.documentA,
  chunk_id: 'chunk-7',
  page_number: 12,
  heading_path: 'Policy / Exceptions',
  version_hash: 'sha256:source-v1',
};

const sourceManifest = [
  {
    document_id: ids.documentA,
    source_version_hash: 'sha256:source-a',
    document_name: 'Policy A.pdf',
  },
  {
    document_id: ids.documentB,
    source_version_hash: 'sha256:source-b',
    document_name: 'Policy B.pdf',
  },
  {
    document_id: ids.documentC,
    source_version_hash: 'sha256:source-c',
    document_name: 'Policy C.pdf',
  },
] as const;

const card = {
  document_id: ids.documentA,
  document_name: 'Internal policy.pdf',
  priority: 'CORE',
  authority_scope: 'organization_specific',
  content_quality: 0.28,
  course_relevance: 0.94,
  processing_mode: 'hierarchical_summary',
  summary: 'The internal policy defines organization-specific approval rules.',
  key_claims: [
    {
      claim_id: ids.claimA,
      statement: 'Managers must approve exceptions before enrollment.',
      confidence: 0.91,
      source_refs: [sourceRef],
    },
  ],
  terminology: ['approval owner'],
  constraints: ['Approval is required before enrollment.'],
  limitations: ['Applies only to the named organization.'],
  coverage_status: 'assessed',
  coverage_reason: 'Validated from a hierarchical summary and source passage.',
  token_counts: { original: 18_000, summary: 1_200, allocated: 1_600 },
} as const;

describe('document evidence canonical contracts', () => {
  it('exports the canonical enum schemas', () => {
    expect(DocumentAuthorityScopeSchema.options).toEqual([
      'organization_specific',
      'course_source',
      'general_reference',
      'unknown',
    ]);
    expect(DocumentEvidenceModeSchema.options).toEqual([
      'full_text',
      'hierarchical_summary',
      'summary',
      'targeted_retrieval',
      'metadata_only',
    ]);
    expect(DocumentCoverageStatusSchema.options).toEqual(['assessed', 'degraded', 'failed']);
  });

  it('validates source refs, claims, and a complete evidence card', () => {
    expect(EvidenceSourceRefSchema.parse(sourceRef)).toEqual(sourceRef);
    expect(EvidenceClaimSchema.parse(card.key_claims[0])).toEqual(card.key_claims[0]);
    expect(DocumentEvidenceCardSchema.parse(card)).toEqual(card);
    expectTypeOf(DocumentEvidenceCardSchema.parse(card)).toEqualTypeOf<DocumentEvidenceCard>();
  });

  it('keeps authority independent from content quality', () => {
    const lowQualityAuthority = DocumentEvidenceCardSchema.parse(card);

    expect(lowQualityAuthority.authority_scope).toBe('organization_specific');
    expect(lowQualityAuthority.content_quality).toBe(0.28);
  });

  it('allows degraded and failed cards to preserve honest missing summaries', () => {
    const { summary: _summary, ...withoutSummary } = card;

    expect(
      DocumentEvidenceCardSchema.parse({
        ...withoutSummary,
        coverage_status: 'degraded',
        coverage_reason: 'The source could not be summarized within the retry bound.',
      })
    ).not.toHaveProperty('summary');
    expect(
      DocumentEvidenceCardSchema.parse({
        ...withoutSummary,
        summary: null,
        coverage_status: 'failed',
        coverage_reason: 'Extraction failed before a trustworthy summary was produced.',
      })
    ).toHaveProperty('summary', null);
    expect(() =>
      DocumentEvidenceCardSchema.parse({
        ...withoutSummary,
        coverage_status: 'assessed',
        coverage_reason: 'Assessment completed.',
      })
    ).toThrow(/summary.*assessed/i);
  });

  it('rejects duplicate document IDs in the coverage ledger', () => {
    const duplicate = { ...card, document_name: 'Duplicate logical source.pdf' };

    expect(() => DocumentEvidenceCardsSchema.parse([card, duplicate])).toThrow(
      /duplicate document_id/i
    );
  });

  it('pins a sorted unique source manifest snapshot with version identity', () => {
    expect(DocumentEvidenceSourceManifestSchema.parse(sourceManifest)).toEqual(sourceManifest);
    expect(() =>
      DocumentEvidenceSourceManifestSchema.parse([
        sourceManifest[0],
        { ...sourceManifest[0], source_version_hash: 'sha256:different' },
      ])
    ).toThrow(/source_manifest.*unique/i);
    expect(() =>
      DocumentEvidenceSourceManifestSchema.parse([sourceManifest[1], sourceManifest[0]])
    ).toThrow(/source_manifest.*sorted/i);
  });

  it('pins the stable conflict shape and source provenance', () => {
    const conflict = {
      conflict_id: ids.conflict,
      conflict_fingerprint: 'sha256:policy-approval-v1',
      topic: 'Exception approval',
      severity: 'important',
      sides: [
        {
          statement: 'Manager approval is mandatory.',
          claim_ids: [ids.claimA],
          document_ids: [ids.documentA],
          source_refs: [sourceRef],
        },
        {
          statement: 'Employees may self-approve exceptions.',
          claim_ids: [ids.claimB],
          document_ids: [ids.documentB],
          source_refs: [{ ...sourceRef, document_id: ids.documentB, page_number: 4 }],
        },
      ],
      course_impact: 'The course must teach one consistent approval workflow.',
      recommended_resolution: 'Follow the organization-specific policy.',
      recommendation_rationale: 'It has explicit authority for this organization.',
      alternatives: ['Teach both workflows and label their scopes.'],
    };

    expect(DocumentConflictSchema.parse(conflict)).toEqual(conflict);
  });

  it('validates append-only decision references and rejects self-superseding events', () => {
    const decision = {
      decision_id: ids.decision,
      run_id: ids.run,
      conflict_id: ids.conflict,
      subject: { kind: 'claim_conflict', conflict_id: ids.conflict },
      selected_resolution: 'Follow the organization-specific policy.',
      resolved_by: 'user',
      answer_source: 'modified',
      rationale: 'The owner confirmed this is the current policy.',
      selected_recommendation_index: 0,
      selected_recommendation_value: 'Follow the organization-specific policy.',
      supersedes_decision_id: ids.priorDecision,
      decided_at: '2026-07-11T10:30:00.000Z',
    };

    expect(DocumentDecisionSchema.parse(decision)).toEqual(decision);
    expect(() =>
      DocumentDecisionSchema.parse({ ...decision, supersedes_decision_id: ids.decision })
    ).toThrow(/cannot supersede itself/i);
    expect(() =>
      DocumentDecisionSchema.parse({
        ...decision,
        resolved_by: 'system',
        answer_source: 'modified',
      })
    ).toThrow(/resolved_by=system.*answer_source=system/i);
    expect(() =>
      DocumentDecisionSchema.parse({
        ...decision,
        resolved_by: 'system',
        answer_source: 'system',
        supersedes_decision_id: ids.priorDecision,
      })
    ).toThrow(/superseding.*resolved_by=user/i);
    expect(() =>
      DocumentDecisionSchema.parse({
        ...decision,
        resolved_by: 'user',
        answer_source: 'system',
      })
    ).toThrow(/resolved_by=system.*answer_source=system/i);
  });

  it('models claim, degraded, and detector-capacity decisions without fake provenance', () => {
    expect(
      DocumentDecisionSubjectSchema.parse({ kind: 'claim_conflict', conflict_id: ids.conflict })
    ).toEqual({ kind: 'claim_conflict', conflict_id: ids.conflict });
    expect(
      DocumentDecisionSubjectSchema.parse({
        kind: 'degraded_evidence',
        document_id: ids.documentA,
        coverage_status: 'degraded',
        coverage_reason: 'verification_unavailable',
        attempt: 1,
        max_attempts: 2,
      })
    ).not.toHaveProperty('claim_ids');
    expect(
      DocumentDecisionSubjectSchema.parse({
        kind: 'detector_capacity',
        reason: 'detector_capacity_degraded',
        call_plan_hash: 'sha256:plan',
        config_hash: 'sha256:config',
      })
    ).not.toHaveProperty('document_id');
    expect(() =>
      DocumentDecisionSchema.parse({
        ...{
          decision_id: ids.decision,
          run_id: ids.run,
          selected_resolution: 'continue_limited',
          resolved_by: 'system',
          answer_source: 'system',
          rationale: 'Capacity policy permits bounded continuation.',
          decided_at: '2026-07-11T10:30:00.000Z',
        },
        subject: {
          kind: 'degraded_evidence',
          document_id: ids.documentA,
          coverage_status: 'degraded',
          coverage_reason: 'verification_unavailable',
          attempt: 1,
          max_attempts: 2,
        },
        conflict_id: ids.conflict,
      })
    ).toThrow(/degraded.*conflict_id/i);
  });

  it('validates bounded shared RU/EN question metadata including same-document conflicts', () => {
    const metadata = {
      schema_version: 'document-conflict-question-v1',
      subject_kind: 'claim_conflict',
      subject_key: 'sha256:subject',
      run_id: ids.run,
      conflict_id: ids.conflict,
      document_ids: [ids.documentA],
      documents: [{ document_id: ids.documentA, document_name: 'Policy.pdf' }],
      document_overflow_count: 0,
      sides: [
        { excerpt: 'Keep 30 days.', source_refs: [sourceRef], source_ref_overflow_count: 0 },
        { excerpt: 'Keep 365 days.', source_refs: [sourceRef], source_ref_overflow_count: 0 },
      ],
      provenance_handle: 'sha256:provenance',
      course_impact: 'One policy is required.',
      recommendation: 'Keep 30 days.',
      recommendation_rationale: 'Organization authority.',
      alternatives: ['Keep 365 days.'],
    } as const;
    expect(DocumentEvidenceQuestionMetadataSchema.parse(metadata)).toEqual(metadata);
    expect(
      DocumentEvidenceQuestionMetadataSchema.parse({
        schema_version: 'document-conflict-question-v1',
        subject_kind: 'detector_capacity',
        subject_key: 'sha256:capacity',
        run_id: ids.run,
        reason: 'detector_capacity_degraded',
        call_plan_hash: 'sha256:plan',
        config_hash: 'sha256:config',
      })
    ).not.toHaveProperty('document_id');
  });

  it('requires exact terminal coverage counts in accepted run summaries', () => {
    const summary = {
      run_id: ids.run,
      course_id: ids.course,
      organization_id: ids.organization,
      input_fingerprint: 'sha256:run-input-v1',
      evidence_version: '1.0.0',
      status: 'accepted',
      source_manifest: sourceManifest,
      source_count: 3,
      assessed_count: 1,
      degraded_count: 1,
      failed_count: 1,
      batch_count: 2,
      model_calls: 4,
      input_tokens: 12_000,
      output_tokens: 2_000,
      total_cost_usd: 0.42,
      conflict_summary: { critical: 0, important: 1, informational: 1 },
      decision_summary: { user: 1, system: 0, unresolved: 1 },
      started_at: '2026-07-11T10:00:00.000Z',
      completed_at: '2026-07-11T10:20:00.000Z',
    };

    expect(DocumentEvidenceRunSummarySchema.parse(summary)).toEqual(summary);
    expect(() => DocumentEvidenceRunSummarySchema.parse({ ...summary, failed_count: 0 })).toThrow(
      /coverage counts must equal source_count/i
    );
    expect(() =>
      DocumentEvidenceRunSummarySchema.parse({
        ...summary,
        source_manifest: [sourceManifest[0], sourceManifest[0], sourceManifest[2]],
      })
    ).toThrow(/source_manifest.*unique/i);
    expect(() =>
      DocumentEvidenceRunSummarySchema.parse({
        ...summary,
        source_manifest: [sourceManifest[1], sourceManifest[0], sourceManifest[2]],
      })
    ).toThrow(/source_manifest.*sorted/i);
  });
});

describe('clarifying and analysis compatibility', () => {
  it('adds document_conflicts and system to the canonical unions', () => {
    expect(ClarifyingQuestionCategorySchema.parse('document_conflicts')).toBe('document_conflicts');
    expect(AnswerSourceSchema.parse('system')).toBe('system');
    expectTypeOf<'document_conflicts'>().toMatchTypeOf<ClarifyingQuestionCategory>();
    expectTypeOf<'system'>().toMatchTypeOf<AnswerSource>();
  });

  it('keeps document evidence in AnalysisResult compact and optional', () => {
    const snapshot = {
      accepted_run_id: ids.run,
      coverage: {
        source_count: 2,
        assessed_count: 1,
        degraded_count: 1,
        failed_count: 0,
      },
      current_decision_ids: [ids.decision],
      unresolved_informational_conflict_ids: [ids.conflict],
      enrichment_status: 'not_applicable',
    } as const;

    expect(DocumentEvidenceSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(AnalysisResultSchema.shape.document_evidence?.parse(snapshot)).toEqual(snapshot);
    expect(AnalysisResultSchema.shape.document_evidence?.isOptional()).toBe(true);
    expect(() =>
      DocumentEvidenceSnapshotSchema.parse({ ...snapshot, evidence_cards: [card] })
    ).toThrow();
  });
});
