import { describe, expect, it, vi } from 'vitest';
import type { DocumentConflict, DocumentEvidenceCard } from '@megacampus/shared-types';
import {
  buildDocumentEvidenceQuestion,
  resolveDocumentEvidenceDecisions,
  type DocumentDecisionRepository,
} from '@/stages/stage4-analysis/evidence/decision-service';

const id = {
  run: '10000000-0000-4000-8000-000000000001',
  course: '20000000-0000-4000-8000-000000000001',
  org: '30000000-0000-4000-8000-000000000001',
  docA: '40000000-0000-4000-8000-000000000001',
  docB: '40000000-0000-4000-8000-000000000002',
  claimA: '50000000-0000-4000-8000-000000000001',
  claimB: '50000000-0000-4000-8000-000000000002',
  conflict: '60000000-0000-8000-8000-000000000001',
  info: '60000000-0000-8000-8000-000000000002',
  decision: '70000000-0000-4000-8000-000000000001',
};

function conflict(severity: DocumentConflict['severity'] = 'important', sameDocument = false): DocumentConflict {
  return {
    conflict_id: severity === 'informational' ? id.info : id.conflict,
    conflict_fingerprint: `sha256:${severity}`,
    topic: '<script>Retention</script>',
    severity,
    sides: [
      {
        statement: '<img src=x onerror=alert(1)> Keep 30 days. '.repeat(30),
        claim_ids: [id.claimA],
        document_ids: [id.docA],
        source_refs: [{ document_id: id.docA, page_number: 1, heading_path: 'Policy' }],
      },
      {
        statement: 'Keep 365 days.',
        claim_ids: [id.claimB],
        document_ids: [sameDocument ? id.docA : id.docB],
        source_refs: [
          { document_id: sameDocument ? id.docA : id.docB, chunk_id: 'chunk-b' },
        ],
      },
    ],
    course_impact: 'The course must teach one enforceable period.',
    recommended_resolution: 'Follow the organization-specific 30-day policy.',
    recommendation_rationale: 'Organization authority has precedence.',
    alternatives: ['Ask the owner.', 'Follow the 365-day reference.'],
  };
}

function card(status: 'assessed' | 'degraded' = 'assessed'): DocumentEvidenceCard {
  return {
    document_id: id.docA,
    document_name: 'policy.pdf',
    priority: 'IMPORTANT',
    authority_scope: 'course_source',
    content_quality: 0.5,
    course_relevance: 0.8,
    processing_mode: status === 'degraded' ? 'metadata_only' : 'summary',
    ...(status === 'assessed' ? { summary: 'summary' } : {}),
    key_claims: [],
    terminology: [],
    constraints: [],
    limitations: status === 'degraded' ? ['retrieval unavailable'] : [],
    coverage_status: status,
    coverage_reason: status === 'degraded' ? 'targeted_verification_unavailable' : 'complete',
    token_counts: { original: 100, summary: 0, allocated: 0 },
  };
}

function repository(): DocumentDecisionRepository {
  return {
    getAcceptedRun: vi.fn(async () => ({ id: id.run, status: 'accepted' as const })),
    listConflicts: vi.fn(async () => [conflict(), conflict('informational')]),
    listItems: vi.fn(async () => [card()]),
    listDetectorCapacityIssues: vi.fn(async () => []),
    listCurrentDecisions: vi.fn(async () => []),
    getDegradedRetryState: vi.fn(async () => ({ attempt: 2, maxAttempts: 2 })),
    materializeDecisionGateAtomic: vi.fn(async input => ({
      question_ids: input.questions.map(question => question.questionId),
      decision_ids:
        input.mode === 'automatic' && input.questions.length > 0 ? [id.decision] : [],
      reused: false,
    })),
  };
}

const input = {
  runId: id.run,
  courseId: id.course,
  organizationId: id.org,
  language: 'en' as const,
  mode: 'manual' as const,
  maxUiExcerptChars: 240,
  maxSourceRefsPerSide: 8,
  maxDocumentsInMetadata: 8,
  maxEvidenceRetryAttempts: 2,
  automaticCapacityPolicy: 'continue_limited' as const,
};

describe('document evidence decision service', () => {
  it('builds strict bounded same-document conflict metadata with one hashed subject', () => {
    const question = buildDocumentEvidenceQuestion({
      runId: id.run,
      language: 'en',
      subject: { kind: 'claim_conflict', conflict: conflict('important', true) },
      documentNames: new Map([[id.docA, 'Policy.pdf']]),
      maxUiExcerptChars: 240,
      maxSourceRefsPerSide: 8,
      maxDocumentsInMetadata: 8,
    });
    expect(question.metadata).toEqual(
      expect.objectContaining({
        subject_kind: 'claim_conflict',
        subject_key: expect.stringMatching(/^sha256:/),
        document_ids: [id.docA],
        documents: [{ document_id: id.docA, document_name: 'Policy.pdf' }],
        provenance_handle: expect.stringMatching(/^sha256:/),
      })
    );
    expect(JSON.stringify(question.metadata)).not.toMatch(/<script|<img|onerror/iu);
    expect(question.metadata.sides[0].excerpt.length).toBeLessThanOrEqual(240);
    expect(question.suggestedAnswers.filter(answer => answer.is_recommended)).toHaveLength(1);
  });

  it('caps huge provenance with overflow counts instead of throwing or storing raw bodies', () => {
    const huge = conflict();
    huge.sides[0].source_refs = Array.from({ length: 100 }, (_, index) => ({
      document_id: id.docA,
      chunk_id: `chunk-${index}`,
    }));
    huge.sides[0].document_ids = Array.from(
      { length: 20 },
      (_, index) => `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
    );
    const names = new Map(huge.sides[0].document_ids.map(documentId => [documentId, 'Source.pdf']));
    names.set(id.docB, 'B.pdf');
    const question = buildDocumentEvidenceQuestion({
      runId: id.run,
      language: 'en',
      subject: { kind: 'claim_conflict', conflict: huge },
      documentNames: names,
      maxUiExcerptChars: 240,
      maxSourceRefsPerSide: 4,
      maxDocumentsInMetadata: 5,
    });
    expect(question.metadata.subject_kind).toBe('claim_conflict');
    if (question.metadata.subject_kind !== 'claim_conflict') throw new Error('wrong metadata');
    expect(question.metadata.documents).toHaveLength(5);
    expect(question.metadata.document_overflow_count).toBeGreaterThan(0);
    expect(question.metadata.sides[0].source_refs).toHaveLength(4);
    expect(question.metadata.sides[0].source_ref_overflow_count).toBe(96);
  });

  it('materializes all manual questions in one atomic gate and leaves informationals nonblocking', async () => {
    const db = repository();
    const result = await resolveDocumentEvidenceDecisions(input, { repository: db });
    expect(db.materializeDecisionGateAtomic).toHaveBeenCalledTimes(1);
    expect(db.materializeDecisionGateAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'manual', questions: [expect.any(Object)] })
    );
    expect(result.pauseRequired).toBe(true);
    expect(result.unresolvedInformationalConflictIds).toEqual([id.info]);
  });

  it('still materializes an empty atomic gate for an informational-only snapshot', async () => {
    const db = repository();
    const informational = conflict('informational');
    vi.mocked(db.listConflicts).mockResolvedValueOnce([informational]);
    vi.mocked(db.listItems).mockResolvedValueOnce([card('assessed')]);
    vi.mocked(db.materializeDecisionGateAtomic).mockResolvedValueOnce({
      question_ids: [],
      decision_ids: [],
      reused: false,
    });
    const result = await resolveDocumentEvidenceDecisions(input, { repository: db });
    expect(db.materializeDecisionGateAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'manual', questions: [] })
    );
    expect(result.pauseRequired).toBe(false);
    expect(result.unresolvedInformationalConflictIds).toEqual([informational.conflict_id]);
  });

  it('automatic mode sends the sole explicit recommendation and receives atomic decision IDs', async () => {
    const db = repository();
    const result = await resolveDocumentEvidenceDecisions(
      { ...input, mode: 'automatic' },
      { repository: db }
    );
    const gate = vi.mocked(db.materializeDecisionGateAtomic).mock.calls[0][0];
    expect(gate.questions[0].suggestedAnswers.findIndex(value => value.is_recommended)).toBe(2);
    expect(gate.questions[0].suggestedAnswers[2].text).toContain('30-day');
    expect(result.currentDecisionIds).toEqual([id.decision]);
    expect(result.pauseRequired).toBe(false);
  });

  it('creates a real retry-capable degraded subject with stable machine values', async () => {
    const db = repository();
    vi.mocked(db.listConflicts).mockResolvedValueOnce([]);
    vi.mocked(db.listItems).mockResolvedValueOnce([card('degraded')]);
    vi.mocked(db.getDegradedRetryState).mockResolvedValueOnce({ attempt: 1, maxAttempts: 2 });
    await resolveDocumentEvidenceDecisions(input, { repository: db });
    const question = vi.mocked(db.materializeDecisionGateAtomic).mock.calls[0][0].questions[0];
    expect(question.metadata).toEqual(
      expect.objectContaining({ subject_kind: 'degraded_evidence', attempt: 1, max_attempts: 2 })
    );
    expect(question.suggestedAnswers.map(answer => answer.value)).toEqual([
      'retry',
      'continue_limited',
      'remove_document',
    ]);
  });

  it('automatic degraded evidence uses continue_limited only after retries are exhausted', async () => {
    const db = repository();
    vi.mocked(db.listConflicts).mockResolvedValueOnce([]);
    vi.mocked(db.listItems).mockResolvedValueOnce([card('degraded')]);
    await resolveDocumentEvidenceDecisions({ ...input, mode: 'automatic' }, { repository: db });
    const question = vi.mocked(db.materializeDecisionGateAtomic).mock.calls[0][0].questions[0];
    expect(question.suggestedAnswers.find(answer => answer.is_recommended)?.value).toBe(
      'continue_limited'
    );

    vi.mocked(db.listConflicts).mockResolvedValueOnce([]);
    vi.mocked(db.listItems).mockResolvedValueOnce([card('degraded')]);
    vi.mocked(db.getDegradedRetryState).mockResolvedValueOnce({ attempt: 1, maxAttempts: 2 });
    await expect(
      resolveDocumentEvidenceDecisions({ ...input, mode: 'automatic' }, { repository: db })
    ).rejects.toThrow(/retry.*not exhausted/i);
  });

  it('materializes a distinct required detector-capacity subject without fake document provenance', async () => {
    const db = repository();
    vi.mocked(db.listConflicts).mockResolvedValueOnce([]);
    vi.mocked(db.listDetectorCapacityIssues).mockResolvedValueOnce([
      {
        kind: 'detector_capacity',
        reason: 'detector_capacity_degraded',
        call_plan_hash: 'sha256:plan',
        config_hash: 'sha256:config',
        claim_count: 1000,
        cluster_count: 1000,
      },
    ]);
    await resolveDocumentEvidenceDecisions(input, { repository: db });
    const question = vi.mocked(db.materializeDecisionGateAtomic).mock.calls[0][0].questions[0];
    expect(question.metadata).toEqual(
      expect.objectContaining({ subject_kind: 'detector_capacity', reason: 'detector_capacity_degraded' })
    );
    expect(question.suggestedAnswers.map(answer => answer.value)).toEqual([
      'abort_adjust_sources',
      'continue_limited',
    ]);
    expect(JSON.stringify(question.suggestedAnswers)).not.toMatch(/retry|safer/iu);
    expect(JSON.stringify(question.metadata)).not.toContain('document_id');
  });

  it('reuses validated current decisions and returns a sorted byte-stable snapshot', async () => {
    const db = repository();
    vi.mocked(db.listCurrentDecisions).mockResolvedValueOnce([
      { id: '70000000-0000-4000-8000-000000000002', subject_key: 'sha256:info' },
      { id: id.decision, subject_key: 'sha256:conflict' },
    ]);
    vi.mocked(db.listConflicts).mockResolvedValueOnce([]);
    const result = await resolveDocumentEvidenceDecisions(input, { repository: db });
    expect(result.currentDecisionIds).toEqual([
      id.decision,
      '70000000-0000-4000-8000-000000000002',
    ]);
  });

  it('localizes degraded labels while keeping machine values stable in RU and EN', () => {
    const subject = {
      kind: 'degraded_evidence' as const,
      card: card('degraded'),
      attempt: 1,
      maxAttempts: 2,
    };
    const english = buildDocumentEvidenceQuestion({
      runId: id.run,
      language: 'en',
      subject,
      documentNames: new Map([[id.docA, 'Policy.pdf']]),
      maxUiExcerptChars: 240,
      maxSourceRefsPerSide: 8,
      maxDocumentsInMetadata: 8,
    });
    const russian = buildDocumentEvidenceQuestion({
      runId: id.run,
      language: 'ru',
      subject,
      documentNames: new Map([[id.docA, 'Policy.pdf']]),
      maxUiExcerptChars: 240,
      maxSourceRefsPerSide: 8,
      maxDocumentsInMetadata: 8,
    });
    expect(russian.suggestedAnswers.map(answer => answer.value)).toEqual(
      english.suggestedAnswers.map(answer => answer.value)
    );
    expect(russian.suggestedAnswers.map(answer => answer.text)).not.toEqual(
      english.suggestedAnswers.map(answer => answer.text)
    );
    expect(JSON.stringify([english.suggestedAnswers, russian.suggestedAnswers])).not.toMatch(
      /safer|безопасн/iu
    );
  });
});
