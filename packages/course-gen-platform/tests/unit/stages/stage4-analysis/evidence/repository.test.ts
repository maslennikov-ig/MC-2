import { describe, expect, it, vi } from 'vitest';
import type { DocumentEvidenceCard, DocumentConflict } from '@megacampus/shared-types';
import { createDocumentEvidenceRepository } from '@/stages/stage4-analysis/evidence/repository';

const ids = {
  run: '10000000-0000-4000-8000-000000000001',
  course: '20000000-0000-4000-8000-000000000001',
  organization: '30000000-0000-4000-8000-000000000001',
  documentA: '40000000-0000-4000-8000-000000000001',
  documentB: '40000000-0000-4000-8000-000000000002',
  claimA: '50000000-0000-4000-8000-000000000001',
  claimB: '50000000-0000-4000-8000-000000000002',
  conflict: '60000000-0000-4000-8000-000000000001',
  decisionA: '70000000-0000-4000-8000-000000000001',
  decisionB: '70000000-0000-4000-8000-000000000002',
  decisionC: '70000000-0000-4000-8000-000000000003',
};

const card: DocumentEvidenceCard = {
  document_id: ids.documentA,
  document_name: 'Policy.pdf',
  priority: 'CORE',
  authority_scope: 'organization_specific',
  content_quality: 0.6,
  course_relevance: 0.9,
  processing_mode: 'summary',
  summary: 'Organization policy summary.',
  key_claims: [
    {
      claim_id: ids.claimA,
      statement: 'Approval is mandatory.',
      confidence: 0.9,
      source_refs: [{ document_id: ids.documentA, page_number: 2 }],
    },
  ],
  terminology: [],
  constraints: ['Approval is mandatory.'],
  limitations: [],
  coverage_status: 'assessed',
  coverage_reason: 'Summary checked against the source.',
  token_counts: { original: 2000, summary: 200, allocated: 250 },
};

const sourceManifest = [
  {
    document_id: ids.documentA,
    source_version_hash: 'hash-a',
    document_name: 'Policy A.pdf',
  },
  {
    document_id: ids.documentB,
    source_version_hash: 'hash-b',
    document_name: 'Policy B.pdf',
  },
];

const conflict: DocumentConflict = {
  conflict_id: ids.conflict,
  conflict_fingerprint: 'sha256:approval-conflict',
  topic: 'Approval',
  severity: 'important',
  sides: [
    {
      statement: 'Approval is mandatory.',
      claim_ids: [ids.claimA],
      document_ids: [ids.documentA],
      source_refs: [{ document_id: ids.documentA, page_number: 2 }],
    },
    {
      statement: 'Approval is optional.',
      claim_ids: [ids.claimB],
      document_ids: [ids.documentB],
      source_refs: [{ document_id: ids.documentB, page_number: 5 }],
    },
  ],
  course_impact: 'The learner needs one unambiguous workflow.',
  recommended_resolution: 'Use the organization policy.',
  recommendation_rationale: 'It is authoritative for this organization.',
  alternatives: ['Explain both scopes.'],
};

type QueryResult = { data: unknown; error: null | { code?: string; message: string } };

function createScriptedClient(script: Record<string, QueryResult[]>) {
  const calls: Array<{ table: string; operations: Array<[string, ...unknown[]]> }> = [];
  const rpc = vi.fn((_name: string, _args: unknown) => {
    const result = script.rpc?.shift();
    if (!result) throw new Error('Missing scripted rpc result');
    return Promise.resolve(result);
  });

  const from = vi.fn((table: string) => {
    const operations: Array<[string, ...unknown[]]> = [];
    calls.push({ table, operations });
    const result = script[table]?.shift();
    if (!result) throw new Error(`Missing scripted result for ${table}`);

    const builder = {
      select(...args: unknown[]) {
        operations.push(['select', ...args]);
        return builder;
      },
      eq(...args: unknown[]) {
        operations.push(['eq', ...args]);
        return builder;
      },
      insert(...args: unknown[]) {
        operations.push(['insert', ...args]);
        return builder;
      },
      order(...args: unknown[]) {
        operations.push(['order', ...args]);
        return builder;
      },
      single() {
        operations.push(['single']);
        return Promise.resolve(result);
      },
      maybeSingle() {
        operations.push(['maybeSingle']);
        return Promise.resolve(result);
      },
      then(resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  });

  return { client: { from, rpc }, calls, rpc };
}

describe('DocumentEvidenceRepository', () => {
  it('reuses an idempotent run for the same course fingerprint and evidence version', async () => {
    const existingRun = {
      id: ids.run,
      course_id: ids.course,
      organization_id: ids.organization,
      input_fingerprint: 'sha256:input-v1',
      evidence_version: '1.0.0',
      status: 'accepted',
      source_manifest: sourceManifest,
      source_count: 2,
    };
    const { client, calls, rpc } = createScriptedClient({
      rpc: [{ data: { run: existingRun, reused: true }, error: null }],
    });
    const repository = createDocumentEvidenceRepository(client as never);

    const result = await repository.getOrCreateRun({
      courseId: ids.course,
      organizationId: ids.organization,
      inputFingerprint: 'sha256:input-v1',
      evidenceVersion: '1.0.0',
      sourceManifest: [sourceManifest[1], sourceManifest[0]],
    });

    expect(result).toEqual({ run: existingRun, reused: true });
    expect(calls).toHaveLength(0);
    expect(rpc).toHaveBeenCalledWith('create_or_reuse_document_evidence_run', {
      p_course_id: ids.course,
      p_organization_id: ids.organization,
      p_input_fingerprint: 'sha256:input-v1',
      p_evidence_version: '1.0.0',
      p_source_manifest: sourceManifest,
    });
  });

  it('creates runs with deterministic unique source IDs and a derived exact count', async () => {
    const createdRun = {
      id: ids.run,
      source_manifest: sourceManifest,
      source_count: 2,
    };
    const { client, rpc } = createScriptedClient({
      rpc: [{ data: { run: createdRun, reused: false }, error: null }],
    });
    const repository = createDocumentEvidenceRepository(client as never);

    await expect(
      repository.getOrCreateRun({
        courseId: ids.course,
        organizationId: ids.organization,
        inputFingerprint: 'sha256:new-input',
        evidenceVersion: '1.0.0',
        sourceManifest: [sourceManifest[1], sourceManifest[0], sourceManifest[1]],
      })
    ).resolves.toEqual({ run: createdRun, reused: false });

    expect(rpc).toHaveBeenCalledWith('create_or_reuse_document_evidence_run', {
      p_course_id: ids.course,
      p_organization_id: ids.organization,
      p_input_fingerprint: 'sha256:new-input',
      p_evidence_version: '1.0.0',
      p_source_manifest: sourceManifest,
    });
  });

  it('rejects a uniqueness-race run whose immutable source set differs', async () => {
    const { client } = createScriptedClient({
      rpc: [
        {
          data: {
            run: { id: ids.run, source_manifest: [sourceManifest[0]], source_count: 1 },
            reused: true,
          },
          error: null,
        },
      ],
    });
    const repository = createDocumentEvidenceRepository(client as never);

    await expect(
      repository.getOrCreateRun({
        courseId: ids.course,
        organizationId: ids.organization,
        inputFingerprint: 'sha256:race',
        evidenceVersion: '1.0.0',
        sourceManifest,
      })
    ).rejects.toThrow(/source_set_mismatch/i);
  });

  it('persists unique items and exact counts through one atomic RPC', async () => {
    const { client, rpc } = createScriptedClient({
      rpc: [
        {
          data: { source_count: 1, assessed_count: 1, degraded_count: 0, failed_count: 0 },
          error: null,
        },
      ],
    });
    const repository = createDocumentEvidenceRepository(client as never);

    const result = await repository.persistItems({
      runId: ids.run,
      courseId: ids.course,
      organizationId: ids.organization,
      cards: [card],
    });

    expect(result).toEqual({
      source_count: 1,
      assessed_count: 1,
      degraded_count: 0,
      failed_count: 0,
    });
    expect(rpc).toHaveBeenCalledWith('persist_document_evidence_items', {
      p_run_id: ids.run,
      p_course_id: ids.course,
      p_organization_id: ids.organization,
      p_items: [card],
    });
  });

  it('rejects duplicate document IDs before writing any item', async () => {
    const { client, rpc } = createScriptedClient({});
    const repository = createDocumentEvidenceRepository(client as never);

    await expect(
      repository.persistItems({
        runId: ids.run,
        courseId: ids.course,
        organizationId: ids.organization,
        cards: [card, { ...card, document_name: 'Duplicate.pdf' }],
      })
    ).rejects.toThrow(/duplicate document_id/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('serializes degraded cards without inventing a summary', async () => {
    const { summary: _summary, ...withoutSummary } = card;
    const degradedCard = {
      ...withoutSummary,
      coverage_status: 'degraded' as const,
      coverage_reason: 'A trustworthy summary was unavailable after retries.',
    };
    const { client, rpc } = createScriptedClient({
      rpc: [
        {
          data: { source_count: 1, assessed_count: 0, degraded_count: 1, failed_count: 0 },
          error: null,
        },
      ],
    });
    const repository = createDocumentEvidenceRepository(client as never);

    await repository.persistItems({
      runId: ids.run,
      courseId: ids.course,
      organizationId: ids.organization,
      cards: [degradedCard],
    });

    const rpcItems = rpc.mock.calls[0]?.[1].p_items as Array<Record<string, unknown>>;
    expect(rpcItems[0]).not.toHaveProperty('summary');
  });

  it('reuses an immutable conflict when its run fingerprint already exists', async () => {
    const existing = {
      id: ids.conflict,
      run_id: ids.run,
      conflict_fingerprint: conflict.conflict_fingerprint,
    };
    const { client, calls, rpc } = createScriptedClient({
      rpc: [{ data: existing, error: null }],
    });
    const repository = createDocumentEvidenceRepository(client as never);

    const result = await repository.upsertConflict({
      runId: ids.run,
      courseId: ids.course,
      organizationId: ids.organization,
      conflict,
      detectionModel: 'test-model',
      detectionVersion: '1.0.0',
    });

    expect(result).toEqual(existing);
    expect(calls).toHaveLength(0);
    expect(rpc).toHaveBeenCalledWith('upsert_document_evidence_conflict', {
      p_run_id: ids.run,
      p_course_id: ids.course,
      p_organization_id: ids.organization,
      p_conflict: conflict,
      p_detection_model: 'test-model',
      p_detection_version: '1.0.0',
    });
  });

  it('appends decisions through the guarded RPC only', async () => {
    const decision = {
      id: ids.decisionA,
      run_id: ids.run,
      conflict_id: ids.conflict,
      selected_resolution: 'Use the organization policy.',
      resolved_by: 'system',
      answer_source: 'system',
      rationale: 'The automatic course selected the recommended answer.',
      decided_at: '2026-07-11T10:00:00.000Z',
    };
    const { client, calls, rpc } = createScriptedClient({
      rpc: [{ data: decision, error: null }],
    });
    const repository = createDocumentEvidenceRepository(client as never);

    await expect(
      repository.appendDecision({
        runId: ids.run,
        conflictId: ids.conflict,
        selectedResolution: decision.selected_resolution,
        resolvedBy: 'system',
        answerSource: 'system',
        rationale: decision.rationale,
        decidedAt: decision.decided_at,
      })
    ).resolves.toEqual(decision);

    expect(calls).toHaveLength(0);
    expect(rpc).toHaveBeenCalledWith('append_document_evidence_decision', {
      p_decision: {
        run_id: ids.run,
        conflict_id: ids.conflict,
        selected_resolution: decision.selected_resolution,
        resolved_by: 'system',
        answer_source: 'system',
        rationale: decision.rationale,
        decided_at: decision.decided_at,
      },
    });
  });

  it('rejects system answer sources for user decisions', async () => {
    const { client } = createScriptedClient({});
    const repository = createDocumentEvidenceRepository(client as never);

    await expect(
      repository.appendDecision({
        runId: ids.run,
        conflictId: ids.conflict,
        selectedResolution: 'Use the organization policy.',
        resolvedBy: 'user',
        answerSource: 'system',
        rationale: 'Invalid audit pairing.',
        decidedAt: '2026-07-11T10:00:00.000Z',
      })
    ).rejects.toThrow(/invalid_system_answer_source/i);
  });

  it('rejects a system decision that tries to supersede an existing event', async () => {
    const { client, rpc } = createScriptedClient({});
    const repository = createDocumentEvidenceRepository(client as never);

    await expect(
      repository.appendDecision({
        runId: ids.run,
        conflictId: ids.conflict,
        selectedResolution: 'System override is forbidden.',
        resolvedBy: 'system',
        answerSource: 'system',
        rationale: 'Invalid override.',
        supersedesDecisionId: ids.decisionA,
        decidedAt: '2026-07-11T10:00:00.000Z',
      })
    ).rejects.toThrow(/superseding_decision_must_be_user/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('resolves the latest unsuperseded decision in each append-only chain', async () => {
    const decisions = [
      {
        id: ids.decisionC,
        conflict_id: ids.conflict,
        supersedes_decision_id: ids.decisionB,
        decided_at: '2026-07-11T12:00:00.000Z',
      },
      {
        id: ids.decisionB,
        conflict_id: ids.conflict,
        supersedes_decision_id: ids.decisionA,
        decided_at: '2026-07-11T11:00:00.000Z',
      },
      {
        id: ids.decisionA,
        conflict_id: ids.conflict,
        supersedes_decision_id: null,
        decided_at: '2026-07-11T10:00:00.000Z',
      },
    ];
    const { client } = createScriptedClient({
      document_evidence_decisions: [{ data: decisions, error: null }],
    });
    const repository = createDocumentEvidenceRepository(client as never);

    const latest = await repository.getLatestDecisions(ids.run);

    expect(latest).toEqual([decisions[0]]);
  });
});
