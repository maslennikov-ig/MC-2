import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Contract: deleting a course removes every document-evidence audit row it owns,
// while direct mutation of an audit row stays rejected. See mc2-ufpko — the
// conflict-checkpoint immutability trigger was the one sibling written without
// the cascade exemption, so a course that reached Stage 4 could not be deleted
// at all and the user's data could not be removed on request.

const databaseUrl = process.env.DOCUMENT_EVIDENCE_DATABASE_URL;
const appliedDescribe = databaseUrl ? describe.sequential : describe.skip;

const migrationSource = (name: string) =>
  readFileSync(resolve(process.cwd(), 'supabase/migrations', name), 'utf8');

const evidenceMigration = migrationSource('20260711120000_document_evidence.sql');
const autoAnswersMigration = migrationSource('20260711130000_document_conflict_auto_answers.sql');
const cascadeDeleteMigration = migrationSource(
  '20260813140000_conflict_checkpoint_cascade_delete.sql'
);

const id = {
  org: '31000000-0000-4000-8000-000000000001',
  course: '21000000-0000-4000-8000-000000000001',
  run: '11000000-0000-4000-8000-000000000001',
  docA: '41000000-0000-4000-8000-000000000001',
  docB: '41000000-0000-4000-8000-000000000002',
  claimA: '51000000-0000-4000-8000-000000000001',
  claimB: '51000000-0000-4000-8000-000000000002',
  conflict: '61000000-0000-4000-8000-000000000001',
  decision: '71000000-0000-4000-8000-000000000001',
  actor: '51000000-0000-4000-8000-000000000099',
};

let admin: Client;

function assertDisposableDatabaseUrl(value: string): string {
  const parsed = new URL(value);
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  if (!loopback || !/_test$/iu.test(parsed.pathname.replace(/^\//u, ''))) {
    throw new Error('Applied evidence tests require a loopback disposable _test database');
  }
  return value;
}

/**
 * Schema stub matching the applied-evidence tests: the tables the evidence
 * migrations reference, then the migrations themselves.
 */
async function resetDatabase(): Promise<void> {
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
  await admin.query(autoAnswersMigration);
  if (process.env.DOCUMENT_EVIDENCE_SKIP_CASCADE_MIGRATION !== '1') {
    await admin.query(cascadeDeleteMigration);
  }
}

/**
 * A course carrying the full audit chain a live Stage 4 leaves behind: an
 * accepted run, items, a conflict, a decision, a batch checkpoint and a
 * conflict checkpoint.
 */
async function seedCourseWithEvidence(): Promise<void> {
  await admin.query(`INSERT INTO organizations(id) VALUES ($1)`, [id.org]);
  await admin.query(`INSERT INTO courses(id,organization_id) VALUES ($1,$2)`, [id.course, id.org]);

  const manifest = [
    { document_id: id.docA, source_version_hash: 'hash-a', document_name: 'A.pdf' },
    { document_id: id.docB, source_version_hash: 'hash-b', document_name: 'B.pdf' },
  ];
  await admin.query(
    `INSERT INTO document_evidence_runs(
       id,course_id,organization_id,input_fingerprint,evidence_version,status,source_manifest
     ) VALUES ($1,$2,$3,'fp-cascade','e2-v1','processing',$4::jsonb)`,
    [id.run, id.course, id.org, JSON.stringify(manifest)]
  );

  const refsA = [{ document_id: id.docA, page_number: 2, version_hash: 'hash-a' }];
  const refsB = [{ document_id: id.docB, page_number: 3, version_hash: 'hash-b' }];
  await admin.query(
    `INSERT INTO document_evidence_items(
       run_id,course_id,organization_id,document_id,source_version_hash,document_name,
       priority,authority_scope,content_quality,course_relevance,processing_mode,summary,claims,
       coverage_status,coverage_reason,original_tokens,summary_tokens,allocated_tokens
     ) VALUES
       ($1,$2,$3,$4,'hash-a','A.pdf','CORE','organization_specific',.9,.9,'summary','A',
        $6::jsonb,'assessed','ok',100,10,10),
       ($1,$2,$3,$5,'hash-b','B.pdf','IMPORTANT','course_source',.8,.8,'summary','B',
        $7::jsonb,'assessed','ok',100,10,10)`,
    [
      id.run,
      id.course,
      id.org,
      id.docA,
      id.docB,
      JSON.stringify([
        { claim_id: id.claimA, statement: 'Mandatory', confidence: 0.9, source_refs: refsA },
      ]),
      JSON.stringify([
        { claim_id: id.claimB, statement: 'Optional', confidence: 0.8, source_refs: refsB },
      ]),
    ]
  );

  const sides = [
    { statement: 'Mandatory', claim_ids: [id.claimA], document_ids: [id.docA], source_refs: refsA },
    { statement: 'Optional', claim_ids: [id.claimB], document_ids: [id.docB], source_refs: refsB },
  ];
  await admin.query(
    `INSERT INTO document_evidence_conflicts(
       id,run_id,course_id,organization_id,conflict_fingerprint,topic,severity,sides,
       course_impact,recommended_resolution,recommendation_rationale,alternatives,
       detection_model,detection_version
     ) VALUES ($1,$2,$3,$4,'sha256:material','Approval','important',$5::jsonb,
       'Needs one answer','Use mandatory','Authority wins','["Explain scopes"]','test','v1')`,
    [id.conflict, id.run, id.course, id.org, JSON.stringify(sides)]
  );

  // The batch checkpoint must exist before the run turns terminal.
  await admin.query(
    `INSERT INTO document_evidence_batch_checkpoints(
       run_id,course_id,organization_id,batch_key,input_hash,structured_checkpoint,cursor,
       batch_count,model_calls,input_tokens,output_tokens,total_cost_usd
     ) VALUES ($1,$2,$3,'batch:1','sha256:batch','{"kind":"batch"}','{"offset":1}',1,1,10,5,0.01)`,
    [id.run, id.course, id.org]
  );

  await admin.query(
    `UPDATE document_evidence_runs SET status='accepted',assessed_count=2,completed_at=now()
     WHERE id=$1`,
    [id.run]
  );

  await admin.query(
    `INSERT INTO document_evidence_decisions(
       id,run_id,course_id,organization_id,selected_resolution,rationale,resolved_by,answer_source,
       selected_recommendation_value,subject_kind,subject_key,conflict_id,actor_user_id
     ) VALUES ($1,$2,$3,$4,'Use mandatory','Authority wins','user','suggested','mandatory',
       'claim_conflict',
       public.document_evidence_subject_key($2,'claim_conflict',$5,NULL,NULL,NULL),
       $5,$6)`,
    [id.decision, id.run, id.course, id.org, id.conflict, id.actor]
  );

  await admin.query(
    `INSERT INTO document_evidence_conflict_checkpoints(
       run_id,course_id,organization_id,batch_key,input_hash,structured_checkpoint,
       verification_status,conflict_verification
     ) VALUES ($1,$2,$3,'conflict:1','sha256:conflict',$4::jsonb,'verified','[]')`,
    [id.run, id.course, id.org, JSON.stringify({ kind: 'conflict_batch', conflicts: 1 })]
  );
}

const EVIDENCE_TABLES = [
  'document_evidence_runs',
  'document_evidence_items',
  'document_evidence_conflicts',
  'document_evidence_decisions',
  'document_evidence_batch_checkpoints',
  'document_evidence_conflict_checkpoints',
];

async function countRowsForCourse(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of EVIDENCE_TABLES) {
    const result = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.${table} WHERE course_id = $1`,
      [id.course]
    );
    counts[table] = Number(result.rows[0]?.count ?? '0');
  }
  return counts;
}

appliedDescribe('course delete cascades through document evidence', () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: assertDisposableDatabaseUrl(databaseUrl as string) });
    await admin.connect();
  }, 120_000);

  afterAll(async () => {
    await admin?.end();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedCourseWithEvidence();
  }, 120_000);

  it('removes every evidence row the course owns, checkpoints included', async () => {
    const before = await countRowsForCourse();
    expect(before).toEqual({
      document_evidence_runs: 1,
      document_evidence_items: 2,
      document_evidence_conflicts: 1,
      document_evidence_decisions: 1,
      document_evidence_batch_checkpoints: 1,
      document_evidence_conflict_checkpoints: 1,
    });

    await expect(
      admin.query(`DELETE FROM public.courses WHERE id = $1`, [id.course])
    ).resolves.toBeDefined();

    const after = await countRowsForCourse();
    expect(after).toEqual({
      document_evidence_runs: 0,
      document_evidence_items: 0,
      document_evidence_conflicts: 0,
      document_evidence_decisions: 0,
      document_evidence_batch_checkpoints: 0,
      document_evidence_conflict_checkpoints: 0,
    });
  });

  it('still rejects a direct DELETE of a conflict checkpoint', async () => {
    await expect(
      admin.query(
        `DELETE FROM public.document_evidence_conflict_checkpoints WHERE course_id = $1`,
        [id.course]
      )
    ).rejects.toMatchObject({ code: '55000' });

    const counts = await countRowsForCourse();
    expect(counts.document_evidence_conflict_checkpoints).toBe(1);
  });

  it('still rejects a direct UPDATE of a conflict checkpoint', async () => {
    await expect(
      admin.query(
        `UPDATE public.document_evidence_conflict_checkpoints
           SET verification_status = 'degraded' WHERE course_id = $1`,
        [id.course]
      )
    ).rejects.toMatchObject({ code: '55000' });
  });

  it('still rejects a direct DELETE of an accepted run', async () => {
    await expect(
      admin.query(`DELETE FROM public.document_evidence_runs WHERE id = $1`, [id.run])
    ).rejects.toMatchObject({ code: '55000' });
  });
});
