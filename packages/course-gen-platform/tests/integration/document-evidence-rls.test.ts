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
    expect(sql).toMatch(/source_manifest JSONB NOT NULL/i);
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
    expect(sql.match(/CREATE POLICY\s+\w+_tenant_insert/gi) ?? []).toHaveLength(0);
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
    expect(sql).not.toMatch(/GRANT\s+[^;]*(INSERT|UPDATE|DELETE)[^;]*TO authenticated/i);
    for (const table of [
      'document_evidence_runs',
      'document_evidence_items',
      'document_evidence_conflicts',
      'document_evidence_decisions',
    ]) {
      expect(sql).toMatch(new RegExp(`GRANT SELECT ON public\\.${table} TO authenticated`, 'i'));
    }
    for (const rpc of [
      'create_or_reuse_document_evidence_run',
      'persist_document_evidence_items',
      'finalize_document_evidence_run',
      'upsert_document_evidence_conflict',
      'append_document_evidence_decision',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}`, 'i'));
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${rpc}[\\s\\S]*FROM PUBLIC`, 'i')
      );
    }
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
    expect(sql).toMatch(/supersedes_decision_id IS NULL OR resolved_by = 'user'/i);
  });

  it('compares exact source and item ID sets and permits honest missing summaries', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/v_item_document_ids\s+IS DISTINCT FROM\s+v_source_document_ids/i);
    expect(sql).toMatch(/coverage_status = 'assessed'[\s\S]*summary IS NOT NULL/i);
    expect(sql).toMatch(/coverage_status IN \('degraded', 'failed'\)[\s\S]*summary IS NULL/i);
    expect(sql).toMatch(/prevent_document_evidence_terminal_run_mutation/i);
    expect(sql).toMatch(/prevent_document_evidence_terminal_item_mutation/i);
    expect(sql).toMatch(/verify_document_evidence_terminal_coverage/i);
    const persistStart = sql.indexOf(
      'CREATE OR REPLACE FUNCTION public.persist_document_evidence_items'
    );
    const persistEnd = sql.indexOf('-- Keep automatic clarifying answers');
    const persistSql = sql.slice(persistStart, persistEnd);
    expect(persistSql).toMatch(/source_manifest/i);
    expect(persistSql).not.toMatch(/file_catalog/i);
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
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.create_or_reuse_document_evidence_run/i);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.finalize_document_evidence_run/i);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.upsert_document_evidence_conflict/i);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.append_document_evidence_decision/i);
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

function assertDisposableDatabaseUrl(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (!loopbackHosts.has(parsed.hostname)) {
    throw new Error('Applied evidence database must use a loopback host');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!databaseName.endsWith('_test')) {
    throw new Error('Applied evidence database name must end with _test');
  }
  return databaseUrl;
}

describe('document evidence applied database safety guard', () => {
  it('rejects non-loopback and non-test database URLs before reset', () => {
    expect(() =>
      assertDisposableDatabaseUrl('postgresql://postgres@db.internal/document_evidence_test')
    ).toThrow(/loopback/i);
    expect(() => assertDisposableDatabaseUrl('postgresql://postgres@127.0.0.1/production')).toThrow(
      /_test/i
    );
    expect(
      assertDisposableDatabaseUrl('postgresql://postgres@127.0.0.1/document_evidence_test')
    ).toBe('postgresql://postgres@127.0.0.1/document_evidence_test');
  });
});

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
    'proves guarded writes, tenant reads, terminal integrity, and rollback',
    async () => {
      const databaseUrl = assertDisposableDatabaseUrl(appliedDatabaseUrl!);
      const client = new Client({ connectionString: databaseUrl });
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
        const manifestA = [
          { document_id: appliedIds.documentB, source_version_hash: 'hash-b', document_name: 'B' },
          { document_id: appliedIds.documentA, source_version_hash: 'hash-a', document_name: 'A' },
        ];
        const manifestB = [
          {
            document_id: appliedIds.documentOtherTenant,
            source_version_hash: 'hash-d',
            document_name: 'D',
          },
        ];
        let runA = '';
        let runB = '';
        await asRole(client, 'authenticated', appliedIds.organizationA, async () => {
          const created = await client.query(
            'SELECT public.create_or_reuse_document_evidence_run($1,$2,$3,$4,$5::jsonb) AS result',
            [appliedIds.courseA, appliedIds.organizationA, 'fp-a', '1', JSON.stringify(manifestA)]
          );
          runA = created.rows[0].result.run.id;
          await expect(
            client.query('INSERT INTO document_evidence_runs DEFAULT VALUES')
          ).rejects.toMatchObject({ code: '42501' });
        });
        await asRole(client, 'authenticated', appliedIds.organizationB, async () => {
          const created = await client.query(
            'SELECT public.create_or_reuse_document_evidence_run($1,$2,$3,$4,$5::jsonb) AS result',
            [appliedIds.courseB, appliedIds.organizationB, 'fp-b', '1', JSON.stringify(manifestB)]
          );
          runB = created.rows[0].result.run.id;
          await expect(
            client.query(
              'SELECT public.create_or_reuse_document_evidence_run($1,$2,$3,$4,$5::jsonb)',
              [
                appliedIds.courseA,
                appliedIds.organizationA,
                'cross-tenant-create',
                '1',
                JSON.stringify(manifestA),
              ]
            )
          ).rejects.toMatchObject({ code: '42501' });
        });

        await client.query('DELETE FROM file_catalog WHERE id = $1', [appliedIds.documentA]);
        await asRole(client, 'authenticated', appliedIds.organizationA, async () => {
          const persisted = await client.query(
            'SELECT public.persist_document_evidence_items($1,$2,$3,$4::jsonb) AS result',
            [
              runA,
              appliedIds.courseA,
              appliedIds.organizationA,
              JSON.stringify([
                evidenceItem(appliedIds.documentA, 'degraded'),
                evidenceItem(appliedIds.documentB, 'assessed', 'verified'),
              ]),
            ]
          );
          expect(persisted.rows[0].result.source_count).toBe(2);
          await expect(
            client.query('SELECT public.persist_document_evidence_items($1,$2,$3,$4::jsonb)', [
              runB,
              appliedIds.courseB,
              appliedIds.organizationB,
              JSON.stringify([evidenceItem(appliedIds.documentOtherTenant, 'degraded')]),
            ])
          ).rejects.toMatchObject({ code: '42501' });
        });
        expect(
          (
            await client.query(
              'SELECT source_version_hash, document_name FROM document_evidence_items WHERE document_id=$1',
              [appliedIds.documentA]
            )
          ).rows[0]
        ).toEqual({ source_version_hash: 'hash-a', document_name: 'A' });

        await asRole(client, 'service_role', appliedIds.organizationB, async () => {
          await client.query('SELECT public.persist_document_evidence_items($1,$2,$3,$4::jsonb)', [
            runB,
            appliedIds.courseB,
            appliedIds.organizationB,
            JSON.stringify([evidenceItem(appliedIds.documentOtherTenant, 'degraded')]),
          ]);
        });

        const conflictPayload = (id: string, fingerprint: string) => ({
          conflict_id: id,
          conflict_fingerprint: fingerprint,
          topic: 'scope',
          severity: 'important',
          sides: [{}, {}],
          course_impact: 'impact',
          recommended_resolution: 'resolution',
          recommendation_rationale: 'rationale',
          alternatives: ['alternative'],
        });
        await asRole(client, 'authenticated', appliedIds.organizationA, async () => {
          await client.query(
            'SELECT public.upsert_document_evidence_conflict($1,$2,$3,$4::jsonb,$5,$6)',
            [
              runA,
              appliedIds.courseA,
              appliedIds.organizationA,
              JSON.stringify(conflictPayload(appliedIds.conflict, 'fp-conflict-a')),
              'model',
              '1',
            ]
          );
        });
        const conflictB = '85000000-0000-4000-8000-000000000002';
        await asRole(client, 'authenticated', appliedIds.organizationB, async () => {
          await client.query(
            'SELECT public.upsert_document_evidence_conflict($1,$2,$3,$4::jsonb,$5,$6)',
            [
              runB,
              appliedIds.courseB,
              appliedIds.organizationB,
              JSON.stringify(conflictPayload(conflictB, 'fp-conflict-b')),
              'model',
              '1',
            ]
          );
          await expect(
            client.query(
              'SELECT public.upsert_document_evidence_conflict($1,$2,$3,$4::jsonb,$5,$6)',
              [
                runA,
                appliedIds.courseA,
                appliedIds.organizationA,
                JSON.stringify(
                  conflictPayload('85000000-0000-4000-8000-000000000003', 'cross-tenant')
                ),
                'model',
                '1',
              ]
            )
          ).rejects.toMatchObject({ code: '42501' });
        });

        let systemDecision = '';
        await asRole(client, 'authenticated', appliedIds.organizationA, async () => {
          const root = await client.query(
            'SELECT public.append_document_evidence_decision($1::jsonb) AS result',
            [
              JSON.stringify({
                run_id: runA,
                conflict_id: appliedIds.conflict,
                selected_resolution: 'system root',
                rationale: 'system root',
                resolved_by: 'system',
                answer_source: 'system',
              }),
            ]
          );
          systemDecision = root.rows[0].result.id;
          const userOverride = await client.query(
            'SELECT public.append_document_evidence_decision($1::jsonb) AS result',
            [
              JSON.stringify({
                run_id: runA,
                conflict_id: appliedIds.conflict,
                selected_resolution: 'user override',
                rationale: 'user override',
                resolved_by: 'user',
                answer_source: 'modified',
                supersedes_decision_id: systemDecision,
              }),
            ]
          );
          await expect(
            client.query('SELECT public.append_document_evidence_decision($1::jsonb)', [
              JSON.stringify({
                run_id: runA,
                conflict_id: appliedIds.conflict,
                selected_resolution: 'invalid system override',
                rationale: 'invalid',
                resolved_by: 'system',
                answer_source: 'system',
                supersedes_decision_id: userOverride.rows[0].result.id,
              }),
            ])
          ).rejects.toMatchObject({ code: '23514' });
        });
        await asRole(client, 'authenticated', appliedIds.organizationB, async () => {
          await client.query('SELECT public.append_document_evidence_decision($1::jsonb)', [
            JSON.stringify({
              run_id: runB,
              conflict_id: conflictB,
              selected_resolution: 'manual root',
              rationale: 'manual root',
              resolved_by: 'user',
              answer_source: 'custom',
            }),
          ]);
          await expect(
            client.query('SELECT public.append_document_evidence_decision($1::jsonb)', [
              JSON.stringify({
                run_id: runA,
                conflict_id: appliedIds.conflict,
                selected_resolution: 'cross tenant',
                rationale: 'cross tenant',
                resolved_by: 'user',
                answer_source: 'custom',
              }),
            ])
          ).rejects.toMatchObject({ code: '42501' });
          await expect(
            client.query('SELECT public.finalize_document_evidence_run($1,$2,$3,$4)', [
              runA,
              appliedIds.courseA,
              appliedIds.organizationA,
              'accepted',
            ])
          ).rejects.toMatchObject({ code: '42501' });
        });

        for (const [organizationId, expected] of [
          [appliedIds.organizationA, [1, 2, 1, 2]],
          [appliedIds.organizationB, [1, 1, 1, 1]],
        ] as const) {
          await asRole(client, 'authenticated', organizationId, async () => {
            const counts = await Promise.all(
              ['runs', 'items', 'conflicts', 'decisions'].map(table =>
                client.query(`SELECT count(*)::int AS count FROM document_evidence_${table}`)
              )
            );
            expect(counts.map(result => result.rows[0].count)).toEqual(expected);
            for (const table of ['runs', 'items', 'conflicts', 'decisions']) {
              await expect(
                client.query(`INSERT INTO document_evidence_${table} DEFAULT VALUES`)
              ).rejects.toMatchObject({ code: '42501' });
            }
          });
        }

        await asRole(client, 'service_role', appliedIds.organizationA, async () => {
          expect(
            (await client.query('SELECT count(*)::int AS count FROM document_evidence_runs'))
              .rows[0].count
          ).toBe(2);
          await client.query('SELECT public.finalize_document_evidence_run($1,$2,$3,$4)', [
            runA,
            appliedIds.courseA,
            appliedIds.organizationA,
            'accepted',
          ]);
          await expect(
            client.query("UPDATE document_evidence_runs SET error_category='changed' WHERE id=$1", [
              runA,
            ])
          ).rejects.toMatchObject({ code: '55000' });
          await expect(
            client.query('DELETE FROM document_evidence_items WHERE run_id=$1', [runA])
          ).rejects.toMatchObject({ code: '55000' });
          await expect(
            client.query(
              `INSERT INTO document_evidence_items
              (run_id,course_id,organization_id,document_id,source_version_hash,document_name,
               priority,authority_scope,content_quality,course_relevance,processing_mode,
               coverage_status,coverage_reason,original_tokens,summary_tokens,allocated_tokens)
             VALUES ($1,$2,$3,$4,'wrong','wrong','CORE','course_source',0,0,'metadata_only',
               'failed','invalid membership',0,0,0)`,
              [runB, appliedIds.courseB, appliedIds.organizationB, appliedIds.substitute]
            )
          ).rejects.toMatchObject({ code: '23514' });
        });

        await client.query(
          `INSERT INTO clarifying_questions(id,course_id,suggested_answers)
         VALUES ($1,$2,'[{"text":"recommended"}]')`,
          [appliedIds.question, appliedIds.courseA]
        );
        await client.query(rollbackSql());
        expect(
          (
            await client.query(`SELECT
            to_regclass('document_evidence_runs') AS runs,
            to_regprocedure('create_or_reuse_document_evidence_run(uuid,uuid,text,text,jsonb)') AS create_rpc,
            to_regprocedure('persist_document_evidence_items(uuid,uuid,uuid,jsonb)') AS persist_rpc,
            to_regprocedure('finalize_document_evidence_run(uuid,uuid,uuid,text)') AS finalize_rpc,
            to_regprocedure('upsert_document_evidence_conflict(uuid,uuid,uuid,jsonb,text,text)') AS conflict_rpc,
            to_regprocedure('append_document_evidence_decision(jsonb)') AS decision_rpc`)
          ).rows[0]
        ).toEqual({
          runs: null,
          create_rpc: null,
          persist_rpc: null,
          finalize_rpc: null,
          conflict_rpc: null,
          decision_rpc: null,
        });
        await client.query('SELECT auto_answer_questions_atomic($1)', [appliedIds.courseA]);
        expect(
          (
            await client.query('SELECT answer_source FROM clarifying_questions WHERE id=$1', [
              appliedIds.question,
            ])
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
