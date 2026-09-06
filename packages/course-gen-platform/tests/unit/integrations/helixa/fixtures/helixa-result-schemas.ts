/**
 * Helixa's own result schemas, transcribed from its `megacampus-generation-worker.ts`.
 *
 * Deliberately a copy and not an import: the two repositories do not share a package, and
 * the point of these is to prove that what this side produces the other side will parse.
 * When Helixa changes a schema, this file is what has to change with it, and the test that
 * fails is the one that tells you a shape stopped fitting.
 */

import { z } from 'zod';

const Identifier = z.string().trim().min(1).max(300);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const ObjectRef = z
  .object({ kind: z.enum(['COURSE', 'ROLE_GUIDE']), id: Identifier })
  .strict()
  .readonly();

export const HelixaSafeErrorCodeSchema = z.enum([
  'megacampus_generation_not_authorized',
  'megacampus_generation_binding_unavailable',
  'megacampus_generation_service_principal_invalid',
  'megacampus_generation_source_unavailable',
  'megacampus_generation_source_stale',
  'megacampus_generation_command_conflict',
  'megacampus_generation_transient',
  'megacampus_generation_outcome_uncertain',
  'megacampus_generation_native_failed',
  'megacampus_generation_awaiting_signed_import',
  'megacampus_generation_signed_correlation_invalid',
  'megacampus_generation_contract_invalid',
]);

const ResultCommon = {
  schemaVersion: z.literal('helixa.megacampus-generation-result.v1'),
  commandId: z.string().max(180),
  payloadHash: Sha256,
};
const Operation = z.enum([
  'CREATE_JOB_INSTRUCTION',
  'CREATE_COURSE_FROM_JOB_INSTRUCTION',
  'CREATE_COURSE',
]);
const ConflictError = z
  .object({
    code: z.literal('megacampus_generation_command_conflict'),
    retryable: z.literal(false),
  })
  .strict();

/** Three states only. `native_completed` is a lookup answer, never a dispatch answer. */
export const HelixaDispatchResultSchema = z.discriminatedUnion('state', [
  z
    .object({
      ...ResultCommon,
      operation: Operation,
      state: z.literal('accepted'),
      object: ObjectRef,
      acceptedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      ...ResultCommon,
      operation: Operation,
      state: z.literal('conflict'),
      error: ConflictError,
    })
    .strict(),
  z
    .object({
      ...ResultCommon,
      operation: Operation,
      state: z.literal('action_required'),
      object: ObjectRef.optional(),
      error: z.object({ code: HelixaSafeErrorCodeSchema, retryable: z.literal(false) }).strict(),
    })
    .strict(),
]);

export const HelixaLookupResultSchema = z.discriminatedUnion('state', [
  z.object({ ...ResultCommon, state: z.literal('not_found') }).strict(),
  z.object({ ...ResultCommon, state: z.literal('conflict'), error: ConflictError }).strict(),
  z
    .object({
      ...ResultCommon,
      operation: Operation,
      state: z.enum(['scheduled', 'executing']),
      object: ObjectRef,
      updatedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      ...ResultCommon,
      operation: Operation,
      state: z.literal('native_completed'),
      object: ObjectRef,
      outboxEventId: Identifier,
      nativeCompletedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      ...ResultCommon,
      operation: Operation,
      state: z.literal('action_required'),
      object: ObjectRef,
      error: z.object({ code: HelixaSafeErrorCodeSchema, retryable: z.literal(false) }).strict(),
    })
    .strict(),
]);
