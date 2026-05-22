import type { RedisOptions } from 'ioredis';

export type CareerPlaybookSmokeEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;
export type CareerPlaybookSmokeMode = 'read-only' | 'mutation-smoke';
export type CareerPlaybookTargetEnvironment =
  | 'local'
  | 'development'
  | 'dev'
  | 'staging'
  | 'production'
  | 'prod';
export type CareerPlaybookCheckStatus = 'pass' | 'warn' | 'fail' | 'blocked' | 'skipped';
export type CareerPlaybookEnvOrigin = 'env:present' | 'missing' | 'web-only';

export interface CareerPlaybookSmokeInput {
  env?: CareerPlaybookSmokeEnv;
  mode?: CareerPlaybookSmokeMode;
  targetEnvironment?: CareerPlaybookTargetEnvironment;
}

export interface CareerPlaybookEnvCheck {
  name: string;
  required: boolean;
  status: CareerPlaybookCheckStatus;
  origin: CareerPlaybookEnvOrigin;
  masked?: string;
  note?: string;
}

export interface CareerPlaybookPreflightCheck {
  id: string;
  label: string;
  status: CareerPlaybookCheckStatus;
  mutates: boolean;
  origin?: string;
  note: string;
}

export interface CareerPlaybookSmokePlan {
  mode: CareerPlaybookSmokeMode;
  targetEnvironment: CareerPlaybookTargetEnvironment;
  envChecks: CareerPlaybookEnvCheck[];
  readOnlyChecks: CareerPlaybookPreflightCheck[];
  mutationChecks: CareerPlaybookPreflightCheck[];
}

export interface CareerPlaybookSmokeReport extends CareerPlaybookSmokePlan {
  status: CareerPlaybookCheckStatus;
  checks: CareerPlaybookPreflightCheck[];
}

export interface SupabaseSchemaProbeResult {
  ok: boolean;
  status?: string;
  code?: string;
  message?: string;
}

export interface RedisReadinessProbeResult {
  ok: boolean;
  status: string;
  queueName?: string;
  message?: string;
}

export interface RedisReadinessProbeConfig {
  redisUrl: string;
  queueName: string;
  options: RedisOptions & { retryStrategy: () => null };
}

export interface SupabaseSchemaProbeConfig {
  supabaseUrl: string;
  serviceKey: string;
}

export interface CareerPlaybookSmokeProbes {
  checkSupabaseSchema?: (env: CareerPlaybookSmokeEnv) => Promise<SupabaseSchemaProbeResult>;
  checkRedisReadiness?: (env: CareerPlaybookSmokeEnv) => Promise<RedisReadinessProbeResult>;
  mutationProbe?: () => Promise<unknown>;
}

interface ReadOnlySupabaseProbeClient {
  from: (table: string) => {
    select: (
      columns: string,
      options: { count: 'exact'; head: true }
    ) => Promise<{ error: { code?: string; message?: string } | null }>;
  };
}

const REQUIRED_BACKEND_ENV = [
  'NODE_ENV',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_ANON_KEY',
  'REDIS_URL',
] as const;

const DEFAULT_QUEUE_NAME = 'course-generation';
const REDIS_PROBE_CONNECT_TIMEOUT_MS = 2000;

function normalizeMode(mode: CareerPlaybookSmokeInput['mode']): CareerPlaybookSmokeMode {
  return mode ?? 'read-only';
}

function normalizeTargetEnvironment(
  targetEnvironment: CareerPlaybookSmokeInput['targetEnvironment'],
  env: CareerPlaybookSmokeInput['env']
): CareerPlaybookTargetEnvironment {
  if (targetEnvironment) return targetEnvironment;

  const nodeEnv = env?.NODE_ENV;
  if (nodeEnv === 'production') return 'prod';
  if (nodeEnv === 'development') return 'development';
  return 'local';
}

function isStagingOrProduction(targetEnvironment: CareerPlaybookTargetEnvironment): boolean {
  return ['staging', 'production', 'prod'].includes(targetEnvironment);
}

function hasValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeQueueName(value: string | undefined): string | undefined {
  if (!hasValue(value)) return undefined;
  return value.trim();
}

function resolveQueueName(env: CareerPlaybookSmokeEnv, probeQueueName?: string): string {
  return (
    normalizeQueueName(probeQueueName) ??
    normalizeQueueName(env?.BULLMQ_QUEUE_NAME) ??
    DEFAULT_QUEUE_NAME
  );
}

function hasDedicatedNonDefaultQueue(env: CareerPlaybookSmokeEnv, queueName: string): boolean {
  return (
    normalizeQueueName(env?.BULLMQ_QUEUE_NAME) === queueName && queueName !== DEFAULT_QUEUE_NAME
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function maskEnvValue(value: string | undefined): string | undefined {
  if (!hasValue(value)) return undefined;
  if (value.length <= 4) return '****';
  if (value.includes('://')) {
    return `${value.slice(0, 2)}***${value.at(-1)}`;
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export function sanitizeSmokeMessage(
  message: string | undefined,
  env: CareerPlaybookSmokeEnv = process.env
): string {
  if (!hasValue(message)) return 'unknown error';

  let sanitized = message;

  for (const value of Object.values(env)) {
    if (hasValue(value) && value.length >= 4) {
      sanitized = sanitized.replace(new RegExp(escapeRegExp(value), 'g'), '[redacted]');
    }
  }

  sanitized = sanitized.replace(/([a-z][a-z0-9+.-]*:\/\/)([^@\s]+)@/gi, '$1[redacted]@');
  sanitized = sanitized.replace(
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    '[redacted]'
  );
  sanitized = sanitized.replace(/\b(?:sk|pk|sb)_[A-Za-z0-9_-]{12,}\b/g, '[redacted]');

  return sanitized;
}

function buildEnvChecks(env: CareerPlaybookSmokeEnv): CareerPlaybookEnvCheck[] {
  const checks = REQUIRED_BACKEND_ENV.map<CareerPlaybookEnvCheck>(name => {
    const value = env?.[name];
    if (hasValue(value)) {
      return {
        name,
        required: true,
        status: 'pass',
        origin: 'env:present',
        masked: maskEnvValue(value),
      };
    }

    return {
      name,
      required: true,
      status: 'fail',
      origin: 'missing',
      note:
        name === 'SUPABASE_SERVICE_KEY'
          ? 'The Node backend uses SUPABASE_SERVICE_KEY; the web app service-role variable is SUPABASE_SERVICE_ROLE_KEY and is not a backend substitute.'
          : 'Required for backend read-only smoke readiness.',
    };
  });

  if (!hasValue(env?.SUPABASE_SERVICE_KEY) && hasValue(env?.SUPABASE_SERVICE_ROLE_KEY)) {
    checks.push({
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      required: false,
      status: 'warn',
      origin: 'web-only',
      masked: maskEnvValue(env?.SUPABASE_SERVICE_ROLE_KEY),
      note: 'Present for web/server components, but backend admin client reads SUPABASE_SERVICE_KEY.',
    });
  }

  return checks;
}

function hasRequiredEnv(envChecks: CareerPlaybookEnvCheck[], names: string[]): boolean {
  return names.every(name =>
    envChecks.some(check => check.name === name && check.required && check.status === 'pass')
  );
}

function buildReadOnlyChecks(envChecks: CareerPlaybookEnvCheck[]): CareerPlaybookPreflightCheck[] {
  const supabaseReady = hasRequiredEnv(envChecks, [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_ANON_KEY',
  ]);
  const redisReady = hasRequiredEnv(envChecks, ['REDIS_URL']);

  return [
    {
      id: 'supabase-career-playbook-schema',
      label: 'Supabase Career Playbook schema',
      status: supabaseReady ? 'skipped' : 'blocked',
      mutates: false,
      origin: 'planner',
      note: supabaseReady
        ? 'Ready to run read-only table probes.'
        : 'Skipped because backend Supabase env is incomplete.',
    },
    {
      id: 'redis-readiness',
      label: 'Redis connection readiness',
      status: redisReady ? 'skipped' : 'blocked',
      mutates: false,
      origin: 'planner',
      note: redisReady ? 'Ready to run Redis PING only.' : 'Skipped because REDIS_URL is missing.',
    },
    {
      id: 'queue-readiness',
      label: 'BullMQ queue readiness',
      status: redisReady ? 'skipped' : 'blocked',
      mutates: false,
      origin: 'planner',
      note: redisReady
        ? 'Ready to resolve the BullMQ queue name after Redis responds; no jobs will be added.'
        : 'Skipped because queue readiness depends on REDIS_URL.',
    },
  ];
}

function buildMutationChecks(
  mode: CareerPlaybookSmokeMode,
  targetEnvironment: CareerPlaybookTargetEnvironment
): CareerPlaybookPreflightCheck[] {
  if (mode === 'read-only') {
    return [
      {
        id: 'mutation-smoke-disabled',
        label: 'Mutation smoke',
        status: 'skipped',
        mutates: true,
        origin: 'planner',
        note: 'Read-only preflight never creates users, rows, jobs, workers, cleanup tasks, or LLM generation.',
      },
    ];
  }

  if (isStagingOrProduction(targetEnvironment)) {
    return [
      {
        id: 'mutation-hard-stop',
        label: 'Mutation smoke hard stop',
        status: 'blocked',
        mutates: true,
        origin: 'planner',
        note: 'staging/prod mutation smoke is blocked without explicit current-task approval, disposable fixtures, and cleanup authorization.',
      },
    ];
  }

  return [
    {
      id: 'mutation-hard-stop',
      label: 'Mutation smoke hard stop',
      status: 'blocked',
      mutates: true,
      origin: 'planner',
      note: 'This preflight is read-only. Mutation smoke requires a separate approved command and must not create users, rows, queue jobs, workers, cleanup tasks, or LLM generation here.',
    },
  ];
}

export function buildCareerPlaybookSmokePlan(
  input: CareerPlaybookSmokeInput = {}
): CareerPlaybookSmokePlan {
  const env = input.env ?? process.env;
  const mode = normalizeMode(input.mode);
  const targetEnvironment = normalizeTargetEnvironment(input.targetEnvironment, env);
  const envChecks = buildEnvChecks(env);

  return {
    mode,
    targetEnvironment,
    envChecks,
    readOnlyChecks: buildReadOnlyChecks(envChecks),
    mutationChecks: buildMutationChecks(mode, targetEnvironment),
  };
}

function schemaMissing(result: SupabaseSchemaProbeResult): boolean {
  const text = `${result.code ?? ''} ${result.message ?? ''}`.toLowerCase();
  return (
    text.includes('42p01') ||
    text.includes('pgrst205') ||
    text.includes('does not exist') ||
    text.includes('schema cache')
  );
}

function statusRank(status: CareerPlaybookCheckStatus): number {
  return {
    pass: 0,
    skipped: 0,
    warn: 1,
    fail: 2,
    blocked: 3,
  }[status];
}

function summarizeStatus(
  envChecks: CareerPlaybookEnvCheck[],
  checks: CareerPlaybookPreflightCheck[]
): CareerPlaybookCheckStatus {
  const statuses = [...envChecks.map(check => check.status), ...checks.map(check => check.status)];
  return statuses.reduce<CareerPlaybookCheckStatus>(
    (worst, status) => (statusRank(status) > statusRank(worst) ? status : worst),
    'pass'
  );
}

export async function runCareerPlaybookSmokePreflight(
  input: CareerPlaybookSmokeInput = {},
  probes: CareerPlaybookSmokeProbes = {}
): Promise<CareerPlaybookSmokeReport> {
  const env = input.env ?? process.env;
  const plan = buildCareerPlaybookSmokePlan(input);
  const checks = [...plan.readOnlyChecks];
  const supabaseIndex = checks.findIndex(check => check.id === 'supabase-career-playbook-schema');
  const redisIndex = checks.findIndex(check => check.id === 'redis-readiness');
  const supabaseReady = hasRequiredEnv(plan.envChecks, [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_ANON_KEY',
  ]);
  const redisReady = hasRequiredEnv(plan.envChecks, ['REDIS_URL']);

  if (supabaseReady && supabaseIndex >= 0) {
    const result = await (probes.checkSupabaseSchema ?? defaultSupabaseSchemaProbe)(env);
    const message = sanitizeSmokeMessage(
      result.message ?? result.status ?? result.code ?? 'unknown error',
      env
    );
    checks[supabaseIndex] = {
      ...checks[supabaseIndex],
      status: result.ok ? 'pass' : schemaMissing(result) ? 'blocked' : 'fail',
      origin: 'read-only-probe',
      note: result.ok
        ? 'career_playbooks and career_playbook_fixed_questions are reachable with read-only selects. Service-role access is not RLS proof.'
        : schemaMissing(result)
          ? `Remote Career Playbook schema is missing or stale (${result.code ?? 'unknown'}). Do not apply migrations from this preflight; run the approved migration flow separately.`
          : `Read-only Supabase schema probe failed: ${message}.`,
    };
  }

  if (redisReady && redisIndex >= 0) {
    const result = await (probes.checkRedisReadiness ?? defaultRedisReadinessProbe)(env);
    const message = sanitizeSmokeMessage(result.message ?? result.status, env);
    const queueName = resolveQueueName(env, result.queueName);
    const dedicatedQueueBlocked =
      result.ok &&
      isStagingOrProduction(plan.targetEnvironment) &&
      !hasDedicatedNonDefaultQueue(env, queueName);
    checks[redisIndex] = {
      ...checks[redisIndex],
      status: result.ok ? 'pass' : 'fail',
      origin: 'read-only-probe',
      note: result.ok
        ? `Redis responded to PING; queue name is ${queueName}.`
        : `Redis read-only readiness failed: ${message}.`,
    };

    const queueIndex = checks.findIndex(check => check.id === 'queue-readiness');
    if (queueIndex >= 0) {
      checks[queueIndex] = {
        ...checks[queueIndex],
        status: result.ok ? (dedicatedQueueBlocked ? 'blocked' : 'pass') : 'fail',
        origin: 'read-only-probe',
        note: result.ok
          ? dedicatedQueueBlocked
            ? `Resolved BullMQ queue name ${queueName}, but staging/prod smoke requires a dedicated non-default BULLMQ_QUEUE_NAME before any live mutation. No jobs were read, added, removed, or retried.`
            : `Resolved BullMQ queue name ${queueName}; no jobs were read, added, removed, or retried.`
          : `Redis read-only readiness failed before queue readiness could be proven: ${message}. No jobs were read, added, removed, or retried.`,
      };
    }
  }

  const allChecks = [...checks, ...plan.mutationChecks];

  return {
    ...plan,
    readOnlyChecks: checks,
    checks: allChecks,
    status: summarizeStatus(plan.envChecks, allChecks),
  };
}

export async function defaultSupabaseSchemaProbe(
  env: CareerPlaybookSmokeEnv = process.env
): Promise<SupabaseSchemaProbeResult> {
  try {
    const { supabaseUrl, serviceKey } = createSupabaseSchemaProbeConfig(env);
    if (!hasValue(supabaseUrl) || !hasValue(serviceKey)) {
      return {
        ok: false,
        status: 'missing-env',
        message: 'SUPABASE_URL and SUPABASE_SERVICE_KEY are required for schema probe',
      };
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    }) as unknown as ReadOnlySupabaseProbeClient;
    const playbooks = await supabase
      .from('career_playbooks')
      .select('id', { count: 'exact', head: true });
    if (playbooks.error) {
      return {
        ok: false,
        code: playbooks.error.code,
        message: playbooks.error.message,
      };
    }

    const questions = await supabase
      .from('career_playbook_fixed_questions')
      .select('id', { count: 'exact', head: true });
    if (questions.error) {
      return {
        ok: false,
        code: questions.error.code,
        message: questions.error.message,
      };
    }

    return { ok: true, status: 'schema-present' };
  } catch (error) {
    return {
      ok: false,
      message: sanitizeSmokeMessage(error instanceof Error ? error.message : String(error), env),
    };
  }
}

export async function defaultRedisReadinessProbe(
  env: CareerPlaybookSmokeEnv = process.env
): Promise<RedisReadinessProbeResult> {
  const { redisUrl, queueName, options } = createRedisReadinessProbeConfig(env);
  let redis: {
    connect: () => Promise<void>;
    ping: () => Promise<string>;
    disconnect: () => void;
  } | null = null;

  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis(redisUrl, options);
    await redis.connect();
    const pong = await redis.ping();
    return {
      ok: pong === 'PONG',
      status: pong,
      queueName,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'error',
      queueName,
      message: sanitizeSmokeMessage(error instanceof Error ? error.message : String(error), env),
    };
  } finally {
    redis?.disconnect();
  }
}

export function createRedisReadinessProbeConfig(
  env: CareerPlaybookSmokeEnv = process.env
): RedisReadinessProbeConfig {
  return {
    redisUrl: env?.REDIS_URL || 'redis://localhost:6379',
    queueName: env?.BULLMQ_QUEUE_NAME || DEFAULT_QUEUE_NAME,
    options: {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: REDIS_PROBE_CONNECT_TIMEOUT_MS,
      retryStrategy: () => null,
    },
  };
}

export function createSupabaseSchemaProbeConfig(
  env: CareerPlaybookSmokeEnv = process.env
): SupabaseSchemaProbeConfig {
  return {
    supabaseUrl: env?.SUPABASE_URL || '',
    serviceKey: env?.SUPABASE_SERVICE_KEY || '',
  };
}

export function formatCareerPlaybookSmokeReport(report: CareerPlaybookSmokeReport): string {
  const lines = [
    'Career Playbook backend smoke preflight',
    `mode: ${report.mode}`,
    `target: ${report.targetEnvironment}`,
    `status: ${report.status}`,
    '',
    'Environment:',
  ];

  for (const check of report.envChecks) {
    const masked = check.masked ? `, masked=${check.masked}` : '';
    const note = check.note ? ` - ${check.note}` : '';
    lines.push(`- ${check.name}: ${check.status} (${check.origin}${masked})${note}`);
  }

  lines.push('', 'Checks:');
  for (const check of report.checks) {
    lines.push(`- ${check.id}: ${check.status} [mutates=${check.mutates}] - ${check.note}`);
  }

  return lines.join('\n');
}
