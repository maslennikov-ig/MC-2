// Split out of `generation-commands.ts` on 2026-09-05. Prettier reformatting the
// densely-authored original took it from 854 to 1258 lines, past the repository's
// 800-line `max-lines` rule, so the file that had only ever been lint-clean because
// it was unformatted had to become several files that are both. Nothing here changed
// behaviour: these are the original declarations, moved. `generation-commands.ts`
// re-exports every one of them, so no import anywhere else had to change.

import { z } from 'zod';

import { sha256 } from './canonical-json';
import { canonicalGenerationJsonV1 } from './generation-canonical-json';

const identifier = z.string().trim().min(1).max(300);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const selectedSource = z
  .object({
    documentId: identifier,
    sourceRevisionHash: hash,
    citationId: identifier,
  })
  .strict();

function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

const selectedSources = z
  .array(selectedSource)
  .min(1)
  .max(64)
  .superRefine((sources, context) => {
    const documentIds = new Set<string>();
    const citationIds = new Set<string>();
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index];
      if (documentIds.has(source.documentId) || citationIds.has(source.citationId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate selected source' });
      }
      documentIds.add(source.documentId);
      citationIds.add(source.citationId);
      if (index > 0) {
        const previous = sources[index - 1];
        const order =
          utf8Compare(previous.documentId, source.documentId) ||
          utf8Compare(previous.citationId, source.citationId);
        if (order >= 0)
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'selected sources are not canonical',
          });
      }
    }
  })
  .readonly();

const common = {
  schemaVersion: z.literal('helixa.megacampus-generation-command.v1'),
  proposalId: identifier,
  approvedRevision: revision,
  payloadHash: hash,
};

const jobInstructionCommand = z
  .object({
    ...common,
    operation: z.literal('CREATE_JOB_INSTRUCTION'),
    commandId: z
      .string()
      .regex(/^megacampus_generation_command:create_job_instruction:v1:[a-f0-9]{64}$/),
    jobInstruction: z
      .object({
        roleTitle: z.string().trim().min(1).max(160),
        businessGoal: z.string().trim().min(1).max(4000),
        context: z.string().trim().min(1).max(12000),
        language: z.enum(['ru', 'en']),
      })
      .strict()
      .readonly(),
    selectedSources,
  })
  .strict();

const courseCommand = z
  .object({
    ...common,
    operation: z.literal('CREATE_COURSE_FROM_JOB_INSTRUCTION'),
    commandId: z
      .string()
      .regex(/^megacampus_generation_command:create_course_from_job_instruction:v1:[a-f0-9]{64}$/),
    course: z
      .object({
        title: z.string().trim().min(1).max(200),
        courseDescription: z.string().trim().min(1).max(7000),
        targetAudience: z.string().trim().min(1).max(2000),
        learningOutcomes: z.array(z.string().trim().min(1).max(500)).min(1).max(20).readonly(),
        language: z.enum(['ru', 'en']),
        courseSize: z.enum(['auto', 'micro', 'mini', 'compact', 'standard', 'comprehensive']),
        style: z.enum([
          'professional',
          'practical',
          'problem_based',
          'analytical',
          'conversational',
          'storytelling',
          'interactive',
          'motivational',
          'academic',
          'technical',
          'research',
          'gamified',
        ]),
      })
      .strict()
      .readonly(),
    sourceJobInstruction: z
      .object({
        kind: z.literal('ROLE_GUIDE'),
        id: identifier,
        sourceVersion: identifier,
        contentHash: hash,
      })
      .strict()
      .readonly(),
  })
  .strict();

export const HelixaGenerationCommandSchema = z.discriminatedUnion('operation', [
  jobInstructionCommand,
  courseCommand,
]);
export type HelixaGenerationCommand = z.infer<typeof HelixaGenerationCommandSchema>;
export type HelixaGenerationOperation = HelixaGenerationCommand['operation'];
export type HelixaGenerationObjectKind = 'ROLE_GUIDE' | 'COURSE';

export const HelixaGenerationLookupQuerySchema = z
  .object({
    schemaVersion: z.literal('helixa.megacampus-generation-lookup.v1'),
    commandId: z.string().max(180),
    payloadHash: hash,
  })
  .strict()
  .readonly();
export type HelixaGenerationLookupQuery = z.infer<typeof HelixaGenerationLookupQuerySchema>;

export function parseHelixaGenerationCommand(value: unknown): HelixaGenerationCommand {
  return HelixaGenerationCommandSchema.parse(value);
}

export function parseHelixaGenerationLookupQuery(value: unknown): HelixaGenerationLookupQuery {
  return HelixaGenerationLookupQuerySchema.parse(value);
}

export function generationCommandHash(command: HelixaGenerationCommand): string {
  return sha256(canonicalGenerationJsonV1(command));
}

/**
 * `disabled` refuses every command. `fake` runs the whole command protocol against a
 * repository that never touches MegaCampus generation, so a caller can exercise the
 * transport end to end. `live` runs it against the PostgreSQL ledger and schedules real
 * work. Absent and empty both mean `disabled`; anything else is a configuration error.
 */
export type HelixaGenerationMode = 'disabled' | 'fake' | 'live';

export function readHelixaGenerationMode(
  environment: NodeJS.ProcessEnv = process.env
): HelixaGenerationMode {
  const value = environment.HELIXA_MEGACAMPUS_GENERATION_MODE;
  if (value == null || value === '' || value === 'disabled') return 'disabled';
  if (value === 'fake') return 'fake';
  if (value === 'live') return 'live';
  throw new Error('Invalid Helixa generation mode');
}
