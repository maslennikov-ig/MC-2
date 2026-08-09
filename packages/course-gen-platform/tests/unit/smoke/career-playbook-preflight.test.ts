import { describe, expect, it, vi } from 'vitest';

import {
  buildCareerPlaybookSmokePlan,
  createRedisReadinessProbeConfig,
  createSupabaseSchemaProbeConfig,
  formatCareerPlaybookSmokeReport,
  runCareerPlaybookSmokePreflight,
  sanitizeSmokeMessage,
} from '@/smoke/career-playbook-preflight';

describe('Career Playbook smoke preflight planner', () => {
  it('requires backend Supabase service key and does not accept the web service-role env name', () => {
    const plan = buildCareerPlaybookSmokePlan({
      env: {
        NODE_ENV: 'development',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'web-only-secret',
        SUPABASE_ANON_KEY: 'anon-secret',
        REDIS_URL: 'redis://localhost:6379',
      },
      mode: 'read-only',
      targetEnvironment: 'local',
    });

    expect(plan.envChecks).toContainEqual(
      expect.objectContaining({
        name: 'SUPABASE_SERVICE_KEY',
        status: 'fail',
        origin: 'missing',
        note: expect.stringContaining('backend uses SUPABASE_SERVICE_KEY'),
      })
    );
    expect(plan.envChecks).toContainEqual(
      expect.objectContaining({
        name: 'SUPABASE_SERVICE_ROLE_KEY',
        status: 'warn',
        origin: 'web-only',
      })
    );
  });

  it('hard-stops mutation smoke in staging and leaves only read-only checks runnable', () => {
    const plan = buildCareerPlaybookSmokePlan({
      env: {
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_KEY: 'service-secret',
        SUPABASE_ANON_KEY: 'anon-secret',
        REDIS_URL: 'redis://example.redis:6379',
      },
      mode: 'mutation-smoke',
      targetEnvironment: 'staging',
    });

    expect(plan.mutationChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'mutation-hard-stop',
          status: 'blocked',
          mutates: true,
          note: expect.stringContaining('staging/prod mutation smoke is blocked'),
        }),
      ])
    );
    expect(plan.readOnlyChecks.every(check => check.mutates === false)).toBe(true);
  });

  it('does not mark queue readiness as passed before the Redis probe runs', () => {
    const plan = buildCareerPlaybookSmokePlan({
      env: {
        NODE_ENV: 'development',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_KEY: 'service-secret',
        SUPABASE_ANON_KEY: 'anon-secret',
        REDIS_URL: 'redis://example.redis:6379',
      },
      mode: 'read-only',
      targetEnvironment: 'local',
    });

    expect(plan.readOnlyChecks).toContainEqual(
      expect.objectContaining({
        id: 'queue-readiness',
        status: 'skipped',
        mutates: false,
        note: expect.stringContaining('after Redis responds'),
      })
    );
  });

  it('plans a read-only model-config pricing coverage check', () => {
    const plan = buildCareerPlaybookSmokePlan({
      env: {
        NODE_ENV: 'development',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_KEY: 'service-secret',
        SUPABASE_ANON_KEY: 'anon-secret',
        REDIS_URL: 'redis://example.redis:6379',
      },
      mode: 'read-only',
      targetEnvironment: 'local',
    });

    expect(plan.readOnlyChecks).toContainEqual(
      expect.objectContaining({
        id: 'model-config-pricing',
        status: 'skipped',
        mutates: false,
      })
    );
  });

  it('blocks staging readiness when the queue name is missing or shared default', async () => {
    const buildReport = (queueName?: string) =>
      runCareerPlaybookSmokePreflight(
        {
          env: {
            NODE_ENV: 'production',
            SUPABASE_URL: 'https://project.supabase.co',
            SUPABASE_SERVICE_KEY: 'service-secret',
            SUPABASE_ANON_KEY: 'anon-secret',
            REDIS_URL: 'redis://example.redis:6379',
            BULLMQ_QUEUE_NAME: queueName,
          },
          mode: 'read-only',
          targetEnvironment: 'staging',
        },
        {
          checkSupabaseSchema: vi.fn(async () => ({ ok: true, status: 'schema-present' })),
          checkRedisReadiness: vi.fn(async () => ({
            ok: true,
            status: 'PONG',
            queueName: queueName || 'course-generation',
          })),
        }
      );

    for (const queueName of [undefined, 'course-generation']) {
      const report = await buildReport(queueName);

      expect(report.status).toBe('blocked');
      expect(report.checks).toContainEqual(
        expect.objectContaining({
          id: 'queue-readiness',
          status: 'blocked',
          mutates: false,
          note: expect.stringContaining('dedicated non-default BULLMQ_QUEUE_NAME'),
        })
      );
    }

    const dedicatedQueueReport = await buildReport('career-playbook-smoke');

    expect(dedicatedQueueReport.status).toBe('pass');
    expect(dedicatedQueueReport.checks).toContainEqual(
      expect.objectContaining({
        id: 'queue-readiness',
        status: 'pass',
        note: expect.stringContaining('career-playbook-smoke'),
      })
    );
  });

  it('uses a short-lived Redis probe config instead of the app worker retry client', () => {
    const config = createRedisReadinessProbeConfig({
      REDIS_URL: 'redis://localhost:6379/2',
      BULLMQ_QUEUE_NAME: 'career-playbook-smoke',
    });

    expect(config).toMatchObject({
      redisUrl: 'redis://localhost:6379/2',
      queueName: 'career-playbook-smoke',
      options: {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      },
    });
    expect(config.options.retryStrategy()).toBe(null);
  });

  it('builds Supabase schema probe config from the supplied env object', () => {
    const config = createSupabaseSchemaProbeConfig({
      SUPABASE_URL: 'https://staging-project.supabase.co',
      SUPABASE_SERVICE_KEY: 'staging-service-key',
    });

    expect(config).toEqual({
      supabaseUrl: 'https://staging-project.supabase.co',
      serviceKey: 'staging-service-key',
    });
  });
});

describe('Career Playbook smoke preflight runner', () => {
  it('reports remote schema absence as a blocker without running mutation probes', async () => {
    const mutationProbe = vi.fn();
    const report = await runCareerPlaybookSmokePreflight(
      {
        env: {
          NODE_ENV: 'development',
          SUPABASE_URL: 'https://project.supabase.co',
          SUPABASE_SERVICE_KEY: 'service-secret',
          SUPABASE_ANON_KEY: 'anon-secret',
          REDIS_URL: 'redis://localhost:6379',
        },
        mode: 'read-only',
        targetEnvironment: 'local',
      },
      {
        checkSupabaseSchema: vi.fn(async () => ({
          ok: false,
          code: '42P01',
          message: 'relation "career_playbooks" does not exist',
        })),
        checkRedisReadiness: vi.fn(async () => ({ ok: true, status: 'ready' })),
        mutationProbe,
      }
    );

    expect(mutationProbe).not.toHaveBeenCalled();
    expect(report.status).toBe('blocked');
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'supabase-career-playbook-schema',
        status: 'blocked',
        mutates: false,
        note: expect.stringContaining('Do not apply migrations from this preflight'),
      })
    );
  });

  it('marks queue readiness failed when the Redis probe fails', async () => {
    const report = await runCareerPlaybookSmokePreflight(
      {
        env: {
          NODE_ENV: 'development',
          SUPABASE_URL: 'https://project.supabase.co',
          SUPABASE_SERVICE_KEY: 'service-secret',
          SUPABASE_ANON_KEY: 'anon-secret',
          REDIS_URL: 'redis://localhost:6379',
        },
        mode: 'read-only',
        targetEnvironment: 'local',
      },
      {
        checkSupabaseSchema: vi.fn(async () => ({ ok: true, status: 'schema-present' })),
        checkRedisReadiness: vi.fn(async () => ({
          ok: false,
          status: 'error',
          queueName: 'career-playbook-smoke',
          message: 'connection refused',
        })),
      }
    );

    expect(report.status).toBe('fail');
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'redis-readiness',
        status: 'fail',
      })
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'queue-readiness',
        status: 'fail',
        mutates: false,
        note: expect.stringContaining('Redis read-only readiness failed'),
      })
    );
  });

  it('runs Supabase diagnostics even when Redis env is missing', async () => {
    const env = {
      NODE_ENV: 'development',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_KEY: 'service-secret',
      SUPABASE_ANON_KEY: 'anon-secret',
    };
    const checkSupabaseSchema = vi.fn(async (..._args: unknown[]) => ({
      ok: true,
      status: 'schema-present',
    }));
    const checkRedisReadiness = vi.fn(async (..._args: unknown[]) => ({
      ok: true,
      status: 'PONG',
    }));

    const report = await runCareerPlaybookSmokePreflight(
      {
        env,
        mode: 'read-only',
        targetEnvironment: 'local',
      },
      {
        checkSupabaseSchema,
        checkRedisReadiness,
      }
    );

    expect(checkSupabaseSchema).toHaveBeenCalledWith(env);
    expect(checkRedisReadiness).not.toHaveBeenCalled();
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'supabase-career-playbook-schema',
        status: 'pass',
      })
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'redis-readiness',
        status: 'blocked',
      })
    );
  });

  it('runs Redis diagnostics even when Supabase env is missing', async () => {
    const env = {
      NODE_ENV: 'development',
      REDIS_URL: 'redis://localhost:6379',
    };
    const checkSupabaseSchema = vi.fn(async (..._args: unknown[]) => ({
      ok: true,
      status: 'schema-present',
    }));
    const checkRedisReadiness = vi.fn(async (..._args: unknown[]) => ({
      ok: true,
      status: 'PONG',
      queueName: 'career-playbook-smoke',
    }));

    const report = await runCareerPlaybookSmokePreflight(
      {
        env,
        mode: 'read-only',
        targetEnvironment: 'local',
      },
      {
        checkSupabaseSchema,
        checkRedisReadiness,
      }
    );

    expect(checkSupabaseSchema).not.toHaveBeenCalled();
    expect(checkRedisReadiness).toHaveBeenCalledWith(env);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'supabase-career-playbook-schema',
        status: 'blocked',
      })
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'redis-readiness',
        status: 'pass',
      })
    );
  });

  it('warns when a configured model id is missing from the OpenRouter pricing catalog', async () => {
    const report = await runCareerPlaybookSmokePreflight(
      {
        env: {
          NODE_ENV: 'development',
          SUPABASE_URL: 'https://project.supabase.co',
          SUPABASE_SERVICE_KEY: 'service-secret',
          SUPABASE_ANON_KEY: 'anon-secret',
          REDIS_URL: 'redis://localhost:6379',
        },
        mode: 'read-only',
        targetEnvironment: 'local',
      },
      {
        checkSupabaseSchema: vi.fn(async () => ({ ok: true, status: 'schema-present' })),
        checkRedisReadiness: vi.fn(async () => ({
          ok: true,
          status: 'PONG',
          queueName: 'career-playbook-smoke',
        })),
        checkModelPricingHealth: vi.fn(() => ({
          ok: false,
          checkedModelIds: ['deprecated/model-x'],
          unpricedModels: [
            {
              phaseName: 'stage_career_playbook_spec',
              role: 'primary' as const,
              modelId: 'deprecated/model-x',
            },
          ],
          missingPhases: [],
        })),
      }
    );

    expect(report.status).toBe('warn');
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'model-config-pricing',
        status: 'warn',
        mutates: false,
        note: expect.stringContaining('deprecated/model-x'),
      })
    );
  });

  it('passes model-config pricing using the network-free default probe', async () => {
    const report = await runCareerPlaybookSmokePreflight(
      {
        env: {
          NODE_ENV: 'development',
          SUPABASE_URL: 'https://project.supabase.co',
          SUPABASE_SERVICE_KEY: 'service-secret',
          SUPABASE_ANON_KEY: 'anon-secret',
          REDIS_URL: 'redis://localhost:6379',
        },
        mode: 'read-only',
        targetEnvironment: 'local',
      },
      {
        checkSupabaseSchema: vi.fn(async () => ({ ok: true, status: 'schema-present' })),
        checkRedisReadiness: vi.fn(async () => ({
          ok: true,
          status: 'PONG',
          queueName: 'career-playbook-smoke',
        })),
        // checkModelPricingHealth intentionally omitted -> default (offline) probe runs.
      }
    );

    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'model-config-pricing',
        status: 'pass',
        origin: 'read-only-probe',
      })
    );
  });

  it('redacts known env values, URL credentials, and JWT-like strings from probe messages', async () => {
    const jwtLikeToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjYXJlZXItcGxheWJvb2sifQ.signaturePart';
    const report = await runCareerPlaybookSmokePreflight(
      {
        env: {
          NODE_ENV: 'development',
          SUPABASE_URL: 'https://project.supabase.co',
          SUPABASE_SERVICE_KEY: 'service-secret-value',
          SUPABASE_ANON_KEY: 'anon-secret-value',
          REDIS_URL: 'redis://:redis-password@example.redis:6379/0',
        },
        mode: 'read-only',
        targetEnvironment: 'local',
      },
      {
        checkSupabaseSchema: vi.fn(async () => ({
          ok: false,
          status: 'error',
          message: `failed with service-secret-value and token ${jwtLikeToken}`,
        })),
        checkRedisReadiness: vi.fn(async () => ({
          ok: false,
          status: 'error',
          message: 'cannot connect to redis://:redis-password@example.redis:6379/0',
        })),
      }
    );

    const output = formatCareerPlaybookSmokeReport(report);

    expect(output).not.toContain('service-secret-value');
    expect(output).not.toContain('redis-password');
    expect(output).not.toContain(jwtLikeToken);
    expect(output).toContain('[redacted]');
  });

  it('sanitizes standalone smoke messages with the supplied env values', () => {
    const sanitized = sanitizeSmokeMessage(
      'failed redis://:secret@example.redis:6379 with service-secret-value',
      { SUPABASE_SERVICE_KEY: 'service-secret-value' }
    );

    expect(sanitized).toBe('failed redis://[redacted]@example.redis:6379 with [redacted]');
  });

  it('formats output with masked secret values and safe origins only', async () => {
    const report = await runCareerPlaybookSmokePreflight(
      {
        env: {
          NODE_ENV: 'development',
          SUPABASE_URL: 'https://project.supabase.co',
          SUPABASE_SERVICE_KEY: 'service-secret-value',
          SUPABASE_ANON_KEY: 'anon-secret-value',
          REDIS_URL: 'redis://:redis-password@example.redis:6379/0',
        },
        mode: 'read-only',
        targetEnvironment: 'local',
      },
      {
        checkSupabaseSchema: vi.fn(async () => ({ ok: true, status: 'schema-present' })),
        checkRedisReadiness: vi.fn(async () => ({ ok: true, status: 'ready' })),
      }
    );

    const output = formatCareerPlaybookSmokeReport(report);

    expect(output).toContain('SUPABASE_SERVICE_KEY: pass (env:present, masked=se***ue)');
    expect(output).toContain('REDIS_URL: pass (env:present, masked=re***0)');
    expect(output).not.toContain('service-secret-value');
    expect(output).not.toContain('redis-password');
  });
});
