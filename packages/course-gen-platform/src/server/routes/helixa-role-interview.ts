import { createHmac } from 'node:crypto';
import express, { Router, type Request, type Response, type ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { authenticateHelixaRequest } from './helixa-http-auth';
import { createPostgresHelixaGenerationBindingAuthority } from '@/integrations/helixa/generation-postgres';
import type { GenerationRpcClient } from '@/integrations/helixa/generation-types';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import {
  createRoleInterviewService,
  interviewCanonical,
  type InterviewDependencies,
} from '@/integrations/helixa/role-interview';
import { createPostgresInterviewRepository } from '@/integrations/helixa/role-interview-postgres';
import {
  RoleInterviewQuestionsRequestSchema,
  RoleInterviewFollowupsRequestSchema,
  RoleInterviewError,
  RoleInterviewLookupRequestSchema,
} from '@/integrations/helixa/role-interview-schema';

export const HELIXA_INTERVIEW_BASE_PATH = '/api/integrations/helixa/interview';
export function createHelixaRoleInterviewRouter(
  options: {
    environment?: NodeJS.ProcessEnv;
    dependencies?: () => InterviewDependencies;
  } = {}
): Router {
  const router = Router();
  const environment = options.environment ?? process.env;
  let service: ReturnType<typeof createRoleInterviewService> | undefined;
  function runtime() {
    if (!service) {
      if (options.dependencies) service = createRoleInterviewService(options.dependencies());
      else {
        const client = getSupabaseAdmin() as unknown as GenerationRpcClient;
        service = createRoleInterviewService({
          authority: createPostgresHelixaGenerationBindingAuthority(client),
          repository: createPostgresInterviewRepository(client),
        });
      }
    }
    return service;
  }
  function send(response: Response, status: number, body: unknown) {
    const raw = Buffer.from(interviewCanonical(body), 'utf8');
    const key = environment.HELIXA_KNOWLEDGE_SYNC_HMAC_KEY;
    if (key)
      response.setHeader(
        'X-Megacampus-Signature',
        `sha256=${createHmac('sha256', key).update(raw).digest('hex')}`
      );
    response.setHeader('Cache-Control', 'no-store');
    response.status(status).type('application/json').send(raw);
  }
  async function handle(
    request: Request,
    response: Response,
    operation: 'questions' | 'followups' | 'lookup'
  ) {
    const refusal = authenticateHelixaRequest(request, environment);
    if (refusal) {
      send(response, refusal.status, { error: refusal.code });
      return;
    }
    if (environment.HELIXA_ROLE_INTERVIEW_MODE !== 'live') {
      send(response, 503, { error: 'interview_disabled' });
      return;
    }
    try {
      let body: unknown;
      try {
        body = JSON.parse((request.body as Buffer).toString('utf8')) as unknown;
      } catch {
        send(response, 400, { error: 'malformed_json' });
        return;
      }
      if (operation === 'questions') {
        const input = RoleInterviewQuestionsRequestSchema.parse(body);
        send(response, 200, await runtime().questions(input.binding.bindingId, input.uiLanguage));
      } else if (operation === 'lookup') {
        const input = RoleInterviewLookupRequestSchema.parse(body);
        const result = await runtime().lookup({
          bindingId: input.binding.bindingId,
          interviewId: input.interviewId,
          revision: input.revision,
          round: input.round,
          requestHash: input.requestHash,
          methodologyHash: input.methodologyHash,
        });
        send(response, result.state === 'pending' ? 202 : 200, result);
      } else {
        const input = RoleInterviewFollowupsRequestSchema.parse(body);
        const result = await runtime().followups(input);
        send(response, result.state === 'pending' ? 202 : 200, result);
      }
    } catch (error) {
      if (error instanceof RoleInterviewError) send(response, error.status, { error: error.code });
      else if (error instanceof ZodError)
        send(response, 422, { error: 'invalid_interview_request' });
      else if (
        error instanceof Error &&
        /MegaCampus generation (binding unavailable|service principal invalid)/u.test(error.message)
      )
        send(response, 403, { error: 'binding_denied' });
      else send(response, 503, { error: 'interview_unavailable' });
    }
  }
  for (const operation of ['questions', 'followups', 'lookup'] as const) {
    router.all(
      `${HELIXA_INTERVIEW_BASE_PATH}/${operation}`,
      express.raw({ type: 'application/json', limit: '2mb' }),
      (request, response, next) => {
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'POST');
          send(response, 405, { error: 'method_not_allowed' });
          return;
        }
        void handle(request, response, operation).catch(next);
      }
    );
  }
  const bodyError: ErrorRequestHandler = (error: unknown, request, response, next) => {
    if (
      request.path.startsWith(HELIXA_INTERVIEW_BASE_PATH) &&
      (error as { type?: string }).type === 'entity.too.large'
    ) {
      send(response, 413, { error: 'payload_too_large' });
      return;
    }
    next(error);
  };
  router.use(bodyError);
  return router;
}
