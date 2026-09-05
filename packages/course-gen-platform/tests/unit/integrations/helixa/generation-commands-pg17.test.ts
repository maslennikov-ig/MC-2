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
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return (result.stdout ?? '').trim();
}

let pool: Pool;

describe.runIf(REAL_PG17)('Helixa generation ledger on disposable PostgreSQL 17', () => {
  beforeAll(async () => {
    docker([
      'run',
      '--rm',
      '-d',
      '--name',
      CONTAINER,
      '-e',
      `POSTGRES_PASSWORD=${PASSWORD}`,
      '-p',
      '127.0.0.1::5432',
      'postgres:17.10-bookworm',
    ]);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = spawnSync('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres'], {
        encoding: 'utf8',
      });
      if (ready.status === 0) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const port = docker(['port', CONTAINER, '5432/tcp']).split(':').at(-1)!;
    pool = new Pool({
      connectionString: `postgresql://postgres:${PASSWORD}@127.0.0.1:${port}/postgres`,
    });
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
      CREATE TYPE vector_status AS ENUM ('pending','indexing','indexed','failed');
      CREATE TABLE courses(id uuid PRIMARY KEY, title text NOT NULL DEFAULT 'fixture', slug text NOT NULL DEFAULT 'fixture', user_id uuid NOT NULL REFERENCES users(id), organization_id uuid NOT NULL REFERENCES organizations(id), status text NOT NULL DEFAULT 'draft', course_description text, target_audience text, learning_outcomes text, language text, course_size text, style text, generation_mode text, settings jsonb, has_files boolean, created_at timestamptz, updated_at timestamptz, generation_status text, generation_completed_at timestamptz);
      CREATE TABLE file_catalog(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), course_id uuid REFERENCES courses(id), filename text NOT NULL, original_name text, file_type text NOT NULL, file_size bigint NOT NULL CHECK(file_size > 0), storage_path text NOT NULL, hash text NOT NULL, mime_type text NOT NULL, vector_status vector_status NOT NULL DEFAULT 'pending', markdown_content text, processed_content text, processing_method text, summary_metadata jsonb, priority text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      CREATE TABLE helixa_knowledge_sync_bindings(binding_id text PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), environment text NOT NULL, destination_binding_id text NOT NULL, enabled boolean NOT NULL DEFAULT true, UNIQUE(binding_id,organization_id,environment,destination_binding_id));
      CREATE TABLE helixa_knowledge_sync_outbox(binding_id text NOT NULL, event_id text NOT NULL, object_kind text NOT NULL, object_id uuid NOT NULL, completed_at timestamptz NOT NULL);
      CREATE TABLE job_outbox(outbox_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL REFERENCES courses(id), queue_name text NOT NULL, job_data jsonb NOT NULL, job_options jsonb NOT NULL, target_queue text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    `);
    const courseCreationMigration = await readFile(
      new URL(
        '../../../../supabase/migrations/20260823060000_helixa_course_creation_commands.sql',
        import.meta.url
      ),
      'utf8'
    );
    await pool.query(courseCreationMigration);
    const migration = await readFile(
      new URL(
        '../../../../supabase/migrations/20260823120000_helixa_generation_commands.sql',
        import.meta.url
      ),
      'utf8'
    );
    await pool.query(migration);
    const nativeMigration = await readFile(
      new URL(
        '../../../../supabase/migrations/20260823130000_helixa_generation_native_transactions.sql',
        import.meta.url
      ),
      'utf8'
    );
    await pool.query(nativeMigration);
    const sourceMigration = await readFile(
      new URL(
        '../../../../supabase/migrations/20260823140000_helixa_generation_course_source.sql',
        import.meta.url
      ),
      'utf8'
    );
    await pool.query(sourceMigration);
    const directCourseMigration = await readFile(
      new URL(
        '../../../../supabase/migrations/20260905150000_helixa_create_course_generation.sql',
        import.meta.url
      ),
      'utf8'
    );
    await pool.query(directCourseMigration);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    docker(['rm', '-f', CONTAINER]);
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE job_outbox, course_job_instruction_native_sources, file_catalog, course_job_instruction_sources, role_guide_generation_proofs, helixa_generation_commands, helixa_knowledge_sync_outbox, career_playbooks, courses, helixa_knowledge_sync_bindings, organization_members, users, auth.users, organizations CASCADE'
    );
    await pool.query('INSERT INTO organizations(id) VALUES ($1)', [ORGANIZATION_ID]);
    await pool.query(
      `INSERT INTO auth.users(id,raw_app_meta_data) VALUES ($1,'{"kind":"service_principal","interactive_login_allowed":false}')`,
      [PRINCIPAL_ID]
    );
    await pool.query(
      `INSERT INTO users(id,organization_id,email) VALUES ($1,$2,'principal@example.test')`,
      [PRINCIPAL_ID, ORGANIZATION_ID]
    );
    await pool.query(
      `INSERT INTO organization_members(organization_id,user_id,role) VALUES ($1,$2,'instructor')`,
      [ORGANIZATION_ID, PRINCIPAL_ID]
    );
    await pool.query(
      `INSERT INTO helixa_knowledge_sync_bindings(binding_id,organization_id,environment,destination_binding_id,generation_service_principal_user_id,job_instruction_creation_enabled,course_from_job_instruction_creation_enabled,course_creation_enabled,source_helixa_organization_id,source_helixa_project_id) VALUES ('binding-a',$1,'test','destination-a',$2,true,true,true,'helixa-org','helixa-project')`,
      [ORGANIZATION_ID, PRINCIPAL_ID]
    );
  });

  async function reserve(
    commandId = `megacampus_generation_command:create_job_instruction:v1:${'a'.repeat(64)}`,
    commandHash = 'b'.repeat(64)
  ) {
    return pool.query(
      `SELECT * FROM reserve_helixa_generation_command($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        'binding-a',
        commandId,
        'CREATE_JOB_INSTRUCTION',
        'proposal-a',
        3,
        'c'.repeat(64),
        commandHash,
        {
          schemaVersion: 'helixa.megacampus-generation-command.v1',
          operation: 'CREATE_JOB_INSTRUCTION',
        },
        'ROLE_GUIDE',
      ]
    );
  }

  it('allows one concurrent owner, exact replay, and changed-hash conflict', async () => {
    const [left, right] = await Promise.all([reserve(), reserve()]);
    expect([...left.rows, ...right.rows].filter(row => row.mutation_owner)).toHaveLength(1);
    expect(left.rows[0].object_id).toBe(right.rows[0].object_id);
    const conflict = await reserve(undefined, 'd'.repeat(64));
    expect(conflict.rows[0].conflict).toBe(true);
  });

  it('creates a native no-file course and addresses its job to the selected queue', async () => {
    const commandId = `megacampus_generation_command:create_course:v1:${'2'.repeat(64)}`;
    const course = {
      title: 'Direct onboarding',
      courseDescription: 'A course created from an approved Helixa proposal.',
      targetAudience: 'New managers',
      learningOutcomes: ['Apply the operating policy'],
      language: 'en',
      courseSize: 'mini',
      style: 'practical',
    };
    const selectedSources = [
      { documentId: 'document-a', sourceRevisionHash: 'a'.repeat(64), citationId: 'citation-a' },
    ];
    const commandPayload = {
      schemaVersion: 'helixa.megacampus-generation-command.v1',
      operation: 'CREATE_COURSE',
      commandId,
      proposalId: 'proposal-direct',
      approvedRevision: 1,
      payloadHash: '3'.repeat(64),
      course,
      selectedSources,
    };
    const reserved = (
      await pool.query(
        `SELECT * FROM reserve_helixa_generation_command($1,$2,'CREATE_COURSE','proposal-direct',1,$3,$4,$5,'COURSE')`,
        ['binding-a', commandId, '3'.repeat(64), '4'.repeat(64), commandPayload]
      )
    ).rows[0];
    const scheduled = await pool.query(
      `SELECT schedule_helixa_course($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value`,
      [
        'binding-a',
        commandId,
        reserved.object_id,
        ORGANIZATION_ID,
        PRINCIPAL_ID,
        course,
        selectedSources,
        reserved.lease_token,
        reserved.claim_generation,
        'course-generation-test',
      ]
    );
    expect(scheduled.rows[0].value).toBe(true);
    expect(
      (await pool.query('SELECT * FROM courses WHERE id=$1', [reserved.object_id])).rows[0]
    ).toMatchObject({
      title: course.title,
      has_files: false,
      settings: { includeWebResearch: false, includeBusinessContextSources: false },
    });
    expect(
      (await pool.query('SELECT * FROM job_outbox WHERE entity_id=$1', [reserved.object_id]))
        .rows[0]
    ).toMatchObject({
      queue_name: 'structure_analysis',
      target_queue: 'course-generation-test',
      job_data: expect.objectContaining({
        jobType: 'structure_analysis',
        courseId: reserved.object_id,
      }),
    });
    expect(
      (
        await pool.query('SELECT count(*)::int count FROM file_catalog WHERE course_id=$1', [
          reserved.object_id,
        ])
      ).rows[0].count
    ).toBe(0);
  });

  it('fences stale owners and permits one expired-lease takeover', async () => {
    const initial = (await reserve()).rows[0];
    await pool.query(
      `UPDATE helixa_generation_commands SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE command_id=$1`,
      [initial.command_id]
    );
    const [left, right] = await Promise.all([reserve(), reserve()]);
    expect(
      [left.rows[0].mutation_owner, right.rows[0].mutation_owner].filter(Boolean)
    ).toHaveLength(1);
    expect(left.rows[0].claim_generation).toBe(2);
    const stale = await pool.query(`SELECT renew_helixa_generation_command($1,$2,$3,$4,$5) value`, [
      'binding-a',
      initial.command_id,
      initial.object_id,
      initial.lease_token,
      1,
    ]);
    expect(stale.rows[0].value).toBe(false);
  });

  it('rejects an interactive principal before reserving', async () => {
    await pool.query(
      `UPDATE auth.users SET raw_app_meta_data='{"kind":"service_principal","interactive_login_allowed":true}' WHERE id=$1`,
      [PRINCIPAL_ID]
    );
    await expect(reserve()).rejects.toThrow(/service principal/i);
    expect(
      (await pool.query('SELECT count(*)::int count FROM helixa_generation_commands')).rows[0].count
    ).toBe(0);
  });

  it('records a proven lost-response completion and fences the stale owner', async () => {
    const initial = (await reserve()).rows[0];
    await pool.query(
      `UPDATE helixa_generation_commands SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE command_id=$1`,
      [initial.command_id]
    );
    const takeover = (await reserve()).rows[0];
    const completedAt = '2026-08-23T10:20:00.000Z';
    const eventId = 'mc2:ROLE_GUIDE:fixture';
    await pool.query(
      `INSERT INTO helixa_knowledge_sync_outbox(binding_id,event_id,object_kind,object_id,completed_at) VALUES ('binding-a',$1,'ROLE_GUIDE',$2,$3)`,
      [eventId, initial.object_id, completedAt]
    );
    const reconciled = await pool.query(
      `SELECT * FROM reconcile_completed_helixa_generation_command($1,$2,$3,$4,$5,$6,$7)`,
      [
        'binding-a',
        initial.command_id,
        initial.object_id,
        takeover.lease_token,
        2,
        completedAt,
        eventId,
      ]
    );
    expect(reconciled.rows[0]).toMatchObject({
      status: 'native_completed',
      outbox_event_id: eventId,
    });
    const staleSchedule = await pool.query(
      `SELECT * FROM schedule_helixa_generation_command($1,$2,$3,$4,$5)`,
      ['binding-a', initial.command_id, initial.object_id, initial.lease_token, 1]
    );
    expect(staleSchedule.rows).toEqual([]);
  });

  it('captures immutable ROLE_GUIDE proof and makes normalized Course relation immutable', async () => {
    const reservation = (await reserve()).rows[0];
    await pool.query(
      `INSERT INTO career_playbooks(id,user_id,organization_id,status,completed_at,final_markdown,role_profile_spec,generated_blocks) VALUES ($1,$2,$3,'completed','2026-08-23T10:15:30Z','# Guide','{}','{}')`,
      [reservation.object_id, PRINCIPAL_ID, ORGANIZATION_ID]
    );
    const proof = (
      await pool.query('SELECT * FROM role_guide_generation_proofs WHERE playbook_id=$1', [
        reservation.object_id,
      ])
    ).rows[0];
    expect(proof.source_version).toBe('2026-08-23T10:15:30.000Z');
    expect(proof.content_hash).toBe(
      createHash('sha256')
        .update(
          '{"blocks":[],"lessons":[],"structure":{"roleProfileSpec":{}},"summaryMarkdown":"# Guide"}',
          'utf8'
        )
        .digest('hex')
    );

    const courseId = '44444444-4444-4444-8444-444444444444';
    const courseCommandId = `megacampus_generation_command:create_course_from_job_instruction:v1:${'e'.repeat(64)}`;
    await pool.query(
      `INSERT INTO helixa_generation_commands(binding_id,organization_id,environment,destination_binding_id,command_id,command_kind,proposal_id,approved_revision,proposal_payload_hash,command_hash,command_payload,object_kind,object_id,status,accepted_at,lease_token,lease_expires_at) VALUES ('binding-a',$1,'test','destination-a',$2,'CREATE_COURSE_FROM_JOB_INSTRUCTION','proposal-b',4,$3,$4,$5,'COURSE',$6,'scheduled',NOW(),NULL,NULL)`,
      [
        ORGANIZATION_ID,
        courseCommandId,
        'f'.repeat(64),
        '1'.repeat(64),
        {
          sourceJobInstruction: {
            kind: 'ROLE_GUIDE',
            id: reservation.object_id,
            sourceVersion: proof.source_version,
            contentHash: proof.content_hash,
          },
        },
        courseId,
      ]
    );
    await pool.query(`INSERT INTO courses(id,user_id,organization_id) VALUES ($1,$2,$3)`, [
      courseId,
      PRINCIPAL_ID,
      ORGANIZATION_ID,
    ]);
    await pool.query(
      `INSERT INTO course_job_instruction_sources(course_id,organization_id,job_instruction_id,source_version,source_content_hash,origin_binding_id,origin_command_id) VALUES ($1,$2,$3,$4,$5,'binding-a',$6)`,
      [
        courseId,
        ORGANIZATION_ID,
        reservation.object_id,
        proof.source_version,
        proof.content_hash,
        courseCommandId,
      ]
    );
    await expect(
      pool.query(
        `UPDATE course_job_instruction_sources SET source_version='changed' WHERE course_id=$1`,
        [courseId]
      )
    ).rejects.toThrow(/immutable/i);
  });

  it('rejects a Course relation whose source triple or native organization disagrees', async () => {
    const guide = (await reserve()).rows[0];
    await pool.query(
      `INSERT INTO career_playbooks(id,user_id,organization_id,status,completed_at,final_markdown,role_profile_spec,generated_blocks) VALUES ($1,$2,$3,'completed','2026-08-23T10:15:30Z','# Guide','{}','{}')`,
      [guide.object_id, PRINCIPAL_ID, ORGANIZATION_ID]
    );
    const proof = (
      await pool.query('SELECT * FROM role_guide_generation_proofs WHERE playbook_id=$1', [
        guide.object_id,
      ])
    ).rows[0];
    const courseId = '44444444-4444-4444-8444-444444444444';
    const commandId = `megacampus_generation_command:create_course_from_job_instruction:v1:${'e'.repeat(64)}`;
    await pool.query(
      `INSERT INTO helixa_generation_commands(binding_id,organization_id,environment,destination_binding_id,command_id,command_kind,proposal_id,approved_revision,proposal_payload_hash,command_hash,command_payload,object_kind,object_id,status,accepted_at,lease_token,lease_expires_at) VALUES ('binding-a',$1,'test','destination-a',$2,'CREATE_COURSE_FROM_JOB_INSTRUCTION','proposal-b',4,$3,$4,$5,'COURSE',$6,'scheduled',NOW(),NULL,NULL)`,
      [
        ORGANIZATION_ID,
        commandId,
        'f'.repeat(64),
        '1'.repeat(64),
        {
          sourceJobInstruction: {
            kind: 'ROLE_GUIDE',
            id: guide.object_id,
            sourceVersion: proof.source_version,
            contentHash: proof.content_hash,
          },
        },
        courseId,
      ]
    );
    await pool.query(`INSERT INTO courses(id,user_id,organization_id) VALUES ($1,$2,$3)`, [
      courseId,
      PRINCIPAL_ID,
      ORGANIZATION_ID,
    ]);
    await expect(
      pool.query(
        `INSERT INTO course_job_instruction_sources(course_id,organization_id,job_instruction_id,source_version,source_content_hash,origin_binding_id,origin_command_id) VALUES ($1,$2,$3,$4,$5,'binding-a',$6)`,
        [
          courseId,
          ORGANIZATION_ID,
          guide.object_id,
          proof.source_version,
          '0'.repeat(64),
          commandId,
        ]
      )
    ).rejects.toThrow(/source relation/i);
    const foreignOrganizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const foreignCourseId = '55555555-5555-4555-8555-555555555555';
    const foreignCommandId = `megacampus_generation_command:create_course_from_job_instruction:v1:${'6'.repeat(64)}`;
    await pool.query('INSERT INTO organizations(id) VALUES ($1)', [foreignOrganizationId]);
    await pool.query(
      `INSERT INTO helixa_generation_commands(binding_id,organization_id,environment,destination_binding_id,command_id,command_kind,proposal_id,approved_revision,proposal_payload_hash,command_hash,command_payload,object_kind,object_id,status,accepted_at,lease_token,lease_expires_at) VALUES ('binding-a',$1,'test','destination-a',$2,'CREATE_COURSE_FROM_JOB_INSTRUCTION','proposal-c',5,$3,$4,$5,'COURSE',$6,'scheduled',NOW(),NULL,NULL)`,
      [
        ORGANIZATION_ID,
        foreignCommandId,
        '5'.repeat(64),
        '4'.repeat(64),
        {
          sourceJobInstruction: {
            kind: 'ROLE_GUIDE',
            id: guide.object_id,
            sourceVersion: proof.source_version,
            contentHash: proof.content_hash,
          },
        },
        foreignCourseId,
      ]
    );
    await pool.query(`INSERT INTO courses(id,user_id,organization_id) VALUES ($1,$2,$3)`, [
      foreignCourseId,
      PRINCIPAL_ID,
      foreignOrganizationId,
    ]);
    await expect(
      pool.query(
        `INSERT INTO course_job_instruction_sources(course_id,organization_id,job_instruction_id,source_version,source_content_hash,origin_binding_id,origin_command_id) VALUES ($1,$2,$3,$4,$5,'binding-a',$6)`,
        [
          foreignCourseId,
          ORGANIZATION_ID,
          guide.object_id,
          proof.source_version,
          proof.content_hash,
          foreignCommandId,
        ]
      )
    ).rejects.toThrow(/source relation/i);
    await expect(
      pool.query(
        `INSERT INTO helixa_generation_commands(binding_id,organization_id,environment,destination_binding_id,command_id,command_kind,proposal_id,approved_revision,proposal_payload_hash,command_hash,command_payload,object_kind,status,safe_error_code,lease_token,lease_expires_at) VALUES ('binding-a',$1,'test','destination-a',$2,'CREATE_JOB_INSTRUCTION','proposal-x',1,$3,$4,'{}','ROLE_GUIDE','action_required','arbitrary_internal_error',NULL,NULL)`,
        [
          ORGANIZATION_ID,
          `megacampus_generation_command:create_job_instruction:v1:${'9'.repeat(64)}`,
          '8'.repeat(64),
          '7'.repeat(64),
        ]
      )
    ).rejects.toThrow(/check constraint/i);
  });

  it('atomically locks current ROLE_GUIDE content, creates one Course relation, and enqueues native generation', async () => {
    const guide = (await reserve()).rows[0];
    await pool.query(
      `INSERT INTO career_playbooks(id,user_id,organization_id,status,completed_at,final_markdown,role_profile_spec,generated_blocks) VALUES ($1,$2,$3,'completed','2026-08-23T10:15:30Z','# Guide','{"z":1,"\uE000":2,"\uD800\uDC00":3}','{"second":{"score":2},"first":{"score":1}}')`,
      [guide.object_id, PRINCIPAL_ID, ORGANIZATION_ID]
    );
    const proof = (
      await pool.query('SELECT * FROM role_guide_generation_proofs WHERE playbook_id=$1', [
        guide.object_id,
      ])
    ).rows[0];
    const commandId = `megacampus_generation_command:create_course_from_job_instruction:v1:${'e'.repeat(64)}`;
    const course = {
      title: 'Onboarding',
      courseDescription: 'Derived course',
      targetAudience: 'Managers',
      learningOutcomes: ['Apply guide'],
      language: 'en',
      courseSize: 'mini',
      style: 'practical',
    };
    const source = {
      kind: 'ROLE_GUIDE',
      id: guide.object_id,
      sourceVersion: proof.source_version,
      contentHash: proof.content_hash,
    };
    const reserved = (
      await pool.query(
        `SELECT * FROM reserve_helixa_generation_command($1,$2,'CREATE_COURSE_FROM_JOB_INSTRUCTION','proposal-b',4,$3,$4,$5,'COURSE')`,
        [
          'binding-a',
          commandId,
          'f'.repeat(64),
          '1'.repeat(64),
          {
            schemaVersion: 'helixa.megacampus-generation-command.v1',
            operation: 'CREATE_COURSE_FROM_JOB_INSTRUCTION',
            commandId,
            proposalId: 'proposal-b',
            approvedRevision: 4,
            payloadHash: 'f'.repeat(64),
            course,
            sourceJobInstruction: source,
          },
        ]
      )
    ).rows[0];
    const scheduled = await pool.query(
      `SELECT schedule_helixa_course_from_role_guide($1,$2,$3,$4,$5,$6,$7,$8,$9) value`,
      [
        'binding-a',
        commandId,
        reserved.object_id,
        ORGANIZATION_ID,
        PRINCIPAL_ID,
        course,
        source,
        reserved.lease_token,
        reserved.claim_generation,
      ]
    );
    expect(scheduled.rows[0].value).toBe(true);
    expect(
      (
        await pool.query('SELECT count(*)::int count FROM courses WHERE id=$1', [
          reserved.object_id,
        ])
      ).rows[0].count
    ).toBe(1);
    expect(
      (
        await pool.query('SELECT * FROM course_job_instruction_sources WHERE course_id=$1', [
          reserved.object_id,
        ])
      ).rows[0]
    ).toMatchObject({
      job_instruction_id: guide.object_id,
      source_version: proof.source_version,
      source_content_hash: proof.content_hash,
    });
    expect(
      (
        await pool.query('SELECT count(*)::int count FROM job_outbox WHERE entity_id=$1', [
          reserved.object_id,
        ])
      ).rows[0].count
    ).toBe(1);
    const nativeSource = (
      await pool.query(
        `SELECT source.source_canonical_content, source.source_content_hash, file.hash, file.processed_content
      FROM course_job_instruction_native_sources source JOIN file_catalog file ON file.id=source.file_catalog_id
      WHERE source.course_id=$1`,
        [reserved.object_id]
      )
    ).rows[0];
    expect(nativeSource.source_content_hash).toBe(proof.content_hash);
    expect(nativeSource.hash).toBe(proof.content_hash);
    expect(nativeSource.processed_content).toBe(nativeSource.source_canonical_content);
    expect(createHash('sha256').update(nativeSource.processed_content, 'utf8').digest('hex')).toBe(
      proof.content_hash
    );
    await expect(
      pool.query(`UPDATE file_catalog SET processed_content='changed' WHERE course_id=$1`, [
        reserved.object_id,
      ])
    ).rejects.toThrow(/immutable/i);
    await expect(
      pool.query(
        `UPDATE course_job_instruction_native_sources SET source_canonical_content='changed' WHERE course_id=$1`,
        [reserved.object_id]
      )
    ).rejects.toThrow(/immutable/i);
  });

  it('recomputes current ROLE_GUIDE content in the Course transaction and rolls back all mutation when stale', async () => {
    const guide = (await reserve()).rows[0];
    await pool.query(
      `INSERT INTO career_playbooks(id,user_id,organization_id,status,completed_at,final_markdown,role_profile_spec,generated_blocks) VALUES ($1,$2,$3,'completed','2026-08-23T10:15:30Z','# Original','{}','{}')`,
      [guide.object_id, PRINCIPAL_ID, ORGANIZATION_ID]
    );
    const proof = (
      await pool.query('SELECT * FROM role_guide_generation_proofs WHERE playbook_id=$1', [
        guide.object_id,
      ])
    ).rows[0];
    await pool.query(
      `UPDATE career_playbooks SET final_markdown='# Mutated after proof' WHERE id=$1`,
      [guide.object_id]
    );
    const commandId = `megacampus_generation_command:create_course_from_job_instruction:v1:${'7'.repeat(64)}`;
    const course = {
      title: 'Onboarding',
      courseDescription: 'Derived course',
      targetAudience: 'Managers',
      learningOutcomes: ['Apply guide'],
      language: 'en',
      courseSize: 'mini',
      style: 'practical',
    };
    const source = {
      kind: 'ROLE_GUIDE',
      id: guide.object_id,
      sourceVersion: proof.source_version,
      contentHash: proof.content_hash,
    };
    const commandPayload = {
      schemaVersion: 'helixa.megacampus-generation-command.v1',
      operation: 'CREATE_COURSE_FROM_JOB_INSTRUCTION',
      commandId,
      proposalId: 'proposal-c',
      approvedRevision: 5,
      payloadHash: '6'.repeat(64),
      course,
      sourceJobInstruction: source,
    };
    const reserved = (
      await pool.query(
        `SELECT * FROM reserve_helixa_generation_command($1,$2,'CREATE_COURSE_FROM_JOB_INSTRUCTION','proposal-c',5,$3,$4,$5,'COURSE')`,
        ['binding-a', commandId, '6'.repeat(64), '5'.repeat(64), commandPayload]
      )
    ).rows[0];
    await expect(
      pool.query(`SELECT schedule_helixa_course_from_role_guide($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
        'binding-a',
        commandId,
        reserved.object_id,
        ORGANIZATION_ID,
        PRINCIPAL_ID,
        course,
        source,
        reserved.lease_token,
        reserved.claim_generation,
      ])
    ).rejects.toThrow(/ROLE_GUIDE_SOURCE_STALE/);
    expect(
      (
        await pool.query('SELECT count(*)::int count FROM courses WHERE id=$1', [
          reserved.object_id,
        ])
      ).rows[0].count
    ).toBe(0);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int count FROM course_job_instruction_sources WHERE course_id=$1',
          [reserved.object_id]
        )
      ).rows[0].count
    ).toBe(0);
    expect(
      (
        await pool.query('SELECT count(*)::int count FROM job_outbox WHERE entity_id=$1', [
          reserved.object_id,
        ])
      ).rows[0].count
    ).toBe(0);
    expect(
      (
        await pool.query('SELECT count(*)::int count FROM file_catalog WHERE course_id=$1', [
          reserved.object_id,
        ])
      ).rows[0].count
    ).toBe(0);
  });

  it('uses UTF-8 key order and rejects fractional numbers in SQL canonicalJson/v1', async () => {
    const canonical = await pool.query(`SELECT helixa_canonical_json_v1($1::jsonb) value`, [
      { '\u{10000}': 1, '\uE000': 2 },
    ]);
    expect(canonical.rows[0].value).toBe('{"":2,"𐀀":1}');
    await expect(pool.query(`SELECT helixa_canonical_json_v1('1.5'::jsonb)`)).rejects.toThrow(
      /safe integers/i
    );
  });

  it('fences scheduled observation, permits lost-response takeover, and records terminal failure without mutation replay', async () => {
    const initial = (await reserve()).rows[0];
    await pool.query(`SELECT * FROM schedule_helixa_generation_command($1,$2,$3,$4,$5)`, [
      'binding-a',
      initial.command_id,
      initial.object_id,
      initial.lease_token,
      initial.claim_generation,
    ]);
    const first = (
      await pool.query(`SELECT * FROM claim_scheduled_helixa_generation_command($1,$2)`, [
        'binding-a',
        initial.command_id,
      ])
    ).rows[0];
    expect(first.status).toBe('scheduled');
    expect(
      (
        await pool.query(`SELECT * FROM claim_scheduled_helixa_generation_command($1,$2)`, [
          'binding-a',
          initial.command_id,
        ])
      ).rows
    ).toEqual([]);
    await pool.query(
      `UPDATE helixa_generation_commands SET observation_lease_expires_at=NOW()-INTERVAL '1 second' WHERE command_id=$1`,
      [initial.command_id]
    );
    const takeover = (
      await pool.query(`SELECT * FROM claim_scheduled_helixa_generation_command($1,$2)`, [
        'binding-a',
        initial.command_id,
      ])
    ).rows[0];
    expect(takeover.claim_generation).toBe(first.claim_generation + 1);
    const stale = await pool.query(
      `SELECT fail_observed_helixa_generation_command($1,$2,$3,$4,$5) value`,
      [
        'binding-a',
        initial.command_id,
        initial.object_id,
        first.lease_token,
        first.claim_generation,
      ]
    );
    expect(stale.rows[0].value).toBe(false);
    const failed = await pool.query(
      `SELECT fail_observed_helixa_generation_command($1,$2,$3,$4,$5) value`,
      [
        'binding-a',
        initial.command_id,
        initial.object_id,
        takeover.lease_token,
        takeover.claim_generation,
      ]
    );
    expect(failed.rows[0].value).toBe(true);
    expect(
      (
        await pool.query(
          `SELECT status,safe_error_code FROM helixa_generation_commands WHERE command_id=$1`,
          [initial.command_id]
        )
      ).rows[0]
    ).toEqual({
      status: 'action_required',
      safe_error_code: 'megacampus_generation_native_failed',
    });
  });

  it('observes terminal native failure and keeps success waiting until signed outbox proof exists', async () => {
    const failedCourseId = '44444444-4444-4444-8444-444444444444';
    await pool.query(
      `INSERT INTO courses(id,user_id,organization_id,generation_status) VALUES ($1,$2,$3,'failed')`,
      [failedCourseId, PRINCIPAL_ID, ORGANIZATION_ID]
    );
    expect(
      (
        await pool.query(`SELECT * FROM observe_helixa_native_generation($1,'COURSE',$2)`, [
          ORGANIZATION_ID,
          failedCourseId,
        ])
      ).rows[0].outcome
    ).toBe('failed');

    const completedCourseId = '55555555-5555-4555-8555-555555555555';
    const completedAt = '2026-08-23T10:40:00.000Z';
    await pool.query(
      `INSERT INTO courses(id,user_id,organization_id,generation_status,generation_completed_at) VALUES ($1,$2,$3,'completed',$4)`,
      [completedCourseId, PRINCIPAL_ID, ORGANIZATION_ID, completedAt]
    );
    expect(
      (
        await pool.query(`SELECT * FROM observe_helixa_native_generation($1,'COURSE',$2)`, [
          ORGANIZATION_ID,
          completedCourseId,
        ])
      ).rows[0].outcome
    ).toBe('succeeded_awaiting_signed_import');
    await pool.query(
      `INSERT INTO helixa_knowledge_sync_outbox(binding_id,event_id,object_kind,object_id,completed_at) VALUES ('binding-a','mc2:COURSE:observed','COURSE',$1,$2)`,
      [completedCourseId, completedAt]
    );
    expect(
      (
        await pool.query(`SELECT * FROM observe_helixa_native_generation($1,'COURSE',$2)`, [
          ORGANIZATION_ID,
          completedCourseId,
        ])
      ).rows[0]
    ).toMatchObject({ outcome: 'completed', outbox_event_id: 'mc2:COURSE:observed' });
  });

  it('rejects completion proof whose outbox object kind differs from the command ledger', async () => {
    const initial = (await reserve()).rows[0];
    await pool.query(`SELECT * FROM schedule_helixa_generation_command($1,$2,$3,$4,$5)`, [
      'binding-a',
      initial.command_id,
      initial.object_id,
      initial.lease_token,
      initial.claim_generation,
    ]);
    const claim = (
      await pool.query(`SELECT * FROM claim_scheduled_helixa_generation_command($1,$2)`, [
        'binding-a',
        initial.command_id,
      ])
    ).rows[0];
    const completedAt = '2026-08-23T10:50:00.000Z';
    await pool.query(
      `INSERT INTO helixa_knowledge_sync_outbox(binding_id,event_id,object_kind,object_id,completed_at) VALUES ('binding-a','mc2:wrong-kind','COURSE',$1,$2)`,
      [initial.object_id, completedAt]
    );
    await expect(
      pool.query(`SELECT complete_observed_helixa_generation_command($1,$2,$3,$4,$5,$6,$7)`, [
        'binding-a',
        initial.command_id,
        initial.object_id,
        claim.lease_token,
        claim.claim_generation,
        completedAt,
        'mc2:wrong-kind',
      ])
    ).rejects.toThrow(/completion proof/i);
  });
});
