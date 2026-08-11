import type {
  CareerPlaybookCleanupManifest,
  CareerPlaybookCleanupScope,
  CareerPlaybookLiveSmokeReportStatus,
  CareerPlaybookLiveSmokeTarget,
} from './career-playbook-live-smoke';

export type CareerPlaybookLoadTestMode = 'plan' | 'mutation-load';
export type CareerPlaybookLoadCheckStatus = 'pass' | 'blocked' | 'fail';

export interface CareerPlaybookLoadTestOptions {
  mode?: CareerPlaybookLoadTestMode;
  targetEnvironment?: CareerPlaybookLiveSmokeTarget;
  count?: number;
  trpcUrl?: string;
  token?: string;
  expectedUserId?: string;
  expectedOrganizationId?: string;
  queueName?: string;
  cleanupScope?: CareerPlaybookCleanupScope;
  maxCostUsdPerRun?: number;
  maxTotalCostUsd?: number;
  confirmLiveMutation?: boolean;
  env?: Record<string, string | undefined>;
}

export interface CareerPlaybookLoadTestCheck {
  id: string;
  status: CareerPlaybookLoadCheckStatus;
  mutates: boolean;
  note: string;
}

export interface CareerPlaybookLoadTestPlan {
  mode: CareerPlaybookLoadTestMode;
  status: 'pass' | 'blocked';
  mutates: boolean;
  checks: CareerPlaybookLoadTestCheck[];
}

export interface CareerPlaybookLoadRunObservation {
  runId: string;
  index: number;
  status: CareerPlaybookLiveSmokeReportStatus;
  playbookId?: string;
  durationMs: number;
  costUsd: number | null;
  costSource: string;
  artifactPaths: string[];
  cleanupManifest?: CareerPlaybookCleanupManifest;
  error?: string;
}

export interface CareerPlaybookLoadQueueState {
  phase: 'before' | 'after';
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export interface CareerPlaybookLoadTestDependencies {
  runSingle: (input: { runId: string; index: number }) => Promise<CareerPlaybookLoadRunObservation>;
  captureQueueState: (
    phase: CareerPlaybookLoadQueueState['phase']
  ) => Promise<CareerPlaybookLoadQueueState>;
}

export interface CareerPlaybookLoadTestReport extends Omit<CareerPlaybookLoadTestPlan, 'status'> {
  status: 'pass' | 'blocked' | 'fail';
  runs: CareerPlaybookLoadRunObservation[];
  summary: {
    requested: number;
    passed: number;
    failed: number;
    totalCostUsd: number;
  };
  queue: {
    before: CareerPlaybookLoadQueueState;
    after: CareerPlaybookLoadQueueState;
  };
}

const REQUIRED_RUN_COUNT = 10;
const DEFAULT_QUEUE_NAME = 'course-generation';

function hasValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function resolveNumber(
  value: number | undefined,
  envValue: string | undefined
): number | undefined {
  if (typeof value === 'number') return value;
  if (!hasValue(envValue)) return undefined;
  const parsed = Number(envValue);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function loadCheck(
  id: string,
  passed: boolean,
  noteWhenPassed: string,
  noteWhenBlocked: string
): CareerPlaybookLoadTestCheck {
  return {
    id,
    status: passed ? 'pass' : 'blocked',
    mutates: false,
    note: passed ? noteWhenPassed : noteWhenBlocked,
  };
}

function emptyQueueState(
  phase: CareerPlaybookLoadQueueState['phase'],
  queueName: string
): CareerPlaybookLoadQueueState {
  return { phase, queueName, waiting: 0, active: 0, completed: 0, failed: 0 };
}

export function buildCareerPlaybookLoadTestPlan(
  options: CareerPlaybookLoadTestOptions = {}
): CareerPlaybookLoadTestPlan {
  const env = options.env ?? process.env;
  const mode = options.mode ?? 'plan';
  const count = options.count ?? REQUIRED_RUN_COUNT;
  const targetEnvironment = options.targetEnvironment ?? 'local';
  const trpcUrl = options.trpcUrl ?? env.CAREER_PLAYBOOK_SMOKE_TRPC_URL;
  const token = options.token ?? env.TOKEN ?? env.CAREER_PLAYBOOK_SMOKE_TOKEN;
  const refreshToken = env.CAREER_PLAYBOOK_SMOKE_REFRESH_TOKEN;
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY;
  const expectedUserId = options.expectedUserId ?? env.CAREER_PLAYBOOK_SMOKE_USER_ID;
  const expectedOrganizationId =
    options.expectedOrganizationId ?? env.CAREER_PLAYBOOK_SMOKE_ORGANIZATION_ID;
  const queueName = options.queueName ?? env.BULLMQ_QUEUE_NAME ?? DEFAULT_QUEUE_NAME;
  const cleanupScope = options.cleanupScope ?? env.CAREER_PLAYBOOK_SMOKE_CLEANUP_SCOPE;
  const maxCostUsdPerRun = resolveNumber(
    options.maxCostUsdPerRun,
    env.CAREER_PLAYBOOK_LOAD_MAX_COST_USD_PER_RUN
  );
  const maxTotalCostUsd = resolveNumber(
    options.maxTotalCostUsd,
    env.CAREER_PLAYBOOK_LOAD_MAX_TOTAL_COST_USD
  );
  const requiredTotal = positiveNumber(maxCostUsdPerRun) ? count * maxCostUsdPerRun : undefined;
  const productionTarget = targetEnvironment === 'production' || targetEnvironment === 'prod';

  const checks: CareerPlaybookLoadTestCheck[] = [
    loadCheck(
      'target-environment',
      !productionTarget,
      `Target environment is ${targetEnvironment}.`,
      'Production load execution is blocked.'
    ),
    loadCheck(
      'run-count',
      count === REQUIRED_RUN_COUNT,
      `Exactly ${REQUIRED_RUN_COUNT} runs selected.`,
      `This acceptance requires exactly ${REQUIRED_RUN_COUNT} runs.`
    ),
    loadCheck('trpc-url', hasValue(trpcUrl), 'tRPC URL supplied.', 'Set the load-test tRPC URL.'),
    loadCheck(
      'auth-token',
      hasValue(token),
      'Bearer token supplied without exposing it.',
      'Set TOKEN or CAREER_PLAYBOOK_SMOKE_TOKEN for the disposable user.'
    ),
    loadCheck(
      'auth-refresh-token',
      hasValue(refreshToken),
      'Refresh token supplied without exposing it.',
      'Set CAREER_PLAYBOOK_SMOKE_REFRESH_TOKEN for a load run that can exceed access-token lifetime.'
    ),
    loadCheck(
      'auth-refresh-config',
      hasValue(supabaseUrl) && hasValue(supabaseAnonKey),
      'Supabase URL and anonymous key supplied for access-token refresh.',
      'Set SUPABASE_URL and SUPABASE_ANON_KEY for access-token refresh.'
    ),
    loadCheck(
      'expected-user-id',
      hasValue(expectedUserId),
      'Expected disposable user id supplied.',
      'Set the expected disposable user id.'
    ),
    loadCheck(
      'expected-organization-id',
      hasValue(expectedOrganizationId),
      'Expected disposable organization id supplied.',
      'Set the expected disposable organization id.'
    ),
    loadCheck(
      'dedicated-queue',
      hasValue(queueName) && queueName !== DEFAULT_QUEUE_NAME,
      `Dedicated queue selected: ${queueName}.`,
      'Select a dedicated non-default BULLMQ_QUEUE_NAME.'
    ),
    loadCheck(
      'cleanup-scope',
      cleanupScope === 'playbook-only' || cleanupScope === 'playbook-and-course',
      `Cleanup scope supplied: ${cleanupScope}.`,
      'Set cleanup scope to playbook-only or playbook-and-course.'
    ),
    loadCheck(
      'max-cost-usd-per-run',
      positiveNumber(maxCostUsdPerRun),
      `Per-run ceiling supplied: ${maxCostUsdPerRun} USD.`,
      'Set a positive per-run USD ceiling.'
    ),
    loadCheck(
      'max-total-cost-usd',
      positiveNumber(maxTotalCostUsd) &&
        positiveNumber(requiredTotal) &&
        maxTotalCostUsd >= requiredTotal,
      `Total ceiling supplied: ${maxTotalCostUsd} USD.`,
      `Set a total ceiling at least equal to count × per-run ceiling (${requiredTotal ?? 'unknown'} USD).`
    ),
    loadCheck(
      'confirm-live-mutation',
      options.confirmLiveMutation === true,
      'Explicit live mutation confirmation supplied.',
      'Pass the explicit live mutation confirmation.'
    ),
  ];

  const status = checks.some(item => item.status === 'blocked') ? 'blocked' : 'pass';
  return {
    mode,
    status,
    mutates: mode === 'mutation-load' && status === 'pass',
    checks,
  };
}

export async function runCareerPlaybookLoadTest(
  options: CareerPlaybookLoadTestOptions = {},
  dependencies: CareerPlaybookLoadTestDependencies
): Promise<CareerPlaybookLoadTestReport> {
  const plan = buildCareerPlaybookLoadTestPlan(options);
  const count = options.count ?? REQUIRED_RUN_COUNT;
  const queueName = options.queueName ?? options.env?.BULLMQ_QUEUE_NAME ?? DEFAULT_QUEUE_NAME;
  const emptySummary = { requested: count, passed: 0, failed: 0, totalCostUsd: 0 };

  if (plan.mode === 'plan' || plan.status !== 'pass') {
    return {
      ...plan,
      mutates: false,
      runs: [],
      summary: emptySummary,
      queue: {
        before: emptyQueueState('before', queueName),
        after: emptyQueueState('after', queueName),
      },
    };
  }

  const before = await dependencies.captureQueueState('before');
  const runs = await Promise.all(
    Array.from({ length: count }, async (_, offset): Promise<CareerPlaybookLoadRunObservation> => {
      const index = offset + 1;
      const runId = `${queueName}-${String(index).padStart(2, '0')}`;
      try {
        return await dependencies.runSingle({ runId, index });
      } catch (error) {
        return {
          runId,
          index,
          status: 'fail',
          durationMs: 0,
          costUsd: null,
          costSource: 'unavailable',
          artifactPaths: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );
  const after = await dependencies.captureQueueState('after');
  const passed = runs.filter(run => run.status === 'pass').length;
  const failed = runs.length - passed;
  const totalCostUsd =
    Math.round(runs.reduce((total, run) => total + (run.costUsd ?? 0), 0) * 1_000_000) / 1_000_000;
  const env = options.env ?? process.env;
  const maxCostUsdPerRun = resolveNumber(
    options.maxCostUsdPerRun,
    env.CAREER_PLAYBOOK_LOAD_MAX_COST_USD_PER_RUN
  );
  const maxTotalCostUsd = resolveNumber(
    options.maxTotalCostUsd,
    env.CAREER_PLAYBOOK_LOAD_MAX_TOTAL_COST_USD
  );
  const terminalRunsPassed = passed === count;
  const postRunQueuePassed =
    after.queueName === queueName && after.active === 0 && after.waiting === 0;
  const costEvidencePassed = runs.every(
    run => run.costUsd !== null && Number.isFinite(run.costUsd) && run.costUsd >= 0
  );
  const costCeilingsPassed =
    costEvidencePassed &&
    positiveNumber(maxCostUsdPerRun) &&
    positiveNumber(maxTotalCostUsd) &&
    runs.every(run => (run.costUsd as number) <= maxCostUsdPerRun) &&
    totalCostUsd <= maxTotalCostUsd;
  const checks: CareerPlaybookLoadTestCheck[] = [
    ...plan.checks,
    {
      id: 'terminal-runs',
      status: terminalRunsPassed ? 'pass' : 'fail',
      mutates: false,
      note: terminalRunsPassed
        ? `All ${count} runs passed.`
        : `${failed} of ${count} runs did not pass.`,
    },
    {
      id: 'post-run-queue',
      status: postRunQueuePassed ? 'pass' : 'fail',
      mutates: false,
      note: postRunQueuePassed
        ? 'Dedicated queue has no active or waiting jobs after the batch.'
        : `Queue residue detected: active=${after.active}, waiting=${after.waiting}.`,
    },
    {
      id: 'cost-evidence',
      status: costEvidencePassed ? 'pass' : 'fail',
      mutates: false,
      note: costEvidencePassed
        ? `Measured runtime cost is available for all ${count} runs.`
        : `${runs.filter(run => run.costUsd === null).length} of ${count} runs lack measured runtime cost.`,
    },
    {
      id: 'cost-ceilings',
      status: costCeilingsPassed ? 'pass' : 'fail',
      mutates: false,
      note: costCeilingsPassed
        ? `All runs stayed within ${maxCostUsdPerRun} USD and total cost stayed within ${maxTotalCostUsd} USD.`
        : `Measured cost did not prove the approved per-run (${maxCostUsdPerRun ?? 'unknown'} USD) and total (${maxTotalCostUsd ?? 'unknown'} USD) ceilings.`,
    },
  ];

  return {
    ...plan,
    status:
      terminalRunsPassed && postRunQueuePassed && costEvidencePassed && costCeilingsPassed
        ? 'pass'
        : 'fail',
    checks,
    runs,
    summary: { requested: count, passed, failed, totalCostUsd },
    queue: { before, after },
  };
}
