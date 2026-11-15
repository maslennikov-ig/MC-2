import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRoleInterviewService } from '@/integrations/helixa/role-interview';
import { createPostgresInterviewRepository } from '@/integrations/helixa/role-interview-postgres';
import { fixtureDependencies, fixtureRequest, fixtureBinding } from './fixtures/role-interview';

const enabled = process.env.MC2_HELIXA_INTERVIEW_REAL_PG17 === '1';
const container = `mc2-role-interview-${process.pid}-${Date.now()}`;
let pool: Pool;
function docker(args: string[]) {
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
}
describe.runIf(enabled)('native interview claims on disposable PostgreSQL 17', () => {
  beforeAll(async () => {
    docker([
      'run',
      '--rm',
      '-d',
      '--name',
      container,
      '-e',
      'POSTGRES_PASSWORD=local-interview-fixture',
      '-p',
      '127.0.0.1::5432',
      'postgres:17.10-bookworm',
    ]);
    for (let n = 0; n < 80; n++) {
      const ready = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres']);
      if (ready.status === 0) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const port = docker(['port', container, '5432/tcp']).split(':').at(-1)!;
    pool = new Pool({
      connectionString: `postgresql://postgres:local-interview-fixture@127.0.0.1:${port}/postgres`,
    });
    for (let n = 0; n < 60; n++) {
      try {
        await pool.query('SELECT 1');
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    await pool.query(`CREATE SCHEMA extensions; CREATE SCHEMA auth;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE organizations(id UUID PRIMARY KEY);
      CREATE TABLE auth.users(id UUID PRIMARY KEY, raw_app_meta_data JSONB NOT NULL);
      CREATE TABLE users(id UUID PRIMARY KEY, organization_id UUID NOT NULL);
      CREATE TABLE organization_members(user_id UUID,organization_id UUID,role TEXT);
      CREATE TABLE helixa_knowledge_sync_bindings(binding_id TEXT PRIMARY KEY,organization_id UUID,
        environment TEXT DEFAULT 'test', destination_binding_id TEXT DEFAULT 'destination-a',enabled BOOLEAN DEFAULT true,
        generation_service_principal_user_id UUID, job_instruction_creation_enabled BOOLEAN DEFAULT true,
        course_from_job_instruction_creation_enabled BOOLEAN DEFAULT true,course_creation_enabled BOOLEAN DEFAULT true);`);
    const resolverSource = await readFile(
      new URL(
        '../../../../supabase/migrations/20260905150000_helixa_create_course_generation.sql',
        import.meta.url
      ),
      'utf8'
    );
    const resolver = resolverSource.match(
      /CREATE OR REPLACE FUNCTION resolve_helixa_generation_binding[\s\S]*?\$\$;/u
    )![0];
    await pool.query(resolver);
    await pool.query(
      'REVOKE ALL ON FUNCTION resolve_helixa_generation_binding(TEXT) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION resolve_helixa_generation_binding(TEXT) TO service_role'
    );
    const migration = await readFile(
      new URL(
        '../../../../supabase/migrations/20261106120144_helixa_role_interview.sql',
        import.meta.url
      ),
      'utf8'
    );
    await pool.query(migration);
  }, 30000);
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE helixa_role_interview_rounds,helixa_knowledge_sync_bindings,organization_members,users,auth.users,organizations CASCADE'
    );
    await pool.query('INSERT INTO organizations VALUES ($1)', [fixtureBinding.organizationId]);
    await pool.query(
      `INSERT INTO auth.users VALUES ($1,'{"kind":"service_principal","interactive_login_allowed":false}')`,
      [fixtureBinding.servicePrincipalUserId]
    );
    await pool.query('INSERT INTO users VALUES ($1,$2)', [
      fixtureBinding.servicePrincipalUserId,
      fixtureBinding.organizationId,
    ]);
    await pool.query("INSERT INTO organization_members VALUES ($1,$2,'instructor')", [
      fixtureBinding.servicePrincipalUserId,
      fixtureBinding.organizationId,
    ]);
    await pool.query(
      "INSERT INTO helixa_knowledge_sync_bindings(binding_id,organization_id,generation_service_principal_user_id) VALUES ('binding-a',$1,$2)",
      [fixtureBinding.organizationId, fixtureBinding.servicePrincipalUserId]
    );
  });
  afterAll(async () => {
    if (pool) await pool.end();
    docker(['rm', '-f', container]);
  });
  function repository() {
    return createPostgresInterviewRepository({
      async rpc<T>(name: string, args: Record<string, unknown>) {
        const client = await pool.connect();
        try {
          await client.query('SET ROLE service_role');
          const values = Object.values(args).map(v =>
            v !== null && typeof v === 'object' ? JSON.stringify(v) : v
          );
          const result = await client.query(
            `SELECT public.${name}(${values.map((_, i) => `$${i + 1}`).join(',')}) AS data`,
            values
          );
          return { data: result.rows[0].data as T, error: null };
        } catch (error) {
          return { data: null, error: { message: (error as Error).message } };
        } finally {
          await client.query('RESET ROLE');
          client.release();
        }
      },
    });
  }
  it('permits one concurrent paid owner and exact replay after a fresh repository instance', async () => {
    const f = fixtureDependencies();
    f.dependencies.repository = repository();
    const service = createRoleInterviewService(f.dependencies);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => service.followups(fixtureRequest))
    );
    expect(f.invoke).toHaveBeenCalledOnce();
    expect(results.some(r => r.state === 'completed')).toBe(true);
    f.dependencies.repository = repository();
    expect((await createRoleInterviewService(f.dependencies).followups(fixtureRequest)).state).toBe(
      'completed'
    );
    expect(f.invoke).toHaveBeenCalledOnce();
    await expect(
      service.followups({
        ...fixtureRequest,
        fixedAnswers: [...fixtureRequest.fixedAnswers].reverse(),
      })
    ).rejects.toMatchObject({ status: 409 });
    const rows = await pool.query('SELECT * FROM helixa_role_interview_rounds');
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].rendered_prompt).toContain(fixtureRequest.context.text);
    expect(rows.rows[0].cost_records).toHaveLength(1);
  });
  it('marks stale claims uncertain without acquiring another owner or paying again', async () => {
    const f = fixtureDependencies();
    f.dependencies.repository = repository();
    const method = await f.dependencies.methodology!('en');
    await f.dependencies.repository.claim({
      key: {
        bindingId: 'binding-a',
        interviewId: fixtureRequest.interviewId,
        revision: 1,
        round: 1,
      },
      requestHash: 'b'.repeat(64),
      request: fixtureRequest,
      renderedPrompt: method.template,
      promptHash: 'c'.repeat(64),
    });
    await pool.query("UPDATE helixa_role_interview_rounds SET stale_at=now()-interval '1 second'");
    const key = {
      bindingId: 'binding-a',
      interviewId: fixtureRequest.interviewId,
      revision: 1,
      round: 1,
    };
    expect((await f.dependencies.repository.read(key))!.status).toBe('uncertain');
    const replay = await f.dependencies.repository.claim({
      key,
      requestHash: 'b'.repeat(64),
      request: fixtureRequest,
      renderedPrompt: 'changed runtime',
      promptHash: 'd'.repeat(64),
    });
    expect(replay.owner).toBe(false);
    expect(replay.row.status).toBe('uncertain');
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it('uses durable previous result identity and enforces round ownership and question limits', async () => {
    const f = fixtureDependencies();
    f.dependencies.repository = repository();
    const original = f.invoke.getMockImplementation()!;
    f.invoke.mockImplementationOnce(async () => ({
      ...(await original()),
      content: JSON.stringify({
        questions: [
          {
            question_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
            question_text: 'Which register is owned?',
            question_type: 'open',
            options: null,
            rationale: 'Close a confirmed gap',
          },
        ],
        completeness_score: 0.65,
        stop_recommendation: 'ask_more',
      }),
    }));
    const service = createRoleInterviewService(f.dependencies);
    const first = await service.followups(fixtureRequest);
    const second = {
      ...fixtureRequest,
      round: 2 as const,
      previousResultHash: first.resultHash!,
      followupAnswers: [
        {
          question_id: first.result!.questions[0].question_id,
          value: 'CEDAR-47',
          skipped: false,
        },
      ],
    };
    await expect(
      service.followups({ ...second, previousResultHash: 'e'.repeat(64) })
    ).rejects.toMatchObject({ status: 409 });
    const result = await service.followups(second);
    expect(result.state).toBe('completed');
    expect(f.invoke).toHaveBeenCalledTimes(2);
    const fresh = createRoleInterviewService({ ...f.dependencies, repository: repository() });
    expect(await fresh.followups(second)).toEqual(result);
    expect(f.invoke).toHaveBeenCalledTimes(2);
  });
  it('does not expose prior tenant rows when a binding is reassigned to another organization', async () => {
    const f = fixtureDependencies();
    f.dependencies.repository = repository();
    await createRoleInterviewService(f.dependencies).followups(fixtureRequest);
    const other = '22222222-2222-4222-8222-222222222222';
    await pool.query('INSERT INTO organizations VALUES ($1)', [other]);
    await pool.query('UPDATE helixa_knowledge_sync_bindings SET organization_id=$1', [other]);
    await pool.query('UPDATE organization_members SET organization_id=$1', [other]);
    await pool.query('UPDATE users SET organization_id=$1', [other]);
    const key = {
      bindingId: 'binding-a',
      interviewId: fixtureRequest.interviewId,
      revision: 1,
      round: 1,
    };
    expect(await f.dependencies.repository.read(key)).toBeNull();
    await expect(
      f.dependencies.repository.claim({
        key,
        requestHash: 'd'.repeat(64),
        request: fixtureRequest,
        renderedPrompt: 'new tenant',
        promptHash: 'c'.repeat(64),
      })
    ).rejects.toMatchObject({ status: 403 });
  });
  it('denies interactive principals and anonymous/authenticated ledger access', async () => {
    for (const role of ['anon', 'authenticated']) {
      const result = await pool.query('SELECT has_table_privilege($1,$2,$3) AS allowed', [
        role,
        'helixa_role_interview_rounds',
        'SELECT',
      ]);
      expect(result.rows[0].allowed).toBe(false);
      const execute = await pool.query(
        "SELECT has_function_privilege($1,'public.claim_helixa_role_interview_round(TEXT,TEXT,BIGINT,INTEGER,TEXT,JSONB,TEXT,TEXT)','EXECUTE') AS allowed",
        [role]
      );
      expect(execute.rows[0].allowed).toBe(false);
    }
    await pool.query(
      `UPDATE auth.users SET raw_app_meta_data='{"kind":"service_principal","interactive_login_allowed":true}'`
    );
    const f = fixtureDependencies();
    f.dependencies.repository = repository();
    await expect(
      createRoleInterviewService(f.dependencies).followups(fixtureRequest)
    ).rejects.toMatchObject({ status: 403 });
    expect(f.invoke).not.toHaveBeenCalled();
  });
});
