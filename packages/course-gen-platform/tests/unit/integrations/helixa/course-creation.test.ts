import { describe, expect, it, vi } from 'vitest';

import {
  executeHelixaCourseCreationCommand,
  createInMemoryFakeHelixaCourseCreationPort,
  createPostgresHelixaCourseCreationRepository,
  readHelixaCourseCreationMode,
  parseHelixaCourseCreationCommand,
  type HelixaCourseCreationRepository,
} from '@/integrations/helixa/course-creation';

const command = {
  schemaVersion: 'helixa.megacampus-course-create.v1',
  commandId: 'command-1',
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
      if (prior) return { kind: 'reserved' as const, ...prior };
      const row = {
        payloadHash: input.payloadHash,
        courseId: 'course-reserved-1',
        status: 'pending' as const,
      };
      rows.set(input.command.commandId, row);
      return { kind: 'reserved' as const, ...row };
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
            command_id: 'command-1',
            payload_hash: 'a'.repeat(64),
            course_id: 'course-1',
            status: 'completed',
            conflict: false,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            command_id: 'command-1',
            payload_hash: 'a'.repeat(64),
            course_id: 'course-1',
            status: 'pending',
            conflict: true,
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
      durable.complete({ commandId: 'command-1', courseId: 'other-course' })
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
      commandId: 'command-1',
      courseId: 'course-reserved-1',
      status: 'completed',
    });
    expect(replay).toEqual(first);
    expect(create).toHaveBeenCalledTimes(1);
    expect(durable.reserve).toHaveBeenCalledBefore(create);
    expect(conflict).toEqual({ commandId: 'command-1', status: 'conflict' });
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
