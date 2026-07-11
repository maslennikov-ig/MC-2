import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260711120000_document_evidence.sql'
);
const rollbackPath = resolve(
  process.cwd(),
  'supabase/migrations/rollback/20260711120000_document_evidence_rollback.sql'
);

function migrationSql(): string {
  return readFileSync(migrationPath, 'utf8');
}

function rollbackSql(): string {
  return readFileSync(rollbackPath, 'utf8');
}

describe('document evidence migration isolation contract', () => {
  it('creates all tenant-scoped evidence tables and exact uniqueness constraints', () => {
    const sql = migrationSql();

    for (const table of [
      'document_evidence_runs',
      'document_evidence_items',
      'document_evidence_conflicts',
      'document_evidence_decisions',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE public\\.${table}`, 'i'));
      expect(sql).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i')
      );
    }

    expect(sql).toMatch(/UNIQUE\s*\(run_id,\s*document_id\)/i);
    expect(sql).toMatch(/UNIQUE\s*\(run_id,\s*conflict_fingerprint\)/i);
    expect(sql).toMatch(/UNIQUE\s*\(course_id,\s*input_fingerprint,\s*evidence_version\)/i);
    expect(sql).toMatch(/source_document_ids UUID\[\] NOT NULL/i);
    expect(sql).not.toMatch(/document_id UUID NOT NULL REFERENCES public\.file_catalog/i);
  });

  it('denies cross-tenant authenticated access through course organization ownership', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/TO authenticated/i);
    expect(sql).toMatch(/FROM public\.courses/i);
    expect(sql).toMatch(
      /courses\.organization_id\s*=\s*\(\(SELECT auth\.jwt\(\)\)->>'organization_id'\)::uuid/i
    );
    expect(sql.match(/CREATE POLICY\s+\w+_tenant_select/gi)).toHaveLength(4);
    expect(sql.match(/CREATE POLICY\s+\w+_tenant_insert/gi)).toHaveLength(4);
    expect(sql).not.toMatch(/TO authenticated[\s\S]{0,120}USING\s*\(true\)/i);
  });

  it('grants backend service access without exposing JSON bodies in logging SQL', () => {
    const sql = migrationSql();

    for (const table of [
      'document_evidence_runs',
      'document_evidence_items',
      'document_evidence_conflicts',
      'document_evidence_decisions',
    ]) {
      expect(sql).toMatch(new RegExp(`GRANT ALL ON public\\.${table} TO service_role`, 'i'));
    }
    expect(sql).not.toMatch(
      /RAISE\s+(NOTICE|LOG|WARNING)[^;]*(claims|sides|summary|rationale|selected_resolution)/i
    );
  });

  it('enforces immutable conflicts and append-only decision rows at the database boundary', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/CREATE TRIGGER prevent_document_evidence_conflicts_mutation/i);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.document_evidence_conflicts/i);
    expect(sql).toMatch(/CREATE TRIGGER prevent_document_evidence_decisions_mutation/i);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.document_evidence_decisions/i);
    expect(sql).toMatch(/supersedes_decision_id UUID/i);
    expect(sql).toMatch(/UNIQUE\s*\(supersedes_decision_id\)/i);
    expect(sql).toMatch(/\(resolved_by\s*=\s*'system'\)\s*=\s*\(answer_source\s*=\s*'system'\)/i);
  });

  it('compares exact source and item ID sets and permits honest missing summaries', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/v_item_document_ids\s+IS DISTINCT FROM\s+v_source_document_ids/i);
    expect(sql).toMatch(/coverage_status = 'assessed'[\s\S]*summary IS NOT NULL/i);
    expect(sql).toMatch(/coverage_status IN \('degraded', 'failed'\)[\s\S]*summary IS NULL/i);
  });

  it('persists automatic clarifying answers as system answers', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.auto_answer_questions_atomic/i);
    expect(sql).toMatch(/answer_source\s*=\s*'system'/i);
    expect(sql).toMatch(/EXCEPTION\s+WHEN OTHERS[\s\S]*'success',\s*false/i);
  });

  it('rolls back functions, policies, triggers, and tables in dependency order', () => {
    const sql = rollbackSql();

    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.persist_document_evidence_items/i);
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.document_evidence_decisions/i);
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.document_evidence_conflicts/i);
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.document_evidence_items/i);
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.document_evidence_runs/i);
    expect(sql).toMatch(/answer_source\s*=\s*'suggested'/i);
    expect(sql).toMatch(/EXCEPTION\s+WHEN OTHERS[\s\S]*'success',\s*false/i);
  });
});

const appliedDatabaseUrl = process.env.DOCUMENT_EVIDENCE_DATABASE_URL;
const appliedIt = appliedDatabaseUrl ? it : it.skip;

const appliedIds = {
  organizationA: '81000000-0000-4000-8000-000000000001',
  organizationB: '81000000-0000-4000-8000-000000000002',
  courseA: '82000000-0000-4000-8000-000000000001',
  courseB: '82000000-0000-4000-8000-000000000002',
  documentA: '83000000-0000-4000-8000-000000000001',
  documentB: '83000000-0000-4000-8000-000000000002',
  substitute: '83000000-0000-4000-8000-000000000003',
  documentOtherTenant: '83000000-0000-4000-8000-000000000004',
  runA: '84000000-0000-4000-8000-000000000001',
  runB: '84000000-0000-4000-8000-000000000002',
  deniedRun: '84000000-0000-4000-8000-000000000003',
  conflict: '85000000-0000-4000-8000-000000000001',
  decisionA: '86000000-0000-4000-8000-000000000001',
  decisionB: '86000000-0000-4000-8000-000000000002',
  question: '87000000-0000-4000-8000-000000000001',
};

type AppliedRole = 'authenticated' | 'service_role';

async function asRole<T>(
  client: Client,
  role: AppliedRole,
  organizationId: string,
  operation: () => Promise<T>
): Promise<T> {
  await client.query(`SET ROLE ${role}`);
  await client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ organization_id: organizationId, role }),
  ]);
  try {
    return await operation();
  } finally {
    await client.query('RESET ROLE');
  }
}

function evidenceItem(documentId: string, status: 'assessed' | 'degraded', summary?: string) {
  return {
    document_id: documentId,
    document_name: `document-${documentId.slice(-4)}`,
    priority: 'CORE',
    authority_scope: 'course_source',
    content_quality: 0.8,
    course_relevance: 0.9,
    processing_mode: 'summary',
    ...(summary === undefined ? {} : { summary }),
    key_claims: [],
    terminology: [],
    constraints: [],
    limitations: [],
    coverage_status: status,
    coverage_reason: status === 'assessed' ? 'verified' : 'summary unavailable after retries',
    token_counts: { original: 100, summary: summary ? 10 : 0, allocated: 10 },
  };
}

async function resetAppliedDatabase(client: Client): Promise<void> {
  await client.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    CREATE SCHEMA public;
    CREATE SCHEMA auth;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END IF;
    END $$;
    ALTER ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;

    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT auth.jwt()->>'role'
    $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(auth.jwt()->>'sub', '')::uuid
    $$;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, service_role;

    CREATE TABLE public.organizations (id uuid PRIMARY KEY);
    CREATE TABLE public.courses (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
    );
    CREATE TABLE public.file_catalog (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
      hash text NOT NULL
    );
    CREATE TABLE public.clarifying_questions (
      id uuid PRIMARY KEY,
      course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
      suggested_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
      question_type text NOT NULL DEFAULT 'open',
      status text NOT NULL DEFAULT 'pending',
      user_answer jsonb,
      answer_source text,
      selected_suggestion_index integer,
      answered_at timestamptz
    );
    GRANT SELECT ON public.courses, public.file_catalog TO authenticated, service_role;
  `);
}

describe('document evidence applied PostgreSQL isolation', () => {
  appliedIt(
    'applies migration and proves tenant, coverage, immutability, chain, audit, and rollback behavior',
    async () => {
      const client = new Client({ connectionString: appliedDatabaseUrl });
      await client.connect();
      try {
        await resetAppliedDatabase(client);
        await client.query(`
          INSERT INTO public.organizations(id) VALUES
            ('${appliedIds.organizationA}'), ('${appliedIds.organizationB}');
          INSERT INTO public.courses(id, organization_id) VALUES
            ('${appliedIds.courseA}', '${appliedIds.organizationA}'),
            ('${appliedIds.courseB}', '${appliedIds.organizationB}');
          INSERT INTO public.file_catalog(id, organization_id, course_id, hash) VALUES
            ('${appliedIds.documentA}', '${appliedIds.organizationA}', '${appliedIds.courseA}', 'hash-a'),
            ('${appliedIds.documentB}', '${appliedIds.organizationA}', '${appliedIds.courseA}', 'hash-b'),
            ('${appliedIds.substitute}', '${appliedIds.organizationA}', '${appliedIds.courseA}', 'hash-c'),
            ('${appliedIds.documentOtherTenant}', '${appliedIds.organizationB}', '${appliedIds.courseB}', 'hash-d');
        `);
        await client.query(migrationSql());

        await asRole(client, 'authenticated', appliedIds.organizationA, async () => {
          await client.query(
            `INSERT INTO public.document_evidence_runs
              (id, course_id, organization_id, input_fingerprint, evidence_version, status,
               source_document_ids)
             VALUES ($1, $2, $3, 'fingerprint-a', '1.0.0', 'processing', $4::uuid[])`,
            [
              appliedIds.runA,
              appliedIds.courseA,
              appliedIds.organizationA,
              [appliedIds.documentB, appliedIds.documentA, appliedIds.documentA],
            ]
          );
          const own = await client.query(
            'SELECT source_document_ids, source_count FROM public.document_evidence_runs WHERE id = $1',
            [appliedIds.runA]
          );
          expect(own.rows[0]).toEqual({
            source_document_ids: [appliedIds.documentA, appliedIds.documentB],
            source_count: 2,
          });
          await expect(
            client.query(
              'UPDATE public.document_evidence_runs SET source_document_ids = $1 WHERE id = $2',
              [[appliedIds.documentA], appliedIds.runA]
            )
          ).rejects.toMatchObject({ code: '55000' });
          await expect(
            client.query(
              `INSERT INTO public.document_evidence_runs
                (id, course_id, organization_id, input_fingerprint, evidence_version, status,
                 source_document_ids)
               VALUES ($1, $2, $3, 'denied', '1.0.0', 'processing', $4::uuid[])`,
              [
                appliedIds.deniedRun,
                appliedIds.courseB,
                appliedIds.organizationB,
                [appliedIds.documentOtherTenant],
              ]
            )
          ).rejects.toMatchObject({ code: '42501' });
        });

        await asRole(client, 'service_role', appliedIds.organizationB, async () => {
          await client.query(
            `INSERT INTO public.document_evidence_runs
              (id, course_id, organization_id, input_fingerprint, evidence_version, status,
               source_document_ids)
             VALUES ($1, $2, $3, 'fingerprint-b', '1.0.0', 'processing', $4::uuid[])`,
            [
              appliedIds.runB,
              appliedIds.courseB,
              appliedIds.organizationB,
              [appliedIds.documentOtherTenant],
            ]
          );
          expect(
            (await client.query('SELECT count(*)::int AS count FROM document_evidence_runs'))
              .rows[0]
          ).toEqual({ count: 2 });
        });

        await asRole(client, 'authenticated', appliedIds.organizationA, async () => {
          const visible = await client.query('SELECT id FROM public.document_evidence_runs');
          expect(visible.rows.map(row => row.id)).toEqual([appliedIds.runA]);
          await expect(
            client.query('SELECT public.persist_document_evidence_items($1, $2, $3, $4::jsonb)', [
              appliedIds.runA,
              appliedIds.courseA,
              appliedIds.organizationA,
              JSON.stringify([
                evidenceItem(appliedIds.documentA, 'assessed', 'verified summary'),
                evidenceItem(appliedIds.substitute, 'degraded'),
              ]),
            ])
          ).rejects.toMatchObject({ code: '23514' });
          const persisted = await client.query(
            'SELECT public.persist_document_evidence_items($1, $2, $3, $4::jsonb) AS coverage',
            [
              appliedIds.runA,
              appliedIds.courseA,
              appliedIds.organizationA,
              JSON.stringify([
                evidenceItem(appliedIds.documentA, 'assessed', 'verified summary'),
                evidenceItem(appliedIds.documentB, 'degraded'),
              ]),
            ]
          );
          expect(persisted.rows[0].coverage).toEqual({
            source_count: 2,
            assessed_count: 1,
            degraded_count: 1,
            failed_count: 0,
          });
        });

        await client.query('DELETE FROM public.file_catalog WHERE id = $1', [appliedIds.documentA]);
        expect(
          (
            await client.query(
              'SELECT document_id, source_version_hash FROM document_evidence_items WHERE document_id = $1',
              [appliedIds.documentA]
            )
          ).rows[0]
        ).toEqual({ document_id: appliedIds.documentA, source_version_hash: 'hash-a' });

        await client.query(
          `INSERT INTO public.document_evidence_conflicts
            (id, run_id, course_id, organization_id, conflict_fingerprint, topic, severity, sides,
             course_impact, recommended_resolution, recommendation_rationale, alternatives,
             detection_model, detection_version)
           VALUES ($1, $2, $3, $4, 'conflict-fp', 'scope', 'important', '[{},{}]'::jsonb,
             'impact', 'resolution', 'rationale', '["alternative"]'::jsonb, 'model', '1')`,
          [appliedIds.conflict, appliedIds.runA, appliedIds.courseA, appliedIds.organizationA]
        );
        await expect(
          client.query('UPDATE document_evidence_conflicts SET topic = topic WHERE id = $1', [
            appliedIds.conflict,
          ])
        ).rejects.toMatchObject({ code: '55000' });
        await expect(
          client.query('DELETE FROM document_evidence_conflicts WHERE id = $1', [
            appliedIds.conflict,
          ])
        ).rejects.toMatchObject({ code: '55000' });

        await expect(
          client.query(
            `INSERT INTO document_evidence_decisions
              (run_id, conflict_id, selected_resolution, rationale, resolved_by, answer_source)
             VALUES ($1, $2, 'invalid', 'invalid', 'user', 'system')`,
            [appliedIds.runA, appliedIds.conflict]
          )
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          client.query(
            `INSERT INTO document_evidence_decisions
              (run_id, conflict_id, selected_resolution, rationale, resolved_by, answer_source)
             VALUES ($1, $2, 'invalid', 'invalid', 'system', 'modified')`,
            [appliedIds.runA, appliedIds.conflict]
          )
        ).rejects.toMatchObject({ code: '23514' });
        await client.query(
          `INSERT INTO document_evidence_decisions
            (id, run_id, conflict_id, selected_resolution, rationale, resolved_by, answer_source)
           VALUES ($1, $2, $3, 'manual', 'manual audit', 'user', 'modified')`,
          [appliedIds.decisionA, appliedIds.runA, appliedIds.conflict]
        );
        await client.query(
          `INSERT INTO document_evidence_decisions
            (id, run_id, conflict_id, selected_resolution, rationale, resolved_by, answer_source,
             supersedes_decision_id)
           VALUES ($1, $2, $3, 'automatic', 'system audit', 'system', 'system', $4)`,
          [appliedIds.decisionB, appliedIds.runA, appliedIds.conflict, appliedIds.decisionA]
        );
        await expect(
          client.query(
            `INSERT INTO document_evidence_decisions
              (run_id, conflict_id, selected_resolution, rationale, resolved_by, answer_source,
               supersedes_decision_id)
             VALUES ($1, $2, 'fork', 'fork', 'system', 'system', $3)`,
            [appliedIds.runA, appliedIds.conflict, appliedIds.decisionA]
          )
        ).rejects.toMatchObject({ code: '23505' });
        await expect(
          client.query(
            `INSERT INTO document_evidence_decisions
              (run_id, conflict_id, selected_resolution, rationale, resolved_by, answer_source)
             VALUES ($1, $2, 'second root', 'second root', 'user', 'custom')`,
            [appliedIds.runA, appliedIds.conflict]
          )
        ).rejects.toMatchObject({ code: '23505' });
        await expect(
          client.query(
            'UPDATE document_evidence_decisions SET rationale = rationale WHERE id = $1',
            [appliedIds.decisionB]
          )
        ).rejects.toMatchObject({ code: '55000' });
        await expect(
          client.query('DELETE FROM document_evidence_decisions WHERE id = $1', [
            appliedIds.decisionB,
          ])
        ).rejects.toMatchObject({ code: '55000' });

        await client.query(
          `INSERT INTO public.clarifying_questions
            (id, course_id, suggested_answers, question_type, status)
           VALUES ($1, $2, '[{"text":"recommended"}]'::jsonb, 'open', 'pending')`,
          [appliedIds.question, appliedIds.courseA]
        );
        await client.query(rollbackSql());
        expect(
          (
            await client.query(`SELECT
              to_regclass('public.document_evidence_runs') AS runs_table,
              to_regclass('public.document_evidence_items') AS items_table,
              to_regclass('public.document_evidence_conflicts') AS conflicts_table,
              to_regclass('public.document_evidence_decisions') AS decisions_table,
              to_regprocedure(
                'public.persist_document_evidence_items(uuid,uuid,uuid,jsonb)'
              ) AS persist_function,
              to_regprocedure(
                'public.enforce_document_evidence_run_source_set()'
              ) AS source_set_function`)
          ).rows[0]
        ).toEqual({
          runs_table: null,
          items_table: null,
          conflicts_table: null,
          decisions_table: null,
          persist_function: null,
          source_set_function: null,
        });
        await client.query('SELECT public.auto_answer_questions_atomic($1)', [appliedIds.courseA]);
        expect(
          (
            await client.query(
              'SELECT answer_source FROM public.clarifying_questions WHERE id = $1',
              [appliedIds.question]
            )
          ).rows[0]
        ).toEqual({ answer_source: 'suggested' });
      } finally {
        await resetAppliedDatabase(client);
        await client.end();
      }
    },
    60_000
  );
});
