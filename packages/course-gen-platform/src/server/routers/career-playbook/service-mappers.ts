import { z } from 'zod';
import {
  CareerPlaybookBlockStateSchema,
  CareerPlaybookFollowupQuestionSchema,
  CareerPlaybookGenerationProgressSchema,
  CareerPlaybookQADataSchema,
  CareerPlaybookPlaybookStatusSchema,
  CareerPlaybookQualityIssueSchema,
  CareerPlaybookWizardProgressSchema,
  languageSchema,
  type CareerPlaybookBlockState,
  type CareerPlaybookFixedQuestion,
  type CareerPlaybookFollowupQuestion,
  type CareerPlaybookGenerationProgress,
  type CareerPlaybookPlaybookStatus,
  type CareerPlaybookQAData,
  type CareerPlaybookVisibility,
  type CareerPlaybookWizardProgress,
  type Json,
  type Language,
} from '@megacampus/shared-types';

export type WizardPhase = 'fixed' | 'business_context' | 'followups' | 'completion';

export interface StoredQAData extends CareerPlaybookQAData {
  followup_questions: CareerPlaybookFollowupQuestion[];
  followup_generation_count: number;
  ui_progress?: CareerPlaybookWizardProgress;
  generation_error?: string;
}

export interface CareerPlaybookRow {
  id: string;
  user_id: string;
  organization_id: string;
  status: CareerPlaybookPlaybookStatus;
  language: Language;
  slug: string | null;
  position_title: string | null;
  department: string | null;
  specialization: string | null;
  level: string | null;
  q_a_data: Json;
  role_profile_spec: Json | null;
  generated_blocks: Json | null;
  final_markdown: string | null;
  web_research: Json | null;
  cost_breakdown: Json | null;
  share_slug: string | null;
  is_public: boolean;
  visibility?: CareerPlaybookVisibility;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface QueryResult<T> {
  data: T | null;
  error: unknown;
}

interface ListQueryResult<T> {
  data: T[] | null;
  error: unknown;
}

interface CareerPlaybookQueryBuilder<T> {
  insert: (values: Partial<T> | Partial<T>[]) => CareerPlaybookQueryBuilder<T>;
  update: (values: Partial<T>) => CareerPlaybookQueryBuilder<T>;
  delete: () => CareerPlaybookQueryBuilder<T>;
  select: (columns?: string) => CareerPlaybookQueryBuilder<T>;
  eq: (column: string, value: unknown) => CareerPlaybookQueryBuilder<T>;
  or: (filters: string) => CareerPlaybookQueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => Promise<ListQueryResult<T>>;
  single: () => Promise<QueryResult<T>>;
  maybeSingle: () => Promise<QueryResult<T>>;
}

export interface CareerPlaybookSupabase {
  from(table: 'career_playbooks'): CareerPlaybookQueryBuilder<CareerPlaybookRow>;
  from(
    table: 'career_playbook_fixed_questions'
  ): CareerPlaybookQueryBuilder<CareerPlaybookFixedQuestion>;
}

export function normalizeLanguage(language: unknown): Language {
  const parsed = languageSchema.safeParse(language);
  return parsed.success ? parsed.data : 'ru';
}

export function normalizeStoredQAData(raw: unknown): StoredQAData {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const hasBusinessContext = Object.prototype.hasOwnProperty.call(value, 'business_context');
  const generationWarnings = z.array(z.string().min(1)).safeParse(value.generation_warnings);
  const qualityIssues = z.array(CareerPlaybookQualityIssueSchema).safeParse(value.quality_issues);
  const qaData = CareerPlaybookQADataSchema.parse({
    fixed: value.fixed ?? [],
    followups: value.followups ?? [],
    freeform: value.freeform ?? [],
    business_context: hasBusinessContext
      ? value.business_context
      : {
          mode: 'universal',
          status: 'skipped',
          digest: null,
          source_ids: [],
          skip_reason: 'legacy_draft_without_business_context',
        },
    completeness_score: value.completeness_score,
    ui_progress: value.ui_progress,
    generation_progress: value.generation_progress,
    generation_warnings: generationWarnings.success ? generationWarnings.data : [],
    quality_issues: qualityIssues.success ? qualityIssues.data : [],
  });
  const followupQuestions = CareerPlaybookFollowupQuestionSchema.array().safeParse(
    value.followup_questions
  );
  const storedGenerationCount = z
    .number()
    .int()
    .nonnegative()
    .safeParse(value.followup_generation_count);
  const normalizedFollowupQuestions = followupQuestions.success ? followupQuestions.data : [];

  return {
    ...qaData,
    followup_questions: normalizedFollowupQuestions,
    followup_generation_count: storedGenerationCount.success
      ? storedGenerationCount.data
      : normalizedFollowupQuestions.length > 0
        ? 1
        : 0,
    generation_error:
      typeof value.generation_error === 'string' ? value.generation_error : undefined,
  };
}

export function normalizeGeneratedBlocks(raw: unknown): Record<string, CareerPlaybookBlockState> {
  const parsed = z.record(CareerPlaybookBlockStateSchema).safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export function phaseFromStatus(
  status: CareerPlaybookPlaybookStatus,
  qaData?: Pick<StoredQAData, 'business_context' | 'followup_questions' | 'ui_progress'>
): WizardPhase {
  if (
    status === 'ready_to_generate' ||
    status === 'generating' ||
    status === 'completed' ||
    status === 'failed'
  ) {
    return 'completion';
  }

  const progress = qaData?.ui_progress
    ? CareerPlaybookWizardProgressSchema.safeParse(qaData.ui_progress)
    : null;
  if (progress?.success) {
    return progress.data.phase;
  }

  if (status === 'awaiting_followups') {
    if (
      qaData &&
      qaData.followup_questions.length === 0 &&
      qaData.business_context.status !== 'ready' &&
      qaData.business_context.status !== 'skipped'
    ) {
      return 'business_context';
    }

    return 'followups';
  }
  if (status === 'answering_followups') return 'followups';
  return 'fixed';
}

export function uiLanguageFromContent(language: Language): 'ru' | 'en' {
  return language === 'en' ? 'en' : 'ru';
}

export function freeformDraftFromQAData(qaData: StoredQAData): string {
  return qaData.freeform.map(answer => answer.text).join('\n\n');
}

export function normalizeGenerationProgress(
  raw: unknown
): CareerPlaybookGenerationProgress | undefined {
  const parsed = CareerPlaybookGenerationProgressSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export function generationProgress(
  status: CareerPlaybookPlaybookStatus,
  progressDetails?: CareerPlaybookGenerationProgress
): number {
  if (status === 'generating' && progressDetails) {
    return Math.min(Math.max(Math.round(progressDetails.percent), 0), 99);
  }

  const progressByStatus: Record<CareerPlaybookPlaybookStatus, number> = {
    draft: 0,
    answering_fixed: 20,
    awaiting_followups: 35,
    answering_followups: 50,
    ready_to_generate: 65,
    generating: 66,
    completed: 100,
    failed: 100,
  };

  return progressByStatus[status];
}

export function mapPlaybookRow(row: CareerPlaybookRow): CareerPlaybookRow {
  const parsedStatus = CareerPlaybookPlaybookStatusSchema.safeParse(row.status);
  const visibility =
    row.visibility === 'private' || row.visibility === 'organization' || row.visibility === 'public'
      ? row.visibility
      : row.is_public
        ? 'public'
        : 'private';

  return {
    ...row,
    status: parsedStatus.success ? parsedStatus.data : 'draft',
    language: normalizeLanguage(row.language),
    visibility,
    is_public: visibility === 'public',
  };
}
