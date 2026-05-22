import type {
  CareerPlaybookAnswerSubmission,
  CareerPlaybookFixedAnswer,
  CareerPlaybookFollowupAnswer,
  CareerPlaybookFollowupQuestion,
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookPlaybookStatus,
  Language,
} from '@megacampus/shared-types';
import {
  validateCareerPlaybookSmokeEvidence,
  type CareerPlaybookSmokeEvidenceReport,
} from './career-playbook-validation';

export type CareerPlaybookLiveSmokeMode = 'plan' | 'mutation-smoke';
export type CareerPlaybookLiveSmokeTarget =
  | 'local'
  | 'development'
  | 'dev'
  | 'staging'
  | 'production'
  | 'prod';
export type CareerPlaybookLiveSmokeStatus = 'pass' | 'warn' | 'blocked' | 'skipped';
export type CareerPlaybookLiveSmokeReportStatus = 'pass' | 'warn' | 'blocked' | 'fail';
export type CareerPlaybookCleanupScope = 'playbook-only' | 'playbook-and-course';

export interface CareerPlaybookLiveSmokeEnv {
  [key: string]: string | undefined;
}

export interface CareerPlaybookLiveSmokeOptions {
  mode?: CareerPlaybookLiveSmokeMode;
  targetEnvironment?: CareerPlaybookLiveSmokeTarget;
  env?: CareerPlaybookLiveSmokeEnv;
  trpcUrl?: string;
  token?: string;
  expectedUserId?: string;
  expectedOrganizationId?: string;
  queueName?: string;
  cleanupScope?: CareerPlaybookCleanupScope;
  maxCostUsd?: number;
  confirmLiveMutation?: boolean;
  runId?: string;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
  includeCourseBridge?: boolean;
}

export interface CareerPlaybookLiveSmokeCheck {
  id: string;
  status: CareerPlaybookLiveSmokeStatus;
  mutates: boolean;
  note: string;
}

export interface CareerPlaybookLiveSmokePlan {
  mode: CareerPlaybookLiveSmokeMode;
  targetEnvironment: CareerPlaybookLiveSmokeTarget;
  status: 'pass' | 'blocked' | 'warn';
  mutates: boolean;
  checks: CareerPlaybookLiveSmokeCheck[];
}

export interface CareerPlaybookLiveSmokeReport extends Omit<CareerPlaybookLiveSmokePlan, 'status'> {
  status: CareerPlaybookLiveSmokeReportStatus;
  playbookId?: string;
  courseId?: string;
  cleanupManifest?: CareerPlaybookCleanupManifest;
  evidence?: CareerPlaybookSmokeEvidenceReport;
}

export interface CareerPlaybookLiveSmokeSessionResponse {
  playbookId: string;
  status: CareerPlaybookPlaybookStatus;
}

export interface CareerPlaybookLiveSmokeFollowupResponse {
  questions: CareerPlaybookFollowupQuestion[];
  completeness_score: number;
  stop_recommendation: 'ask_more' | 'ready_to_generate';
}

export interface CareerPlaybookLiveSmokeGenerationStatus {
  playbookId: string;
  status: CareerPlaybookPlaybookStatus;
  progress?: number;
  finalMarkdown?: string;
  completedAt?: string;
  generatedBlocks?: unknown;
}

export interface CareerPlaybookLiveSmokeLibraryDetail {
  id: string;
  status: CareerPlaybookPlaybookStatus;
  finalMarkdown: string | null;
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
  completedAt?: string | null;
}

export interface CareerPlaybookLiveSmokeClient {
  startSession: (input: { language: Language }) => Promise<CareerPlaybookLiveSmokeSessionResponse>;
  submitAnswer: (input: {
    playbookId: string;
    phase: 'fixed' | 'followup' | 'freeform';
    answer: CareerPlaybookAnswerSubmission;
  }) => Promise<unknown>;
  requestFollowups: (input: {
    playbookId: string;
    fixedAnswers: Record<string, CareerPlaybookFixedAnswer>;
    followupAnswers: Record<string, CareerPlaybookFollowupAnswer>;
    contentLanguage: Language;
  }) => Promise<CareerPlaybookLiveSmokeFollowupResponse>;
  approveAndGenerate: (input: {
    playbookId: string;
  }) => Promise<CareerPlaybookLiveSmokeGenerationStatus>;
  getStatus: (input: { playbookId: string }) => Promise<CareerPlaybookLiveSmokeGenerationStatus>;
  getLibraryDetail: (input: { playbookId: string }) => Promise<CareerPlaybookLiveSmokeLibraryDetail>;
  exportPdf: (input: { playbookId: string }) => Promise<unknown>;
  toggleShare: (input: {
    playbookId: string;
    isPublic: boolean;
  }) => Promise<{ shareSlug: string | null; isPublic: boolean }>;
  getPublicShare: (input: { shareSlug: string }) => Promise<unknown>;
  createCourseFromPlaybook: (input: {
    playbookId: string;
    includeWebResearch: boolean;
  }) => Promise<{ courseId: string; redirectUrl: string; sourceDocumentIds: string[] }>;
}

export interface CareerPlaybookLiveSmokeDependencies {
  client?: CareerPlaybookLiveSmokeClient;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export type CareerPlaybookCleanupItemType =
  | 'auth_user'
  | 'organization'
  | 'career_playbook'
  | 'bullmq_job'
  | 'job_status'
  | 'share_slug'
  | 'course'
  | 'source_document'
  | 'upload_path';

export interface CareerPlaybookCleanupItem {
  type: CareerPlaybookCleanupItemType;
  id: string;
  note: string;
}

export interface CareerPlaybookCleanupManifestInput {
  runId: string;
  targetEnvironment: CareerPlaybookLiveSmokeTarget;
  queueName?: string;
  token?: string;
  expectedUserId?: string;
  expectedOrganizationId?: string;
  playbookId?: string;
  careerPlaybookJobId?: string;
  shareSlug?: string | null;
  courseId?: string | null;
  sourceDocumentIds?: string[];
  uploadPaths?: string[];
}

export interface CareerPlaybookCleanupManifest {
  runId: string;
  targetEnvironment: CareerPlaybookLiveSmokeTarget;
  queueName?: string;
  mutates: false;
  items: CareerPlaybookCleanupItem[];
}

const DEFAULT_QUEUE_NAME = 'course-generation';
const DEFAULT_POLL_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 5000;

const SALES_MANAGER_B2B_FIXED_ANSWERS: CareerPlaybookFixedAnswer[] = [
  { question_key: 'position', value: 'Sales Manager B2B' },
  { question_key: 'department', value: 'sales' },
  { question_key: 'level', value: 'lead' },
  { question_key: 'reporting', value: 'Reports to CRO. Leads SDR and AE team.' },
  { question_key: 'team_size', value: '51-200' },
  { question_key: 'company_stage', value: 'growth' },
  { question_key: 'content_language', value: 'en' },
];

function hasValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeMode(mode: CareerPlaybookLiveSmokeOptions['mode']): CareerPlaybookLiveSmokeMode {
  return mode ?? 'plan';
}

function normalizeTarget(
  targetEnvironment: CareerPlaybookLiveSmokeOptions['targetEnvironment'],
  env: CareerPlaybookLiveSmokeEnv
): CareerPlaybookLiveSmokeTarget {
  if (targetEnvironment) return targetEnvironment;
  if (env.NODE_ENV === 'production') return 'prod';
  if (env.NODE_ENV === 'development') return 'development';
  return 'local';
}

function isProductionTarget(targetEnvironment: CareerPlaybookLiveSmokeTarget): boolean {
  return targetEnvironment === 'production' || targetEnvironment === 'prod';
}

function isStagingOrProduction(targetEnvironment: CareerPlaybookLiveSmokeTarget): boolean {
  return ['staging', 'production', 'prod'].includes(targetEnvironment);
}

function resolveToken(options: CareerPlaybookLiveSmokeOptions, env: CareerPlaybookLiveSmokeEnv) {
  return options.token ?? env.TOKEN ?? env.CAREER_PLAYBOOK_SMOKE_TOKEN;
}

function resolveQueueName(options: CareerPlaybookLiveSmokeOptions, env: CareerPlaybookLiveSmokeEnv) {
  return options.queueName ?? env.BULLMQ_QUEUE_NAME ?? DEFAULT_QUEUE_NAME;
}

function resolveMaxCostUsd(
  options: CareerPlaybookLiveSmokeOptions,
  env: CareerPlaybookLiveSmokeEnv
): number | undefined {
  if (typeof options.maxCostUsd === 'number') return options.maxCostUsd;
  if (!hasValue(env.CAREER_PLAYBOOK_SMOKE_MAX_COST_USD)) return undefined;
  const parsed = Number(env.CAREER_PLAYBOOK_SMOKE_MAX_COST_USD);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveCleanupScope(
  options: CareerPlaybookLiveSmokeOptions,
  env: CareerPlaybookLiveSmokeEnv
): CareerPlaybookCleanupScope | undefined {
  const value = options.cleanupScope ?? env.CAREER_PLAYBOOK_SMOKE_CLEANUP_SCOPE;
  if (value === 'playbook-only' || value === 'playbook-and-course') return value;
  return undefined;
}

function check(
  id: string,
  status: CareerPlaybookLiveSmokeStatus,
  mutates: boolean,
  note: string
): CareerPlaybookLiveSmokeCheck {
  return { id, status, mutates, note };
}

function summarizePlan(checks: CareerPlaybookLiveSmokeCheck[]): CareerPlaybookLiveSmokePlan['status'] {
  if (checks.some(item => item.status === 'blocked')) return 'blocked';
  if (checks.some(item => item.status === 'warn')) return 'warn';
  return 'pass';
}

function requireGate(
  id: string,
  present: boolean,
  noteWhenPresent: string,
  noteWhenMissing: string
): CareerPlaybookLiveSmokeCheck {
  return check(id, present ? 'pass' : 'blocked', false, present ? noteWhenPresent : noteWhenMissing);
}

export function buildCareerPlaybookLiveSmokePlan(
  options: CareerPlaybookLiveSmokeOptions = {}
): CareerPlaybookLiveSmokePlan {
  const env = options.env ?? process.env;
  const mode = normalizeMode(options.mode);
  const targetEnvironment = normalizeTarget(options.targetEnvironment, env);
  const token = resolveToken(options, env);
  const queueName = resolveQueueName(options, env);
  const maxCostUsd = resolveMaxCostUsd(options, env);
  const cleanupScope = resolveCleanupScope(options, env);
  const trpcUrl = options.trpcUrl ?? env.CAREER_PLAYBOOK_SMOKE_TRPC_URL;
  const expectedUserId = options.expectedUserId ?? env.CAREER_PLAYBOOK_SMOKE_USER_ID;
  const expectedOrganizationId =
    options.expectedOrganizationId ?? env.CAREER_PLAYBOOK_SMOKE_ORGANIZATION_ID;

  const checks: CareerPlaybookLiveSmokeCheck[] = [
    check(
      'mode',
      mode === 'plan' ? 'skipped' : 'pass',
      mode === 'mutation-smoke',
      mode === 'plan'
        ? 'Plan mode is non-mutating and will not call tRPC, enqueue jobs, start workers, or call LLMs.'
        : 'Mutation mode selected; live smoke gates must all pass before any tRPC mutation.'
    ),
    check(
      'target-environment',
      isProductionTarget(targetEnvironment) ? 'blocked' : 'pass',
      false,
      isProductionTarget(targetEnvironment)
        ? 'Production Career Playbook live smoke is blocked by this runner.'
        : `Target environment is ${targetEnvironment}.`
    ),
    requireGate(
      'trpc-url',
      hasValue(trpcUrl),
      'tRPC URL supplied.',
      'Set --trpc-url or CAREER_PLAYBOOK_SMOKE_TRPC_URL before live mutation smoke.'
    ),
    requireGate(
      'auth-token',
      hasValue(token),
      'Bearer token supplied without exposing it in the report.',
      'Set TOKEN or CAREER_PLAYBOOK_SMOKE_TOKEN for the disposable staging user.'
    ),
    requireGate(
      'expected-user-id',
      hasValue(expectedUserId),
      'Expected disposable user id supplied.',
      'Set --expected-user-id or CAREER_PLAYBOOK_SMOKE_USER_ID.'
    ),
    requireGate(
      'expected-organization-id',
      hasValue(expectedOrganizationId),
      'Expected disposable organization id supplied.',
      'Set --expected-organization-id or CAREER_PLAYBOOK_SMOKE_ORGANIZATION_ID.'
    ),
    check(
      'dedicated-queue',
      queueName !== DEFAULT_QUEUE_NAME && hasValue(queueName)
        ? 'pass'
        : isStagingOrProduction(targetEnvironment)
          ? 'blocked'
          : 'warn',
      false,
      queueName !== DEFAULT_QUEUE_NAME && hasValue(queueName)
        ? `Dedicated queue selected: ${queueName}.`
        : 'Live staging/prod smoke requires a dedicated non-default BULLMQ_QUEUE_NAME before enqueue.'
    ),
    requireGate(
      'cleanup-scope',
      cleanupScope !== undefined,
      `Cleanup scope supplied: ${cleanupScope}.`,
      'Set --cleanup-scope to playbook-only or playbook-and-course before live mutation smoke.'
    ),
    requireGate(
      'max-cost-usd',
      typeof maxCostUsd === 'number' && maxCostUsd > 0,
      `Max live-smoke budget supplied: ${maxCostUsd} USD.`,
      'Set a positive --max-cost-usd or CAREER_PLAYBOOK_SMOKE_MAX_COST_USD.'
    ),
    requireGate(
      'confirm-live-mutation',
      options.confirmLiveMutation === true,
      'Explicit live mutation confirmation supplied.',
      'Pass --confirm-live-mutation for mutation-smoke mode.'
    ),
  ];

  return {
    mode,
    targetEnvironment,
    status: summarizePlan(checks),
    mutates: mode === 'mutation-smoke',
    checks,
  };
}

function fixedAnswerRecord(): Record<string, CareerPlaybookFixedAnswer> {
  return Object.fromEntries(
    SALES_MANAGER_B2B_FIXED_ANSWERS.map(answer => [answer.question_key, answer])
  );
}

function followupAnswerFor(question: CareerPlaybookFollowupQuestion): CareerPlaybookAnswerSubmission {
  if (question.options?.[0]?.value) {
    return {
      question_id: question.question_id,
      value: question.options[0].value,
    };
  }

  return {
    question_id: question.question_id,
    skipped: true,
  };
}

function isPdfExportResponse(value: unknown): value is {
  pdfBase64: string;
  contentType: string;
  sizeBytes: number;
} {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.pdfBase64 === 'string' &&
    typeof candidate.contentType === 'string' &&
    typeof candidate.sizeBytes === 'number'
  );
}

function pdfStartsWithHeader(pdfBase64: string): boolean {
  try {
    return Buffer.from(pdfBase64, 'base64').subarray(0, 4).toString('utf8') === '%PDF';
  } catch {
    return false;
  }
}

async function waitForCompletion(
  client: CareerPlaybookLiveSmokeClient,
  playbookId: string,
  options: CareerPlaybookLiveSmokeOptions,
  dependencies: CareerPlaybookLiveSmokeDependencies
): Promise<CareerPlaybookLiveSmokeGenerationStatus> {
  const now = dependencies.now ?? (() => new Date());
  const sleep = dependencies.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const timeoutMs = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const intervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const startedAt = now().getTime();

  while (now().getTime() - startedAt <= timeoutMs) {
    const status = await client.getStatus({ playbookId });
    if (status.status === 'completed' || status.status === 'failed') return status;
    await sleep(intervalMs);
  }

  throw new Error(`Career Playbook live smoke timed out waiting for ${playbookId}`);
}

export async function runCareerPlaybookLiveSmoke(
  options: CareerPlaybookLiveSmokeOptions = {},
  dependencies: CareerPlaybookLiveSmokeDependencies = {}
): Promise<CareerPlaybookLiveSmokeReport> {
  const plan = buildCareerPlaybookLiveSmokePlan(options);
  const env = options.env ?? process.env;
  const expectedUserId = options.expectedUserId ?? env.CAREER_PLAYBOOK_SMOKE_USER_ID;
  const expectedOrganizationId =
    options.expectedOrganizationId ?? env.CAREER_PLAYBOOK_SMOKE_ORGANIZATION_ID;

  if (plan.mode === 'plan' || plan.status !== 'pass') {
    return { ...plan, mutates: false };
  }

  const client = dependencies.client;
  if (!client) {
    return {
      ...plan,
      status: 'blocked',
      checks: [
        ...plan.checks,
        check('client', 'blocked', false, 'No tRPC client adapter was supplied.'),
      ],
    };
  }

  const session = await client.startSession({ language: 'en' });
  const playbookId = session.playbookId;

  for (const fixedAnswer of SALES_MANAGER_B2B_FIXED_ANSWERS) {
    await client.submitAnswer({
      playbookId,
      phase: 'fixed',
      answer: {
        question_key: fixedAnswer.question_key,
        value: fixedAnswer.value,
      },
    });
  }

  const followups = await client.requestFollowups({
    playbookId,
    fixedAnswers: fixedAnswerRecord(),
    followupAnswers: {},
    contentLanguage: 'en',
  });

  for (const question of followups.questions) {
    await client.submitAnswer({
      playbookId,
      phase: 'followup',
      answer: followupAnswerFor(question),
    });
  }

  await client.approveAndGenerate({ playbookId });
  await waitForCompletion(client, playbookId, options, dependencies);
  const detail = await client.getLibraryDetail({ playbookId });
  const pdf = await client.exportPdf({ playbookId });
  const pdfEvidence = isPdfExportResponse(pdf)
    ? {
        contentType: pdf.contentType,
        sizeBytes: pdf.sizeBytes,
        startsWithPdfHeader: pdfStartsWithHeader(pdf.pdfBase64),
      }
    : undefined;
  const share = await client.toggleShare({ playbookId, isPublic: true });
  if (share.shareSlug) {
    await client.getPublicShare({ shareSlug: share.shareSlug });
  }

  let courseId: string | undefined;
  let sourceDocumentIds: string[] = [];
  let redirectUrl: string | undefined;
  if (options.includeCourseBridge) {
    const course = await client.createCourseFromPlaybook({
      playbookId,
      includeWebResearch: false,
    });
    courseId = course.courseId;
    sourceDocumentIds = course.sourceDocumentIds;
    redirectUrl = course.redirectUrl;
  }

  const evidence = validateCareerPlaybookSmokeEvidence({
    playbook: {
      id: detail.id,
      status: detail.status,
      completedAt: detail.completedAt,
      generatedBlocks: detail.generatedBlocks,
      finalMarkdown: detail.finalMarkdown,
    },
    pdf: pdfEvidence,
    share: {
      isPublic: share.isPublic,
      shareSlug: share.shareSlug,
      publicFetchOk: Boolean(share.shareSlug),
    },
    courseBridge: options.includeCourseBridge
      ? {
          courseId,
          redirectUrl,
          sourceDocumentIds,
        }
      : undefined,
    requireSurfaces: true,
    requireCourseBridge: options.includeCourseBridge === true,
  });

  return {
    ...plan,
    status: evidence.status === 'pass' ? plan.status : 'fail',
    playbookId,
    courseId,
    evidence,
    cleanupManifest: buildCareerPlaybookCleanupManifest({
      runId: options.runId ?? `career-playbook-smoke-${new Date().toISOString()}`,
      targetEnvironment: plan.targetEnvironment,
      queueName: resolveQueueName(options, options.env ?? process.env),
      expectedUserId,
      expectedOrganizationId,
      playbookId,
      careerPlaybookJobId: `career-playbook:${playbookId}`,
      shareSlug: share.shareSlug,
      courseId,
      sourceDocumentIds,
    }),
  };
}

function pushCleanupItem(
  items: CareerPlaybookCleanupItem[],
  type: CareerPlaybookCleanupItemType,
  id: string | null | undefined,
  note: string
): void {
  if (!hasValue(id ?? undefined)) return;
  items.push({ type, id: id as string, note });
}

export function buildCareerPlaybookCleanupManifest(
  input: CareerPlaybookCleanupManifestInput
): CareerPlaybookCleanupManifest {
  const items: CareerPlaybookCleanupItem[] = [];

  pushCleanupItem(items, 'auth_user', input.expectedUserId, 'Delete only if this user is disposable.');
  pushCleanupItem(
    items,
    'organization',
    input.expectedOrganizationId,
    'Delete only if this organization is disposable.'
  );
  pushCleanupItem(items, 'career_playbook', input.playbookId, 'Delete by exact playbook id.');
  pushCleanupItem(
    items,
    'bullmq_job',
    input.careerPlaybookJobId,
    'Remove only from the dedicated Career Playbook smoke queue.'
  );
  pushCleanupItem(
    items,
    'job_status',
    input.careerPlaybookJobId,
    'Delete job_status by exact job_id because Career Playbook jobs have no course_id.'
  );
  pushCleanupItem(items, 'share_slug', input.shareSlug, 'Share state lives on the playbook row.');
  pushCleanupItem(items, 'course', input.courseId, 'Delete bridge course after file/job cleanup.');

  for (const documentId of input.sourceDocumentIds ?? []) {
    pushCleanupItem(items, 'source_document', documentId, 'Delete bridge source document by exact id.');
  }

  for (const uploadPath of input.uploadPaths ?? []) {
    pushCleanupItem(items, 'upload_path', uploadPath, 'Remove exact generated upload path.');
  }

  return {
    runId: input.runId,
    targetEnvironment: input.targetEnvironment,
    queueName: input.queueName,
    mutates: false,
    items,
  };
}

export function formatCareerPlaybookLiveSmokeReport(report: CareerPlaybookLiveSmokeReport): string {
  const lines = [
    'Career Playbook live smoke runner',
    `mode: ${report.mode}`,
    `target: ${report.targetEnvironment}`,
    `status: ${report.status}`,
    `mutates: ${report.mutates}`,
    '',
    'Checks:',
  ];

  for (const check of report.checks) {
    lines.push(`- ${check.id}: ${check.status} [mutates=${check.mutates}] - ${check.note}`);
  }

  if (report.playbookId) {
    lines.push('', `playbookId: ${report.playbookId}`);
  }
  if (report.courseId) {
    lines.push(`courseId: ${report.courseId}`);
  }
  if (report.evidence) {
    lines.push('', `Evidence: ${report.evidence.status}`);
    for (const check of report.evidence.checks) {
      lines.push(`- ${check.id}: ${check.status} - ${check.note}`);
    }
  }
  if (report.cleanupManifest) {
    lines.push('', 'Cleanup manifest (dry-run):');
    for (const item of report.cleanupManifest.items) {
      lines.push(`- ${item.type}: ${item.id} - ${item.note}`);
    }
  }

  return lines.join('\n');
}
