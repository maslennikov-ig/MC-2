import { describe, expect, it, vi } from 'vitest';

import {
  executeHelixaCourseCreationCommand,
  createInMemoryFakeHelixaCourseCreationPort,
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

  it('reserves before fake mutation, replays one receipt, and conflicts on a changed payload', async () => {
    const durable = repository();
    const create = vi.fn(async ({ courseId }: { courseId: string }) => ({ courseId }));
    const composition = {
      mode: 'fake' as const,
      binding: {
        bindingId: 'binding-1',
        externalOrganizationId: 'helixa-org',
        externalProjectId: 'helixa-project',
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
            externalOrganizationId: 'helixa-org',
            externalProjectId: 'helixa-project',
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
          externalOrganizationId: 'helixa-org',
          externalProjectId: 'helixa-project',
        },
      }),
      port.create({
        courseId: 'reserved-course',
        command,
        binding: {
          bindingId: 'binding-1',
          externalOrganizationId: 'helixa-org',
          externalProjectId: 'helixa-project',
        },
      }),
    ]);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
