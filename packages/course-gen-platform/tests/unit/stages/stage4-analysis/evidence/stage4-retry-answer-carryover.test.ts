/**
 * Contract: a Stage 4 retry must not strand the answer the user already gave.
 *
 * On 2026-08-13 a live course sat in `stage_4_clarifying` forever. Two things
 * combined: the run fingerprint was built partly from an LLM output, so a job
 * retry created a second accepted run instead of reusing the first; and the
 * subject key is derived from the run id, so the answered question belonged to
 * the older run while the guard trigger checked the newer one. The question's
 * attempt budget was spent, so no new question could ever appear (mc2-fqbrj).
 *
 * Both ends are covered here: one run for one set of documents, and an answer
 * that carries onto an equivalent subject of a later run — but only while the
 * sources are unchanged.
 */

import { describe, expect, it, vi } from 'vitest';
import type { DocumentConflict, DocumentEvidenceCard } from '@megacampus/shared-types';

import { runDocumentEvidencePreflight } from '@/stages/stage4-analysis/evidence/preflight';
import {
  resolveDocumentEvidenceDecisions,
  type DocumentDecisionRepository,
} from '@/stages/stage4-analysis/evidence/decision-service';

const id = {
  runA: '10000000-0000-4000-8000-00000000000a',
  runB: '10000000-0000-4000-8000-00000000000b',
  course: '20000000-0000-4000-8000-000000000001',
  org: '30000000-0000-4000-8000-000000000001',
  doc: '40000000-0000-4000-8000-000000000001',
  otherDoc: '40000000-0000-4000-8000-000000000002',
  actor: '50000000-0000-4000-8000-000000000099',
  priorDecision: '70000000-0000-4000-8000-000000000001',
  carriedDecision: '70000000-0000-4000-8000-000000000002',
};

const manifest = [
  { document_id: id.doc, source_version_hash: 'hash-a', document_name: 'photosynthesis.docx' },
];
const changedManifest = [
  ...manifest,
  { document_id: id.otherDoc, source_version_hash: 'hash-b', document_name: 'extra.docx' },
];

// ---------------------------------------------------------------- run identity

/**
 * A repository that behaves like `create_or_reuse_document_evidence_run`: the
 * fingerprint is the run's identity, so an equal fingerprint reuses the run.
 */
function reusingPreflightRepository() {
  const runsByFingerprint = new Map<string, string>();
  const created: string[] = [];
  return {
    created,
    getOrCreateRun: vi.fn(async (input: { inputFingerprint: string }) => {
      const existing = runsByFingerprint.get(input.inputFingerprint);
      if (existing) return { run: { id: existing, status: 'processing' }, reused: true };
      const runId = `10000000-0000-4000-8000-${String(created.length + 1).padStart(12, '0')}`;
      runsByFingerprint.set(input.inputFingerprint, runId);
      created.push(runId);
      return { run: { id: runId, status: 'processing' }, reused: false };
    }),
    listItems: vi.fn(async () => []),
    listBatchCheckpoints: vi.fn(async () => []),
    commitBatch: vi.fn(async () => ({})),
    finalizeRun: vi.fn(async () => ({})),
  };
}

function preflightInput() {
  return {
    courseId: id.course,
    organizationId: id.org,
    topic: 'Фотосинтез',
    language: 'ru' as const,
    evidenceVersion: 'document-evidence-v1',
    modelId: 'openai/gpt-5.6-luna',
    sources: [
      {
        documentId: id.doc,
        documentName: 'photosynthesis.docx',
        sourceVersionHash: 'hash-a',
        priority: 'CORE' as const,
        authorityScope: 'course_source' as const,
        contentQuality: 0.83,
        originalTokens: 8310,
        summaryTokens: 0,
        stage3Summary: 'Краткое изложение статьи',
        stage3SummaryVersionHash: 'summary-hash-a',
      },
    ],
    maxRetries: 2,
    modelContext: 700_000,
    promptReserve: 10_000,
    outputReserve: 16_000,
    maxBatchTokens: 32_000,
  };
}

// ------------------------------------------------------------- answer carrying

function degradedCard(): DocumentEvidenceCard {
  return {
    document_id: id.doc,
    document_name: 'photosynthesis.docx',
    priority: 'CORE',
    authority_scope: 'course_source',
    content_quality: 0.83,
    course_relevance: 0,
    processing_mode: 'metadata_only',
    summary: null,
    key_claims: [],
    terminology: [],
    constraints: [],
    limitations: [],
    coverage_status: 'failed',
    coverage_reason: 'structured_evidence_generation_failed_after_retries',
    token_counts: { original: 8310, summary: 0, allocated: 0 },
  };
}

interface CarryRepositoryOptions {
  /** The manifest recorded against the earlier run. */
  priorManifest?: typeof manifest;
  /** What the user answered on the earlier run. */
  priorAnswer?: string;
}

function carryRepository(options: CarryRepositoryOptions = {}) {
  const answered: Array<{ questionId: string; answer: string; actorUserId: string }> = [];
  const repository: DocumentDecisionRepository = {
    getAcceptedRun: vi.fn(async () => ({ id: id.runB, status: 'accepted' as const })),
    listConflicts: vi.fn(async (): Promise<DocumentConflict[]> => []),
    listItems: vi.fn(async () => [degradedCard()]),
    listDetectorCapacityIssues: vi.fn(async () => []),
    listCurrentDecisions: vi.fn(async () => []),
    getDegradedRetryState: vi.fn(async () => ({ attempt: 2, maxAttempts: 2 })),
    materializeDecisionGateAtomic: vi.fn(async input => ({
      question_ids: input.questions.map(question => question.questionId),
      decision_ids: [],
      reused: false,
    })),
    listCourseAcceptedRuns: vi.fn(async () => [
      { id: id.runB, sourceManifest: manifest },
      { id: id.runA, sourceManifest: options.priorManifest ?? manifest },
    ]),
    getLatestDecisions: vi.fn(async (runId: string) =>
      runId === id.runA
        ? [
            {
              id: id.priorDecision,
              run_id: id.runA,
              subject_kind: 'degraded_evidence',
              document_id: id.doc,
              conflict_id: null,
              resolved_by: 'user',
              selected_recommendation_value: options.priorAnswer ?? 'continue_limited',
              actor_user_id: id.actor,
              supersedes_decision_id: null,
              decided_at: '2026-08-13T15:57:00Z',
            },
          ]
        : []
    ),
    answerDocumentConflictAtomic: vi.fn(async input => {
      for (const answer of input.answers) {
        answered.push({
          questionId: answer.questionId,
          answer: answer.answer,
          actorUserId: input.actorUserId,
        });
      }
      return {
        answered_question_ids: input.answers.map(a => a.questionId),
        decision_ids: [id.carriedDecision],
      };
    }),
  };
  return { repository, answered };
}

const gateInput = {
  runId: id.runB,
  courseId: id.course,
  organizationId: id.org,
  language: 'ru' as const,
  mode: 'manual' as const,
  maxUiExcerptChars: 240,
  maxSourceRefsPerSide: 8,
  maxDocumentsInMetadata: 8,
  maxEvidenceRetryAttempts: 2,
  automaticCapacityPolicy: 'continue_limited' as const,
};

describe('Stage 4 retry does not strand the answer', () => {
  it('gives one accepted run to two attempts over the same documents', async () => {
    const repository = reusingPreflightRepository();

    // The second attempt carries the Stage 4 classifier's output, which differs
    // between attempts on identical documents. Run identity must ignore it: it
    // is not an input to evidence generation. Passed untyped on purpose — the
    // caller used to supply exactly this, and the fingerprint used to read it.
    const withClassifierOutput = {
      ...preflightInput(),
      classificationContext: {
        course_category: { primary: 'science', secondary: 'biology' },
        topic_analysis: {
          determined_topic: 'Фотосинтез растений',
          complexity: 'intermediate',
          target_audience: 'beginners',
        },
      },
    } as ReturnType<typeof preflightInput>;

    const first = await runDocumentEvidencePreflight(preflightInput(), { repository });
    const second = await runDocumentEvidencePreflight(withClassifierOutput, { repository });

    expect(first.inputFingerprint).toBe(second.inputFingerprint);
    expect(repository.created).toHaveLength(1);
  });

  it('gives a distinct run when the set of sources changes', async () => {
    const repository = reusingPreflightRepository();
    const withExtraSource = preflightInput();
    withExtraSource.sources = [
      ...withExtraSource.sources,
      {
        documentId: id.otherDoc,
        documentName: 'extra.docx',
        sourceVersionHash: 'hash-b',
        priority: 'SUPPLEMENTARY' as const,
        authorityScope: 'general_reference' as const,
        contentQuality: 0.4,
        originalTokens: 500,
        summaryTokens: 0,
        stage3Summary: 'Ещё один документ',
        stage3SummaryVersionHash: 'summary-hash-b',
      },
    ];

    await runDocumentEvidencePreflight(preflightInput(), { repository });
    await runDocumentEvidencePreflight(withExtraSource, { repository });

    expect(repository.created).toHaveLength(2);
  });

  it('carries the answered decision onto the newer run and stops asking', async () => {
    const { repository, answered } = carryRepository();

    const result = await resolveDocumentEvidenceDecisions(gateInput, { repository });

    expect(answered).toHaveLength(1);
    expect(answered[0]).toMatchObject({ answer: 'continue_limited', actorUserId: id.actor });
    expect(result.pauseRequired).toBe(false);
    expect(result.requiredQuestionIds).toEqual([]);
    expect(result.currentDecisionIds).toContain(id.carriedDecision);
  });

  it('does not carry an answer given for a different set of sources', async () => {
    const { repository, answered } = carryRepository({ priorManifest: changedManifest });

    const result = await resolveDocumentEvidenceDecisions(gateInput, { repository });

    expect(answered).toHaveLength(0);
    expect(result.pauseRequired).toBe(true);
    expect(result.requiredQuestionIds).toHaveLength(1);
  });

  it('asks again when the newer question no longer offers the earlier choice', async () => {
    const { repository, answered } = carryRepository({ priorAnswer: 'retry' });
    // Retries are exhausted on this run, so `retry` is not among the choices.

    const result = await resolveDocumentEvidenceDecisions(gateInput, { repository });

    expect(answered).toHaveLength(0);
    expect(result.pauseRequired).toBe(true);
  });
});
