import { z } from 'zod';
import {
  CareerPlaybookBlockStateSchema,
  CareerPlaybookFollowupQuestionSchema,
  CareerPlaybookQADataSchema,
  CareerPlaybookPlaybookStatusSchema,
  languageSchema,
  type CareerPlaybookBlockState,
  type CareerPlaybookFixedQuestion,
  type CareerPlaybookFollowupQuestion,
  type CareerPlaybookPlaybookStatus,
  type CareerPlaybookQAData,
  type Json,
  type Language,
} from '@megacampus/shared-types';

export type WizardPhase = 'fixed' | 'followups' | 'completion';

export interface StoredQAData extends CareerPlaybookQAData {
  followup_questions: CareerPlaybookFollowupQuestion[];
  followup_generation_count: number;
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
  select: (columns?: string) => CareerPlaybookQueryBuilder<T>;
  eq: (column: string, value: unknown) => CareerPlaybookQueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => Promise<ListQueryResult<T>>;
  single: () => Promise<QueryResult<T>>;
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
  const qaData = CareerPlaybookQADataSchema.parse({
    fixed: value.fixed ?? [],
    followups: value.followups ?? [],
    freeform: value.freeform ?? [],
    completeness_score: value.completeness_score,
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

export function phaseFromStatus(status: CareerPlaybookPlaybookStatus): WizardPhase {
  if (status === 'awaiting_followups' || status === 'answering_followups') return 'followups';
  if (status === 'ready_to_generate' || status === 'generating' || status === 'completed') {
    return 'completion';
  }
  if (status === 'failed') return 'completion';
  return 'fixed';
}

export function uiLanguageFromContent(language: Language): 'ru' | 'en' {
  return language === 'en' ? 'en' : 'ru';
}

export function freeformDraftFromQAData(qaData: StoredQAData): string {
  return qaData.freeform.map(answer => answer.text).join('\n\n');
}

export function generationProgress(status: CareerPlaybookPlaybookStatus): number {
  const progressByStatus: Record<CareerPlaybookPlaybookStatus, number> = {
    draft: 0,
    answering_fixed: 20,
    awaiting_followups: 35,
    answering_followups: 50,
    ready_to_generate: 65,
    generating: 80,
    completed: 100,
    failed: 100,
  };

  return progressByStatus[status];
}

export function mapPlaybookRow(row: CareerPlaybookRow): CareerPlaybookRow {
  const parsedStatus = CareerPlaybookPlaybookStatusSchema.safeParse(row.status);
  return {
    ...row,
    status: parsedStatus.success ? parsedStatus.data : 'draft',
    language: normalizeLanguage(row.language),
  };
}
