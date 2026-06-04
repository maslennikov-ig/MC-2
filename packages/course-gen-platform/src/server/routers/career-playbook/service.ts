import { TRPCError } from '@trpc/server';
import {
  CareerPlaybookBusinessContextSchema,
  CareerPlaybookFixedQuestionSchema,
  CareerPlaybookFollowupAnswerSchema,
  CareerPlaybookFollowupResponseSchema,
  CareerPlaybookQADataSchema,
  JobType,
  isCareerPlaybookFollowupResponseReady,
  normalizeCareerPlaybookFollowupResponseReadiness,
  type CareerPlaybookAnswerSubmission,
  type CareerPlaybookBlockId,
  type CareerPlaybookBlockState,
  type CareerPlaybookBusinessContext,
  type CareerPlaybookBusinessContextSourceSummary,
  type CareerPlaybookFixedAnswer,
  type CareerPlaybookFixedQuestion,
  type CareerPlaybookFollowupAnswer,
  type CareerPlaybookFollowupQuestion,
  type CareerPlaybookFollowupResponse,
  type CareerPlaybookPlaybookStatus,
  type CareerPlaybookGeneratePlaybookJobData,
  type Language,
} from '@megacampus/shared-types';
import type { Context, UserContext } from '../../trpc';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { addJob, removeTerminalJobById } from '../../../orchestrator/queue';
import { generateCareerPlaybookFollowups } from '@/stages/stage-career-playbook/nodes/followup-questions';
import {
  hasPendingCareerPlaybookBusinessContextSources,
  refreshCareerPlaybookBusinessContextDigest,
} from '@/stages/stage-career-playbook/nodes/business-context';
import {
  freeformDraftFromQAData,
  generationProgress,
  mapPlaybookRow,
  normalizeGeneratedBlocks,
  normalizeLanguage,
  normalizeStoredQAData,
  phaseFromStatus,
  toJson,
  uiLanguageFromContent,
  type CareerPlaybookRow,
  type CareerPlaybookSupabase,
  type StoredQAData,
  type WizardPhase,
} from './service-mappers';
import { getCareerPlaybookGenerationJobId } from './job-ids';
import { listCareerPlaybookBusinessContextSourceSummaries } from './sources.service';

export interface CareerPlaybookDraftResponse {
  playbookId: string;
  uiLanguage: 'ru' | 'en';
  contentLanguage: Language;
  fixedAnswers: CareerPlaybookFixedAnswer[];
  followupQuestions: CareerPlaybookFollowupQuestion[];
  followupAnswers: CareerPlaybookFollowupAnswer[];
  completenessScore: number;
  followupGenerationCount: number;
  freeformDraft: string;
  businessContext: CareerPlaybookBusinessContext;
  businessContextSources?: CareerPlaybookBusinessContextSourceSummary[];
  status: CareerPlaybookPlaybookStatus;
  phase: WizardPhase;
}

export interface CareerPlaybookGenerationStatusResponse {
  playbookId: string;
  status: CareerPlaybookPlaybookStatus;
  phase: WizardPhase;
  progress: number;
  error?: string;
  generatedBlocks?: Record<string, CareerPlaybookBlockState>;
  finalMarkdown?: string;
  completedAt?: string;
}

export interface RequestFollowupsInput {
  playbookId: string;
  fixedAnswers: Record<string, CareerPlaybookFixedAnswer>;
  followupAnswers: Record<string, CareerPlaybookFollowupAnswer>;
  contentLanguage: Language;
}

function getCareerPlaybookSupabase(): CareerPlaybookSupabase {
  return getSupabaseAdmin() as unknown as CareerPlaybookSupabase;
}

function requireUser(ctx: Context): UserContext {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  return ctx.user;
}

function throwOnDbError(error: unknown, message: string): never {
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message,
    cause: error,
  });
}

function mapRowToDraft(
  row: CareerPlaybookRow,
  options: { businessContextSources?: CareerPlaybookBusinessContextSourceSummary[] } = {}
): CareerPlaybookDraftResponse {
  const mapped = mapPlaybookRow(row);
  const qaData = normalizeStoredQAData(mapped.q_a_data);

  const draft: CareerPlaybookDraftResponse = {
    playbookId: mapped.id,
    uiLanguage: uiLanguageFromContent(mapped.language),
    contentLanguage: mapped.language,
    fixedAnswers: qaData.fixed,
    followupQuestions: qaData.followup_questions,
    followupAnswers: qaData.followups,
    completenessScore: qaData.completeness_score ?? 0,
    followupGenerationCount: qaData.followup_generation_count,
    freeformDraft: freeformDraftFromQAData(qaData),
    businessContext: qaData.business_context,
    status: mapped.status,
    phase: phaseFromStatus(mapped.status, qaData),
  };

  if (options.businessContextSources) {
    draft.businessContextSources = options.businessContextSources;
  }

  return draft;
}

function assertReadable(row: CareerPlaybookRow, user: UserContext): void {
  if (user.role === 'superadmin' || row.user_id === user.id) {
    return;
  }

  throw new TRPCError({ code: 'FORBIDDEN', message: 'Career Playbook access denied' });
}

function assertWritable(row: CareerPlaybookRow, user: UserContext): void {
  if (user.role === 'superadmin' || row.user_id === user.id) return;

  throw new TRPCError({ code: 'FORBIDDEN', message: 'Career Playbook access denied' });
}

async function loadPlaybook(playbookId: string, user: UserContext, mode: 'read' | 'write') {
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .select('*')
    .eq('id', playbookId)
    .single();

  if (error || !data) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Career Playbook not found',
      cause: error,
    });
  }

  const row = mapPlaybookRow(data);
  if (mode === 'write') {
    assertWritable(row, user);
  } else {
    assertReadable(row, user);
  }

  return row;
}

function valueAsString(value: CareerPlaybookFixedAnswer['value'] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function upsertByKey<T>(items: T[], key: keyof T, value: T): T[] {
  const next = items.filter(item => item[key] !== value[key]);
  next.push(value);
  return next;
}

function buildFixedAnswer(answer: CareerPlaybookAnswerSubmission): CareerPlaybookFixedAnswer {
  if (!answer.question_key || answer.value === undefined) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Fixed answers require question_key and value',
    });
  }

  return {
    question_key: answer.question_key,
    value: answer.value,
    answered_at: new Date().toISOString(),
  };
}

function buildFollowupAnswer(
  answer: CareerPlaybookAnswerSubmission,
  questions: CareerPlaybookFollowupQuestion[]
): CareerPlaybookFollowupAnswer {
  if (!answer.question_id) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Follow-up answers require question_id' });
  }

  const question = questions.find(item => item.question_id === answer.question_id);
  if (!question) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Follow-up question is not part of this playbook draft',
    });
  }

  return CareerPlaybookFollowupAnswerSchema.parse({
    question_id: question.question_id,
    question_text: question.question_text,
    question_type: question.question_type,
    value: answer.value,
    skipped: answer.skipped === true,
    answered_at: new Date().toISOString(),
  });
}

const FOLLOWUP_GENERATION_LIMIT = 2;
const MAX_FOLLOWUP_QUESTIONS = 7;
const REQUIRED_FIXED_QUESTION_KEYS = ['position', 'department', 'level', 'reporting', 'team_size'];

function mergeGeneratedQuestions(
  existing: CareerPlaybookFollowupQuestion[],
  generated: CareerPlaybookFollowupQuestion[]
) {
  const byId = new Map<string, CareerPlaybookFollowupQuestion>();
  for (const question of existing) byId.set(question.question_id, question);
  for (const question of generated) byId.set(question.question_id, question);
  return [...byId.values()].slice(0, MAX_FOLLOWUP_QUESTIONS);
}

function capGeneratedQuestionsForResponse(
  existing: CareerPlaybookFollowupQuestion[],
  generated: CareerPlaybookFollowupQuestion[],
  merged: CareerPlaybookFollowupQuestion[]
) {
  const existingIds = new Set(existing.map(question => question.question_id));
  const mergedIds = new Set(merged.map(question => question.question_id));
  return generated.filter(
    question => !existingIds.has(question.question_id) && mergedIds.has(question.question_id)
  );
}

function isReadyForGeneration(row: CareerPlaybookRow, qaData: StoredQAData): boolean {
  if (row.status === 'ready_to_generate') return hasCompletedBusinessContext(qaData);
  if (row.status === 'failed') {
    return qaData.fixed.length > 0 && hasCompletedBusinessContext(qaData);
  }
  if (
    qaData.followup_questions.length === 0 &&
    (row.status === 'answering_fixed' ||
      row.status === 'awaiting_followups' ||
      row.status === 'answering_followups')
  ) {
    return hasRequiredFixedAnswers(qaData) && hasCompletedBusinessContext(qaData);
  }
  if (row.status !== 'answering_followups') return false;
  if (
    qaData.fixed.length === 0 ||
    qaData.followup_questions.length === 0 ||
    !hasCompletedBusinessContext(qaData)
  ) {
    return false;
  }

  const answeredQuestionIds = new Set(qaData.followups.map(answer => answer.question_id));
  return qaData.followup_questions.every(question => answeredQuestionIds.has(question.question_id));
}

function hasCompletedBusinessContext(qaData: StoredQAData): boolean {
  return qaData.business_context.status === 'ready' || qaData.business_context.status === 'skipped';
}

function hasRequiredFixedAnswers(qaData: StoredQAData): boolean {
  const answeredFixedKeys = new Set(
    qaData.fixed
      .filter(answer => hasStoredAnswerValue(answer.value))
      .map(answer => answer.question_key)
  );

  return REQUIRED_FIXED_QUESTION_KEYS.every(questionKey => answeredFixedKeys.has(questionKey));
}

function hasStoredAnswerValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(item => typeof item === 'string' && item.trim().length > 0);
  }

  return typeof value === 'string' && value.trim().length > 0;
}

function assertCanRequestFollowups(
  row: CareerPlaybookRow,
  qaData: StoredQAData,
  fixedAnswers: Record<string, CareerPlaybookFixedAnswer>
): void {
  const allowedStatuses: CareerPlaybookPlaybookStatus[] = [
    'answering_fixed',
    'awaiting_followups',
    'answering_followups',
  ];
  if (
    allowedStatuses.includes(row.status) &&
    Object.keys(fixedAnswers).length > 0 &&
    hasCompletedBusinessContext(qaData)
  ) {
    return;
  }

  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Career Playbook is not accepting follow-up generation',
  });
}

function qaDataWithoutGenerationError(qaData: StoredQAData): StoredQAData {
  const { generation_error: _generationError, ...cleanQAData } = qaData;
  return cleanQAData;
}

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function startCareerPlaybookSession(
  ctx: Context,
  input: { language: Language }
): Promise<CareerPlaybookDraftResponse> {
  const user = requireUser(ctx);
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .insert({
      user_id: user.id,
      organization_id: user.organizationId,
      status: 'answering_fixed',
      language: input.language,
      q_a_data: toJson({
        fixed: [],
        followups: [],
        freeform: [],
        business_context: {
          mode: 'universal',
          status: 'not_started',
          digest: null,
          source_ids: [],
        },
        followup_questions: [],
        followup_generation_count: 0,
      }),
      generated_blocks: toJson({}),
    })
    .select('*')
    .single();

  if (error || !data) throwOnDbError(error, 'Failed to start Career Playbook session');

  return mapRowToDraft(data, { businessContextSources: [] });
}

export async function getCareerPlaybookDraft(
  ctx: Context,
  input: { playbookId: string }
): Promise<CareerPlaybookDraftResponse> {
  const user = requireUser(ctx);
  const row = await loadPlaybook(input.playbookId, user, 'read');
  const businessContextSources = await listCareerPlaybookBusinessContextSourceSummaries(row.id);
  return mapRowToDraft(row, { businessContextSources });
}

export async function submitCareerPlaybookAnswer(
  ctx: Context,
  input: {
    playbookId: string;
    phase: 'fixed' | 'followup' | 'freeform' | 'business_context';
    answer: CareerPlaybookAnswerSubmission;
  }
): Promise<CareerPlaybookDraftResponse> {
  const user = requireUser(ctx);
  const row = await loadPlaybook(input.playbookId, user, 'write');
  if (row.status === 'generating') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Career Playbook generation is already in progress',
    });
  }
  const qaData = normalizeStoredQAData(row.q_a_data);
  const updatePayload: Partial<CareerPlaybookRow> = {};

  if (input.phase === 'fixed') {
    const fixedAnswer = buildFixedAnswer(input.answer);
    qaData.fixed = upsertByKey(qaData.fixed, 'question_key', fixedAnswer);
    updatePayload.status = 'answering_fixed';

    if (fixedAnswer.question_key === 'position') {
      updatePayload.position_title = valueAsString(fixedAnswer.value);
    }
    if (fixedAnswer.question_key === 'department') {
      updatePayload.department = valueAsString(fixedAnswer.value);
    }
    if (fixedAnswer.question_key === 'level') {
      updatePayload.level = valueAsString(fixedAnswer.value);
    }
    if (fixedAnswer.question_key === 'content_language') {
      updatePayload.language = normalizeLanguage(valueAsString(fixedAnswer.value));
    }
  }

  if (input.phase === 'followup') {
    const followupAnswer = buildFollowupAnswer(input.answer, qaData.followup_questions);
    qaData.followups = upsertByKey(qaData.followups, 'question_id', followupAnswer);
    updatePayload.status = 'answering_followups';
  }

  if (input.phase === 'freeform') {
    if (!input.answer.freeform_text) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Free-form answers require text' });
    }

    qaData.freeform = [
      {
        text: input.answer.freeform_text,
        submitted_at: new Date().toISOString(),
      },
    ];
  }

  if (input.phase === 'business_context') {
    if (!input.answer.business_context) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Business context answers require business_context',
      });
    }

    qaData.business_context = CareerPlaybookBusinessContextSchema.parse({
      ...input.answer.business_context,
      updated_at: new Date().toISOString(),
    });
  }

  updatePayload.q_a_data = toJson(qaData);

  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .update(updatePayload)
    .eq('id', input.playbookId)
    .select('*')
    .single();

  if (error || !data) throwOnDbError(error, 'Failed to save Career Playbook answer');

  return mapRowToDraft(data);
}

export async function getCareerPlaybookFixedQuestions(
  ctx: Context,
  input: { uiLanguage: 'ru' | 'en' }
): Promise<CareerPlaybookFixedQuestion[]> {
  requireUser(ctx);
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbook_fixed_questions')
    .select('*')
    .eq('language', input.uiLanguage)
    .order('position', { ascending: true });

  if (error) throwOnDbError(error, 'Failed to load Career Playbook fixed questions');

  return CareerPlaybookFixedQuestionSchema.array().parse(data ?? []);
}

export async function requestCareerPlaybookFollowups(
  ctx: Context,
  input: RequestFollowupsInput
): Promise<CareerPlaybookFollowupResponse> {
  const user = requireUser(ctx);
  const row = await loadPlaybook(input.playbookId, user, 'write');
  const existingQAData = normalizeStoredQAData(row.q_a_data);
  const refreshedBusinessContext = await refreshCareerPlaybookBusinessContextDigest({
    playbookId: input.playbookId,
    context: existingQAData.business_context,
    freeformText: freeformDraftFromQAData(existingQAData),
  });
  if (hasPendingCareerPlaybookBusinessContextSources(refreshedBusinessContext)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Business context source files are still processing',
    });
  }
  const existingQADataWithDigest: StoredQAData = {
    ...existingQAData,
    business_context: refreshedBusinessContext.context,
  };
  assertCanRequestFollowups(row, existingQADataWithDigest, input.fixedAnswers);
  if (existingQAData.followup_generation_count >= FOLLOWUP_GENERATION_LIMIT) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Career Playbook follow-up generation limit reached',
    });
  }

  const qaData = CareerPlaybookQADataSchema.parse({
    fixed: Object.values(input.fixedAnswers),
    followups: Object.values(input.followupAnswers),
    freeform: existingQAData.freeform,
    business_context: refreshedBusinessContext.context,
  });
  const result = await generateCareerPlaybookFollowups({
    playbookId: input.playbookId,
    qaData,
    language: input.contentLanguage,
    businessContextSourceExcerpts: refreshedBusinessContext.sourceExcerpts,
  });
  const response = normalizeCareerPlaybookFollowupResponseReadiness(
    CareerPlaybookFollowupResponseSchema.parse(result.response)
  );
  const status = isCareerPlaybookFollowupResponseReady(response)
    ? 'ready_to_generate'
    : 'answering_followups';
  const mergedQuestions = mergeGeneratedQuestions(
    existingQAData.followup_questions,
    response.questions
  );
  const storedQAData: StoredQAData = {
    ...qaData,
    completeness_score: response.completeness_score,
    followup_questions: mergedQuestions,
    followup_generation_count: existingQAData.followup_generation_count + 1,
  };
  const supabase = getCareerPlaybookSupabase();
  const { error } = await supabase
    .from('career_playbooks')
    .update({
      status,
      language: input.contentLanguage,
      q_a_data: toJson(storedQAData),
    })
    .eq('id', input.playbookId)
    .select('*')
    .single();

  if (error) throwOnDbError(error, 'Failed to persist Career Playbook follow-up questions');

  return {
    ...response,
    questions: capGeneratedQuestionsForResponse(
      existingQAData.followup_questions,
      response.questions,
      mergedQuestions
    ),
  };
}

export async function approveCareerPlaybookGeneration(
  ctx: Context,
  input: { playbookId: string }
): Promise<CareerPlaybookGenerationStatusResponse> {
  const user = requireUser(ctx);
  const row = await loadPlaybook(input.playbookId, user, 'write');
  if (row.status === 'generating' || row.status === 'completed') {
    return mapRowToGenerationStatus(row);
  }

  const qaData = normalizeStoredQAData(row.q_a_data);
  if (!isReadyForGeneration(row, qaData)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Career Playbook is not ready for generation',
    });
  }

  const generationJobId = getCareerPlaybookGenerationJobId(input.playbookId);
  await removeTerminalJobById(generationJobId);
  const qaDataForGeneration = qaDataWithoutGenerationError(qaData);
  const supabase = getCareerPlaybookSupabase();
  const { data, error } = await supabase
    .from('career_playbooks')
    .update({
      status: 'generating',
      q_a_data: toJson(qaDataForGeneration),
    })
    .eq('id', input.playbookId)
    .select('*')
    .single();

  if (error || !data) throwOnDbError(error, 'Failed to start Career Playbook generation');

  const jobData: CareerPlaybookGeneratePlaybookJobData = {
    jobType: JobType.CAREER_PLAYBOOK,
    operation: 'GENERATE_PLAYBOOK',
    playbookId: input.playbookId,
    userId: user.id,
    organizationId: user.organizationId,
    language: row.language,
    qaData: CareerPlaybookQADataSchema.parse(qaDataForGeneration),
    createdAt: new Date().toISOString(),
    locale: row.language === 'en' ? 'en' : 'ru',
  };
  try {
    await addJob(JobType.CAREER_PLAYBOOK, jobData, {
      jobId: generationJobId,
    });
  } catch (enqueueError) {
    const message = errorMessageFrom(enqueueError);
    const compensation = await supabase
      .from('career_playbooks')
      .update({
        status: 'failed',
        q_a_data: toJson({
          ...qaDataForGeneration,
          generation_error: message,
        }),
      })
      .eq('id', input.playbookId)
      .select('*')
      .single();

    if (compensation.error || !compensation.data) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to enqueue Career Playbook generation and mark playbook failed',
        cause: {
          enqueueError,
          compensationError: compensation.error,
        },
      });
    }

    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to enqueue Career Playbook generation',
      cause: enqueueError,
    });
  }

  return mapRowToGenerationStatus(data);
}

export async function getCareerPlaybookGenerationStatus(
  ctx: Context,
  input: { playbookId: string }
): Promise<CareerPlaybookGenerationStatusResponse> {
  const user = requireUser(ctx);
  return mapRowToGenerationStatus(await loadPlaybook(input.playbookId, user, 'read'));
}

export async function getCareerPlaybookBlock(
  ctx: Context,
  input: { playbookId: string; blockId: CareerPlaybookBlockId }
): Promise<CareerPlaybookBlockState> {
  const user = requireUser(ctx);
  const row = await loadPlaybook(input.playbookId, user, 'read');
  const block = normalizeGeneratedBlocks(row.generated_blocks)[input.blockId];
  if (!block) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Career Playbook block not found' });
  }

  return block;
}

function mapRowToGenerationStatus(row: CareerPlaybookRow): CareerPlaybookGenerationStatusResponse {
  const mapped = mapPlaybookRow(row);
  const qaData = normalizeStoredQAData(mapped.q_a_data);

  return {
    playbookId: mapped.id,
    status: mapped.status,
    phase: phaseFromStatus(mapped.status, qaData),
    progress: generationProgress(mapped.status),
    error: mapped.status === 'failed' ? qaData.generation_error : undefined,
    generatedBlocks: normalizeGeneratedBlocks(mapped.generated_blocks),
    finalMarkdown: mapped.final_markdown ?? undefined,
    completedAt: mapped.completed_at ?? undefined,
  };
}
