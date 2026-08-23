import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';

import {
  createPostgresHelixaCourseCreationRepository,
  executeHelixaCourseCreationCommand,
  helixaCourseCreationPayloadHash,
  parseHelixaCourseCreationCommand,
} from '@/integrations/helixa/course-creation';

const REAL_PG17 = process.env.MC2_HELIXA_REAL_PG17 === '1';
const POSTGRES_IMAGE = 'postgres:17.10-bookworm';
const POSTGRES_PASSWORD = 'helixa-course-command-fixture-only';
const CONTAINER = `mc2-helixa-command-${process.pid}-${Date.now()}`;
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const BINDING = {
  bindingId: 'helixa-binding-fixture',
  organizationId: ORGANIZATION_ID,
  environment: 'test',
  destinationBindingId: 'megacampus-fixture',
} as const;

const command = {
  schemaVersion: 'helixa.megacampus-course-create.v1',
  commandId: `megacampus_course_command:${'b'.repeat(64)}`,
  proposalId: 'proposal-1',
  approvedRevision: Number.MAX_SAFE_INTEGER,
  course: { title: 'Safety', brief: 'Learn safe operations.', language: 'ru' },
  selectedSources: [
    { documentId: 'document-1', sourceRevisionHash: 'a'.repeat(64), citationId: 'citation-1' },
  ],
} as const;

function docker(args: string[], timeout = 120_000): string {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return (result.stdout ?? '').trim();
}

function rpcClient(pool: Pool) {
  return {
    async rpc<T>(name: string, args: Record<string, unknown>) {
      try {
        if (name === 'reserve_helixa_course_creation_command') {
          const result = await pool.query(
            `SELECT * FROM reserve_helixa_course_creation_command($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              args.p_binding_id,
              args.p_organization_id,
              args.p_environment,
              args.p_destination_binding_id,
              args.p_command_id,
              args.p_proposal_id,
              args.p_approved_revision,
              args.p_payload_hash,
            ]
          );
          return { data: result.rows as T, error: null };
        }
        if (name === 'complete_helixa_course_creation_command') {
          const result = await pool.query(
            `SELECT complete_helixa_course_creation_command($1, $2, $3, $4, $5) AS value`,
            [
              args.p_binding_id,
              args.p_command_id,
              args.p_course_id,
              args.p_lease_token,
              args.p_claim_generation,
            ]
          );
          return { data: result.rows[0]?.value as T, error: null };
        }
        if (name === 'renew_helixa_course_creation_command') {
          const result = await pool.query(
            `SELECT renew_helixa_course_creation_command($1, $2, $3, $4, $5) AS value`,
            [
              args.p_binding_id,
              args.p_command_id,
              args.p_course_id,
              args.p_lease_token,
              args.p_claim_generation,
            ]
          );
          return { data: result.rows[0]?.value as T, error: null };
        }
        if (name === 'action_required_helixa_course_creation_command') {
          const result = await pool.query(
            `SELECT action_required_helixa_course_creation_command($1, $2, $3, $4, $5, $6) AS value`,
            [
              args.p_binding_id,
              args.p_command_id,
              args.p_course_id,
              args.p_safe_error,
              args.p_lease_token,
              args.p_claim_generation,
            ]
          );
          return { data: result.rows[0]?.value as T, error: null };
        }
        throw new Error(`Unexpected RPC: ${name}`);
      } catch (error) {
        return {
          data: null,
          error: { message: error instanceof Error ? error.message : String(error) },
        };
      }
    },
  };
}

let pool: Pool;

describe.runIf(REAL_PG17)('Helixa course command PostgreSQL concurrency', () => {
  beforeAll(async () => {
    docker([
      'run',
      '--rm',
      '--name',
      CONTAINER,
      '-e',
      `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
      '-p',
      '127.0.0.1::5432',
      '-d',
      POSTGRES_IMAGE,
    ]);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const ready = spawnSync('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres']);
      if (ready.status === 0) break;
      await new Promise(resolve => setTimeout(resolve, 50));
      if (attempt === 99) throw new Error('Disposable PostgreSQL did not become ready');
    }
    const port = Number(docker(['port', CONTAINER, '5432/tcp']).split(':').at(-1));
    pool = new Pool({
      host: '127.0.0.1',
      port,
      database: 'postgres',
      user: 'postgres',
      password: POSTGRES_PASSWORD,
      max: 4,
    });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await pool.query('SELECT 1');
        break;
      } catch (error) {
        if (attempt === 99) throw error;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    const migration = await readFile(
      new URL(
        '../../../../supabase/migrations/20260823060000_helixa_course_creation_commands.sql',
        import.meta.url
      ),
      'utf8'
    );
    await pool.query(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN;
      CREATE TABLE organizations(id UUID PRIMARY KEY);
      CREATE TABLE helixa_knowledge_sync_bindings (
        binding_id TEXT PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organizations(id),
        environment TEXT NOT NULL,
        destination_binding_id TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (binding_id, organization_id, environment, destination_binding_id)
      );
      ${migration}
      INSERT INTO organizations(id) VALUES ('${ORGANIZATION_ID}');
      INSERT INTO helixa_knowledge_sync_bindings(
        binding_id, organization_id, environment, destination_binding_id, enabled,
        course_creation_enabled, source_helixa_organization_id, source_helixa_project_id
      ) VALUES (
        '${BINDING.bindingId}', '${ORGANIZATION_ID}', '${BINDING.environment}',
        '${BINDING.destinationBindingId}', true, true, 'helixa-org-fixture', 'helixa-project-fixture'
      );
    `);
  }, 120_000);

  beforeEach(async () => {
    await pool.query('TRUNCATE helixa_course_creation_commands');
  });

  afterAll(async () => {
    await pool?.end();
    spawnSync('docker', ['rm', '-f', CONTAINER], { encoding: 'utf8', timeout: 30_000 });
  });

  it('executes one fake mutation and returns one receipt to concurrent exact callers', async () => {
    const mutation = vi.fn(async ({ courseId }: { courseId: string }) => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return { courseId };
    });
    const composition = { mode: 'fake' as const, binding: BINDING };
    const firstRepository = createPostgresHelixaCourseCreationRepository(rpcClient(pool), BINDING);
    const secondRepository = createPostgresHelixaCourseCreationRepository(rpcClient(pool), BINDING);

    const [first, second] = await Promise.all([
      executeHelixaCourseCreationCommand({
        command,
        composition,
        repository: firstRepository,
        fakePort: { create: mutation },
      }),
      executeHelixaCourseCreationCommand({
        command,
        composition,
        repository: secondRepository,
        fakePort: { create: mutation },
      }),
    ]);

    expect(mutation).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ commandId: command.commandId, status: 'completed' });
    const ledger = await pool.query(
      `SELECT count(*)::int AS count, min(status) AS status
       FROM helixa_course_creation_commands WHERE command_id = $1`,
      [command.commandId]
    );
    expect(ledger.rows[0]).toEqual({ count: 1, status: 'completed' });
  });

  it('keeps a changed payload in conflict without a second mutation', async () => {
    const mutation = vi.fn(({ courseId }: { courseId: string }) => Promise.resolve({ courseId }));
    const composition = { mode: 'fake' as const, binding: BINDING };
    const repository = createPostgresHelixaCourseCreationRepository(rpcClient(pool), BINDING);

    await executeHelixaCourseCreationCommand({
      command,
      composition,
      repository,
      fakePort: { create: mutation },
    });
    const conflict = await executeHelixaCourseCreationCommand({
      command: { ...command, course: { ...command.course, title: 'Changed' } },
      composition,
      repository,
      fakePort: { create: mutation },
    });

    expect(conflict).toEqual({ commandId: command.commandId, status: 'conflict' });
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it('recovers a missing deterministic course after the execution lease expires', async () => {
    const crashedRepository = createPostgresHelixaCourseCreationRepository(
      rpcClient(pool),
      BINDING
    );
    const parsedCommand = parseHelixaCourseCreationCommand(command);
    const reservation = await crashedRepository.reserve({
      command: parsedCommand,
      payloadHash: helixaCourseCreationPayloadHash(parsedCommand),
      ...BINDING,
    });
    expect(reservation).toMatchObject({
      kind: 'reserved',
      mutationOwner: true,
      claimGeneration: 1,
      leaseToken: expect.any(String),
    });
    if (reservation.kind === 'conflict') throw new Error('unexpected conflict');
    const priorLease = {
      leaseToken: reservation.leaseToken,
      claimGeneration: reservation.claimGeneration,
    };
    await pool.query(
      `UPDATE helixa_course_creation_commands SET lease_expires_at = NOW() - INTERVAL '1 second'
       WHERE command_id = $1`,
      [command.commandId]
    );

    const calls: string[] = [];
    const reconciliationStarted = Promise.withResolvers<void>();
    const continueReconciliation = Promise.withResolvers<void>();
    const recovery = executeHelixaCourseCreationCommand({
      command,
      composition: { mode: 'fake', binding: BINDING },
      repository: createPostgresHelixaCourseCreationRepository(rpcClient(pool), BINDING),
      fakePort: {
        reconcile: async () => {
          calls.push('reconcile');
          reconciliationStarted.resolve();
          await continueReconciliation.promise;
          return 'missing' as const;
        },
        create: ({ courseId }) => {
          calls.push('create');
          return Promise.resolve({ courseId });
        },
      },
    });

    await reconciliationStarted.promise;
    await expect(
      crashedRepository.complete({
        commandId: command.commandId,
        courseId: reservation.courseId,
        ...priorLease,
      })
    ).resolves.toBeNull();
    continueReconciliation.resolve();
    const recovered = await recovery;

    expect(calls).toEqual(['reconcile', 'create']);
    expect(recovered).toMatchObject({ commandId: command.commandId, status: 'completed' });
    const ledger = await pool.query(
      `SELECT status, claim_generation FROM helixa_course_creation_commands WHERE command_id = $1`,
      [command.commandId]
    );
    expect(ledger.rows[0]).toEqual({ status: 'completed', claim_generation: 2 });
  });

  it('reconciles a completed deterministic course before stale takeover can mutate again', async () => {
    const crashedRepository = createPostgresHelixaCourseCreationRepository(
      rpcClient(pool),
      BINDING
    );
    const parsedCommand = parseHelixaCourseCreationCommand(command);
    const reservation = await crashedRepository.reserve({
      command: parsedCommand,
      payloadHash: helixaCourseCreationPayloadHash(parsedCommand),
      ...BINDING,
    });
    if (reservation.kind === 'conflict') throw new Error('unexpected conflict');
    await pool.query(
      `UPDATE helixa_course_creation_commands SET lease_expires_at = NOW() - INTERVAL '1 second'
       WHERE command_id = $1`,
      [command.commandId]
    );
    const create = vi.fn(() => Promise.reject(new Error('duplicate mutation')));

    const recovered = await executeHelixaCourseCreationCommand({
      command,
      composition: { mode: 'fake', binding: BINDING },
      repository: createPostgresHelixaCourseCreationRepository(rpcClient(pool), BINDING),
      fakePort: {
        reconcile: () => Promise.resolve('completed' as const),
        create,
      },
    });

    expect(recovered).toMatchObject({
      commandId: command.commandId,
      courseId: reservation.courseId,
      status: 'completed',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('grants one new owner when two receivers race for a stale lease', async () => {
    const parsedCommand = parseHelixaCourseCreationCommand(command);
    const payloadHash = helixaCourseCreationPayloadHash(parsedCommand);
    const repository = createPostgresHelixaCourseCreationRepository(rpcClient(pool), BINDING);
    const initial = await repository.reserve({ command: parsedCommand, payloadHash, ...BINDING });
    if (initial.kind === 'conflict') throw new Error('unexpected conflict');
    await pool.query(
      `UPDATE helixa_course_creation_commands SET lease_expires_at = NOW() - INTERVAL '1 second'
       WHERE command_id = $1`,
      [command.commandId]
    );

    const [first, second] = await Promise.all([
      createPostgresHelixaCourseCreationRepository(rpcClient(pool), BINDING).reserve({
        command: parsedCommand,
        payloadHash,
        ...BINDING,
      }),
      createPostgresHelixaCourseCreationRepository(rpcClient(pool), BINDING).reserve({
        command: parsedCommand,
        payloadHash,
        ...BINDING,
      }),
    ]);
    if (first.kind === 'conflict' || second.kind === 'conflict')
      throw new Error('unexpected conflict');

    expect([first.mutationOwner, second.mutationOwner].filter(Boolean)).toHaveLength(1);
    expect(first.courseId).toBe(initial.courseId);
    expect(second.courseId).toBe(initial.courseId);
    expect(first.claimGeneration).toBe(2);
    expect(second.claimGeneration).toBe(2);
  });
});
