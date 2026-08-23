import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

import {
  executeHelixaCourseCreationCommand,
  createInMemoryFakeHelixaCourseCreationPort,
  createPostgresHelixaCourseCreationRepository,
  readHelixaCourseCreationMode,
  parseHelixaCourseCreationCommand,
  type HelixaCourseCreationRepository,
} from '@/integrations/helixa/course-creation';

const canonicalCommandId = `megacampus_course_command:${'a'.repeat(64)}`;

const command = {
  schemaVersion: 'helixa.megacampus-course-create.v1',
  commandId: canonicalCommandId,
  proposalId: 'proposal-1',
  approvedRevision: 3,
  course: { title: 'Safety', brief: 'Learn safe operations.', language: 'ru' },
  selectedSources: [
    { documentId: 'document-1', sourceRevisionHash: 'a'.repeat(64), citationId: 'citation-1' },
  ],
} as const;

function repository(): HelixaCourseCreationRepository {
  const rows = new Map<
    string,
    {
      payloadHash: string;
      courseId: string;
      status: 'pending' | 'completed' | 'action_required';
      receipt?: { commandId: string; courseId: string; status: 'completed' };
    }
  >();
  return {
    reserve: vi.fn(async input => {
      const prior = rows.get(input.command.commandId);
      if (prior && prior.payloadHash !== input.payloadHash) return { kind: 'conflict' as const };
      if (prior) return { kind: 'reserved' as const, mutationOwner: false, ...prior };
      const row = {
        payloadHash: input.payloadHash,
        courseId: 'course-reserved-1',
        status: 'pending' as const,
      };
      rows.set(input.command.commandId, row);
      return { kind: 'reserved' as const, mutationOwner: true, ...row };
    }),
    complete: vi.fn(async input => {
      const row = rows.get(input.commandId);
      if (!row || row.courseId !== input.courseId || row.status !== 'pending') return null;
      const receipt = {
        commandId: input.commandId,
        courseId: input.courseId,
        status: 'completed' as const,
      };
      rows.set(input.commandId, { ...row, status: 'completed', receipt });
      return receipt;
    }),
    actionRequired: vi.fn(),
  };
}

describe('Helixa fake course creation command', () => {
  it('uses a named constraint for the SQL reserve conflict target', async () => {
    const sql = await readFile(
      new URL(
        '../../../../supabase/migrations/20260823060000_helixa_course_creation_commands.sql',
        import.meta.url
      ),
      'utf8'
    );
    expect(sql).toContain(
      'CONSTRAINT helixa_course_creation_commands_binding_command_key UNIQUE (binding_id, command_id)'
    );
    expect(sql).toContain(
      'ON CONFLICT ON CONSTRAINT helixa_course_creation_commands_binding_command_key DO NOTHING'
    );
    expect(sql).not.toContain('ON CONFLICT (binding_id, command_id) DO NOTHING');
  });
  it('qualifies command ledger identifiers in every RPC', async () => {
    const sql = await readFile(
      new URL(
        '../../../../supabase/migrations/20260823060000_helixa_course_creation_commands.sql',
        import.meta.url
      ),
      'utf8'
    );
    expect(sql).toContain(
      'FROM helixa_course_creation_commands AS command\n  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id;'
    );
    expect(sql.match(/UPDATE helixa_course_creation_commands AS command/g)).toHaveLength(2);
    expect(
      sql.match(/WHERE command\.binding_id = p_binding_id AND command\.command_id = p_command_id/g)
    ).toHaveLength(3);
  });
  it('keeps the PostgreSQL command contract at the Helixa sender bounds', async () => {
    const sql = await readFile(
      new URL(
        '../../../../supabase/migrations/20260823060000_helixa_course_creation_commands.sql',
        import.meta.url
      ),
      'utf8'
    );
    expect(sql).toContain(
      "command_id TEXT NOT NULL CHECK (command_id ~ '^megacampus_course_command:[a-f0-9]{64}$')"
    );
    expect(sql).toContain('char_length(proposal_id) <= 300');
    expect(sql).toContain(
      'approved_revision BIGINT NOT NULL CHECK (approved_revision BETWEEN 1 AND 9007199254740991)'
    );
    expect(sql).toContain('p_approved_revision BIGINT, p_payload_hash TEXT');
  });
  it('allows only the exact fake runtime mode', () => {
    expect(readHelixaCourseCreationMode({})).toBe('disabled');
    expect(readHelixaCourseCreationMode({ HELIXA_MEGACAMPUS_COURSE_CREATION_MODE: 'fake' })).toBe(
      'fake'
    );
    expect(() =>
      readHelixaCourseCreationMode({ HELIXA_MEGACAMPUS_COURSE_CREATION_MODE: 'FAKE' })
    ).toThrow(/mode/i);
  });

  it('closes Postgres RPC authority over the server binding and maps replay/conflict', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            command_id: canonicalCommandId,
            payload_hash: 'a'.repeat(64),
            course_id: 'course-1',
            status: 'completed',
            conflict: false,
            mutation_owner: false,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            command_id: canonicalCommandId,
            payload_hash: 'a'.repeat(64),
            course_id: 'course-1',
            status: 'pending',
            conflict: true,
            mutation_owner: false,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: false, error: null });
    const durable = createPostgresHelixaCourseCreationRepository({ rpc } as never, {
      bindingId: 'binding-1',
      organizationId: 'mc2-org',
      environment: 'test',
      destinationBindingId: 'destination-1',
    });
    const replay = await durable.reserve({
      command: parseHelixaCourseCreationCommand(command),
      payloadHash: 'a'.repeat(64),
      bindingId: 'ignored',
      organizationId: 'ignored',
      destinationBindingId: 'ignored',
    });
    const conflict = await durable.reserve({
      command: parseHelixaCourseCreationCommand(command),
      payloadHash: 'b'.repeat(64),
      bindingId: 'ignored',
      organizationId: 'ignored',
      destinationBindingId: 'ignored',
    });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_binding_id: 'binding-1',
      p_organization_id: 'mc2-org',
      p_environment: 'test',
      p_destination_binding_id: 'destination-1',
    });
    expect(replay).toMatchObject({ status: 'completed', receipt: { courseId: 'course-1' } });
    expect(conflict).toEqual({ kind: 'conflict' });
    await expect(
      durable.complete({ commandId: canonicalCommandId, courseId: 'other-course' })
    ).resolves.toBeNull();
  });
  it('rejects unknown fields and raw source material', () => {
    expect(() =>
      parseHelixaCourseCreationCommand({ ...command, organizationId: 'caller-owned' })
    ).toThrow(/unrecognized/i);
    expect(() =>
      parseHelixaCourseCreationCommand({
        ...command,
        selectedSources: [{ ...command.selectedSources[0], bytes: 'raw' }],
      })
    ).toThrow(/unrecognized/i);
  });

  it('accepts Helixa maximum title/brief and requires at least one source', () => {
    expect(
      parseHelixaCourseCreationCommand({
        ...command,
        course: { title: 't'.repeat(1000), brief: 'b'.repeat(8000), language: 'en' },
      })
    ).toMatchObject({ course: { title: 't'.repeat(1000), brief: 'b'.repeat(8000) } });
    expect(() => parseHelixaCourseCreationCommand({ ...command, selectedSources: [] })).toThrow();
  });

  it('accepts the shared Helixa sender fixture and rejects looser command bounds', async () => {
    const fixture = JSON.parse(
      await readFile(new URL('./fixtures/course-create-command.v1.json', import.meta.url), 'utf8')
    ) as unknown;

    expect(parseHelixaCourseCreationCommand(fixture)).toMatchObject({
      commandId: canonicalCommandId,
      approvedRevision: Number.MAX_SAFE_INTEGER,
    });
    expect(() =>
      parseHelixaCourseCreationCommand({ ...command, commandId: 'command-1' })
    ).toThrow();
    expect(
      parseHelixaCourseCreationCommand({
        ...command,
        commandId: canonicalCommandId,
        proposalId: 'p'.repeat(300),
      }).proposalId
    ).toHaveLength(300);
    expect(() =>
      parseHelixaCourseCreationCommand({
        ...command,
        commandId: canonicalCommandId,
        proposalId: 'p'.repeat(301),
      })
    ).toThrow();
    expect(() =>
      parseHelixaCourseCreationCommand({
        ...command,
        commandId: canonicalCommandId,
        approvedRevision: Number.MAX_SAFE_INTEGER + 1,
      })
    ).toThrow();
  });

  it('reserves before fake mutation, replays one receipt, and conflicts on a changed payload', async () => {
    const durable = repository();
    const create = vi.fn(async ({ courseId }: { courseId: string }) => ({ courseId }));
    const composition = {
      mode: 'fake' as const,
      binding: {
        bindingId: 'binding-1',
        organizationId: 'mc2-org',
        environment: 'test',
        destinationBindingId: 'destination-1',
      },
    };

    const first = await executeHelixaCourseCreationCommand({
      command,
      composition,
      repository: durable,
      fakePort: { create },
    });
    const replay = await executeHelixaCourseCreationCommand({
      command,
      composition,
      repository: durable,
      fakePort: { create },
    });
    const conflict = await executeHelixaCourseCreationCommand({
      command: { ...command, course: { ...command.course, title: 'Changed' } },
      composition,
      repository: durable,
      fakePort: { create },
    });

    expect(first).toEqual({
      commandId: canonicalCommandId,
      courseId: 'course-reserved-1',
      status: 'completed',
    });
    expect(replay).toEqual(first);
    expect(create).toHaveBeenCalledTimes(1);
    expect(durable.reserve).toHaveBeenCalledBefore(create);
    expect(conflict).toEqual({ commandId: canonicalCommandId, status: 'conflict' });
  });

  it('is disabled unless the server composition enables fake mode', async () => {
    const create = vi.fn();
    await expect(
      executeHelixaCourseCreationCommand({
        command,
        composition: {
          mode: 'disabled',
          binding: {
            bindingId: 'binding-1',
            organizationId: 'mc2-org',
            environment: 'test',
            destinationBindingId: 'destination-1',
          },
        },
        repository: repository(),
        fakePort: { create },
      })
    ).rejects.toThrow(/disabled/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('completes a reserved course ID only once across two receivers', async () => {
    const complete = vi.fn();
    const port = createInMemoryFakeHelixaCourseCreationPort({ complete });
    await Promise.all([
      port.create({
        courseId: 'reserved-course',
        command,
        binding: {
          bindingId: 'binding-1',
          organizationId: 'mc2-org',
          environment: 'test',
          destinationBindingId: 'destination-1',
        },
      }),
      port.create({
        courseId: 'reserved-course',
        command,
        binding: {
          bindingId: 'binding-1',
          organizationId: 'mc2-org',
          environment: 'test',
          destinationBindingId: 'destination-1',
        },
      }),
    ]);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
