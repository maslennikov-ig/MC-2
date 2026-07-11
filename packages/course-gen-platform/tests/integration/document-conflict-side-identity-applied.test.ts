import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DOCUMENT_EVIDENCE_DATABASE_URL;
const appliedDescribe = databaseUrl ? describe.sequential : describe.skip;
const evidenceMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260711120000_document_evidence.sql'),
  'utf8'
);
const e3Migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260711130000_document_conflict_auto_answers.sql'),
  'utf8'
);
const sideMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260711140000_document_conflict_side_identity.sql'),
  'utf8'
);
const sideRollback = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/rollback/20260711140000_document_conflict_side_identity_rollback.sql'
  ),
  'utf8'
);

const id = {
  org: '30000000-0000-4000-8000-000000000001',
  course: '20000000-0000-4000-8000-000000000001',
  run: '10000000-0000-4000-8000-000000000001',
  docA: '40000000-0000-4000-8000-000000000001',
  docB: '40000000-0000-4000-8000-000000000002',
  claimA: '50000000-0000-4000-8000-000000000001',
  claimB: '50000000-0000-4000-8000-000000000002',
  conflict: '60000000-0000-4000-8000-000000000001',
  decision: '70000000-0000-4000-8000-000000000001',
  question: '80000000-0000-4000-8000-000000000001',
  actor: '50000000-0000-4000-8000-000000000099',
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const sideHandle = (conflictId: string, claimIds: string[]) =>
  `side:v1:${sha256(
    `document-conflict-side-v1|${conflictId}|${[...new Set(claimIds)].sort().join(',')}`
  )}`;
const subjectKey = () =>
  `sha256:${sha256(`document-evidence-subject-v1:${id.run}:conflict:${id.conflict}`)}`;

let admin: Client;

function assertDisposableDatabaseUrl(value: string): string {
  const parsed = new URL(value);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
    !/_test$/u.test(parsed.pathname.replace(/^\//u, ''))
  ) {
    throw new Error('Side-identity applied tests require a loopback disposable _test database');
  }
  return value;
}

async function asRole<T>(
  role: 'service_role' | 'authenticated',
  operation: () => Promise<T>
): Promise<T> {
  await admin.query('BEGIN');
  try {
    await admin.query(`SELECT set_config('request.jwt.claims',$1,true)`, [
      JSON.stringify({ role, organization_id: id.org, sub: id.actor }),
    ]);
    await admin.query(`SET LOCAL ROLE ${role}`);
    const result = await operation();
    await admin.query('COMMIT');
    return result;
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
}

async function resetBase(): Promise<void> {
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
  await admin.query(e3Migration);
  await admin.query(`INSERT INTO organizations(id) VALUES ($1)`, [id.org]);
  await admin.query(`INSERT INTO courses(id,organization_id) VALUES ($1,$2)`, [id.course, id.org]);
}

async function seedAcceptedRun(statements: [string, string]): Promise<void> {
  const manifest = [
    { document_id: id.docA, source_version_hash: 'hash-a', document_name: 'A.pdf' },
    { document_id: id.docB, source_version_hash: 'hash-b', document_name: 'B.pdf' },
  ];
  await admin.query(
    `INSERT INTO document_evidence_runs(
       id,course_id,organization_id,input_fingerprint,evidence_version,status,source_manifest
     ) VALUES ($1,$2,$3,'fp-side','e2-v1','processing',$4::jsonb)`,
    [id.run, id.course, id.org, JSON.stringify(manifest)]
  );
  for (const [index, values] of [
    [0, [id.docA, id.claimA, 'hash-a', 'A.pdf', statements[0]]],
    [1, [id.docB, id.claimB, 'hash-b', 'B.pdf', statements[1]]],
  ] as const) {
    await admin.query(
      `INSERT INTO document_evidence_items(
         run_id,course_id,organization_id,document_id,source_version_hash,document_name,
         priority,authority_scope,content_quality,course_relevance,processing_mode,summary,claims,
         coverage_status,coverage_reason,original_tokens,summary_tokens,allocated_tokens
       ) VALUES ($1,$2,$3,$4,$5,$6,'IMPORTANT','course_source',.8,.9,'summary','summary',
         $7::jsonb,'assessed','complete',100,20,20)`,
      [
        id.run,
        id.course,
        id.org,
        values[0],
        values[2],
        values[3],
        JSON.stringify([
          {
            claim_id: values[1],
            statement: values[4],
            confidence: 0.9,
            source_refs: [
              { document_id: values[0], chunk_id: `chunk-${index}`, version_hash: values[2] },
            ],
          },
        ]),
      ]
    );
  }
  await admin.query(
    `UPDATE document_evidence_runs
     SET status='accepted',assessed_count=2,completed_at=now() WHERE id=$1`,
    [id.run]
  );
}

async function insertConflict(input: {
  sides: unknown[];
  recommendation: string;
  alternatives: string[];
}): Promise<void> {
  await admin.query(
    `INSERT INTO document_evidence_conflicts(
       id,run_id,course_id,organization_id,conflict_fingerprint,topic,severity,sides,
       claim_ids,source_refs,course_impact,recommended_resolution,recommendation_rationale,
       alternatives,detection_model,detection_version,semantic_payload_hash,verification_status
     ) VALUES ($1,$2,$3,$4,'fp-side','Retention','important',$5::jsonb,$6::jsonb,'[]',
       'Changes guidance',$7,'Authority wins',$8::jsonb,'test','v1','sha256:semantic','verified')`,
    [
      id.conflict,
      id.run,
      id.course,
      id.org,
      JSON.stringify(input.sides),
      JSON.stringify([id.claimA, id.claimB]),
      input.recommendation,
      JSON.stringify(input.alternatives),
    ]
  );
}

async function insertLegacyRecommendationDecision(
  selectedResolution: string,
  selectedRecommendationValue: string | null = `recommendation:${id.conflict}`
): Promise<void> {
  await admin.query(
    `INSERT INTO document_evidence_decisions(
       id,run_id,conflict_id,course_id,organization_id,selected_resolution,rationale,
       resolved_by,answer_source,selected_recommendation_index,selected_recommendation_value,
       subject_kind,subject_key
     ) VALUES ($1,$2,$3,$4,$5,$6,'Legacy recommendation','system','system',0,$7,
       'claim_conflict',$8)`,
    [
      id.decision,
      id.run,
      id.conflict,
      id.course,
      id.org,
      selectedResolution,
      selectedRecommendationValue,
      subjectKey(),
    ]
  );
}

function conflictQuestionInput(input: {
  recommendation: string;
  alternative: string;
  sideHandles?: [string, string];
}) {
  const [recommendedHandle, alternativeHandle] = input.sideHandles ?? [];
  return {
    questionId: id.question,
    questionText: 'Which retention rule should the course use?',
    priority: 'important',
    suggestedAnswers: [
      {
        value: alternativeHandle ?? `alternative:${id.conflict}:0`,
        text: input.alternative,
        rationale: 'Authority wins',
        is_recommended: false,
      },
      {
        value: recommendedHandle ?? `recommendation:${id.conflict}`,
        text: input.recommendation,
        rationale: 'Authority wins',
        is_recommended: true,
      },
    ],
    metadata: {
      schema_version: 'document-conflict-question-v1',
      subject_kind: 'claim_conflict',
      subject_key: subjectKey(),
      run_id: id.run,
      conflict_id: id.conflict,
      sides: [
        {
          ...(recommendedHandle ? { side_handle: recommendedHandle } : {}),
          excerpt: input.recommendation,
          source_refs: [],
          source_ref_overflow_count: 0,
        },
        {
          ...(alternativeHandle ? { side_handle: alternativeHandle } : {}),
          excerpt: input.alternative,
          source_refs: [],
          source_ref_overflow_count: 0,
        },
      ],
      recommendation: input.recommendation,
      ...(recommendedHandle ? { recommended_side_handle: recommendedHandle } : {}),
      recommendation_rationale: 'Authority wins',
      alternatives: [input.alternative],
      ...(alternativeHandle ? { alternative_side_handles: [alternativeHandle] } : {}),
    },
  };
}

async function insertLegacyConflictQuestion(recommendation: string, alternative: string) {
  const question = conflictQuestionInput({ recommendation, alternative });
  await admin.query(
    `INSERT INTO clarifying_questions(
       id,course_id,question_text,question_type,question_priority,question_category,
       suggested_answers,iteration_round,status,order_index,metadata
     ) VALUES ($1,$2,$3,'single_choice',$4,'document_conflicts',$5::jsonb,1,'pending',10000,$6::jsonb)`,
    [
      question.questionId,
      id.course,
      question.questionText,
      question.priority,
      JSON.stringify(question.suggestedAnswers),
      JSON.stringify(question.metadata),
    ]
  );
}

function rawSides(withIdentity: boolean): unknown[] {
  const handles = [sideHandle(id.conflict, [id.claimA]), sideHandle(id.conflict, [id.claimB])];
  return [id.claimA, id.claimB].map((claimId, index) => ({
    ...(withIdentity
      ? {
          side_handle: handles[index],
          side_role: index === 0 ? 'recommended' : 'alternative',
          ...(index === 1 ? { alternative_index: 0 } : {}),
        }
      : {}),
    statement: index === 0 ? 'Retain data 30 days.' : 'Retain data indefinitely.',
    claim_ids: [claimId],
    document_ids: [index === 0 ? id.docA : id.docB],
    source_refs: [
      {
        document_id: index === 0 ? id.docA : id.docB,
        chunk_id: `chunk-${index}`,
        version_hash: index === 0 ? 'hash-a' : 'hash-b',
      },
    ],
  }));
}

appliedDescribe('document conflict side identity applied PostgreSQL 15 matrix', () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: assertDisposableDatabaseUrl(databaseUrl!) });
    await admin.connect();
  }, 30_000);

  afterAll(async () => {
    await admin?.end();
  });

  it('backfills only exact unambiguous legacy sides and remains migration-idempotent', async () => {
    await resetBase();
    await seedAcceptedRun(['Retain data 30 days.', 'Retain data indefinitely.']);
    await insertConflict({
      sides: rawSides(false),
      recommendation: 'Retain data 30 days.',
      alternatives: ['Retain data indefinitely.'],
    });
    await insertLegacyRecommendationDecision('Retain data 30 days.');
    await admin.query(sideMigration);
    await admin.query(sideMigration);

    const row = (
      await admin.query(`SELECT sides FROM document_evidence_conflicts WHERE id=$1`, [id.conflict])
    ).rows[0];
    expect(row.sides).toMatchObject([
      { side_handle: sideHandle(id.conflict, [id.claimA]), side_role: 'recommended' },
      {
        side_handle: sideHandle(id.conflict, [id.claimB]),
        side_role: 'alternative',
        alternative_index: 0,
      },
    ]);
    expect(
      (
        await admin.query(
          `SELECT selected_side_handle FROM document_evidence_decisions WHERE id=$1`,
          [id.decision]
        )
      ).rows[0].selected_side_handle
    ).toBe(sideHandle(id.conflict, [id.claimA]));

    await resetBase();
    await seedAcceptedRun(['Retain data 30 days.', 'Retain data indefinitely.']);
    await insertConflict({
      sides: rawSides(false),
      recommendation: 'Retain data 30 days.',
      alternatives: ['Retain data indefinitely.'],
    });
    await insertLegacyRecommendationDecision('Retain data 30 days.', null);
    await admin.query(sideMigration);
    expect(
      (
        await admin.query(
          `SELECT selected_side_handle FROM document_evidence_decisions WHERE id=$1`,
          [id.decision]
        )
      ).rows[0].selected_side_handle
    ).toBeNull();

    await resetBase();
    const common = 'Retain data '.repeat(60);
    await seedAcceptedRun([`${common}30 days.`, `${common}indefinitely.`]);
    await insertConflict({
      sides: rawSides(false),
      recommendation: `${common}30 days.`.slice(0, 600),
      alternatives: [`${common}indefinitely.`.slice(0, 600)],
    });
    await insertLegacyConflictQuestion(
      `${common}30 days.`.slice(0, 600),
      `${common}indefinitely.`.slice(0, 600)
    );
    await insertLegacyRecommendationDecision(`${common}30 days.`.slice(0, 600));
    await admin.query(sideMigration);
    await admin.query(sideMigration);
    const ambiguous = (
      await admin.query(`SELECT sides FROM document_evidence_conflicts WHERE id=$1`, [id.conflict])
    ).rows[0].sides;
    expect(ambiguous.every((side: Record<string, unknown>) => side.side_handle)).toBe(true);
    expect(ambiguous.every((side: Record<string, unknown>) => !side.side_role)).toBe(true);
    expect(
      (
        await admin.query(
          `SELECT selected_side_handle FROM document_evidence_decisions WHERE id=$1`,
          [id.decision]
        )
      ).rows[0].selected_side_handle
    ).toBeNull();
    const blockedQuestion = (
      await admin.query(`SELECT suggested_answers,metadata FROM clarifying_questions WHERE id=$1`, [
        id.question,
      ])
    ).rows[0];
    expect(blockedQuestion.metadata.side_identity_migration).toBe('blocked_ambiguous');
    expect(blockedQuestion.suggested_answers.map((answer: { value: string }) => answer.value)).toEqual(
      [`alternative:${id.conflict}:0`, `recommendation:${id.conflict}`]
    );
    await expect(
      asRole('authenticated', () =>
        admin.query(
          `SELECT public.answer_document_evidence_questions_atomic($1,$2::jsonb) AS result`,
          [
            id.course,
            JSON.stringify([
              {
                question_id: id.question,
                answer: `${common}30 days.`.slice(0, 600),
                answer_source: 'suggested',
                selected_suggestion_index: 1,
                idempotency_key: '90000000-0000-4000-8000-000000000020',
                expected_current_decision_id: id.decision,
              },
            ]),
          ]
        )
      )
    ).rejects.toMatchObject({
      code: '23514',
      message: expect.stringMatching(/side identity migration is blocked/i),
    });
  });

  it('atomically upgrades a pending legacy question and reuses its stable payload', async () => {
    await resetBase();
    await seedAcceptedRun(['Retain data 30 days.', 'Retain data indefinitely.']);
    await insertConflict({
      sides: rawSides(false),
      recommendation: 'Retain data 30 days.',
      alternatives: ['Retain data indefinitely.'],
    });
    await insertLegacyConflictQuestion('Retain data 30 days.', 'Retain data indefinitely.');
    await admin.query(sideMigration);
    await admin.query(sideMigration);

    const handleA = sideHandle(id.conflict, [id.claimA]);
    const handleB = sideHandle(id.conflict, [id.claimB]);
    const question = (
      await admin.query(`SELECT suggested_answers,metadata FROM clarifying_questions WHERE id=$1`, [
        id.question,
      ])
    ).rows[0];
    expect(question.suggested_answers.map((answer: { value: string }) => answer.value)).toEqual([
      handleB,
      handleA,
    ]);
    expect(question.metadata).toMatchObject({
      recommended_side_handle: handleA,
      alternative_side_handles: [handleB],
      sides: [{ side_handle: handleA }, { side_handle: handleB }],
    });

    await expect(
      asRole('service_role', () =>
        admin.query(
          `SELECT public.materialize_document_evidence_decision_gate_atomic(
             $1,$2,$3,'manual',$4::jsonb,$5
           ) AS result`,
          [
            id.run,
            id.course,
            id.org,
            JSON.stringify([
              conflictQuestionInput({
                recommendation: 'Retain data 30 days.',
                alternative: 'Retain data indefinitely.',
                sideHandles: [handleA, handleB],
              }),
            ]),
            '90000000-0000-4000-8000-000000000021',
          ]
        )
      )
    ).resolves.toBeDefined();
    expect(
      (await admin.query(`SELECT count(*) FROM clarifying_questions WHERE id=$1`, [id.question]))
        .rows[0].count
    ).toBe('1');
  });

  it('blocks pending legacy questions whose conflict scope or complete side projection is missing', async () => {
    await resetBase();
    await seedAcceptedRun(['Retain data 30 days.', 'Retain data indefinitely.']);
    await insertLegacyConflictQuestion('Retain data 30 days.', 'Retain data indefinitely.');
    await admin.query(sideMigration);
    expect(
      (
        await admin.query(`SELECT metadata FROM clarifying_questions WHERE id=$1`, [id.question])
      ).rows[0].metadata
    ).toMatchObject({
      side_identity_migration: 'blocked_ambiguous',
      side_identity_migration_reason: 'conflict_scope_unavailable',
    });

    await resetBase();
    await seedAcceptedRun(['Retain data 30 days.', 'Retain data indefinitely.']);
    await insertConflict({
      sides: rawSides(false),
      recommendation: 'Retain data 30 days.',
      alternatives: ['Retain data indefinitely.'],
    });
    await insertLegacyConflictQuestion('Retain data 30 days.', 'Retain data indefinitely.');
    await admin.query(
      `UPDATE clarifying_questions
       SET metadata = jsonb_set(metadata, '{sides}', jsonb_build_array(metadata->'sides'->0))
       WHERE id=$1`,
      [id.question]
    );
    await admin.query(sideMigration);
    const incomplete = (
      await admin.query(`SELECT suggested_answers,metadata FROM clarifying_questions WHERE id=$1`, [
        id.question,
      ])
    ).rows[0];
    expect(incomplete.metadata).toMatchObject({
      side_identity_migration: 'blocked_ambiguous',
      side_identity_migration_reason: 'conflict_role_projection_unavailable',
    });
    expect(incomplete.suggested_answers.map((answer: { value: string }) => answer.value)).toEqual([
      `alternative:${id.conflict}:0`,
      `recommendation:${id.conflict}`,
    ]);
  });

  it('persists exact system and modified side handles while custom remains null', async () => {
    await resetBase();
    await admin.query(sideMigration);
    await seedAcceptedRun(['Retain data 30 days.', 'Retain data indefinitely.']);
    await insertConflict({
      sides: rawSides(true),
      recommendation: 'Retain data 30 days.',
      alternatives: ['Retain data indefinitely.'],
    });
    const handleA = sideHandle(id.conflict, [id.claimA]);
    const handleB = sideHandle(id.conflict, [id.claimB]);
    const question = {
      questionId: id.question,
      questionText: 'Which retention rule should the course use?',
      priority: 'important',
      suggestedAnswers: [
        { value: handleB, text: 'Retain indefinitely', rationale: 'B', is_recommended: false },
        { value: handleA, text: 'Retain 30 days', rationale: 'A', is_recommended: true },
      ],
      metadata: {
        schema_version: 'document-conflict-question-v1',
        subject_kind: 'claim_conflict',
        subject_key: subjectKey(),
        run_id: id.run,
        conflict_id: id.conflict,
        recommended_side_handle: handleA,
        alternative_side_handles: [handleB],
        sides: [{ side_handle: handleA }, { side_handle: handleB }],
      },
    };
    const system = await asRole('service_role', () =>
      admin.query(
        `SELECT public.materialize_document_evidence_decision_gate_atomic(
           $1,$2,$3,'automatic',$4::jsonb,$5
         ) AS result`,
        [
          id.run,
          id.course,
          id.org,
          JSON.stringify([question]),
          '90000000-0000-4000-8000-000000000001',
        ]
      )
    );
    const replay = await asRole('service_role', () =>
      admin.query(
        `SELECT public.materialize_document_evidence_decision_gate_atomic(
           $1,$2,$3,'automatic',$4::jsonb,$5
         ) AS result`,
        [
          id.run,
          id.course,
          id.org,
          JSON.stringify([question]),
          '90000000-0000-4000-8000-000000000001',
        ]
      )
    );
    const systemDecisionId = system.rows[0].result.decision_ids[0];
    expect(replay.rows[0].result).toMatchObject({ decision_ids: [systemDecisionId], reused: true });

    const modified = await asRole('authenticated', () =>
      admin.query(
        `SELECT public.answer_document_evidence_questions_atomic($1,$2::jsonb) AS result`,
        [
          id.course,
          JSON.stringify([
            {
              question_id: id.question,
              answer: 'Retain indefinitely with annual review',
              answer_source: 'modified',
              selected_suggestion_index: 0,
              idempotency_key: '90000000-0000-4000-8000-000000000002',
              expected_current_decision_id: systemDecisionId,
            },
          ]),
        ]
      )
    );
    const modifiedDecisionId = modified.rows[0].result.decision_ids[0];
    const custom = await asRole('authenticated', () =>
      admin.query(
        `SELECT public.answer_document_evidence_questions_atomic($1,$2::jsonb) AS result`,
        [
          id.course,
          JSON.stringify([
            {
              question_id: id.question,
              answer: 'Use a new compromise',
              answer_source: 'custom',
              selected_suggestion_index: null,
              idempotency_key: '90000000-0000-4000-8000-000000000003',
              expected_current_decision_id: modifiedDecisionId,
            },
          ]),
        ]
      )
    );
    const customDecisionId = custom.rows[0].result.decision_ids[0];
    const decisions = await admin.query(
      `SELECT id,answer_source,selected_side_handle FROM document_evidence_decisions
       WHERE id IN ($1,$2,$3) ORDER BY decided_at`,
      [systemDecisionId, modifiedDecisionId, customDecisionId]
    );
    expect(decisions.rows.map(row => row.selected_side_handle)).toEqual([handleA, handleB, null]);
  });

  it('rolls back cleanly with no side-aware decisions and reapplies', async () => {
    await resetBase();
    await admin.query(sideMigration);
    await admin.query(sideRollback);
    expect(
      (
        await admin.query(
          `SELECT count(*) FROM information_schema.columns
           WHERE table_schema='public' AND table_name='document_evidence_decisions'
             AND column_name='selected_side_handle'`
        )
      ).rows[0].count
    ).toBe('0');
    await admin.query(sideMigration);
    expect(
      (
        await admin.query(
          `SELECT count(*) FROM information_schema.columns
           WHERE table_schema='public' AND table_name='document_evidence_decisions'
             AND column_name='selected_side_handle'`
        )
      ).rows[0].count
    ).toBe('1');
  });

  it('refuses rollback for a pending side-aware question without decisions', async () => {
    await resetBase();
    await seedAcceptedRun(['Retain data 30 days.', 'Retain data indefinitely.']);
    await insertConflict({
      sides: rawSides(false),
      recommendation: 'Retain data 30 days.',
      alternatives: ['Retain data indefinitely.'],
    });
    await insertLegacyConflictQuestion('Retain data 30 days.', 'Retain data indefinitely.');
    await admin.query(sideMigration);
    await expect(admin.query(sideRollback)).rejects.toThrow(/side-aware question/i);
  });

  it('refuses rollback when the only decision is custom-null on a side-aware question', async () => {
    await resetBase();
    await admin.query(sideMigration);
    await seedAcceptedRun(['Retain data 30 days.', 'Retain data indefinitely.']);
    await insertConflict({
      sides: rawSides(true),
      recommendation: 'Retain data 30 days.',
      alternatives: ['Retain data indefinitely.'],
    });
    const handleA = sideHandle(id.conflict, [id.claimA]);
    const handleB = sideHandle(id.conflict, [id.claimB]);
    await asRole('service_role', () =>
      admin.query(
        `SELECT public.materialize_document_evidence_decision_gate_atomic(
           $1,$2,$3,'manual',$4::jsonb,$5
         )`,
        [
          id.run,
          id.course,
          id.org,
          JSON.stringify([
            conflictQuestionInput({
              recommendation: 'Retain data 30 days.',
              alternative: 'Retain data indefinitely.',
              sideHandles: [handleA, handleB],
            }),
          ]),
          '90000000-0000-4000-8000-000000000022',
        ]
      )
    );
    await asRole('authenticated', () =>
      admin.query(`SELECT public.answer_document_evidence_questions_atomic($1,$2::jsonb)`, [
        id.course,
        JSON.stringify([
          {
            question_id: id.question,
            answer: 'Use a new compromise',
            answer_source: 'custom',
            selected_suggestion_index: null,
            idempotency_key: '90000000-0000-4000-8000-000000000023',
            expected_current_decision_id: null,
          },
        ]),
      ])
    );
    expect(
      (
        await admin.query(
          `SELECT selected_side_handle FROM document_evidence_decisions WHERE conflict_id=$1`,
          [id.conflict]
        )
      ).rows[0].selected_side_handle
    ).toBeNull();
    await expect(admin.query(sideRollback)).rejects.toThrow(/side-aware question/i);
  });

  it('refuses rollback for side handles anywhere in legacy question metadata or user answers', async () => {
    const handle = sideHandle(id.conflict, [id.claimA]);
    await resetBase();
    await admin.query(sideMigration);
    await admin.query(
      `INSERT INTO clarifying_questions(
         id,course_id,question_category,suggested_answers,status,user_answer,answered_at,metadata
       ) VALUES ($1,$2,'document_conflicts','{}'::jsonb,'answered',$3::jsonb,now(),$4::jsonb)`,
      [
        id.question,
        id.course,
        JSON.stringify({ value: handle }),
        JSON.stringify({
          subject_kind: 'claim_conflict',
          legacy_projection: { selected: handle },
        }),
      ]
    );
    await expect(admin.query(sideRollback)).rejects.toThrow(/side-aware question/i);
  });
});
