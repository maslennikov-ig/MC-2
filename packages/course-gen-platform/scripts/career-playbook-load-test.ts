import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  CareerPlaybookLoadQueueState,
  CareerPlaybookLoadRunObservation,
  CareerPlaybookLoadTestMode,
  CareerPlaybookLoadTestOptions,
} from '../src/smoke/career-playbook-load-test';
import {
  buildCareerPlaybookLoadTestPlan,
  runCareerPlaybookLoadTest,
} from '../src/smoke/career-playbook-load-test';
import type {
  CareerPlaybookCleanupScope,
  CareerPlaybookLiveSmokeTarget,
} from '../src/smoke/career-playbook-live-smoke';
import { runCareerPlaybookLiveSmoke } from '../src/smoke/career-playbook-live-smoke';
import {
  captureCareerPlaybookSmokeArtifact,
  createSupabaseCareerPlaybookBearerToken,
  createTrpcLiveSmokeClient,
} from './career-playbook-live-smoke';

export interface ParsedCareerPlaybookLoadArgs extends CareerPlaybookLoadTestOptions {
  mode: CareerPlaybookLoadTestMode;
  targetEnvironment?: CareerPlaybookLiveSmokeTarget;
  cleanupScope?: CareerPlaybookCleanupScope;
  json: boolean;
  noArtifact: boolean;
  artifactDir?: string;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
}

const TARGETS = ['local', 'development', 'dev', 'staging', 'production', 'prod'] as const;
const CLEANUP_SCOPES = ['playbook-only', 'playbook-and-course'] as const;

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function positiveNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} must be positive`);
  return parsed;
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

export function parseCareerPlaybookLoadArgs(argv: string[]): ParsedCareerPlaybookLoadArgs {
  const parsed: ParsedCareerPlaybookLoadArgs = {
    mode: 'plan',
    count: 10,
    json: false,
    noArtifact: false,
    confirmLiveMutation: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--mode': {
        const value = readValue(argv, index, arg);
        if (value !== 'plan' && value !== 'mutation-load') {
          throw new Error('--mode must be plan or mutation-load');
        }
        parsed.mode = value;
        index += 1;
        break;
      }
      case '--target': {
        const value = readValue(argv, index, arg);
        if (!TARGETS.includes(value as (typeof TARGETS)[number])) {
          throw new Error('--target must be local, development, dev, staging, production, or prod');
        }
        parsed.targetEnvironment = value as CareerPlaybookLiveSmokeTarget;
        index += 1;
        break;
      }
      case '--count':
        parsed.count = positiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--trpc-url':
        parsed.trpcUrl = readValue(argv, index, arg);
        index += 1;
        break;
      case '--expected-user-id':
        parsed.expectedUserId = readValue(argv, index, arg);
        index += 1;
        break;
      case '--expected-organization-id':
        parsed.expectedOrganizationId = readValue(argv, index, arg);
        index += 1;
        break;
      case '--queue-name':
        parsed.queueName = readValue(argv, index, arg);
        index += 1;
        break;
      case '--cleanup-scope': {
        const value = readValue(argv, index, arg);
        if (!CLEANUP_SCOPES.includes(value as CareerPlaybookCleanupScope)) {
          throw new Error('--cleanup-scope must be playbook-only or playbook-and-course');
        }
        parsed.cleanupScope = value as CareerPlaybookCleanupScope;
        index += 1;
        break;
      }
      case '--max-cost-usd-per-run':
        parsed.maxCostUsdPerRun = positiveNumber(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--max-total-cost-usd':
        parsed.maxTotalCostUsd = positiveNumber(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--poll-timeout-ms':
        parsed.pollTimeoutMs = positiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--poll-interval-ms':
        parsed.pollIntervalMs = positiveInteger(readValue(argv, index, arg), arg);
        index += 1;
        break;
      case '--artifact-dir':
        parsed.artifactDir = readValue(argv, index, arg);
        index += 1;
        break;
      case '--no-artifact':
        parsed.noArtifact = true;
        break;
      case '--confirm-live-mutation':
        parsed.confirmLiveMutation = true;
        break;
      case '--json':
        parsed.json = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

export function extractCareerPlaybookLoadCostUsd(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const candidate = record.total_cost_usd ?? record.totalCostUsd;
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
    ? candidate
    : null;
}

async function readPersistedCost(jsonPath: string): Promise<number | null> {
  const document = JSON.parse(await fs.readFile(jsonPath, 'utf8')) as Record<string, unknown>;
  return extractCareerPlaybookLoadCostUsd(document.costBreakdown);
}

async function captureQueueState(
  phase: CareerPlaybookLoadQueueState['phase'],
  queueName: string
): Promise<CareerPlaybookLoadQueueState> {
  const { getQueue } = await import('../src/orchestrator/queue');
  const counts = await getQueue().getJobCounts('waiting', 'active', 'completed', 'failed');
  return {
    phase,
    queueName,
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
  };
}

function exitCodeFor(status: string): number {
  if (status === 'pass') return 0;
  if (status === 'blocked') return 2;
  return 1;
}

async function main(): Promise<void> {
  const args = parseCareerPlaybookLoadArgs(process.argv.slice(2));
  const token = process.env.TOKEN ?? process.env.CAREER_PLAYBOOK_SMOKE_TOKEN;
  const refreshToken = process.env.CAREER_PLAYBOOK_SMOKE_REFRESH_TOKEN;
  const trpcUrl = args.trpcUrl ?? process.env.CAREER_PLAYBOOK_SMOKE_TRPC_URL;
  const expectedUserId = args.expectedUserId ?? process.env.CAREER_PLAYBOOK_SMOKE_USER_ID;
  const expectedOrganizationId =
    args.expectedOrganizationId ?? process.env.CAREER_PLAYBOOK_SMOKE_ORGANIZATION_ID;
  const queueName = args.queueName ?? process.env.BULLMQ_QUEUE_NAME ?? 'course-generation';
  process.env.BULLMQ_QUEUE_NAME = queueName;
  const tokenSource =
    token && refreshToken && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
      ? createSupabaseCareerPlaybookBearerToken({
          supabaseUrl: process.env.SUPABASE_URL,
          supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
          accessToken: token,
          refreshToken,
        })
      : token;
  const client =
    args.mode === 'mutation-load' && tokenSource && trpcUrl
      ? createTrpcLiveSmokeClient(trpcUrl, tokenSource)
      : undefined;
  const options: CareerPlaybookLoadTestOptions = {
    ...args,
    token,
    trpcUrl,
    expectedUserId,
    expectedOrganizationId,
    queueName,
    env: process.env,
  };
  const plan = buildCareerPlaybookLoadTestPlan(options);
  const runSingle = async (input: {
    runId: string;
    index: number;
  }): Promise<CareerPlaybookLoadRunObservation> => {
    if (!client) throw new Error('No tRPC client available for mutation-load mode.');
    const startedAt = new Date();
    const smoke = await runCareerPlaybookLiveSmoke(
      {
        mode: 'mutation-smoke',
        targetEnvironment: args.targetEnvironment,
        env: process.env,
        trpcUrl,
        token,
        expectedUserId,
        expectedOrganizationId,
        queueName,
        cleanupScope: args.cleanupScope,
        maxCostUsd: args.maxCostUsdPerRun,
        pollTimeoutMs: args.pollTimeoutMs,
        pollIntervalMs: args.pollIntervalMs,
        confirmLiveMutation: args.confirmLiveMutation,
        includeCourseBridge: false,
        runId: input.runId,
      },
      { client }
    );
    const finishedAt = new Date();
    const artifactPaths: string[] = [];
    let costUsd: number | null = null;
    let costSource = 'unavailable';

    if (!args.noArtifact && smoke.playbookId) {
      const artifacts = await captureCareerPlaybookSmokeArtifact({
        report: smoke,
        client,
        baseDir: args.artifactDir,
        timings: {
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          pollTimeoutMs: args.pollTimeoutMs,
          pollIntervalMs: args.pollIntervalMs,
        },
      });
      artifactPaths.push(artifacts.markdownPath, artifacts.jsonPath);
      costUsd = await readPersistedCost(artifacts.jsonPath);
      costSource = costUsd === null ? 'unavailable' : 'runtime-artifact';
    }

    return {
      runId: input.runId,
      index: input.index,
      status: smoke.status,
      playbookId: smoke.playbookId,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      costUsd,
      costSource,
      artifactPaths,
      cleanupManifest: smoke.cleanupManifest,
      error: smoke.status === 'fail' ? 'single smoke evidence failed' : undefined,
    };
  };

  const report = await runCareerPlaybookLoadTest(options, {
    runSingle,
    captureQueueState: phase => captureQueueState(phase, queueName),
  });

  console.log(args.json ? JSON.stringify(report, null, 2) : JSON.stringify(report, null, 2));
  if (plan.mode === 'mutation-load') {
    const { closeQueue } = await import('../src/orchestrator/queue');
    await closeQueue();
  }
  process.exit(exitCodeFor(report.status));
}

function isRunAsCareerPlaybookLoadScript(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isRunAsCareerPlaybookLoadScript()) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
