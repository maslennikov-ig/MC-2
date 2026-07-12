import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DOCUMENT_EVIDENCE_DATABASE_URL;
const appliedDescribe = databaseUrl ? describe.sequential : describe.skip;
const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260711130000_document_conflict_auto_answers.sql'),
  'utf8'
);
const evidenceMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260711120000_document_evidence.sql'),
  'utf8'
);
const rollback = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/rollback/20260711130000_document_conflict_auto_answers_rollback.sql'
  ),
  'utf8'
);

const id = {
  orgA: '30000000-0000-4000-8000-000000000001',
  orgB: '30000000-0000-4000-8000-000000000002',
  courseA: '20000000-0000-4000-8000-000000000001',
  courseB: '20000000-0000-4000-8000-000000000002',
  run: '10000000-0000-4000-8000-000000000001',
  docA: '40000000-0000-4000-8000-000000000001',
  docB: '40000000-0000-4000-8000-000000000002',
  docC: '40000000-0000-4000-8000-000000000003',
  claimA: '50000000-0000-4000-8000-000000000001',
  claimB: '50000000-0000-4000-8000-000000000002',
  conflict: '60000000-0000-4000-8000-000000000001',
  informational: '60000000-0000-4000-8000-000000000002',
  conflictQuestion: '80000000-0000-4000-8000-000000000001',
  degradedQuestion: '80000000-0000-4000-8000-000000000002',
  capacityQuestion: '80000000-0000-4000-8000-000000000003',
  additionalConflict: '60000000-0000-4000-8000-000000000003',
  additionalConflictQuestion: '80000000-0000-4000-8000-000000000004',
  gate: '90000000-0000-4000-8000-000000000001',
  oldRun: '10000000-0000-4000-8000-000000000002',
  retryTarget: '10000000-0000-4000-8000-000000000003',
  oldRetryDecision: '70000000-0000-4000-8000-000000000099',
};

let admin: Client;
let systemDecisionId = '';
let currentUserDecisionId = '';

function assertDisposableDatabaseUrl(value: string): string {
  const parsed = new URL(value);
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  if (!loopback || !/_test$/iu.test(parsed.pathname.replace(/^\//u, ''))) {
    throw new Error('Applied evidence tests require a loopback disposable _test database');
  }
  return value;
}

function claims(
  role: 'service_role' | 'authenticated',
  organizationId: string,
  actorUserId = '50000000-0000-4000-8000-000000000099'
): string {
  return JSON.stringify({
    role,
    organization_id: organizationId,
    sub: actorUserId,
  });
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const subjectKey = (runId: string, identity: string) =>
  `sha256:${sha256(`document-evidence-subject-v1:${runId}:${identity}`)}`;

async function asRole<T>(
  client: Client,
  role: 'service_role' | 'authenticated',
  organizationId: string,
  operation: () => Promise<T>,
  actorUserId?: string
): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('request.jwt.claims',$1,true)`, [
      claims(role, organizationId, actorUserId),
    ]);
    await client.query(`SET LOCAL ROLE ${role}`);
    const result = await operation();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function conflictQuestion(recommendedCount = 1) {
  return {
    questionId: id.conflictQuestion,
    questionText: 'Which approval rule should the course use?',
    priority: 'important',
    suggestedAnswers: [
      {
        value: 'explain_both',
        text: 'Explain both scopes',
        rationale: 'Preserve context',
        is_recommended: recommendedCount > 1,
      },
      {
        value: 'mandatory',
        text: 'Use mandatory approval',
        rationale: 'Organization authority wins',
        is_recommended: recommendedCount > 0,
      },
    ],
    metadata: {
      schema_version: 'document-conflict-question-v1',
      subject_kind: 'claim_conflict',
      subject_key: subjectKey(id.run, `conflict:${id.conflict}`),
      run_id: id.run,
      conflict_id: id.conflict,
    },
  };
}

function degradedQuestion() {
  return {
    questionId: id.degradedQuestion,
    questionText: 'How should C.pdf be handled?',
    priority: 'important',
    suggestedAnswers: [
      { value: 'retry', text: 'Retry', rationale: 'Try once more', is_recommended: false },
      {
        value: 'continue_limited',
        text: 'Continue with limited evidence',
        rationale: 'Baseline remains available',
        is_recommended: true,
      },
    ],
    metadata: {
      schema_version: 'document-conflict-question-v1',
      subject_kind: 'degraded_evidence',
      subject_key: subjectKey(id.run, `degraded:${id.docC}:degraded:parse failed:1`),
      run_id: id.run,
      document_id: id.docC,
      attempt: 1,
      max_attempts: 1,
    },
  };
}

function terminalUnrecoverableQuestion(
  metadataOverrides: Record<string, unknown> = {},
  suggestedAnswers: unknown[] = [
    {
      value: 'continue_limited',
      text: 'Continue with limited evidence',
      rationale: 'The original source is unavailable; retain the audited limitation',
      is_recommended: true,
    },
    {
      value: 'remove_document',
      text: 'Exclude advisory evidence',
      rationale: 'Keep source history only',
      is_recommended: false,
    },
  ],
  durableCoverage: { status: 'degraded' | 'failed'; reason: string } = {
    status: 'failed',
    reason: 'source_file_unrecoverable',
  }
) {
  return {
    questionId: id.degradedQuestion,
    questionText: 'How should the unrecoverable C.pdf source be handled?',
    priority: 'important',
    suggestedAnswers,
    metadata: {
      schema_version: 'document-conflict-question-v1',
      subject_kind: 'degraded_evidence',
      subject_key: subjectKey(
        id.run,
        `degraded:${id.docC}:${durableCoverage.status}:${durableCoverage.reason}:0`
      ),
      run_id: id.run,
      document_id: id.docC,
      coverage_status: 'failed',
      coverage_reason: 'source_file_unrecoverable',
      attempt: 0,
      max_attempts: 2,
      choices: ['continue_limited', 'remove_document'],
      ...metadataOverrides,
    },
  };
}

function capacityQuestion() {
  return {
    questionId: id.capacityQuestion,
    questionText: 'Continue with bounded conflict detection?',
    priority: 'important',
    suggestedAnswers: [
      {
        value: 'continue_limited',
        text: 'Continue with limitations',
        rationale: 'Explicitly retain the limitation',
        is_recommended: true,
      },
      {
        value: 'abort_adjust_sources',
        text: 'Stop and adjust sources',
        rationale: 'Materially change corpus or configuration',
        is_recommended: false,
      },
    ],
    metadata: {
      schema_version: 'document-conflict-question-v1',
      subject_kind: 'detector_capacity',
      subject_key: subjectKey(id.run, 'capacity:sha256:plan:sha256:config'),
      run_id: id.run,
      call_plan_hash: 'sha256:plan',
      config_hash: 'sha256:config',
    },
  };
}

function allDurableQuestions(recommendedCount = 1) {
  return [conflictQuestion(recommendedCount), degradedQuestion(), capacityQuestion()];
}

function largeDegradedQuestions(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const documentId = `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    return {
      questionId: `80000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      questionText: `How should Document-${index + 1}.pdf be handled?`,
      priority: 'important',
      suggestedAnswers: [
        {
          value: 'continue_limited',
          text: 'Continue with limited evidence',
          rationale: 'Retain explicit degraded coverage',
          is_recommended: true,
        },
        {
          value: 'remove_document',
          text: 'Exclude advisory evidence',
          rationale: 'Keep source history only',
          is_recommended: false,
        },
      ],
      metadata: {
        schema_version: 'document-conflict-question-v1',
        subject_kind: 'degraded_evidence',
        subject_key: subjectKey(id.run, `degraded:${documentId}:degraded:transient:0`),
        run_id: id.run,
        document_id: documentId,
        attempt: 0,
        max_attempts: 1,
      },
    };
  });
}

function additionalConflictQuestion() {
  const question = conflictQuestion();
  return {
    ...question,
    questionId: id.additionalConflictQuestion,
    questionText: 'Which additional approval rule should the course use?',
    metadata: {
      ...question.metadata,
      subject_key: subjectKey(id.run, `conflict:${id.additionalConflict}`),
      conflict_id: id.additionalConflict,
    },
  };
}

async function materialize(
  mode: 'manual' | 'automatic',
  questions: unknown[],
  gateId: string = id.gate
) {
  return asRole(admin, 'service_role', id.orgA, () =>
    admin.query(
      `SELECT public.materialize_document_evidence_decision_gate_atomic(
        $1,$2,$3,$4,$5::jsonb,$6
      ) AS result`,
      [id.run, id.courseA, id.orgA, mode, JSON.stringify(questions), gateId]
    )
  );
}

async function answer(
  client: Client,
  input: {
    answer?: string;
    answerSource?: 'suggested' | 'modified' | 'custom';
    questionId?: string;
    idempotencyKey: string;
    expected?: string;
    extra?: Record<string, unknown>;
  },
  organizationId = id.orgA,
  actorUserId?: string
) {
  const payload = {
    question_id: input.questionId ?? id.conflictQuestion,
    answer: input.answer ?? 'Use mandatory approval',
    answer_source: input.answerSource ?? 'suggested',
    selected_suggestion_index: 1,
    idempotency_key: input.idempotencyKey,
    expected_current_decision_id: input.expected ?? null,
    ...input.extra,
  };
  return asRole(
    client,
    'authenticated',
    organizationId,
    () =>
      client.query(
        'SELECT public.answer_document_evidence_questions_atomic($1,$2::jsonb) AS result',
        [id.courseA, JSON.stringify([payload])]
      ),
    actorUserId
  );
}

async function resetDatabase(
  includePriorRetry = true,
  includeCapacity = true,
  includeSecondDegraded = false,
  largeDegradedCount = 0,
  includeConflicts = true,
  documentCoverage: {
    status: 'degraded' | 'failed';
    reason: string;
    allocatedTokens: number;
  } = { status: 'degraded', reason: 'parse failed', allocatedTokens: 10 }
): Promise<void> {
  await admin.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    CREATE SCHEMA public;
    CREATE SCHEMA auth;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END IF;
    END $$;
    ALTER ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb
    $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(auth.jwt()->>'sub','')::uuid
    $$;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated,service_role;
    CREATE TABLE organizations(id uuid PRIMARY KEY);
    CREATE TABLE courses(
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      generation_status text NOT NULL DEFAULT 'stage_4_clarifying',
      analysis_result jsonb
    );
    CREATE TABLE file_catalog(
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
      hash text NOT NULL
    );
    CREATE TABLE clarifying_questions(
      id uuid PRIMARY KEY,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      question_text text NOT NULL DEFAULT 'question',
      question_type text NOT NULL DEFAULT 'single_choice',
      question_priority text NOT NULL DEFAULT 'important',
      question_category text,
      suggested_answers jsonb NOT NULL DEFAULT '[]',
      iteration_round integer NOT NULL DEFAULT 1,
      order_index integer NOT NULL DEFAULT 0,
      metadata jsonb NOT NULL DEFAULT '{}',
      status text NOT NULL DEFAULT 'pending',
      user_answer jsonb,
      answer_source text,
      selected_suggestion_index integer,
      answered_at timestamptz
    );
    GRANT SELECT ON courses,file_catalog TO authenticated,service_role;
  `);
  await admin.query(evidenceMigration);
  await admin.query(migration);
  await admin.query(`INSERT INTO organizations(id) VALUES ($1),($2)`, [id.orgA, id.orgB]);
  await admin.query(`INSERT INTO courses(id,organization_id) VALUES ($1,$2),($3,$4)`, [
    id.courseA,
    id.orgA,
    id.courseB,
    id.orgB,
  ]);
  if (largeDegradedCount > 0) {
    const largeManifest = Array.from({ length: largeDegradedCount }, (_, index) => ({
      document_id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      source_version_hash: `hash-${index + 1}`,
      document_name: `Document-${index + 1}.pdf`,
    }));
    await admin.query(
      `INSERT INTO document_evidence_runs(
         id,course_id,organization_id,input_fingerprint,evidence_version,status,source_manifest
       ) VALUES ($1,$2,$3,'fp-large','e2-v1','processing',$4::jsonb)`,
      [id.run, id.courseA, id.orgA, JSON.stringify(largeManifest)]
    );
    await admin.query(
      `INSERT INTO document_evidence_items(
         run_id,course_id,organization_id,document_id,source_version_hash,document_name,
         priority,authority_scope,content_quality,course_relevance,processing_mode,summary,claims,
         coverage_status,coverage_reason,original_tokens,summary_tokens,allocated_tokens
       )
       SELECT $1,$2,$3,entry.document_id::uuid,entry.source_version_hash,entry.document_name,
         'IMPORTANT','course_source',0.5,0.5,'metadata_only',NULL,'[]'::jsonb,
         'degraded','transient',100,0,10
       FROM jsonb_to_recordset($4::jsonb) AS entry(
         document_id text, source_version_hash text, document_name text
       )`,
      [id.run, id.courseA, id.orgA, JSON.stringify(largeManifest)]
    );
    await admin.query(
      `UPDATE document_evidence_runs SET status='accepted',degraded_count=$2,completed_at=now()
       WHERE id=$1`,
      [id.run, largeDegradedCount]
    );
    return;
  }
  const manifest = [
    { document_id: id.docA, source_version_hash: 'hash-a', document_name: 'A.pdf' },
    { document_id: id.docB, source_version_hash: 'hash-b', document_name: 'B.pdf' },
    { document_id: id.docC, source_version_hash: 'hash-c', document_name: 'C.pdf' },
  ];
  await admin.query(
    `INSERT INTO document_evidence_runs(
       id,course_id,organization_id,input_fingerprint,evidence_version,status,source_manifest
     ) VALUES ($1,$2,$3,'fp-a','e2-v1','processing',$4::jsonb)`,
    [id.run, id.courseA, id.orgA, JSON.stringify(manifest)]
  );
  if (includePriorRetry) {
    const oldManifest = [
      { document_id: id.docC, source_version_hash: 'hash-c', document_name: 'C.pdf' },
    ];
    await admin.query(
      `INSERT INTO document_evidence_runs(
         id,course_id,organization_id,input_fingerprint,evidence_version,status,source_manifest
       ) VALUES ($1,$2,$3,'fp-old','e2-v1','processing',$4::jsonb)`,
      [id.oldRun, id.courseA, id.orgA, JSON.stringify(oldManifest)]
    );
    await admin.query(
      `INSERT INTO document_evidence_items(
         run_id,course_id,organization_id,document_id,source_version_hash,document_name,
         priority,authority_scope,content_quality,course_relevance,processing_mode,summary,claims,
         coverage_status,coverage_reason,original_tokens,summary_tokens,allocated_tokens
       ) VALUES ($1,$2,$3,$4,'hash-c','C.pdf','SUPPLEMENTARY','general_reference',.2,.3,
         'metadata_only',NULL,'[]','degraded','parse failed',100,0,10)`,
      [id.oldRun, id.courseA, id.orgA, id.docC]
    );
    await admin.query(
      `UPDATE document_evidence_runs SET status='accepted',degraded_count=1,completed_at=now()
       WHERE id=$1`,
      [id.oldRun]
    );
    await admin.query(
      `INSERT INTO document_evidence_decisions(
         id,run_id,course_id,organization_id,selected_resolution,rationale,resolved_by,answer_source,
         selected_recommendation_value,subject_kind,subject_key,document_id,actor_user_id
       ) VALUES ($1,$2,$3,$4,'Retry','User requested retry','user','suggested','retry',
         'degraded_evidence',$5,$6,'50000000-0000-4000-8000-000000000099')`,
      [
        id.oldRetryDecision,
        id.oldRun,
        id.courseA,
        id.orgA,
        subjectKey(id.oldRun, `degraded:${id.docC}:degraded:parse failed:0`),
        id.docC,
      ]
    );
    await admin.query(
      `INSERT INTO document_evidence_retry_applications(
         decision_id,target_run_id,course_id,organization_id
       ) VALUES ($1,$2,$3,$4)`,
      [id.oldRetryDecision, id.run, id.courseA, id.orgA]
    );
  }
  const refsA = [{ document_id: id.docA, page_number: 2, version_hash: 'hash-a' }];
  const refsB = [{ document_id: id.docB, page_number: 3, version_hash: 'hash-b' }];
  await admin.query(
    `INSERT INTO document_evidence_items(
       run_id,course_id,organization_id,document_id,source_version_hash,document_name,
       priority,authority_scope,content_quality,course_relevance,processing_mode,summary,claims,
       coverage_status,coverage_reason,original_tokens,summary_tokens,allocated_tokens
     ) VALUES
       ($1,$2,$3,$4,'hash-a','A.pdf','CORE','organization_specific',.9,.9,'summary','A',
        $7::jsonb,'assessed','ok',100,10,10),
       ($1,$2,$3,$5,'hash-b','B.pdf','IMPORTANT','course_source',.8,.8,'summary','B',
        $8::jsonb,$9,$10,100,10,10),
       ($1,$2,$3,$6,'hash-c','C.pdf','SUPPLEMENTARY','general_reference',.2,.3,
        'metadata_only',NULL,'[]',$11,$12,100,0,$13)`,
    [
      id.run,
      id.courseA,
      id.orgA,
      id.docA,
      id.docB,
      id.docC,
      JSON.stringify([
        { claim_id: id.claimA, statement: 'Mandatory', confidence: 0.9, source_refs: refsA },
      ]),
      JSON.stringify([
        { claim_id: id.claimB, statement: 'Optional', confidence: 0.8, source_refs: refsB },
      ]),
      includeSecondDegraded ? 'degraded' : 'assessed',
      includeSecondDegraded ? 'transient' : 'ok',
      documentCoverage.status,
      documentCoverage.reason,
      documentCoverage.allocatedTokens,
    ]
  );
  await admin.query(
    `UPDATE document_evidence_runs SET status='accepted',assessed_count=$2,degraded_count=$3,
       failed_count=$4,
       completed_at=now() WHERE id=$1`,
    [
      id.run,
      includeSecondDegraded ? 1 : 2,
      (includeSecondDegraded ? 1 : 0) + (documentCoverage.status === 'degraded' ? 1 : 0),
      documentCoverage.status === 'failed' ? 1 : 0,
    ]
  );
  const materialSides = [
    {
      statement: 'Mandatory',
      claim_ids: [id.claimA],
      document_ids: [id.docA],
      source_refs: refsA,
    },
    {
      statement: 'Optional',
      claim_ids: [id.claimB],
      document_ids: [id.docB],
      source_refs: refsB,
    },
  ];
  if (includeConflicts) {
    await admin.query(
      `INSERT INTO document_evidence_conflicts(
         id,run_id,course_id,organization_id,conflict_fingerprint,topic,severity,sides,
         course_impact,recommended_resolution,recommendation_rationale,alternatives,
         detection_model,detection_version
       ) VALUES
         ($1,$3,$4,$5,'sha256:material','Approval','important',$6::jsonb,
          'Needs one answer','Use mandatory','Authority wins','["Explain scopes"]','test','v1'),
         ($2,$3,$4,$5,'sha256:info','Minor','informational',$6::jsonb,
          'No block','Keep baseline','Minor','["Ignore"]','test','v1')`,
      [id.conflict, id.informational, id.run, id.courseA, id.orgA, JSON.stringify(materialSides)]
    );
  }
  if (includeCapacity) {
    await admin.query(
      `INSERT INTO document_evidence_conflict_checkpoints(
       run_id,course_id,organization_id,batch_key,input_hash,structured_checkpoint,
       verification_status,conflict_verification
     ) VALUES ($1,$2,$3,'capacity:1','sha256:capacity',$4::jsonb,'degraded','[]')`,
      [
        id.run,
        id.courseA,
        id.orgA,
        JSON.stringify({
          kind: 'conflict_capacity_degraded',
          issue: {
            kind: 'detector_capacity',
            reason: 'detector_capacity_degraded',
            call_plan_hash: 'sha256:plan',
            config_hash: 'sha256:config',
            claim_count: 1000,
            cluster_count: 1000,
          },
        }),
      ]
    );
  }
}

async function resetTerminalUnrecoverableDatabase(
  status: 'degraded' | 'failed' = 'failed',
  reason = 'source_file_unrecoverable'
): Promise<void> {
  await resetDatabase(false, false, false, 0, false, {
    status,
    reason,
    allocatedTokens: status === 'failed' ? 0 : 10,
  });
}

describe('document conflict applied harness guard', () => {
  it('rejects remote hosts and non-test database names before connection', () => {
    expect(() =>
      assertDisposableDatabaseUrl('postgresql://postgres@db.internal/document_evidence_test')
    ).toThrow(/loopback/u);
    expect(() =>
      assertDisposableDatabaseUrl('postgresql://postgres@127.0.0.1/document_evidence')
    ).toThrow(/_test/u);
    expect(
      assertDisposableDatabaseUrl('postgresql://postgres@127.0.0.1:55432/document_evidence_e3_test')
    ).toContain('document_evidence_e3_test');
  });
});

appliedDescribe('document conflict applied PostgreSQL 15 matrix', () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: assertDisposableDatabaseUrl(databaseUrl!) });
    await admin.connect();
    await resetDatabase();
  }, 30_000);

  afterAll(async () => {
    await admin?.end();
  });

  it('rolls back the entire whole gate when recommendation shape is malformed', async () => {
    await expect(materialize('automatic', allDurableQuestions(2))).rejects.toMatchObject({
      code: '23514',
    });
    const counts = await admin.query(
      `SELECT
        (SELECT count(*) FROM clarifying_questions) AS questions,
        (SELECT count(*) FROM document_evidence_decisions) AS decisions`
    );
    expect(counts.rows[0]).toMatchObject({ questions: '0', decisions: '1' });
  });

  it('materializes question, system decision and compact snapshot atomically', async () => {
    const result = await materialize('automatic', allDurableQuestions());
    systemDecisionId = (
      await admin.query(
        `SELECT id FROM document_evidence_decisions WHERE run_id=$1 AND conflict_id=$2`,
        [id.run, id.conflict]
      )
    ).rows[0].id;
    expect(result.rows[0].result).toMatchObject({ reused: false });
    const row = await admin.query(
      `SELECT q.answer_source,d.resolved_by,d.answer_source AS decision_source,
              c.analysis_result->'document_evidence'->'current_decision_ids' AS current_ids
       FROM clarifying_questions q
       JOIN document_evidence_decisions d ON d.clarifying_question_id=q.id
       JOIN courses c ON c.id=q.course_id WHERE q.id=$1`,
      [id.conflictQuestion]
    );
    expect(row.rows[0]).toMatchObject({
      answer_source: 'system',
      resolved_by: 'system',
      decision_source: 'system',
    });
    expect(row.rows[0].current_ids).toContain(systemDecisionId);
  });

  it('reuses the same whole-gate idempotency key and payload', async () => {
    const result = await materialize('automatic', allDurableQuestions());
    expect(result.rows[0].result).toMatchObject({ reused: true });
    expect(result.rows[0].result.decision_ids).toContain(systemDecisionId);
  });

  it('rejects a reused whole-gate key with a changed payload', async () => {
    const changed = allDurableQuestions();
    changed[0].questionText = 'Changed';
    await expect(materialize('automatic', changed)).rejects.toMatchObject({ code: '23514' });
  });

  it('denies an authenticated caller from forging a system gate', async () => {
    await expect(
      asRole(admin, 'authenticated', id.orgA, () =>
        admin.query(
          `SELECT public.materialize_document_evidence_decision_gate_atomic(
            $1,$2,$3,'manual',$4::jsonb,$5
          )`,
          [id.run, id.courseA, id.orgA, JSON.stringify([degradedQuestion()]), id.gate]
        )
      )
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('denies cross-tenant authenticated ordinary auto-answer', async () => {
    await admin.query(
      `INSERT INTO clarifying_questions(id,course_id,question_category,suggested_answers)
       VALUES ('80000000-0000-4000-8000-000000000099',$1,'general','[{"text":"A"}]')`,
      [id.courseA]
    );
    await expect(
      asRole(admin, 'authenticated', id.orgB, () =>
        admin.query('SELECT public.auto_answer_questions_atomic($1)', [id.courseA])
      )
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('keeps retry lineage and subject-key helpers private behind scoped wrappers', async () => {
    await expect(
      asRole(admin, 'authenticated', id.orgA, () =>
        admin.query('SELECT public.document_evidence_retry_attempt($1,$2)', [id.courseA, id.docC])
      )
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asRole(admin, 'authenticated', id.orgA, () =>
        admin.query(`SELECT public.document_evidence_subject_key($1,'degraded_evidence',NULL,$2)`, [
          id.run,
          id.docC,
        ])
      )
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('rejects user-supplied origin fields', async () => {
    await expect(
      answer(admin, {
        idempotencyKey: '90000000-0000-4000-8000-000000000010',
        expected: systemDecisionId,
        extra: { resolved_by: 'system' },
      })
    ).rejects.toMatchObject({ code: '22023' });
  });

  it('forces the first user override origin and supersedes the system decision', async () => {
    const result = await answer(admin, {
      idempotencyKey: '90000000-0000-4000-8000-000000000011',
      expected: systemDecisionId,
    });
    currentUserDecisionId = result.rows[0].result.decision_ids[0];
    const row = await admin.query(
      `SELECT resolved_by,answer_source,supersedes_decision_id,selected_recommendation_value
       FROM document_evidence_decisions WHERE id=$1`,
      [currentUserDecisionId]
    );
    expect(row.rows[0]).toMatchObject({
      resolved_by: 'user',
      answer_source: 'suggested',
      supersedes_decision_id: systemDecisionId,
      selected_recommendation_value: 'mandatory',
    });
  });

  it('reuses an identical user idempotency key without appending', async () => {
    const result = await answer(admin, {
      idempotencyKey: '90000000-0000-4000-8000-000000000011',
      expected: systemDecisionId,
    });
    expect(result.rows[0].result.decision_ids).toEqual([currentUserDecisionId]);
    expect(
      (await admin.query('SELECT count(*) FROM document_evidence_decisions')).rows[0].count
    ).toBe('5');
  });

  it('does not reuse another authenticated actor audit under the same idempotency key', async () => {
    await expect(
      answer(
        admin,
        {
          idempotencyKey: '90000000-0000-4000-8000-000000000011',
          expected: systemDecisionId,
        },
        id.orgA,
        '50000000-0000-4000-8000-000000000098'
      )
    ).rejects.toMatchObject({ code: '23514' });
    const audit = await admin.query(
      `SELECT actor_user_id,actor_provenance FROM document_evidence_decisions WHERE id=$1`,
      [currentUserDecisionId]
    );
    expect(audit.rows[0]).toMatchObject({
      actor_user_id: '50000000-0000-4000-8000-000000000099',
      actor_provenance: 'authenticated',
    });
  });

  it('appends a later user supersede only with the exact expected current decision', async () => {
    const result = await answer(admin, {
      answer: 'Use mandatory approval with a note',
      answerSource: 'modified',
      idempotencyKey: '90000000-0000-4000-8000-000000000012',
      expected: currentUserDecisionId,
    });
    const next = result.rows[0].result.decision_ids[0];
    expect(next).not.toBe(currentUserDecisionId);
    currentUserDecisionId = next;
  });

  it('rejects stale expected-current and permits only one concurrent successor', async () => {
    await expect(
      answer(admin, {
        idempotencyKey: '90000000-0000-4000-8000-000000000013',
        expected: systemDecisionId,
      })
    ).rejects.toMatchObject({ code: '40001' });
    const clientA = new Client({ connectionString: databaseUrl });
    const clientB = new Client({ connectionString: databaseUrl });
    await Promise.all([clientA.connect(), clientB.connect()]);
    try {
      const results = await Promise.allSettled([
        answer(clientA, {
          idempotencyKey: '90000000-0000-4000-8000-000000000014',
          expected: currentUserDecisionId,
        }),
        answer(clientB, {
          idempotencyKey: '90000000-0000-4000-8000-000000000015',
          expected: currentUserDecisionId,
        }),
      ]);
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    } finally {
      await Promise.all([clientA.end(), clientB.end()]);
    }
  });

  it('rejects cross-tenant and cross-question/run scope', async () => {
    await expect(
      answer(
        admin,
        {
          idempotencyKey: '90000000-0000-4000-8000-000000000016',
          expected: currentUserDecisionId,
        },
        id.orgB
      )
    ).rejects.toMatchObject({ code: '42501' });
    const wrong = degradedQuestion();
    wrong.metadata.run_id = '10000000-0000-4000-8000-000000000099';
    await expect(
      materialize('manual', [wrong], '90000000-0000-4000-8000-000000000017')
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('blocks stage exit for a material orphan even when the caller intends force', async () => {
    await admin.query(
      `INSERT INTO document_evidence_conflicts(
         id,run_id,course_id,organization_id,conflict_fingerprint,topic,severity,sides,
         course_impact,recommended_resolution,recommendation_rationale,alternatives,
         detection_model,detection_version
       )
       SELECT $1,run_id,course_id,organization_id,'sha256:additional','Additional','important',sides,
         course_impact,recommended_resolution,recommendation_rationale,alternatives,
         detection_model,detection_version
       FROM document_evidence_conflicts WHERE id=$2`,
      [id.additionalConflict, id.conflict]
    );
    await materialize(
      'manual',
      [additionalConflictQuestion()],
      '90000000-0000-4000-8000-000000000018'
    );
    await admin.query(`UPDATE clarifying_questions SET status='skipped' WHERE id=$1`, [
      id.additionalConflictQuestion,
    ]);
    await expect(
      admin.query(`UPDATE courses SET generation_status='stage_5' WHERE id=$1`, [id.courseA])
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('does not let informational conflicts block after all material subjects are decided', async () => {
    await asRole(admin, 'authenticated', id.orgA, () =>
      admin.query('SELECT public.answer_document_evidence_questions_atomic($1,$2::jsonb)', [
        id.courseA,
        JSON.stringify([
          {
            question_id: id.additionalConflictQuestion,
            answer: 'Use mandatory approval',
            answer_source: 'suggested',
            selected_suggestion_index: 1,
            idempotency_key: '90000000-0000-4000-8000-000000000019',
            expected_current_decision_id: null,
          },
        ]),
      ])
    );
    await expect(
      admin.query(`UPDATE courses SET generation_status='stage_5' WHERE id=$1`, [id.courseA])
    ).resolves.toBeDefined();
  });

  it('materializes degraded and detector-capacity subjects without fake conflicts', async () => {
    await admin.query(`UPDATE courses SET generation_status='stage_4_clarifying' WHERE id=$1`, [
      id.courseA,
    ]);
    const subjects = await admin.query(
      `SELECT metadata->>'subject_kind' AS kind FROM clarifying_questions
       WHERE id IN ($1,$2) ORDER BY kind`,
      [id.degradedQuestion, id.capacityQuestion]
    );
    expect(subjects.rows.map(row => row.kind)).toEqual(['degraded_evidence', 'detector_capacity']);
  });

  it('rejects conflict fingerprint collisions and non-allowlisted source refs', async () => {
    const badConflict = {
      conflict_id: '60000000-0000-4000-8000-000000000099',
      conflict_fingerprint: 'sha256:new',
      topic: 'Bad',
      severity: 'important',
      sides: [
        {
          statement: 'Bad',
          claim_ids: [id.claimA],
          document_ids: [id.docA],
          source_refs: [{ document_id: id.docA, page_number: 999, version_hash: 'wrong' }],
        },
        {
          statement: 'Optional',
          claim_ids: [id.claimB],
          document_ids: [id.docB],
          source_refs: [{ document_id: id.docB, page_number: 3, version_hash: 'hash-b' }],
        },
      ],
      course_impact: 'Bad',
      recommended_resolution: 'Bad',
      recommendation_rationale: 'Bad',
      alternatives: ['Bad'],
    };
    await expect(
      asRole(admin, 'service_role', id.orgA, () =>
        admin.query(
          `SELECT public.commit_document_evidence_conflict_batch(
             $1,$2,$3,'bad:1','hash',$4::jsonb,$5::jsonb,'test','v1','verified','[]'
           )`,
          [
            id.run,
            id.courseA,
            id.orgA,
            JSON.stringify({ kind: 'test' }),
            JSON.stringify([badConflict]),
          ]
        )
      )
    ).rejects.toMatchObject({ code: '23514' });
    const collision = {
      ...badConflict,
      conflict_id: id.conflict,
      conflict_fingerprint: 'sha256:material',
      topic: 'Different but structurally valid approval rule',
      sides: [
        {
          statement: 'Mandatory',
          claim_ids: [id.claimA],
          document_ids: [id.docA],
          source_refs: [{ document_id: id.docA, page_number: 2, version_hash: 'hash-a' }],
        },
        {
          statement: 'Optional',
          claim_ids: [id.claimB],
          document_ids: [id.docB],
          source_refs: [{ document_id: id.docB, page_number: 3, version_hash: 'hash-b' }],
        },
      ],
    };
    await expect(
      asRole(admin, 'service_role', id.orgA, () =>
        admin.query(
          `SELECT public.commit_document_evidence_conflict_batch(
             $1,$2,$3,'bad:2','hash',$4::jsonb,$5::jsonb,'test','v1','verified','[]'
           )`,
          [
            id.run,
            id.courseA,
            id.orgA,
            JSON.stringify({ kind: 'test' }),
            JSON.stringify([collision]),
          ]
        )
      )
    ).rejects.toBeDefined();
  });

  it('rolls back to E1 and reapplies E3 on PostgreSQL 15', async () => {
    await expect(admin.query(rollback)).rejects.toThrow(/Cannot roll back E3/i);
    await resetDatabase(false, false);
    await admin.query(rollback);
    expect(
      (
        await admin.query(
          `SELECT to_regprocedure('materialize_document_evidence_decision_gate_atomic(uuid,uuid,uuid,text,jsonb,uuid)') AS gate`
        )
      ).rows[0].gate
    ).toBeNull();
    await admin.query(
      `INSERT INTO document_evidence_decisions(
         id,run_id,conflict_id,course_id,organization_id,selected_resolution,rationale,
         resolved_by,answer_source
       ) VALUES ('70000000-0000-4000-8000-000000000097',$1,$2,$3,$4,
         'Legacy answer','Legacy E1 audit','user','custom')`,
      [id.run, id.conflict, id.courseA, id.orgA]
    );
    await admin.query(migration);
    expect(
      (
        await admin.query(
          `SELECT to_regprocedure('materialize_document_evidence_decision_gate_atomic(uuid,uuid,uuid,text,jsonb,uuid)') AS gate`
        )
      ).rows[0].gate
    ).not.toBeNull();
    const upgraded = await admin.query(
      `SELECT subject_key,actor_user_id,actor_provenance
       FROM document_evidence_decisions WHERE id='70000000-0000-4000-8000-000000000097'`
    );
    expect(upgraded.rows[0]).toEqual({
      subject_key: subjectKey(id.run, `conflict:${id.conflict}`),
      actor_user_id: null,
      actor_provenance: 'legacy_unknown',
    });
  });

  it('materializes only the canonical terminal unrecoverable decision at retry zero', async () => {
    await resetTerminalUnrecoverableDatabase();

    const question = terminalUnrecoverableQuestion();
    const first = await materialize('automatic', [question]);
    expect(first.rows[0].result).toMatchObject({ reused: false });
    expect(first.rows[0].result.question_ids).toEqual([id.degradedQuestion]);
    expect(first.rows[0].result.decision_ids).toHaveLength(1);

    const audit = await admin.query(
      `SELECT d.id,d.run_id,d.course_id,d.organization_id,d.document_id,d.subject_kind,
              d.selected_resolution,d.selected_recommendation_value,d.resolved_by,d.answer_source,
              d.supersedes_decision_id,q.status AS question_status,q.answer_source AS question_source,
              q.selected_suggestion_index
       FROM document_evidence_decisions d
       JOIN clarifying_questions q ON q.id=d.clarifying_question_id
       WHERE d.run_id=$1 AND d.document_id=$2`,
      [id.run, id.docC]
    );
    expect(audit.rows).toEqual([
      expect.objectContaining({
        id: first.rows[0].result.decision_ids[0],
        run_id: id.run,
        course_id: id.courseA,
        organization_id: id.orgA,
        document_id: id.docC,
        subject_kind: 'degraded_evidence',
        selected_resolution: 'continue_limited',
        selected_recommendation_value: 'continue_limited',
        resolved_by: 'system',
        answer_source: 'system',
        supersedes_decision_id: null,
        question_status: 'answered',
        question_source: 'system',
        selected_suggestion_index: 0,
      }),
    ]);
    expect(
      (
        await admin.query(
          `SELECT
             (SELECT count(*) FROM document_evidence_runs WHERE course_id=$1) AS runs,
             (SELECT count(*) FROM document_evidence_retry_applications WHERE course_id=$1) AS retries,
             (SELECT count(*) FROM document_evidence_decisions WHERE run_id=$2) AS decisions`,
          [id.courseA, id.run]
        )
      ).rows[0]
    ).toEqual({ runs: '1', retries: '0', decisions: '1' });

    const replay = await materialize('automatic', [question]);
    expect(replay.rows[0].result).toMatchObject({
      reused: true,
      question_ids: [id.degradedQuestion],
      decision_ids: [first.rows[0].result.decision_ids[0]],
    });
    expect(
      (
        await admin.query(`SELECT count(*) FROM document_evidence_decisions WHERE run_id=$1`, [
          id.run,
        ])
      ).rows[0].count
    ).toBe('1');

    await expect(
      asRole(admin, 'service_role', id.orgA, () =>
        admin.query(
          `SELECT public.materialize_document_evidence_decision_gate_atomic(
             $1,$2,$3,'automatic',$4::jsonb,$5
           )`,
          [
            id.run,
            id.courseA,
            id.orgB,
            JSON.stringify([question]),
            '90000000-0000-4000-8000-000000000091',
          ]
        )
      )
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('uses the resolver value fallback for canonical terminal choices', async () => {
    await resetTerminalUnrecoverableDatabase();
    const question = terminalUnrecoverableQuestion({}, [
      {
        text: 'continue_limited',
        rationale: 'Retain the limitation',
        is_recommended: true,
      },
      {
        text: 'remove_document',
        rationale: 'Keep source history only',
        is_recommended: false,
      },
    ]);

    const result = await materialize(
      'automatic',
      [question],
      '90000000-0000-4000-8000-000000000090'
    );
    expect(result.rows[0].result.decision_ids).toHaveLength(1);
    expect(
      (
        await admin.query(
          `SELECT selected_recommendation_value FROM document_evidence_decisions
           WHERE run_id=$1 AND document_id=$2`,
          [id.run, id.docC]
        )
      ).rows[0].selected_recommendation_value
    ).toBe('continue_limited');
  });

  it.each([
    ['durable degraded reason', 'degraded', 'parse_failed', {}, undefined, '23514'],
    ['durable failed reason', 'failed', 'parse_failed', {}, undefined, '23514'],
    [
      'forged degraded status',
      'failed',
      'source_file_unrecoverable',
      { coverage_status: 'degraded' },
      undefined,
      '23514',
    ],
    [
      'forged failed reason',
      'failed',
      'source_file_unrecoverable',
      { coverage_reason: 'parse_failed' },
      undefined,
      '23514',
    ],
    [
      'missing status',
      'failed',
      'source_file_unrecoverable',
      { coverage_status: null },
      undefined,
      '23514',
    ],
    [
      'missing reason',
      'failed',
      'source_file_unrecoverable',
      { coverage_reason: null },
      undefined,
      '23514',
    ],
    [
      'missing max attempts',
      'failed',
      'source_file_unrecoverable',
      { max_attempts: null },
      undefined,
      '22023',
    ],
    [
      'actual extra retry',
      'failed',
      'source_file_unrecoverable',
      {},
      [
        {
          value: 'continue_limited',
          text: 'Continue with limited evidence',
          rationale: 'Retain the limitation',
          is_recommended: true,
        },
        {
          value: 'remove_document',
          text: 'Exclude advisory evidence',
          rationale: 'Keep source history only',
          is_recommended: false,
        },
        {
          value: 'retry',
          text: 'Retry source processing',
          rationale: 'Try processing again',
          is_recommended: false,
        },
      ],
      '23514',
    ],
    [
      'actual missing remove_document',
      'failed',
      'source_file_unrecoverable',
      {},
      [
        {
          value: 'continue_limited',
          text: 'Continue with limited evidence',
          rationale: 'Retain the limitation',
          is_recommended: true,
        },
      ],
      '23514',
    ],
    [
      'actual duplicate values',
      'failed',
      'source_file_unrecoverable',
      {},
      [
        {
          value: 'continue_limited',
          text: 'Continue with limited evidence',
          rationale: 'Retain the limitation',
          is_recommended: true,
        },
        {
          value: 'remove_document',
          text: 'Exclude advisory evidence',
          rationale: 'Keep source history only',
          is_recommended: false,
        },
        {
          value: 'remove_document',
          text: 'Exclude the same advisory evidence again',
          rationale: 'Duplicate values are invalid',
          is_recommended: false,
        },
      ],
      '23514',
    ],
    [
      'actual order disagrees with metadata choices',
      'failed',
      'source_file_unrecoverable',
      {},
      [
        {
          value: 'remove_document',
          text: 'Exclude advisory evidence',
          rationale: 'Keep source history only',
          is_recommended: false,
        },
        {
          value: 'continue_limited',
          text: 'Continue with limited evidence',
          rationale: 'Retain the limitation',
          is_recommended: true,
        },
      ],
      '23514',
    ],
    [
      'another recommendation',
      'failed',
      'source_file_unrecoverable',
      {},
      [
        {
          value: 'remove_document',
          text: 'Exclude advisory evidence',
          rationale: 'Keep source history only',
          is_recommended: true,
        },
        {
          value: 'continue_limited',
          text: 'Continue with limited evidence',
          rationale: 'Retain the limitation',
          is_recommended: false,
        },
      ],
      '23514',
    ],
  ])(
    'fails closed below max attempts for %s',
    async (_label, durableStatus, durableReason, metadata, answers, expectedCode) => {
      await resetTerminalUnrecoverableDatabase(
        durableStatus as 'degraded' | 'failed',
        durableReason as string
      );
      const question = terminalUnrecoverableQuestion(
        metadata,
        answers ?? terminalUnrecoverableQuestion().suggestedAnswers,
        { status: durableStatus as 'degraded' | 'failed', reason: durableReason as string }
      );
      await expect(
        materialize(
          'automatic',
          [question],
          `90000000-0000-4000-8000-0000000000${String(
            [
              'durable degraded reason',
              'durable failed reason',
              'forged degraded status',
              'forged failed reason',
              'missing status',
              'missing reason',
              'missing max attempts',
              'actual extra retry',
              'actual missing remove_document',
              'actual duplicate values',
              'actual order disagrees with metadata choices',
              'another recommendation',
            ].indexOf(_label) + 2
          ).padStart(2, '0')}`
        )
      ).rejects.toMatchObject({ code: expectedCode });
      expect((await admin.query(`SELECT count(*) FROM clarifying_questions`)).rows[0].count).toBe(
        '0'
      );
      expect(
        (await admin.query(`SELECT count(*) FROM document_evidence_decisions`)).rows[0].count
      ).toBe('0');
    }
  );

  it('persists and restores the full manual zero-system-decision snapshot', async () => {
    await resetDatabase(true, true);
    const first = await materialize('manual', allDurableQuestions());
    expect(first.rows[0].result.decision_ids).toEqual([]);
    const snapshot = (
      await admin.query(
        `SELECT analysis_result->'document_evidence' AS value FROM courses WHERE id=$1`,
        [id.courseA]
      )
    ).rows[0].value;
    expect(snapshot).toMatchObject({
      accepted_run_id: id.run,
      coverage: {
        source_count: 3,
        assessed_count: 2,
        degraded_count: 1,
        failed_count: 0,
      },
      current_decision_ids: [],
      unresolved_informational_conflict_ids: [id.informational],
    });
    await admin.query(
      `UPDATE courses SET analysis_result=analysis_result-'document_evidence' WHERE id=$1`,
      [id.courseA]
    );
    const replay = await materialize('manual', allDurableQuestions());
    expect(replay.rows[0].result.reused).toBe(true);
    const restored = (
      await admin.query(
        `SELECT analysis_result->'document_evidence' AS value FROM courses WHERE id=$1`,
        [id.courseA]
      )
    ).rows[0].value;
    expect(restored).toEqual(snapshot);
  });

  it('supports the analyzing-to-manual-pause-to-approved transition path', async () => {
    await resetDatabase(true, true);
    await admin.query(
      'ALTER TABLE courses DISABLE TRIGGER guard_document_evidence_course_transition'
    );
    await admin.query(`UPDATE courses SET generation_status='stage_4_analyzing' WHERE id=$1`, [
      id.courseA,
    ]);
    await admin.query(
      'ALTER TABLE courses ENABLE TRIGGER guard_document_evidence_course_transition'
    );
    await materialize('manual', allDurableQuestions());
    await expect(
      admin.query(`UPDATE courses SET generation_status='stage_4_clarifying' WHERE id=$1`, [
        id.courseA,
      ])
    ).resolves.toBeDefined();
    await expect(
      admin.query(`UPDATE courses SET generation_status='stage_4_analyzing' WHERE id=$1`, [
        id.courseA,
      ])
    ).rejects.toMatchObject({ code: '23514' });
    await materialize('automatic', allDurableQuestions(), '90000000-0000-4000-8000-000000000096');
    await expect(
      admin.query(`UPDATE courses SET generation_status='stage_4_analyzing' WHERE id=$1`, [
        id.courseA,
      ])
    ).resolves.toBeDefined();
  });

  it('atomically materializes the exact 1000-subject manual gate without partial questions', async () => {
    await resetDatabase(false, false, false, 1000);
    const questions = largeDegradedQuestions(1000);
    const invalid = structuredClone(questions);
    invalid[999].metadata.subject_key = 'sha256:foreign';
    await expect(materialize('manual', invalid)).rejects.toMatchObject({ code: '23514' });
    expect((await admin.query('SELECT count(*) FROM clarifying_questions')).rows[0].count).toBe(
      '0'
    );
    const oversized = questions.map((question, index) =>
      index === 0 ? { ...question, questionText: 'x'.repeat(16_777_216) } : question
    );
    await expect(
      materialize('manual', oversized, '90000000-0000-4000-8000-000000000095')
    ).rejects.toMatchObject({ code: '22023' });
    expect((await admin.query('SELECT count(*) FROM clarifying_questions')).rows[0].count).toBe(
      '0'
    );
    const result = await materialize('manual', questions);
    expect(result.rows[0].result.question_ids).toHaveLength(1000);
    expect(result.rows[0].result.decision_ids).toEqual([]);
    expect((await admin.query('SELECT count(*) FROM clarifying_questions')).rows[0].count).toBe(
      '1000'
    );
    const snapshot = (
      await admin.query(
        `SELECT analysis_result->'document_evidence' AS value FROM courses WHERE id=$1`,
        [id.courseA]
      )
    ).rows[0].value;
    expect(snapshot).toMatchObject({
      accepted_run_id: id.run,
      coverage: { source_count: 1000, degraded_count: 1000 },
      current_decision_ids: [],
      unresolved_informational_conflict_ids: [],
    });
  }, 30_000);

  it.each([51, 1000])(
    'recovers and atomically links the full %i-document pending retry set',
    async count => {
      await resetDatabase(false, false, false, count);
      await admin.query(
        `INSERT INTO document_evidence_decisions(
           run_id,course_id,organization_id,selected_resolution,rationale,resolved_by,answer_source,
           selected_recommendation_value,subject_kind,subject_key,document_id
         )
         SELECT items.run_id,items.course_id,items.organization_id,'retry','Bounded transient retry',
           'system','system','retry','degraded_evidence',
           public.document_evidence_subject_key(items.run_id,'degraded_evidence',NULL,items.document_id),
           items.document_id
         FROM document_evidence_items items WHERE items.run_id=$1`,
        [id.run]
      );
      const firstPending = await asRole(admin, 'service_role', id.orgA, () =>
        admin.query('SELECT public.get_document_evidence_retry_directives($1,2) AS result', [
          id.courseA,
        ])
      );
      const replayedPending = await asRole(admin, 'service_role', id.orgA, () =>
        admin.query('SELECT public.get_document_evidence_retry_directives($1,2) AS result', [
          id.courseA,
        ])
      );
      expect(firstPending.rows[0].result).toHaveLength(count);
      expect(replayedPending.rows[0].result).toEqual(firstPending.rows[0].result);
      await admin.query(
        `INSERT INTO document_evidence_runs(
           id,course_id,organization_id,input_fingerprint,evidence_version,status,source_manifest
         ) SELECT $1,course_id,organization_id,'fp-large-target',evidence_version,'processing',source_manifest
           FROM document_evidence_runs WHERE id=$2`,
        [id.retryTarget, id.run]
      );
      await admin.query(
        `INSERT INTO document_evidence_items(
           run_id,course_id,organization_id,document_id,source_version_hash,document_name,
           priority,authority_scope,content_quality,course_relevance,processing_mode,summary,claims,
           coverage_status,coverage_reason,original_tokens,summary_tokens,allocated_tokens
         ) SELECT $1,course_id,organization_id,document_id,source_version_hash,document_name,
           priority,authority_scope,content_quality,course_relevance,processing_mode,summary,claims,
           coverage_status,coverage_reason,original_tokens,summary_tokens,allocated_tokens
         FROM document_evidence_items WHERE run_id=$2`,
        [id.retryTarget, id.run]
      );
      await admin.query(
        `UPDATE document_evidence_runs SET status='accepted',degraded_count=$2,completed_at=now()
         WHERE id=$1`,
        [id.retryTarget, count]
      );
      const decisionIds = firstPending.rows[0].result.map(
        (value: { decision_id: string }) => value.decision_id
      );
      const consumed = await asRole(admin, 'service_role', id.orgA, () =>
        admin.query(
          'SELECT public.consume_document_evidence_retry_directives($1,$2,$3,$4::jsonb) AS result',
          [id.courseA, id.orgA, id.retryTarget, JSON.stringify(decisionIds)]
        )
      );
      expect(consumed.rows[0].result).toMatchObject({ reused: false });
      expect(consumed.rows[0].result.decision_ids).toHaveLength(count);
      const replay = await asRole(admin, 'service_role', id.orgA, () =>
        admin.query(
          'SELECT public.consume_document_evidence_retry_directives($1,$2,$3,$4::jsonb) AS result',
          [id.courseA, id.orgA, id.retryTarget, JSON.stringify(decisionIds)]
        )
      );
      expect(replay.rows[0].result).toMatchObject({ reused: true });
      expect(
        (await admin.query('SELECT count(*) FROM document_evidence_retry_applications')).rows[0]
          .count
      ).toBe(String(count));
    },
    30_000
  );

  it('recovers the exact pending multi-document retry set and counts only an applied target run', async () => {
    await resetDatabase(false, true, true);
    const recorded = await asRole(admin, 'service_role', id.orgA, () =>
      admin.query(
        `SELECT public.record_document_evidence_automatic_retry(
          $1,$2,$3,$4,2,$5
        ) AS result`,
        [id.run, id.courseA, id.orgA, id.docC, '90000000-0000-4000-8000-000000000099']
      )
    );
    expect(recorded.rows[0].result).toMatchObject({
      document_id: id.docC,
      attempt: 1,
      max_attempts: 2,
      reused: false,
    });
    const replayed = await asRole(admin, 'service_role', id.orgA, () =>
      admin.query(
        `SELECT public.record_document_evidence_automatic_retry(
          $1,$2,$3,$4,2,$5
        ) AS result`,
        [id.run, id.courseA, id.orgA, id.docC, '90000000-0000-4000-8000-000000000099']
      )
    );
    expect(replayed.rows[0].result).toMatchObject({
      decision_id: recorded.rows[0].result.decision_id,
      document_id: id.docC,
      attempt: 1,
      max_attempts: 2,
      reused: true,
    });
    const second = await asRole(admin, 'service_role', id.orgA, () =>
      admin.query(
        `SELECT public.record_document_evidence_automatic_retry(
          $1,$2,$3,$4,2,$5
        ) AS result`,
        [id.run, id.courseA, id.orgA, id.docB, '90000000-0000-4000-8000-000000000098']
      )
    );
    const pending = await asRole(admin, 'service_role', id.orgA, () =>
      admin.query('SELECT public.get_document_evidence_retry_directives($1,2) AS result', [
        id.courseA,
      ])
    );
    expect(pending.rows[0].result).toEqual([
      expect.objectContaining({
        decision_id: second.rows[0].result.decision_id,
        document_id: id.docB,
        attempt: 1,
      }),
      expect.objectContaining({
        decision_id: recorded.rows[0].result.decision_id,
        document_id: id.docC,
        attempt: 1,
      }),
    ]);
    const manifest = [
      { document_id: id.docA, source_version_hash: 'hash-a', document_name: 'A.pdf' },
      { document_id: id.docB, source_version_hash: 'hash-b', document_name: 'B.pdf' },
      { document_id: id.docC, source_version_hash: 'hash-c', document_name: 'C.pdf' },
    ];
    await admin.query(
      `INSERT INTO document_evidence_runs(
         id,course_id,organization_id,input_fingerprint,evidence_version,status,source_manifest
       ) VALUES ($1,$2,$3,'fp-retry-target','e2-v1','processing',$4::jsonb)`,
      [id.retryTarget, id.courseA, id.orgA, JSON.stringify(manifest)]
    );
    await admin.query(
      `INSERT INTO document_evidence_items(
         run_id,course_id,organization_id,document_id,source_version_hash,document_name,
         priority,authority_scope,content_quality,course_relevance,processing_mode,summary,claims,
         coverage_status,coverage_reason,original_tokens,summary_tokens,allocated_tokens
       ) SELECT $1,course_id,organization_id,document_id,source_version_hash,document_name,
         priority,authority_scope,content_quality,course_relevance,processing_mode,summary,claims,
         coverage_status,coverage_reason,original_tokens,summary_tokens,allocated_tokens
       FROM document_evidence_items WHERE run_id=$2`,
      [id.retryTarget, id.run]
    );
    await admin.query(
      `UPDATE document_evidence_runs SET status='accepted',assessed_count=1,degraded_count=2,
         completed_at=now() WHERE id=$1`,
      [id.retryTarget]
    );
    const decisionIds = pending.rows[0].result.map(
      (value: { decision_id: string }) => value.decision_id
    );
    const consumed = await asRole(admin, 'service_role', id.orgA, () =>
      admin.query(
        'SELECT public.consume_document_evidence_retry_directives($1,$2,$3,$4::jsonb) AS result',
        [id.courseA, id.orgA, id.retryTarget, JSON.stringify(decisionIds)]
      )
    );
    expect(consumed.rows[0].result).toMatchObject({ target_run_id: id.retryTarget, reused: false });
    const consumedReplay = await asRole(admin, 'service_role', id.orgA, () =>
      admin.query(
        'SELECT public.consume_document_evidence_retry_directives($1,$2,$3,$4::jsonb) AS result',
        [id.courseA, id.orgA, id.retryTarget, JSON.stringify(decisionIds)]
      )
    );
    expect(consumedReplay.rows[0].result).toMatchObject({ reused: true });
    const after = await asRole(admin, 'service_role', id.orgA, () =>
      admin.query('SELECT public.get_document_evidence_retry_directives($1,2) AS result', [
        id.courseA,
      ])
    );
    expect(after.rows[0].result).toEqual([]);
    const attempts = await admin.query(
      `SELECT document_id, public.document_evidence_retry_attempt($1, document_id) AS attempt
       FROM document_evidence_items WHERE run_id=$2 AND document_id IN ($3,$4)
       ORDER BY document_id`,
      [id.courseA, id.run, id.docB, id.docC]
    );
    expect(attempts.rows.map(row => row.attempt)).toEqual([1, 1]);
  });
});
