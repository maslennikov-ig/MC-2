import { describe, expect, it, vi } from 'vitest';
import type {
  CourseStructure,
  DocumentConflict,
  DocumentEvidenceCard,
  DocumentEvidenceSnapshot,
} from '@megacampus/shared-types';
import {
  enrichBaselineWithDocumentEvidence,
  type Stage5EvidenceContextRepository,
} from '@/stages/stage5-generation/evidence/advisory-enrichment';
import type { SearchResponse } from '@/shared/qdrant/search-types';

const id = {
  run: '10000000-0000-4000-8000-000000000001',
  course: '20000000-0000-4000-8000-000000000001',
  org: '30000000-0000-4000-8000-000000000001',
  docA: '40000000-0000-4000-8000-000000000001',
  docB: '40000000-0000-4000-8000-000000000002',
  claimA: '50000000-0000-4000-8000-000000000001',
  claimB: '50000000-0000-4000-8000-000000000002',
  conflict: '60000000-0000-8000-8000-000000000001',
  decision: '70000000-0000-4000-8000-000000000001',
};

function baseline(language: 'ru' | 'en' = 'en'): CourseStructure {
  return {
    course_title: language === 'ru' ? 'Политики хранения данных' : 'Data Retention Policies',
    course_description:
      language === 'ru'
        ? 'Практический курс по безопасному хранению корпоративных данных.'
        : 'A practical course about safe enterprise data retention policies.',
    estimated_duration_hours: 1,
    difficulty_level: 'intermediate',
    prerequisites: [],
    learning_outcomes: [
      {
        id: '80000000-0000-4000-8000-000000000001',
        text: 'Explain safe retention policy design',
        language,
      },
      {
        id: '80000000-0000-4000-8000-000000000002',
        text: 'Apply retention rules to realistic cases',
        language,
      },
      {
        id: '80000000-0000-4000-8000-000000000003',
        text: 'Evaluate retention controls and tradeoffs',
        language,
      },
    ],
    course_tags: ['retention', 'security', 'policy', 'governance', 'compliance'],
    sections: [
      {
        section_number: 1,
        section_title:
          language === 'ru' ? 'Основы политики хранения' : 'Retention Policy Foundations',
        section_description:
          language === 'ru'
            ? 'Базовые требования и структура политики хранения данных.'
            : 'Baseline requirements and structure of a data retention policy.',
        learning_objectives: [
          language === 'ru'
            ? 'Объяснить базовые правила хранения'
            : 'Explain baseline retention rules',
        ],
        lessons: [
          {
            lesson_number: 1,
            lesson_title: language === 'ru' ? 'Модель срока хранения' : 'Retention Period Model',
            lesson_objectives: [
              language === 'ru'
                ? 'Определить безопасный срок хранения'
                : 'Define a safe retention period',
            ],
            key_topics: [
              language === 'ru' ? 'Базовый срок хранения' : 'Baseline retention period',
              language === 'ru' ? 'Обязательные требования' : 'Required policy controls',
            ],
            estimated_duration_minutes: 30,
          },
        ],
      },
    ],
  };
}

function snapshot(decisionIds: string[] = [id.decision]): DocumentEvidenceSnapshot {
  return {
    accepted_run_id: id.run,
    coverage: { source_count: 2, assessed_count: 2, degraded_count: 0, failed_count: 0 },
    current_decision_ids: decisionIds,
    unresolved_informational_conflict_ids: [],
    enrichment_status: 'not_applicable',
  };
}

function card(documentId: string, claimId: string, statement: string): DocumentEvidenceCard {
  return {
    document_id: documentId,
    document_name: `${documentId}.pdf`,
    priority: 'CORE',
    authority_scope: documentId === id.docA ? 'organization_specific' : 'general_reference',
    content_quality: 0.9,
    course_relevance: 0.95,
    processing_mode: 'summary',
    summary: 'Validated source summary.',
    key_claims: [
      {
        claim_id: claimId,
        statement,
        confidence: 0.95,
        source_refs: [
          {
            document_id: documentId,
            chunk_id: `chunk-${claimId.slice(-1)}`,
            version_hash: `hash-${documentId}`,
          },
        ],
      },
    ],
    terminology: documentId === id.docA ? ['legal hold'] : ['obsolete retention'],
    constraints: [statement],
    limitations: [],
    coverage_status: 'assessed',
    coverage_reason: 'complete',
    token_counts: { original: 100, summary: 20, allocated: 20 },
  };
}

function conflict(): DocumentConflict {
  return {
    conflict_id: id.conflict,
    conflict_fingerprint: 'sha256:conflict',
    topic: 'Retention period',
    severity: 'important',
    sides: [
      {
        statement: 'Keep records for 30 days.',
        claim_ids: [id.claimA],
        document_ids: [id.docA],
        source_refs: [{ document_id: id.docA, chunk_id: 'chunk-1' }],
      },
      {
        statement: 'Keep records for 365 days.',
        claim_ids: [id.claimB],
        document_ids: [id.docB],
        source_refs: [{ document_id: id.docB, chunk_id: 'chunk-2' }],
      },
    ],
    course_impact: 'The course must teach one enforceable period.',
    recommended_resolution: 'Keep records for 30 days.',
    recommendation_rationale: 'Organization policy has precedence.',
    alternatives: ['Keep records for 365 days.'],
  };
}

function repository(
  overrides: Partial<Stage5EvidenceContextRepository> = {}
): Stage5EvidenceContextRepository {
  return {
    getAcceptedRun: vi.fn(async () => ({ id: id.run, status: 'accepted' as const })),
    listItems: vi.fn(async () => [
      card(id.docA, id.claimA, 'Keep records for 30 days.'),
      card(id.docB, id.claimB, 'Keep records for 365 days.'),
    ]),
    listConflicts: vi.fn(async () => [conflict()]),
    getLatestDecisions: vi.fn(async () => [
      {
        id: id.decision,
        run_id: id.run,
        course_id: id.course,
        organization_id: id.org,
        conflict_id: id.conflict,
        subject_kind: 'claim_conflict',
        subject_key: 'sha256:subject',
        selected_resolution: `recommendation:${id.conflict}`,
        selected_recommendation_value: `recommendation:${id.conflict}`,
        supersedes_decision_id: null,
        decided_at: '2026-07-11T12:00:00.000Z',
      },
    ]),
    ...overrides,
  };
}

function searchResult(documentId = id.docA, payload: Record<string, unknown> = {}): SearchResponse {
  return {
    results: [
      {
        chunk_id: 'chunk-1',
        parent_chunk_id: null,
        level: 'child',
        content: 'Sensitive source body that must never be logged.',
        heading_path: 'Policy > Retention',
        chapter: null,
        section: null,
        document_id: documentId,
        document_name: 'policy.pdf',
        page_number: 2,
        page_range: null,
        token_count: 9,
        score: 0.95,
        metadata: { has_code: false, has_formulas: false, has_tables: false, has_images: false },
        payload: {
          organization_id: id.org,
          course_id: id.course,
          version_hash: `hash-${documentId}`,
          ...payload,
        },
      },
    ],
    metadata: {
      total_results: 1,
      search_type: 'hybrid',
      embedding_time_ms: 1,
      search_time_ms: 1,
      filters_applied: { organization_id: id.org, course_id: id.course },
      fallback_used: false,
    },
  };
}

function run(overrides: Record<string, unknown> = {}) {
  const search = vi.fn(async () => searchResult());
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    search,
    log,
    promise: enrichBaselineWithDocumentEvidence(
      {
        courseId: id.course,
        organizationId: id.org,
        language: 'en',
        baseline: baseline(),
        snapshot: snapshot(),
      },
      { repository: repository(), search, log, ...overrides }
    ),
  };
}

describe('Stage 5 advisory evidence enrichment', () => {
  it.each(['en', 'ru'] as const)(
    'keeps the no-document %s baseline byte-equivalent',
    async language => {
      const original = baseline(language);
      const search = vi.fn();
      const result = await enrichBaselineWithDocumentEvidence(
        { courseId: id.course, organizationId: id.org, language, baseline: original },
        { repository: repository(), search }
      );

      expect(JSON.stringify(result.courseStructure)).toBe(JSON.stringify(original));
      expect(result.enrichment.status).toBe('not_applicable');
      expect(search).not.toHaveBeenCalled();
    }
  );

  it('keeps no-relevant-evidence baseline byte-equivalent', async () => {
    const original = baseline();
    const search = vi.fn(async () => ({ ...searchResult(), results: [] }));
    const result = await enrichBaselineWithDocumentEvidence(
      {
        courseId: id.course,
        organizationId: id.org,
        language: 'en',
        baseline: original,
        snapshot: snapshot(),
      },
      { repository: repository(), search }
    );

    expect(JSON.stringify(result.courseStructure)).toBe(JSON.stringify(original));
    expect(result.enrichment.status).toBe('no_relevant_evidence');
  });

  it('uses a grouped tenant/course-filtered live Qdrant query with bounded limits', async () => {
    const { search, promise } = run();
    await promise;

    expect(search).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        limit: 8,
        enable_hybrid: true,
        include_payload: true,
        group_by_document: true,
        group_size: 2,
        filters: {
          organization_id: id.org,
          course_id: id.course,
          document_ids: [id.docA],
        },
      })
    );
  });

  it('bounds a 1,000-document corpus to a deterministic priority-ranked query set', async () => {
    const cards = Array.from({ length: 1_000 }, (_, index) => {
      const documentId = `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      const claimId = `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      return {
        ...card(documentId, claimId, `Retention guidance ${index + 1}.`),
        priority: index % 10 === 0 ? ('CORE' as const) : ('SUPPLEMENTARY' as const),
        course_relevance: (1_000 - index) / 1_000,
      };
    });
    const repo = repository({
      listItems: vi.fn(async () => cards),
      listConflicts: vi.fn(async () => []),
      getLatestDecisions: vi.fn(async () => []),
    });
    const search = vi.fn(async () => ({ ...searchResult(), results: [] }));
    const largeSnapshot: DocumentEvidenceSnapshot = {
      accepted_run_id: id.run,
      coverage: {
        source_count: 1_000,
        assessed_count: 1_000,
        degraded_count: 0,
        failed_count: 0,
      },
      current_decision_ids: [],
      unresolved_informational_conflict_ids: [],
      enrichment_status: 'not_applicable',
    };
    const execute = () =>
      enrichBaselineWithDocumentEvidence(
        {
          courseId: id.course,
          organizationId: id.org,
          language: 'en',
          baseline: baseline(),
          snapshot: largeSnapshot,
        },
        { repository: repo, search }
      );

    await execute();
    await execute();
    const firstIds = vi.mocked(search).mock.calls[0][1].filters?.document_ids;
    const secondIds = vi.mocked(search).mock.calls[1][1].filters?.document_ids;
    expect(firstIds).toHaveLength(64);
    expect(firstIds).toEqual(secondIds);
    expect(firstIds?.slice(0, 3)).toEqual([
      '40000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000011',
      '40000000-0000-4000-8000-000000000021',
    ]);
  });

  it('adds only bounded advisory topics and preserves every baseline field/order', async () => {
    const original = baseline();
    const { promise } = run();
    const result = await promise;

    expect(result.enrichment.status).toBe('applied');
    expect(result.courseStructure.sections[0].section_title).toBe(
      original.sections[0].section_title
    );
    expect(result.courseStructure.sections[0].lessons[0].lesson_title).toBe(
      original.sections[0].lessons[0].lesson_title
    );
    expect(result.courseStructure.sections[0].lessons[0].key_topics).toEqual([
      ...original.sections[0].lessons[0].key_topics,
      'legal hold',
      'Keep records for 30 days.',
    ]);
    expect(result.enrichment.accepted_decision_ids).toEqual([id.decision]);
    expect(result.enrichment.section_evidence[0].evidence_refs).toHaveLength(1);
  });

  it('excludes the rejected conflict side from retrieval and patch material', async () => {
    const patcher = vi.fn(
      async ({ baseline: value }: { baseline: CourseStructure; materials: unknown[] }) => value
    );
    const { promise } = run({ patcher });
    await promise;

    expect(patcher).toHaveBeenCalledWith(
      expect.objectContaining({
        materials: expect.not.arrayContaining([
          expect.objectContaining({ documentId: id.docB }),
          expect.objectContaining({
            additions: expect.arrayContaining(['Keep records for 365 days.']),
          }),
        ]),
      })
    );
  });

  it('honors a manually selected alternative using its canonical selected value', async () => {
    const manualAlternative = {
      id: id.decision,
      run_id: id.run,
      course_id: id.course,
      organization_id: id.org,
      conflict_id: id.conflict,
      subject_kind: 'claim_conflict' as const,
      subject_key: 'sha256:subject',
      selected_resolution: 'The owner chose the longer reference period.',
      selected_recommendation_value: `alternative:${id.conflict}:0`,
      supersedes_decision_id: null,
      decided_at: '2026-07-11T12:00:00.000Z',
    };
    const search = vi.fn(async () => searchResult(id.docB));
    await enrichBaselineWithDocumentEvidence(
      {
        courseId: id.course,
        organizationId: id.org,
        language: 'en',
        baseline: baseline(),
        snapshot: snapshot(),
      },
      {
        repository: repository({ getLatestDecisions: vi.fn(async () => [manualAlternative]) }),
        search,
      }
    );

    expect(search).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        filters: expect.objectContaining({ document_ids: [id.docB] }),
      })
    );
  });

  it('rejects a destructive patch, retries once with violations, and accepts a valid retry', async () => {
    const original = baseline();
    const patcher = vi
      .fn()
      .mockResolvedValueOnce({ ...original, sections: [] })
      .mockImplementationOnce(async ({ baseline: value }) => value);
    const { promise } = run({ patcher });
    const result = await promise;

    expect(patcher).toHaveBeenCalledTimes(2);
    expect(patcher).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        attempt: 2,
        violations: expect.arrayContaining(['sections_removed_or_reordered']),
      })
    );
    expect(JSON.stringify(result.courseStructure)).toBe(JSON.stringify(original));
    expect(result.enrichment.attempted_patches).toBe(2);
  });

  it('fails open honestly after two invalid patches without changing the baseline', async () => {
    const original = baseline();
    const patcher = vi.fn(async () => ({ ...original, sections: [] }));
    const { promise } = run({ patcher });
    const result = await promise;

    expect(JSON.stringify(result.courseStructure)).toBe(JSON.stringify(original));
    expect(result.enrichment.status).toBe('degraded');
    expect(patcher).toHaveBeenCalledTimes(2);
  });

  it('revalidates schema/size constraints and rejects a key-topic overflow', async () => {
    const original = baseline();
    const patcher = vi.fn(async () => {
      const changed = structuredClone(original);
      changed.sections[0].lessons[0].key_topics = Array.from(
        { length: 11 },
        (_, index) => `Topic ${index}`
      );
      return changed;
    });
    const { promise } = run({ patcher });
    const result = await promise;

    expect(result.enrichment.status).toBe('degraded');
    expect(JSON.stringify(result.courseStructure)).toBe(JSON.stringify(original));
  });

  it('uses the live Stage 5 structural gate during both patch attempts', async () => {
    const original = baseline();
    const patcher = vi.fn(async ({ baseline: value }) => {
      const changed = structuredClone(value);
      changed.sections[0].lessons[0].key_topics.push('legal hold');
      return changed;
    });
    const structuralGate = vi.fn(() => ['new_hard_size_violation']);
    const search = vi.fn(async () => searchResult());
    const result = await enrichBaselineWithDocumentEvidence(
      {
        courseId: id.course,
        organizationId: id.org,
        language: 'en',
        baseline: original,
        snapshot: snapshot(),
        validateCandidate: structuralGate,
      },
      { repository: repository(), search, patcher }
    );

    expect(structuralGate).toHaveBeenCalledTimes(2);
    expect(patcher).toHaveBeenCalledTimes(2);
    expect(result.enrichment.status).toBe('degraded');
    expect(JSON.stringify(result.courseStructure)).toBe(JSON.stringify(original));
  });

  it('records degraded on Qdrant outage without a continue-limited decision', async () => {
    const original = baseline();
    const search = vi.fn(async () => {
      throw new Error('Qdrant unavailable');
    });
    const result = await enrichBaselineWithDocumentEvidence(
      {
        courseId: id.course,
        organizationId: id.org,
        language: 'en',
        baseline: original,
        snapshot: snapshot(),
      },
      { repository: repository(), search }
    );

    expect(result.enrichment.status).toBe('degraded');
    expect(JSON.stringify(result.courseStructure)).toBe(JSON.stringify(original));
  });

  it('records failed_open_with_decision when persisted continue_limited authorizes fallback', async () => {
    const search = vi.fn(async () => {
      throw new Error('Qdrant unavailable');
    });
    const degradedDecision = {
      id: id.decision,
      run_id: id.run,
      course_id: id.course,
      organization_id: id.org,
      conflict_id: null,
      subject_kind: 'degraded_evidence',
      subject_key: 'sha256:degraded',
      document_id: id.docA,
      selected_resolution: 'continue_limited',
      selected_recommendation_value: 'continue_limited',
      supersedes_decision_id: null,
      decided_at: '2026-07-11T12:00:00.000Z',
    };
    const result = await enrichBaselineWithDocumentEvidence(
      {
        courseId: id.course,
        organizationId: id.org,
        language: 'en',
        baseline: baseline(),
        snapshot: snapshot(),
      },
      {
        repository: repository({
          listConflicts: vi.fn(async () => []),
          getLatestDecisions: vi.fn(async () => [degradedDecision]),
        }),
        search,
      }
    );

    expect(result.enrichment.status).toBe('failed_open_with_decision');
  });

  it('accepts a manual continue-limited decision by canonical selected value', async () => {
    const search = vi.fn(async () => {
      throw new Error('Qdrant unavailable');
    });
    const decision = {
      id: id.decision,
      run_id: id.run,
      course_id: id.course,
      organization_id: id.org,
      conflict_id: null,
      subject_kind: 'degraded_evidence' as const,
      subject_key: 'sha256:degraded',
      document_id: id.docA,
      selected_resolution: 'Continue with the available evidence.',
      selected_recommendation_value: 'continue_limited',
      supersedes_decision_id: null,
      decided_at: '2026-07-11T12:00:00.000Z',
    };
    const result = await enrichBaselineWithDocumentEvidence(
      {
        courseId: id.course,
        organizationId: id.org,
        language: 'en',
        baseline: baseline(),
        snapshot: snapshot(),
      },
      {
        repository: repository({
          listConflicts: vi.fn(async () => []),
          getLatestDecisions: vi.fn(async () => [decision]),
        }),
        search,
      }
    );

    expect(result.enrichment.status).toBe('failed_open_with_decision');
  });

  it('rejects a stale coverage snapshot before retrieval', async () => {
    const search = vi.fn();
    const stale = snapshot();
    stale.coverage = { source_count: 1, assessed_count: 1, degraded_count: 0, failed_count: 0 };
    const result = await enrichBaselineWithDocumentEvidence(
      {
        courseId: id.course,
        organizationId: id.org,
        language: 'en',
        baseline: baseline(),
        snapshot: stale,
      },
      { repository: repository(), search }
    );

    expect(result.enrichment.status).toBe('degraded');
    expect(search).not.toHaveBeenCalled();
  });

  it('rejects a degraded card that has no current durable decision', async () => {
    const degradedCard = {
      ...card(id.docA, id.claimA, 'Keep records for 30 days.'),
      coverage_status: 'degraded' as const,
      coverage_reason: 'verification unavailable',
    };
    const search = vi.fn();
    const result = await enrichBaselineWithDocumentEvidence(
      {
        courseId: id.course,
        organizationId: id.org,
        language: 'en',
        baseline: baseline(),
        snapshot: {
          ...snapshot([]),
          coverage: { source_count: 1, assessed_count: 0, degraded_count: 1, failed_count: 0 },
        },
      },
      {
        repository: repository({
          listItems: vi.fn(async () => [degradedCard]),
          listConflicts: vi.fn(async () => []),
          getLatestDecisions: vi.fn(async () => []),
        }),
        search,
      }
    );

    expect(result.enrichment.status).toBe('degraded');
    expect(search).not.toHaveBeenCalled();
  });

  it.each([
    ['stale decision snapshot', repository(), snapshot([])],
    [
      'cross-tenant current decision',
      repository({
        getLatestDecisions: vi.fn(async () => [
          {
            id: id.decision,
            run_id: id.run,
            course_id: id.course,
            organization_id: '30000000-0000-4000-8000-000000000099',
            conflict_id: id.conflict,
            subject_kind: 'claim_conflict',
            subject_key: 'sha256:subject',
            selected_resolution: `recommendation:${id.conflict}`,
            selected_recommendation_value: `recommendation:${id.conflict}`,
            supersedes_decision_id: null,
            decided_at: '2026-07-11T12:00:00.000Z',
          },
        ]),
      }),
      snapshot(),
    ],
  ] as const)('rejects %s without evidence influence', async (_name, repo, evidenceSnapshot) => {
    const original = baseline();
    const search = vi.fn();
    const result = await enrichBaselineWithDocumentEvidence(
      {
        courseId: id.course,
        organizationId: id.org,
        language: 'en',
        baseline: original,
        snapshot: evidenceSnapshot,
      },
      { repository: repo, search }
    );

    expect(result.enrichment.status).toBe('degraded');
    expect(JSON.stringify(result.courseStructure)).toBe(JSON.stringify(original));
    expect(search).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant and stale-version Qdrant refs', async () => {
    const original = baseline();
    const search = vi
      .fn()
      .mockResolvedValueOnce(
        searchResult(id.docA, { organization_id: '30000000-0000-4000-8000-000000000099' })
      )
      .mockResolvedValueOnce(searchResult(id.docA, { version_hash: 'stale-hash' }));
    const first = await enrichBaselineWithDocumentEvidence(
      {
        courseId: id.course,
        organizationId: id.org,
        language: 'en',
        baseline: original,
        snapshot: snapshot(),
      },
      { repository: repository(), search }
    );
    const second = await enrichBaselineWithDocumentEvidence(
      {
        courseId: id.course,
        organizationId: id.org,
        language: 'en',
        baseline: original,
        snapshot: snapshot(),
      },
      { repository: repository(), search }
    );

    expect(first.enrichment.status).toBe('no_relevant_evidence');
    expect(second.enrichment.status).toBe('no_relevant_evidence');
    expect(first.enrichment.section_evidence).toEqual([]);
    expect(second.enrichment.section_evidence).toEqual([]);
  });

  it('never logs source or claim bodies', async () => {
    const { log, promise } = run();
    await promise;
    const serialized = JSON.stringify([
      ...log.info.mock.calls,
      ...log.warn.mock.calls,
      ...log.error.mock.calls,
    ]);

    expect(serialized).not.toContain('Sensitive source body');
    expect(serialized).not.toContain('Keep records for 30 days');
    expect(serialized).not.toContain('Keep records for 365 days');
  });
});
