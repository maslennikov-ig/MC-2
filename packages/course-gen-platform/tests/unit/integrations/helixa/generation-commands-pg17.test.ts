import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

const REAL_PG17 = process.env.MC2_HELIXA_GENERATION_REAL_PG17 === '1';
const CONTAINER = `mc2-helixa-generation-${process.pid}-${Date.now()}`;
const PASSWORD = 'local-generation-fixture';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PRINCIPAL_ID = '99999999-9999-4999-8999-999999999999';

function docker(args: string[], timeout = 120_000): string {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return (result.stdout ?? '').trim();
}

let pool: Pool;

describe.runIf(REAL_PG17)('Helixa generation ledger on disposable PostgreSQL 17', () => {
  beforeAll(async () => {
    docker(['run', '--rm', '-d', '--name', CONTAINER, '-e', `POSTGRES_PASSWORD=${PASSWORD}`, '-p', '127.0.0.1::5432', 'postgres:17.10-bookworm']);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = spawnSync('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres'], { encoding: 'utf8' });
      if (ready.status === 0) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const port = docker(['port', CONTAINER, '5432/tcp']).split(':').at(-1)!;
    pool = new Pool({ connectionString: `postgresql://postgres:${PASSWORD}@127.0.0.1:${port}/postgres` });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        await pool.query('SELECT 1');
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    await pool.query(`
      CREATE EXTENSION pgcrypto;
      CREATE SCHEMA auth;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TYPE org_role AS ENUM ('owner','admin','instructor','student');
      CREATE TABLE organizations(id uuid PRIMARY KEY);
      CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_app_meta_data jsonb NOT NULL DEFAULT '{}');
      CREATE TABLE users(id uuid PRIMARY KEY REFERENCES auth.users(id), organization_id uuid NOT NULL REFERENCES organizations(id), email text NOT NULL UNIQUE);
      CREATE TABLE organization_members(organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES auth.users(id), role org_role NOT NULL, UNIQUE(organization_id,user_id));
      CREATE TABLE career_playbooks(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), organization_id uuid NOT NULL REFERENCES organizations(id), status text NOT NULL, completed_at timestamptz, final_markdown text, role_profile_spec jsonb, generated_blocks jsonb);
      CREATE TABLE courses(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), organization_id uuid NOT NULL REFERENCES organizations(id), generation_status text, generation_completed_at timestamptz);
      CREATE TABLE helixa_knowledge_sync_bindings(binding_id text PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), environment text NOT NULL, destination_binding_id text NOT NULL, enabled boolean NOT NULL DEFAULT true, UNIQUE(binding_id,organization_id,environment,destination_binding_id));
      CREATE TABLE helixa_knowledge_sync_outbox(binding_id text NOT NULL, event_id text NOT NULL, object_kind text NOT NULL, object_id uuid NOT NULL, completed_at timestamptz NOT NULL);
    `);
    const migration = await readFile(new URL('../../../../supabase/migrations/20260823120000_helixa_generation_commands.sql', import.meta.url), 'utf8');
    await pool.query(migration);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    docker(['rm', '-f', CONTAINER]);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE course_job_instruction_sources, role_guide_generation_proofs, helixa_generation_commands, helixa_knowledge_sync_outbox, career_playbooks, courses, helixa_knowledge_sync_bindings, organization_members, users, auth.users, organizations CASCADE');
    await pool.query('INSERT INTO organizations(id) VALUES ($1)', [ORGANIZATION_ID]);
    await pool.query(`INSERT INTO auth.users(id,raw_app_meta_data) VALUES ($1,'{"kind":"service_principal","interactive_login_allowed":false}')`, [PRINCIPAL_ID]);
    await pool.query(`INSERT INTO users(id,organization_id,email) VALUES ($1,$2,'principal@example.test')`, [PRINCIPAL_ID, ORGANIZATION_ID]);
    await pool.query(`INSERT INTO organization_members(organization_id,user_id,role) VALUES ($1,$2,'instructor')`, [ORGANIZATION_ID, PRINCIPAL_ID]);
    await pool.query(`INSERT INTO helixa_knowledge_sync_bindings(binding_id,organization_id,environment,destination_binding_id,generation_service_principal_user_id,job_instruction_creation_enabled,course_from_job_instruction_creation_enabled) VALUES ('binding-a',$1,'test','destination-a',$2,true,true)`, [ORGANIZATION_ID, PRINCIPAL_ID]);
  });

  async function reserve(commandId = `megacampus_generation_command:create_job_instruction:v1:${'a'.repeat(64)}`, commandHash = 'b'.repeat(64)) {
    return pool.query(`SELECT * FROM reserve_helixa_generation_command($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      'binding-a', commandId, 'CREATE_JOB_INSTRUCTION', 'proposal-a', 3, 'c'.repeat(64), commandHash,
      { schemaVersion: 'helixa.megacampus-generation-command.v1', operation: 'CREATE_JOB_INSTRUCTION' }, 'ROLE_GUIDE',
    ]);
  }

  it('allows one concurrent owner, exact replay, and changed-hash conflict', async () => {
    const [left, right] = await Promise.all([reserve(), reserve()]);
    expect([...left.rows, ...right.rows].filter(row => row.mutation_owner)).toHaveLength(1);
    expect(left.rows[0].object_id).toBe(right.rows[0].object_id);
    const conflict = await reserve(undefined, 'd'.repeat(64));
    expect(conflict.rows[0].conflict).toBe(true);
  });

  it('fences stale owners and permits one expired-lease takeover', async () => {
    const initial = (await reserve()).rows[0];
    await pool.query(`UPDATE helixa_generation_commands SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE command_id=$1`, [initial.command_id]);
    const [left, right] = await Promise.all([reserve(), reserve()]);
    expect([left.rows[0].mutation_owner, right.rows[0].mutation_owner].filter(Boolean)).toHaveLength(1);
    expect(left.rows[0].claim_generation).toBe(2);
    const stale = await pool.query(`SELECT renew_helixa_generation_command($1,$2,$3,$4,$5) value`, ['binding-a', initial.command_id, initial.object_id, initial.lease_token, 1]);
    expect(stale.rows[0].value).toBe(false);
  });

  it('rejects an interactive principal before reserving', async () => {
    await pool.query(`UPDATE auth.users SET raw_app_meta_data='{"kind":"service_principal","interactive_login_allowed":true}' WHERE id=$1`, [PRINCIPAL_ID]);
    await expect(reserve()).rejects.toThrow(/service principal/i);
    expect((await pool.query('SELECT count(*)::int count FROM helixa_generation_commands')).rows[0].count).toBe(0);
  });

  it('records a proven lost-response completion and fences the stale owner', async () => {
    const initial = (await reserve()).rows[0];
    await pool.query(`UPDATE helixa_generation_commands SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE command_id=$1`, [initial.command_id]);
    const takeover = (await reserve()).rows[0];
    const completedAt = '2026-08-23T10:20:00.000Z';
    const eventId = 'mc2:ROLE_GUIDE:fixture';
    await pool.query(`INSERT INTO helixa_knowledge_sync_outbox(binding_id,event_id,object_kind,object_id,completed_at) VALUES ('binding-a',$1,'ROLE_GUIDE',$2,$3)`, [eventId, initial.object_id, completedAt]);
    const reconciled = await pool.query(`SELECT * FROM reconcile_completed_helixa_generation_command($1,$2,$3,$4,$5,$6,$7)`, ['binding-a', initial.command_id, initial.object_id, takeover.lease_token, 2, completedAt, eventId]);
    expect(reconciled.rows[0]).toMatchObject({ status: 'native_completed', outbox_event_id: eventId });
    const staleSchedule = await pool.query(`SELECT * FROM schedule_helixa_generation_command($1,$2,$3,$4,$5)`, ['binding-a', initial.command_id, initial.object_id, initial.lease_token, 1]);
    expect(staleSchedule.rows).toEqual([]);
  });

  it('captures immutable ROLE_GUIDE proof and makes normalized Course relation immutable', async () => {
    const reservation = (await reserve()).rows[0];
    await pool.query(`INSERT INTO career_playbooks(id,user_id,organization_id,status,completed_at,final_markdown,role_profile_spec,generated_blocks) VALUES ($1,$2,$3,'completed','2026-08-23T10:15:30Z','# Guide','{}','{}')`, [reservation.object_id, PRINCIPAL_ID, ORGANIZATION_ID]);
    const proof = (await pool.query('SELECT * FROM role_guide_generation_proofs WHERE playbook_id=$1', [reservation.object_id])).rows[0];
    expect(proof.source_version).toBe('2026-08-23T10:15:30.000Z');
    expect(proof.content_hash).toBe(createHash('sha256').update('{"blocks":[],"lessons":[],"structure":{"roleProfileSpec":{}},"summaryMarkdown":"# Guide"}', 'utf8').digest('hex'));

    const courseId = '44444444-4444-4444-8444-444444444444';
    const courseCommandId = `megacampus_generation_command:create_course_from_job_instruction:v1:${'e'.repeat(64)}`;
    await pool.query(`INSERT INTO helixa_generation_commands(binding_id,organization_id,environment,destination_binding_id,command_id,command_kind,proposal_id,approved_revision,proposal_payload_hash,command_hash,command_payload,object_kind,object_id,status,accepted_at,lease_token,lease_expires_at) VALUES ('binding-a',$1,'test','destination-a',$2,'CREATE_COURSE_FROM_JOB_INSTRUCTION','proposal-b',4,$3,$4,$5,'COURSE',$6,'scheduled',NOW(),NULL,NULL)`, [ORGANIZATION_ID, courseCommandId, 'f'.repeat(64), '1'.repeat(64), { sourceJobInstruction: { kind: 'ROLE_GUIDE', id: reservation.object_id, sourceVersion: proof.source_version, contentHash: proof.content_hash } }, courseId]);
    await pool.query(`INSERT INTO courses(id,user_id,organization_id) VALUES ($1,$2,$3)`, [courseId, PRINCIPAL_ID, ORGANIZATION_ID]);
    await pool.query(`INSERT INTO course_job_instruction_sources(course_id,organization_id,job_instruction_id,source_version,source_content_hash,origin_binding_id,origin_command_id) VALUES ($1,$2,$3,$4,$5,'binding-a',$6)`, [courseId, ORGANIZATION_ID, reservation.object_id, proof.source_version, proof.content_hash, courseCommandId]);
    await expect(pool.query(`UPDATE course_job_instruction_sources SET source_version='changed' WHERE course_id=$1`, [courseId])).rejects.toThrow(/immutable/i);
  });

  it('rejects a Course relation whose source triple or native organization disagrees', async () => {
    const guide = (await reserve()).rows[0];
    await pool.query(`INSERT INTO career_playbooks(id,user_id,organization_id,status,completed_at,final_markdown,role_profile_spec,generated_blocks) VALUES ($1,$2,$3,'completed','2026-08-23T10:15:30Z','# Guide','{}','{}')`, [guide.object_id, PRINCIPAL_ID, ORGANIZATION_ID]);
    const proof = (await pool.query('SELECT * FROM role_guide_generation_proofs WHERE playbook_id=$1', [guide.object_id])).rows[0];
    const courseId = '44444444-4444-4444-8444-444444444444';
    const commandId = `megacampus_generation_command:create_course_from_job_instruction:v1:${'e'.repeat(64)}`;
    await pool.query(`INSERT INTO helixa_generation_commands(binding_id,organization_id,environment,destination_binding_id,command_id,command_kind,proposal_id,approved_revision,proposal_payload_hash,command_hash,command_payload,object_kind,object_id,status,accepted_at,lease_token,lease_expires_at) VALUES ('binding-a',$1,'test','destination-a',$2,'CREATE_COURSE_FROM_JOB_INSTRUCTION','proposal-b',4,$3,$4,$5,'COURSE',$6,'scheduled',NOW(),NULL,NULL)`, [ORGANIZATION_ID, commandId, 'f'.repeat(64), '1'.repeat(64), { sourceJobInstruction: { kind: 'ROLE_GUIDE', id: guide.object_id, sourceVersion: proof.source_version, contentHash: proof.content_hash } }, courseId]);
    await pool.query(`INSERT INTO courses(id,user_id,organization_id) VALUES ($1,$2,$3)`, [courseId, PRINCIPAL_ID, ORGANIZATION_ID]);
    await expect(pool.query(`INSERT INTO course_job_instruction_sources(course_id,organization_id,job_instruction_id,source_version,source_content_hash,origin_binding_id,origin_command_id) VALUES ($1,$2,$3,$4,$5,'binding-a',$6)`, [courseId, ORGANIZATION_ID, guide.object_id, proof.source_version, '0'.repeat(64), commandId])).rejects.toThrow(/source relation/i);
    const foreignOrganizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const foreignCourseId = '55555555-5555-4555-8555-555555555555';
    const foreignCommandId = `megacampus_generation_command:create_course_from_job_instruction:v1:${'6'.repeat(64)}`;
    await pool.query('INSERT INTO organizations(id) VALUES ($1)', [foreignOrganizationId]);
    await pool.query(`INSERT INTO helixa_generation_commands(binding_id,organization_id,environment,destination_binding_id,command_id,command_kind,proposal_id,approved_revision,proposal_payload_hash,command_hash,command_payload,object_kind,object_id,status,accepted_at,lease_token,lease_expires_at) VALUES ('binding-a',$1,'test','destination-a',$2,'CREATE_COURSE_FROM_JOB_INSTRUCTION','proposal-c',5,$3,$4,$5,'COURSE',$6,'scheduled',NOW(),NULL,NULL)`, [ORGANIZATION_ID, foreignCommandId, '5'.repeat(64), '4'.repeat(64), { sourceJobInstruction: { kind: 'ROLE_GUIDE', id: guide.object_id, sourceVersion: proof.source_version, contentHash: proof.content_hash } }, foreignCourseId]);
    await pool.query(`INSERT INTO courses(id,user_id,organization_id) VALUES ($1,$2,$3)`, [foreignCourseId, PRINCIPAL_ID, foreignOrganizationId]);
    await expect(pool.query(`INSERT INTO course_job_instruction_sources(course_id,organization_id,job_instruction_id,source_version,source_content_hash,origin_binding_id,origin_command_id) VALUES ($1,$2,$3,$4,$5,'binding-a',$6)`, [foreignCourseId, ORGANIZATION_ID, guide.object_id, proof.source_version, proof.content_hash, foreignCommandId])).rejects.toThrow(/source relation/i);
    await expect(pool.query(`INSERT INTO helixa_generation_commands(binding_id,organization_id,environment,destination_binding_id,command_id,command_kind,proposal_id,approved_revision,proposal_payload_hash,command_hash,command_payload,object_kind,status,safe_error_code,lease_token,lease_expires_at) VALUES ('binding-a',$1,'test','destination-a',$2,'CREATE_JOB_INSTRUCTION','proposal-x',1,$3,$4,'{}','ROLE_GUIDE','action_required','arbitrary_internal_error',NULL,NULL)`, [ORGANIZATION_ID, `megacampus_generation_command:create_job_instruction:v1:${'9'.repeat(64)}`, '8'.repeat(64), '7'.repeat(64)])).rejects.toThrow(/check constraint/i);
  });
});
