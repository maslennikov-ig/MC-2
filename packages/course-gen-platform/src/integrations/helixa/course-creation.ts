import { createHash } from 'node:crypto';
import { z } from 'zod';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const HelixaCourseCreationCommandSchema = z
  .object({
    schemaVersion: z.literal('helixa.megacampus-course-create.v1'),
    commandId: z.string().trim().min(1).max(200),
    proposalId: z.string().trim().min(1).max(200),
    approvedRevision: z.number().int().positive(),
    course: z
      .object({
        title: z.string().trim().min(1).max(200),
        brief: z.string().trim().min(1).max(7000),
        language: z.enum(['ru', 'en']),
      })
      .strict(),
    selectedSources: z
      .array(
        z
          .object({
            documentId: z.string().trim().min(1).max(300),
            sourceRevisionHash: sha256,
            citationId: z.string().trim().min(1).max(300),
          })
          .strict()
      )
      .max(50),
  })
  .strict();

export type HelixaCourseCreationCommand = z.infer<typeof HelixaCourseCreationCommandSchema>;

export function parseHelixaCourseCreationCommand(value: unknown): HelixaCourseCreationCommand {
  return HelixaCourseCreationCommandSchema.parse(value);
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value !== 'object') throw new TypeError('command must be JSON');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

export function helixaCourseCreationPayloadHash(command: HelixaCourseCreationCommand): string {
  return createHash('sha256').update(canonical(command), 'utf8').digest('hex');
}

export interface HelixaCourseCreationReceipt {
  commandId: string;
  courseId: string;
  status: 'completed';
}

export interface HelixaCourseCreationRepository {
  reserve(input: {
    command: HelixaCourseCreationCommand;
    payloadHash: string;
    bindingId: string;
    externalOrganizationId: string;
    externalProjectId: string;
  }): Promise<
    | { kind: 'conflict' }
    | {
        kind: 'reserved';
        payloadHash: string;
        courseId: string;
        status: 'pending' | 'completed' | 'action_required';
        receipt?: HelixaCourseCreationReceipt;
      }
  >;
  complete(input: {
    commandId: string;
    courseId: string;
  }): Promise<HelixaCourseCreationReceipt | null>;
  actionRequired(input: { commandId: string; courseId: string; safeError: string }): Promise<void>;
}

export interface FakeHelixaCourseCreationPort {
  create(input: {
    courseId: string;
    command: HelixaCourseCreationCommand;
    binding: HelixaCourseCreationBinding;
  }): Promise<{ courseId: string }>;
}

/** Local acceptance adapter only: it records one deterministic fake completion per reserved course ID. */
export function createInMemoryFakeHelixaCourseCreationPort(options: {
  complete(input: {
    courseId: string;
    command: HelixaCourseCreationCommand;
    binding: HelixaCourseCreationBinding;
  }): Promise<void> | void;
}): FakeHelixaCourseCreationPort {
  const completions = new Map<string, Promise<void>>();
  return {
    async create(input) {
      let completion = completions.get(input.courseId);
      if (!completion) {
        completion = Promise.resolve(options.complete(input));
        completions.set(input.courseId, completion);
      }
      await completion;
      return { courseId: input.courseId };
    },
  };
}

export interface HelixaCourseCreationBinding {
  bindingId: string;
  externalOrganizationId: string;
  externalProjectId: string;
}

export interface HelixaCourseCreationComposition {
  mode: 'disabled' | 'fake';
  binding: HelixaCourseCreationBinding;
}

export async function executeHelixaCourseCreationCommand(input: {
  command: unknown;
  composition: HelixaCourseCreationComposition;
  repository: HelixaCourseCreationRepository;
  fakePort: FakeHelixaCourseCreationPort;
}): Promise<HelixaCourseCreationReceipt | { commandId: string; status: 'conflict' }> {
  if (input.composition.mode !== 'fake') throw new Error('Helixa course creation is disabled');
  const command = parseHelixaCourseCreationCommand(input.command);
  const reservation = await input.repository.reserve({
    command,
    payloadHash: helixaCourseCreationPayloadHash(command),
    ...input.composition.binding,
  });
  if (reservation.kind === 'conflict') return { commandId: command.commandId, status: 'conflict' };
  if (reservation.status === 'completed' && reservation.receipt) return reservation.receipt;
  if (reservation.status === 'action_required') {
    throw new Error('Helixa course creation requires operator action');
  }

  try {
    const created = await input.fakePort.create({
      courseId: reservation.courseId,
      command,
      binding: input.composition.binding,
    });
    if (created.courseId !== reservation.courseId)
      throw new Error('Fake creation returned a different course ID');
    const receipt = await input.repository.complete({
      commandId: command.commandId,
      courseId: reservation.courseId,
    });
    if (receipt == null) throw new Error('Course creation completion lost its reservation');
    return receipt;
  } catch (error) {
    await input.repository.actionRequired({
      commandId: command.commandId,
      courseId: reservation.courseId,
      safeError: 'Fake course creation failed',
    });
    throw error;
  }
}
