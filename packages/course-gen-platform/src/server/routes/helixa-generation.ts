/**
 * Inbound HTTP transport for Helixa generation commands.
 *
 * The command ledger, the lease functions and the schema parsing all existed before
 * this file; nothing called them. This router is the transport, and it mirrors the
 * outbound direction in `integrations/helixa/delivery.ts`: an HMAC-SHA256 over the exact
 * bytes received, plus an external-system identifier, both carried in headers.
 *
 * The two directions share one secret, `HELIXA_KNOWLEDGE_SYNC_HMAC_KEY`. Outbound signs
 * with it as `X-Megacampus-Signature`; inbound verifies `X-Helixa-Signature` with it.
 * They are deliberately different header names over the same key, so a signature cannot
 * be replayed across directions by header name alone.
 *
 * The signature is computed over the raw request body, so this route must never sit
 * behind a global JSON parser. See the note in `src/server/index.ts` about why
 * `express.json()` is not applied globally; the raw parser here is scoped to these
 * two paths.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { ZodError, z } from 'zod';

import {
  createHelixaGenerationNativePort,
  createInMemoryHelixaGenerationRepository,
  createPostgresHelixaCourseFromRoleGuideScheduler,
  createPostgresHelixaCourseScheduler,
  createPostgresHelixaGenerationBindingAuthority,
  createPostgresHelixaGenerationRepository,
  createPostgresHelixaNativeObserver,
  createPostgresHelixaNativeReconciler,
  dispatchHelixaGenerationCommandWithAdmission,
  lookupHelixaGenerationCommand,
  readHelixaGenerationMode,
  type GenerationRpcClient,
  type HelixaGenerationBindingAuthority,
  type HelixaGenerationMode,
  type HelixaGenerationNativePort,
  type HelixaGenerationRepository,
} from '@/integrations/helixa/generation-commands';
import {
  createCareerPlaybookGenerationEnqueue,
  createPostgresHelixaRoleGuideScheduler,
} from '@/integrations/helixa/generation-role-guide';
import logger from '@/shared/logger';
import { getSupabaseAdmin } from '@/shared/supabase/admin';

export const HELIXA_GENERATION_BASE_PATH = '/api/integrations/helixa/generation';
export const HELIXA_GENERATION_DISPATCH_PATH = `${HELIXA_GENERATION_BASE_PATH}/dispatch`;
export const HELIXA_GENERATION_LOOKUP_PATH = `${HELIXA_GENERATION_BASE_PATH}/lookup`;

export interface HelixaGenerationRouteRuntime {
  mode: HelixaGenerationMode;
  authority: HelixaGenerationBindingAuthority;
  repository: HelixaGenerationRepository;
  nativePort: HelixaGenerationNativePort;
}

export interface HelixaGenerationRouterOptions {
  /** Defaults to `process.env`. Read per request so a redeploy is not needed to flip the mode. */
  environment?: NodeJS.ProcessEnv;
  /** Overrides the Supabase-backed runtime. Tests inject; production does not. */
  runtime?: (mode: Exclude<HelixaGenerationMode, 'disabled'>) => HelixaGenerationRouteRuntime;
}

type Refusal = { status: number; code: string };

const bindingLocator = z
  .object({ bindingId: z.string().trim().min(1).max(300) })
  .strict()
  .readonly();
const dispatchEnvelope = z.object({ binding: bindingLocator, command: z.unknown() }).strict();
const lookupEnvelope = z.object({ binding: bindingLocator, query: z.unknown() }).strict();

function header(request: Request, name: string): string | null {
  const value = request.headers[name];
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

function isJsonContentType(value: string | undefined): boolean {
  if (!value) return false;
  return value.split(';')[0].trim().toLowerCase() === 'application/json';
}

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  // A length difference is not secret-dependent here: both the signature and the system
  // id have a fixed expected length, so failing early leaks nothing a timing attack could use.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Refuses before any parsing. Every branch answers with a code and nothing else — no
 * echo of the header value, the expected signature, the binding, or any internal id.
 */
function authenticate(request: Request, environment: NodeJS.ProcessEnv): Refusal | null {
  if (!isJsonContentType(request.headers['content-type']))
    return { status: 415, code: 'unsupported_media_type' };
  const externalSystemId = environment.HELIXA_EXTERNAL_SYSTEM_ID;
  const hmacKey = environment.HELIXA_KNOWLEDGE_SYNC_HMAC_KEY;
  if (!externalSystemId || !hmacKey) return { status: 503, code: 'generation_not_configured' };
  const claimedSystemId = header(request, 'x-helixa-external-system-id');
  const signature = header(request, 'x-helixa-signature');
  if (!claimedSystemId || !signature) return { status: 400, code: 'missing_required_header' };
  if (!constantTimeEquals(claimedSystemId, externalSystemId))
    return { status: 403, code: 'unknown_external_system' };
  const raw: unknown = request.body;
  if (!Buffer.isBuffer(raw)) return { status: 400, code: 'malformed_json' };
  const expected = `sha256=${createHmac('sha256', hmacKey).update(raw).digest('hex')}`;
  if (!constantTimeEquals(signature, expected)) return { status: 401, code: 'invalid_signature' };
  return null;
}

function readJsonBody(request: Request): { value: unknown } | Refusal {
  const raw = request.body as Buffer;
  try {
    return { value: JSON.parse(raw.toString('utf8')) as unknown };
  } catch {
    return { status: 400, code: 'malformed_json' };
  }
}

function isRefusal(value: unknown): value is Refusal {
  return typeof value === 'object' && value !== null && 'status' in value && 'code' in value;
}

/**
 * The library signals these three conditions by throwing a plain `Error` with a fixed
 * message. Matching on the message is the coupling that makes it a refusal rather than a
 * 500; the messages are asserted in the route tests so a rename cannot pass silently.
 */
function refusalForThrownError(error: unknown): Refusal {
  const message = error instanceof Error ? error.message : '';
  if (message === 'MegaCampus generation is disabled')
    return { status: 503, code: 'generation_disabled' };
  if (
    message === 'MegaCampus generation binding unavailable' ||
    message === 'MegaCampus generation service principal invalid'
  )
    return { status: 403, code: 'binding_denied' };
  return { status: 500, code: 'generation_failed' };
}

function send(response: Response, refusal: Refusal): void {
  response.status(refusal.status).json({ error: refusal.code });
}

function fakeNativePort(): HelixaGenerationNativePort {
  return {
    reconcile: () => Promise.resolve('missing' as const),
    observe: () => Promise.resolve('running' as const),
    schedule: input => Promise.resolve({ objectId: input.objectId }),
  };
}

function supabaseRuntime(mode: Exclude<HelixaGenerationMode, 'disabled'>) {
  const client = getSupabaseAdmin() as unknown as GenerationRpcClient;
  const authority = createPostgresHelixaGenerationBindingAuthority(client);
  if (mode === 'fake')
    return {
      mode,
      authority,
      repository: createInMemoryHelixaGenerationRepository(),
      nativePort: fakeNativePort(),
    };
  return {
    mode,
    authority,
    repository: createPostgresHelixaGenerationRepository(client),
    nativePort: createHelixaGenerationNativePort({
      // All three commands have a PostgreSQL scheduler. The role-guide one writes the
      // `career_playbooks` row under the command's lease and then enqueues the same job the
      // product enqueues; it cannot do both in one transaction, because `job_outbox` is
      // keyed to `courses(id)`.
      scheduleRoleGuide: createPostgresHelixaRoleGuideScheduler(
        client,
        createCareerPlaybookGenerationEnqueue()
      ),
      scheduleCourseFromRoleGuide: createPostgresHelixaCourseFromRoleGuideScheduler(client),
      scheduleCourse: createPostgresHelixaCourseScheduler(client),
      reconcile: createPostgresHelixaNativeReconciler(client),
      observe: createPostgresHelixaNativeObserver(client),
    }),
  };
}

export function createHelixaGenerationRouter(options: HelixaGenerationRouterOptions = {}): Router {
  const router = Router();
  const environment = options.environment ?? process.env;
  const buildRuntime = options.runtime ?? supabaseRuntime;
  let cached: HelixaGenerationRouteRuntime | null = null;

  function runtime(): HelixaGenerationRouteRuntime | Refusal {
    const mode = readHelixaGenerationMode(environment);
    if (mode === 'disabled') return { status: 503, code: 'generation_disabled' };
    if (!cached || cached.mode !== mode) cached = buildRuntime(mode);
    return cached;
  }

  const rawBody = express.raw({ type: 'application/json', limit: '2mb' });

  function onlyPost(request: Request, response: Response, next: NextFunction): void {
    if (request.method === 'POST') {
      next();
      return;
    }
    response.setHeader('Allow', 'POST');
    send(response, { status: 405, code: 'method_not_allowed' });
  }

  async function handle(
    request: Request,
    response: Response,
    kind: 'dispatch' | 'lookup'
  ): Promise<void> {
    const refusal = authenticate(request, environment);
    if (refusal) {
      logger.warn({ path: request.path, code: refusal.code }, 'Helixa generation call refused');
      send(response, refusal);
      return;
    }
    const parsed = readJsonBody(request);
    if (isRefusal(parsed)) {
      send(response, parsed);
      return;
    }
    const resolved = runtime();
    if (isRefusal(resolved)) {
      send(response, resolved);
      return;
    }
    try {
      if (kind === 'dispatch') await runDispatch(parsed.value, resolved, response);
      else await runLookup(parsed.value, resolved, response);
    } catch (error) {
      if (error instanceof ZodError) {
        send(response, {
          status: 422,
          code: kind === 'dispatch' ? 'invalid_command' : 'invalid_lookup_query',
        });
        return;
      }
      const mapped = refusalForThrownError(error);
      if (mapped.status >= 500)
        logger.error({ err: error, path: request.path }, 'Helixa generation call failed');
      else logger.warn({ path: request.path, code: mapped.code }, 'Helixa generation call refused');
      send(response, mapped);
    }
  }

  async function runDispatch(
    body: unknown,
    resolved: HelixaGenerationRouteRuntime,
    response: Response
  ): Promise<void> {
    const envelope = dispatchEnvelope.safeParse(body);
    if (!envelope.success) {
      send(response, { status: 400, code: 'malformed_body' });
      return;
    }
    const bindingLocatorValue = { bindingId: envelope.data.binding.bindingId };
    const admission = await dispatchHelixaGenerationCommandWithAdmission({
      bindingLocator: bindingLocatorValue,
      command: envelope.data.command,
      mode: resolved.mode,
      authority: resolved.authority,
      repository: resolved.repository,
      nativePort: resolved.nativePort,
    });
    if (admission.result.state === 'conflict') {
      response.status(409).json(admission.result);
      return;
    }
    response.status(admission.newlyReserved ? 202 : 200).json(admission.result);
  }

  async function runLookup(
    body: unknown,
    resolved: HelixaGenerationRouteRuntime,
    response: Response
  ): Promise<void> {
    const envelope = lookupEnvelope.safeParse(body);
    if (!envelope.success) {
      send(response, { status: 400, code: 'malformed_body' });
      return;
    }
    const result = await lookupHelixaGenerationCommand({
      bindingLocator: { bindingId: envelope.data.binding.bindingId },
      query: envelope.data.query,
      mode: resolved.mode,
      authority: resolved.authority,
      repository: resolved.repository,
      nativePort: resolved.nativePort,
    });
    response.status(200).json(result);
  }

  const post =
    (kind: 'dispatch' | 'lookup') => (request: Request, response: Response, next: NextFunction) => {
      handle(request, response, kind).catch(next);
    };

  router.all(HELIXA_GENERATION_DISPATCH_PATH, onlyPost, rawBody, post('dispatch'));
  router.all(HELIXA_GENERATION_LOOKUP_PATH, onlyPost, rawBody, post('lookup'));

  // `express.raw` rejects an oversized body by calling `next(err)`. Without this the
  // global handler would answer 500 for what is a client-side refusal.
  router.use(
    HELIXA_GENERATION_BASE_PATH,
    (error: Error & { type?: string }, _req: Request, res: Response, next: NextFunction) => {
      if (error.type === 'entity.too.large') {
        send(res, { status: 413, code: 'payload_too_large' });
        return;
      }
      next(error);
    }
  );

  return router;
}
