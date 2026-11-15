import { createHmac } from 'node:crypto';
import { request as httpRequest, createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { createHelixaRoleInterviewRouter } from '@/server/routes/helixa-role-interview';
import {
  fixtureDependencies,
  fixtureRequest,
} from '../../integrations/helixa/fixtures/role-interview';
const secret = 'unit-interview-secret';
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve())))
  );
});
async function harness(options: { disabled?: boolean; denied?: boolean } = {}) {
  const f = fixtureDependencies();
  if (options.denied) f.dependencies.authority = { resolve: async () => null };
  const app = express();
  app.use(
    createHelixaRoleInterviewRouter({
      environment: {
        HELIXA_KNOWLEDGE_SYNC_HMAC_KEY: secret,
        HELIXA_EXTERNAL_SYSTEM_ID: 'mc2-unit',
        ...(options.disabled ? {} : { HELIXA_ROLE_INTERVIEW_MODE: 'live' }),
      },
      dependencies: () => f.dependencies,
    })
  );
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  async function send(body: unknown, operation = 'questions', valid = true) {
    const raw = JSON.stringify(body);
    return new Promise<{
      status: number;
      raw: string;
      signature: string | undefined;
      body: Record<string, unknown>;
    }>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/integrations/helixa/interview/${operation}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Helixa-External-System-Id': 'mc2-unit',
            'X-Helixa-Signature': `sha256=${createHmac('sha256', valid ? secret : 'wrong')
              .update(raw)
              .digest('hex')}`,
          },
        },
        res => {
          let text = '';
          res.on('data', chunk => {
            text += String(chunk);
          });
          res.on('end', () =>
            resolve({
              status: res.statusCode!,
              raw: text,
              signature: res.headers['x-megacampus-signature'] as string | undefined,
              body: JSON.parse(text) as Record<string, unknown>,
            })
          );
        }
      );
      req.on('error', reject);
      req.end(raw);
    });
  }
  return { ...f, send };
}
const questionRequest = {
  schemaVersion: 'helixa.role-interview-questions.v1',
  binding: { bindingId: 'binding-a' },
  uiLanguage: 'en',
};
describe('signed role interview HTTP facade', () => {
  it('is default-disabled and never reaches the runtime', async () => {
    const f = await harness({ disabled: true });
    expect((await f.send(questionRequest)).status).toBe(503);
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it('checks raw HMAC and current principal/binding before work', async () => {
    const f = await harness();
    expect((await f.send(questionRequest, 'questions', false)).status).toBe(401);
    const denied = await harness({ denied: true });
    expect((await denied.send(questionRequest)).status).toBe(403);
    expect(f.invoke).not.toHaveBeenCalled();
    expect(denied.invoke).not.toHaveBeenCalled();
  });
  it('returns native questions with a verifiable response signature and rejects unknown fields', async () => {
    const f = await harness();
    const result = await f.send(questionRequest);
    expect(result.status).toBe(200);
    expect(result.body.questions).toHaveLength(6);
    expect(result.signature).toBe(
      `sha256=${createHmac('sha256', secret).update(result.raw).digest('hex')}`
    );
    expect((await f.send({ ...questionRequest, userId: 'injected' })).status).toBe(422);
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it('refuses oversized raw bodies with a safe signed JSON error', async () => {
    const f = await harness();
    const result = await f.send({ text: 'x'.repeat(2 * 1024 * 1024) });
    expect(result.status).toBe(413);
    expect(result.body).toEqual({ error: 'payload_too_large' });
    expect(result.signature).toBe(
      `sha256=${createHmac('sha256', secret).update(result.raw).digest('hex')}`
    );
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it('reconciles through signed lookup without ever creating a new paid claim', async () => {
    const f = await harness();
    const body = {
      schemaVersion: 'helixa.role-interview-lookup.v1',
      binding: fixtureRequest.binding,
      interviewId: fixtureRequest.interviewId,
      revision: 1,
      round: 1,
      requestHash: 'b'.repeat(64),
      methodologyHash: fixtureRequest.methodologyHash,
    };
    const absent = await f.send(body, 'lookup');
    expect(absent.body.state).toBe('action_required');
    expect(absent.body.error).toEqual({ code: 'interview_request_not_found', retryable: false });
    expect(f.rows.size).toBe(0);
    expect(f.invoke).not.toHaveBeenCalled();
    const result = await f.send(fixtureRequest, 'followups');
    const found = await f.send({ ...body, requestHash: result.body.requestHash }, 'lookup');
    expect(found.raw).toBe(result.raw);
    expect(f.invoke).toHaveBeenCalledOnce();
  });
  it('exact-replays immutable response bytes, conflicts changed input and signs the result', async () => {
    const f = await harness();
    const first = await f.send(fixtureRequest, 'followups');
    expect(first.status).toBe(200);
    expect(first.body.state).toBe('completed');
    const replay = await f.send(fixtureRequest, 'followups');
    expect(replay.raw).toBe(first.raw);
    expect(replay.signature).toBe(first.signature);
    const conflict = await f.send(
      { ...fixtureRequest, fixedAnswers: [...fixtureRequest.fixedAnswers].reverse() },
      'followups'
    );
    expect(conflict.status).toBe(409);
    expect(f.invoke).toHaveBeenCalledOnce();
  });
  it.each(['question', 'aggregate options'])(
    'signs a truthful uncertain %s result and lookup without another model attempt',
    async oversized => {
      const f = await harness();
      const original = f.invoke.getMockImplementation()!;
      f.invoke.mockImplementation(async () => ({
        ...(await original()),
        content: JSON.stringify({
          questions: [
            {
              question_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
              question_text: oversized === 'question' ? 'q'.repeat(3001) : 'Which option?',
              question_type: 'single_choice',
              options:
                oversized === 'question'
                  ? null
                  : [
                      { value: 'a'.repeat(750), label: 'A'.repeat(750) },
                      { value: 'b'.repeat(750), label: 'B'.repeat(750) },
                    ],
              rationale: 'Close an operational gap',
            },
          ],
          completeness_score: 0.65,
          stop_recommendation: 'ask_more',
        }),
      }));
      const first = await f.send(fixtureRequest, 'followups');
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ state: 'uncertain', error: { retryable: false } });
      expect(first.body.result).toBeUndefined();
      expect(first.signature).toBe(
        `sha256=${createHmac('sha256', secret).update(first.raw).digest('hex')}`
      );
      const found = await f.send(
        {
          schemaVersion: 'helixa.role-interview-lookup.v1',
          binding: fixtureRequest.binding,
          interviewId: fixtureRequest.interviewId,
          revision: 1,
          round: 1,
          requestHash: first.body.requestHash,
          methodologyHash: fixtureRequest.methodologyHash,
        },
        'lookup'
      );
      expect(found.raw).toBe(first.raw);
      expect(found.signature).toBe(first.signature);
      expect((await f.send(fixtureRequest, 'followups')).raw).toBe(first.raw);
      expect(f.invoke).toHaveBeenCalledOnce();
    }
  );
});
