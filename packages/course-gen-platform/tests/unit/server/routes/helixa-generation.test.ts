import { createHmac } from 'node:crypto';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { AddressInfo } from 'node:net';

import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  createInMemoryHelixaGenerationRepository,
  readHelixaGenerationMode,
  type HelixaGenerationBindingAuthority,
  type HelixaGenerationNativePort,
  type HelixaGenerationRepository,
} from '@/integrations/helixa/generation-commands';
import {
  createHelixaGenerationRouter,
  HELIXA_GENERATION_DISPATCH_PATH,
  HELIXA_GENERATION_LOOKUP_PATH,
} from '@/server/routes/helixa-generation';

// ---------------------------------------------------------------------------
// A minimal copy of Helixa's own result schemas, transcribed from its
// `megacampus-generation-worker.ts`. It is deliberately a copy and not an import:
// the point is to prove this route answers something the other side will parse.
// ---------------------------------------------------------------------------
const Identifier = z.string().trim().min(1).max(300);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const ObjectRef = z
  .object({ kind: z.enum(['COURSE', 'ROLE_GUIDE']), id: Identifier })
  .strict()
  .readonly();
const SafeErrorCode = z.enum([
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
const Operation = z.enum(['CREATE_JOB_INSTRUCTION', 'CREATE_COURSE_FROM_JOB_INSTRUCTION']);
const HelixaDispatchResultSchema = z.discriminatedUnion('state', [
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
      error: z
        .object({
          code: z.literal('megacampus_generation_command_conflict'),
          retryable: z.literal(false),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...ResultCommon,
      operation: Operation,
      state: z.literal('action_required'),
      object: ObjectRef.optional(),
      error: z.object({ code: SafeErrorCode, retryable: z.literal(false) }).strict(),
    })
    .strict(),
]);
const HelixaLookupResultSchema = z.discriminatedUnion('state', [
  z.object({ ...ResultCommon, state: z.literal('not_found') }).strict(),
  z
    .object({
      ...ResultCommon,
      state: z.literal('conflict'),
      error: z
        .object({
          code: z.literal('megacampus_generation_command_conflict'),
          retryable: z.literal(false),
        })
        .strict(),
    })
    .strict(),
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
      error: z.object({ code: SafeErrorCode, retryable: z.literal(false) }).strict(),
    })
    .strict(),
]);

const HMAC_KEY = 'shared-helixa-secret';
const EXTERNAL_SYSTEM_ID = 'megacampus-test';
const BINDING_ID = 'binding-a';

const jobCommand = {
  schemaVersion: 'helixa.megacampus-generation-command.v1',
  operation: 'CREATE_JOB_INSTRUCTION',
  commandId:
    'megacampus_generation_command:create_job_instruction:v1:5be564997f181c5e1e25f80a324070406718c6bffbf4440256467b0ec8f31467',
  proposalId: 'proposal-a',
  approvedRevision: 3,
  payloadHash: '8daa4156a9241d22eb9c943b3ea5641f589e75086e301995014312c81b4945ee',
  jobInstruction: {
    roleTitle: 'Sales Manager',
    businessGoal: 'Increase predictable revenue while preserving customer trust.',
    context: 'The role owns the B2B sales process for a growing software company.',
    language: 'en',
  },
  selectedSources: [
    { documentId: 'document-a', sourceRevisionHash: 'a'.repeat(64), citationId: 'citation-a' },
  ],
} as const;

const lookupQuery = {
  schemaVersion: 'helixa.megacampus-generation-lookup.v1',
  commandId: jobCommand.commandId,
  payloadHash: jobCommand.payloadHash,
} as const;

function resolvedBinding(bindingId = BINDING_ID) {
  return {
    bindingId,
    organizationId: '11111111-1111-4111-8111-111111111111',
    environment: 'test',
    destinationBindingId: 'destination-a',
    servicePrincipalUserId: '99999999-9999-4999-8999-999999999999',
    jobInstructionCreationEnabled: true,
    courseFromJobInstructionCreationEnabled: true,
    principal: {
      existsInAuth: true,
      existsInPublic: true,
      organizationId: '11111111-1111-4111-8111-111111111111',
      role: 'instructor',
      kind: 'service_principal',
      interactiveLoginAllowed: false,
    },
  };
}

function authority(resolve?: HelixaGenerationBindingAuthority['resolve']) {
  return { resolve: resolve ?? vi.fn(() => Promise.resolve(resolvedBinding())) };
}

function nativePort(): HelixaGenerationNativePort {
  return {
    reconcile: () => Promise.resolve('missing' as const),
    observe: () => Promise.resolve('running' as const),
    schedule: input => Promise.resolve({ objectId: input.objectId }),
  };
}

const servers: Server[] = [];

afterEach(() => {
  while (servers.length > 0) servers.pop()?.close();
});

interface Harness {
  url: string;
  repository: HelixaGenerationRepository;
}

async function start(options: {
  mode?: string;
  hmacKey?: string;
  externalSystemId?: string;
  resolve?: HelixaGenerationBindingAuthority['resolve'];
}): Promise<Harness> {
  const repository = createInMemoryHelixaGenerationRepository();
  const app = express();
  app.use(
    createHelixaGenerationRouter({
      environment: {
        HELIXA_MEGACAMPUS_GENERATION_MODE: options.mode ?? 'fake',
        HELIXA_KNOWLEDGE_SYNC_HMAC_KEY: options.hmacKey ?? HMAC_KEY,
        HELIXA_EXTERNAL_SYSTEM_ID: options.externalSystemId ?? EXTERNAL_SYSTEM_ID,
      } as NodeJS.ProcessEnv,
      runtime: mode => ({
        mode,
        authority: authority(options.resolve),
        repository,
        nativePort: nativePort(),
      }),
    })
  );
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, repository };
}

interface CallResult {
  status: number;
  body: unknown;
}

// Node's `http` rather than `fetch`: the unit-test setup file stubs `fetch` globally.
function call(
  harness: Harness,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    contentType?: string | null;
    signature?: string | null;
    systemId?: string | null;
  } = {}
): Promise<CallResult> {
  const raw = Buffer.from(options.body === undefined ? '' : JSON.stringify(options.body), 'utf8');
  const headers: Record<string, string> = {};
  const contentType = options.contentType === undefined ? 'application/json' : options.contentType;
  if (contentType !== null) headers['content-type'] = contentType;
  const systemId = options.systemId === undefined ? EXTERNAL_SYSTEM_ID : options.systemId;
  if (systemId !== null) headers['x-helixa-external-system-id'] = systemId;
  const signature =
    options.signature === undefined
      ? `sha256=${createHmac('sha256', HMAC_KEY).update(raw).digest('hex')}`
      : options.signature;
  if (signature !== null) headers['x-helixa-signature'] = signature;
  headers['content-length'] = String(raw.length);

  return new Promise<CallResult>((resolve, reject) => {
    const req = httpRequest(
      `${harness.url}${path}`,
      { method: options.method ?? 'POST', headers },
      response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(chunk as Buffer));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: response.statusCode ?? 0,
            body: text.length > 0 ? (JSON.parse(text) as unknown) : null,
          });
        });
      }
    );
    req.on('error', reject);
    if (raw.length > 0) req.write(raw);
    req.end();
  });
}

const dispatchBody = { binding: { bindingId: BINDING_ID }, command: jobCommand };
const lookupBody = { binding: { bindingId: BINDING_ID }, query: lookupQuery };

describe('Helixa generation route: refusals', () => {
  it('refuses a call with no signature header', async () => {
    const harness = await start({});
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, {
      body: dispatchBody,
      signature: null,
    });
    expect(result).toEqual({ status: 400, body: { error: 'missing_required_header' } });
  });

  it('refuses a call with no external system id header', async () => {
    const harness = await start({});
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, {
      body: dispatchBody,
      systemId: null,
    });
    expect(result).toEqual({ status: 400, body: { error: 'missing_required_header' } });
  });

  it('refuses a signature computed over different bytes', async () => {
    const harness = await start({});
    const forged = `sha256=${createHmac('sha256', HMAC_KEY).update('{}').digest('hex')}`;
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, {
      body: dispatchBody,
      signature: forged,
    });
    expect(result).toEqual({ status: 401, body: { error: 'invalid_signature' } });
  });

  it('refuses a signature made with a different key', async () => {
    const harness = await start({ hmacKey: 'another-secret' });
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, { body: dispatchBody });
    expect(result).toEqual({ status: 401, body: { error: 'invalid_signature' } });
  });

  it('refuses an unknown external system id', async () => {
    const harness = await start({});
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, {
      body: dispatchBody,
      systemId: 'somebody-else',
    });
    expect(result).toEqual({ status: 403, body: { error: 'unknown_external_system' } });
  });

  it('refuses a body that is not application/json', async () => {
    const harness = await start({});
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, {
      body: dispatchBody,
      contentType: 'text/plain',
    });
    expect(result).toEqual({ status: 415, body: { error: 'unsupported_media_type' } });
  });

  it('refuses any method other than POST', async () => {
    const harness = await start({});
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, { method: 'GET' });
    expect(result).toEqual({ status: 405, body: { error: 'method_not_allowed' } });
  });

  it('refuses every command while the mode is disabled', async () => {
    const harness = await start({ mode: 'disabled' });
    for (const path of [HELIXA_GENERATION_DISPATCH_PATH, HELIXA_GENERATION_LOOKUP_PATH]) {
      const result = await call(harness, path, {
        body: path === HELIXA_GENERATION_DISPATCH_PATH ? dispatchBody : lookupBody,
      });
      expect(result).toEqual({ status: 503, body: { error: 'generation_disabled' } });
    }
  });

  it('refuses when the shared secret is not configured', async () => {
    const harness = await start({ hmacKey: '' });
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, { body: dispatchBody });
    expect(result).toEqual({ status: 503, body: { error: 'generation_not_configured' } });
  });

  it('refuses a binding the authority does not know', async () => {
    const harness = await start({ resolve: vi.fn(() => Promise.resolve(null)) });
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, { body: dispatchBody });
    expect(result).toEqual({ status: 403, body: { error: 'binding_denied' } });
  });

  it('refuses a binding whose id does not match the caller', async () => {
    const harness = await start({
      resolve: vi.fn(() => Promise.resolve(resolvedBinding('binding-b'))),
    });
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, { body: dispatchBody });
    expect(result).toEqual({ status: 403, body: { error: 'binding_denied' } });
  });

  it('refuses a disabled operation on a known binding', async () => {
    const harness = await start({
      resolve: vi.fn(() =>
        Promise.resolve({ ...resolvedBinding(), jobInstructionCreationEnabled: false })
      ),
    });
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, { body: dispatchBody });
    expect(result).toEqual({ status: 403, body: { error: 'binding_denied' } });
  });

  it('refuses a body that is not JSON at all', async () => {
    const harness = await start({});
    const raw = Buffer.from('not json', 'utf8');
    const result = await new Promise<CallResult>((resolve, reject) => {
      const req = httpRequest(
        `${harness.url}${HELIXA_GENERATION_DISPATCH_PATH}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-helixa-external-system-id': EXTERNAL_SYSTEM_ID,
            'x-helixa-signature': `sha256=${createHmac('sha256', HMAC_KEY).update(raw).digest('hex')}`,
            'content-length': String(raw.length),
          },
        },
        response => {
          const chunks: Buffer[] = [];
          response.on('data', chunk => chunks.push(chunk as Buffer));
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
            })
          );
        }
      );
      req.on('error', reject);
      req.write(raw);
      req.end();
    });
    expect(result).toEqual({ status: 400, body: { error: 'malformed_json' } });
  });

  it('refuses an envelope without a binding locator', async () => {
    const harness = await start({});
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, {
      body: { command: jobCommand },
    });
    expect(result).toEqual({ status: 400, body: { error: 'malformed_body' } });
  });

  it('refuses a command that fails the contract', async () => {
    const harness = await start({});
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, {
      body: { binding: { bindingId: BINDING_ID }, command: { ...jobCommand, approvedRevision: 0 } },
    });
    expect(result).toEqual({ status: 422, body: { error: 'invalid_command' } });
  });

  it('refuses a lookup query that fails the contract', async () => {
    const harness = await start({});
    const result = await call(harness, HELIXA_GENERATION_LOOKUP_PATH, {
      body: { binding: { bindingId: BINDING_ID }, query: { ...lookupQuery, payloadHash: 'nope' } },
    });
    expect(result).toEqual({ status: 422, body: { error: 'invalid_lookup_query' } });
  });
});

describe('Helixa generation route: the protocol', () => {
  it('accepts a first dispatch with 202 and a result Helixa can parse', async () => {
    const harness = await start({});
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, { body: dispatchBody });
    expect(result.status).toBe(202);
    const parsed = HelixaDispatchResultSchema.parse(result.body);
    expect(parsed.state).toBe('accepted');
    expect(parsed.commandId).toBe(jobCommand.commandId);
    expect(parsed.payloadHash).toBe(jobCommand.payloadHash);
    expect(parsed.operation).toBe('CREATE_JOB_INSTRUCTION');
    if (parsed.state === 'accepted') expect(parsed.object.kind).toBe('ROLE_GUIDE');
  });

  it('answers a replayed dispatch with 200 and the same object', async () => {
    const harness = await start({});
    const first = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, { body: dispatchBody });
    const second = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, { body: dispatchBody });
    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    const one = HelixaDispatchResultSchema.parse(first.body);
    const two = HelixaDispatchResultSchema.parse(second.body);
    expect(one.state).toBe('accepted');
    expect(two.state).toBe('accepted');
    if (one.state === 'accepted' && two.state === 'accepted')
      expect(two.object.id).toBe(one.object.id);
  });

  it('answers a conflicting replay with 409', async () => {
    const harness = await start({});
    await call(harness, HELIXA_GENERATION_DISPATCH_PATH, { body: dispatchBody });
    const conflicting = {
      binding: { bindingId: BINDING_ID },
      command: {
        ...jobCommand,
        jobInstruction: { ...jobCommand.jobInstruction, roleTitle: 'Sales Director' },
      },
    };
    const result = await call(harness, HELIXA_GENERATION_DISPATCH_PATH, { body: conflicting });
    expect(result.status).toBe(409);
    const parsed = HelixaDispatchResultSchema.parse(result.body);
    expect(parsed.state).toBe('conflict');
  });

  it('answers a lookup with 200 and a result Helixa can parse', async () => {
    const harness = await start({});
    await call(harness, HELIXA_GENERATION_DISPATCH_PATH, { body: dispatchBody });
    const result = await call(harness, HELIXA_GENERATION_LOOKUP_PATH, { body: lookupBody });
    expect(result.status).toBe(200);
    const parsed = HelixaLookupResultSchema.parse(result.body);
    expect(parsed.state).toBe('scheduled');
    expect(parsed.commandId).toBe(jobCommand.commandId);
  });

  it('answers a lookup for an unknown command with 200 not_found', async () => {
    const harness = await start({});
    const result = await call(harness, HELIXA_GENERATION_LOOKUP_PATH, { body: lookupBody });
    expect(result.status).toBe(200);
    expect(HelixaLookupResultSchema.parse(result.body).state).toBe('not_found');
  });

  it('reads live as a mode of its own and keeps disabled the default', () => {
    expect(readHelixaGenerationMode({})).toBe('disabled');
    expect(readHelixaGenerationMode({ HELIXA_MEGACAMPUS_GENERATION_MODE: 'live' })).toBe('live');
    expect(readHelixaGenerationMode({ HELIXA_MEGACAMPUS_GENERATION_MODE: 'fake' })).toBe('fake');
    expect(() =>
      readHelixaGenerationMode({ HELIXA_MEGACAMPUS_GENERATION_MODE: 'production' })
    ).toThrow('Invalid Helixa generation mode');
  });
});
