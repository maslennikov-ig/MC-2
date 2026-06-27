import 'dotenv/config';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../src/server/app-router';
import {
  type CareerPlaybookCleanupScope,
  type CareerPlaybookLiveSmokeClient,
  type CareerPlaybookLiveSmokeMode,
  type CareerPlaybookLiveSmokeTarget,
  formatCareerPlaybookLiveSmokeReport,
  runCareerPlaybookLiveSmoke,
} from '../src/smoke/career-playbook-live-smoke';

interface ParsedArgs {
  mode: CareerPlaybookLiveSmokeMode;
  targetEnvironment?: CareerPlaybookLiveSmokeTarget;
  trpcUrl?: string;
  expectedUserId?: string;
  expectedOrganizationId?: string;
  queueName?: string;
  cleanupScope?: CareerPlaybookCleanupScope;
  maxCostUsd?: number;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
  resumePlaybookId?: string;
  confirmLiveMutation: boolean;
  includeCourseBridge: boolean;
  json: boolean;
}

const TARGETS = ['local', 'development', 'dev', 'staging', 'production', 'prod'] as const;
const CLEANUP_SCOPES = ['playbook-only', 'playbook-and-course'] as const;

function printUsage(): void {
  console.log(`Usage: pnpm --dir packages/course-gen-platform smoke:career-playbook:live [options]

Options:
  --mode <plan|mutation-smoke>            Runner mode (default: plan)
  --target <local|development|dev|staging|production|prod>
                                           Target environment label
  --trpc-url <url>                         Backend tRPC URL, for example https://api.example.com/trpc
  --expected-user-id <uuid>                Disposable user id expected in staging
  --expected-organization-id <uuid>        Disposable organization id expected in staging
  --queue <name>                           Dedicated BULLMQ_QUEUE_NAME used by API and worker
  --cleanup-scope <playbook-only|playbook-and-course>
                                           Exact cleanup scope after evidence capture
  --max-cost-usd <number>                  Numeric API/LLM budget cap for this run
  --poll-timeout-ms <number>               Max wait time for generated artifacts (default: 2700000)
  --poll-interval-ms <number>              Poll interval while waiting (default: 5000)
  --resume-playbook-id <uuid>              Resume post-generation evidence capture for an existing playbook
  --confirm-live-mutation                  Required for mutation-smoke
  --include-course-bridge                  Also create the bridge course; requires cleanup coverage
  --json                                   Print JSON report
  -h, --help                               Show help

Default plan mode does not call tRPC, enqueue jobs, start workers, write Supabase rows,
clean Redis, or call LLMs. Mutation mode reads the bearer token from TOKEN or
CAREER_PLAYBOOK_SMOKE_TOKEN; do not pass secrets as CLI arguments because package
managers can echo them. Mutation mode should only be used with disposable staging
fixtures, a dedicated queue, cleanup authorization, and a budget.`);
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseTarget(value: string): CareerPlaybookLiveSmokeTarget {
  if ((TARGETS as readonly string[]).includes(value)) return value as CareerPlaybookLiveSmokeTarget;
  throw new Error('--target must be local, development, dev, staging, production, or prod');
}

function parseCleanupScope(value: string): CareerPlaybookCleanupScope {
  if ((CLEANUP_SCOPES as readonly string[]).includes(value)) {
    return value as CareerPlaybookCleanupScope;
  }
  throw new Error('--cleanup-scope must be playbook-only or playbook-and-course');
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    mode: 'plan',
    confirmLiveMutation: false,
    includeCourseBridge: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--mode': {
        const value = readValue(argv, index, arg);
        if (value !== 'plan' && value !== 'mutation-smoke') {
          throw new Error('--mode must be plan or mutation-smoke');
        }
        parsed.mode = value;
        index += 1;
        break;
      }
      case '--target':
        parsed.targetEnvironment = parseTarget(readValue(argv, index, arg));
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
      case '--queue':
        parsed.queueName = readValue(argv, index, arg);
        index += 1;
        break;
      case '--cleanup-scope':
        parsed.cleanupScope = parseCleanupScope(readValue(argv, index, arg));
        index += 1;
        break;
      case '--max-cost-usd': {
        const value = Number(readValue(argv, index, arg));
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error('--max-cost-usd must be a positive number');
        }
        parsed.maxCostUsd = value;
        index += 1;
        break;
      }
      case '--poll-timeout-ms': {
        const value = Number(readValue(argv, index, arg));
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error('--poll-timeout-ms must be a positive number');
        }
        parsed.pollTimeoutMs = value;
        index += 1;
        break;
      }
      case '--poll-interval-ms': {
        const value = Number(readValue(argv, index, arg));
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error('--poll-interval-ms must be a positive number');
        }
        parsed.pollIntervalMs = value;
        index += 1;
        break;
      }
      case '--resume-playbook-id':
        parsed.resumePlaybookId = readValue(argv, index, arg);
        index += 1;
        break;
      case '--confirm-live-mutation':
        parsed.confirmLiveMutation = true;
        break;
      case '--include-course-bridge':
        parsed.includeCourseBridge = true;
        break;
      case '--json':
        parsed.json = true;
        break;
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function createTrpcLiveSmokeClient(trpcUrl: string, token: string): CareerPlaybookLiveSmokeClient {
  const trpc = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: trpcUrl,
        headers() {
          return {
            Authorization: `Bearer ${token}`,
          };
        },
      }),
    ],
  });

  return {
    startSession: input => trpc.careerPlaybook.session.start.mutate(input),
    submitAnswer: input => trpc.careerPlaybook.session.submitAnswer.mutate(input),
    requestFollowups: input => trpc.careerPlaybook.generation.requestFollowups.mutate(input),
    approveAndGenerate: input => trpc.careerPlaybook.generation.approveAndGenerate.mutate(input),
    getStatus: input => trpc.careerPlaybook.generation.getStatus.query(input),
    getLibraryDetail: input => trpc.careerPlaybook.library.get.query(input),
    exportPdf: input => trpc.careerPlaybook.exportPdf.query(input),
    toggleShare: input => trpc.careerPlaybook.share.shareToggle.mutate(input),
    getPublicShare: input => trpc.careerPlaybook.share.getPublicBySlug.query(input),
    createCourseFromPlaybook: input =>
      trpc.careerPlaybook.courseBridge.createCourseFromPlaybook.mutate(input),
    getCourseStatus: input => trpc.generation.getStatus.query(input),
  };
}

function exitCodeFor(status: string): number {
  if (status === 'pass' || status === 'warn') return 0;
  if (status === 'blocked') return 2;
  return 1;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.TOKEN ?? process.env.CAREER_PLAYBOOK_SMOKE_TOKEN;
  const trpcUrl = args.trpcUrl ?? process.env.CAREER_PLAYBOOK_SMOKE_TRPC_URL;
  const client =
    args.mode === 'mutation-smoke' && token && trpcUrl
      ? createTrpcLiveSmokeClient(trpcUrl, token)
      : undefined;
  const report = await runCareerPlaybookLiveSmoke(
    {
      mode: args.mode,
      targetEnvironment: args.targetEnvironment,
      env: {
        ...process.env,
        BULLMQ_QUEUE_NAME: args.queueName ?? process.env.BULLMQ_QUEUE_NAME,
      },
      trpcUrl,
      token,
      expectedUserId: args.expectedUserId,
      expectedOrganizationId: args.expectedOrganizationId,
      queueName: args.queueName,
      cleanupScope: args.cleanupScope,
      maxCostUsd: args.maxCostUsd,
      pollTimeoutMs: args.pollTimeoutMs,
      pollIntervalMs: args.pollIntervalMs,
      resumePlaybookId: args.resumePlaybookId,
      confirmLiveMutation: args.confirmLiveMutation,
      includeCourseBridge: args.includeCourseBridge,
    },
    { client }
  );

  console.log(
    args.json ? JSON.stringify(report, null, 2) : formatCareerPlaybookLiveSmokeReport(report)
  );
  process.exit(exitCodeFor(report.status));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
