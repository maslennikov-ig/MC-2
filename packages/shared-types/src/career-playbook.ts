/**
 * Career Playbook shared schemas.
 * @module shared-types/career-playbook
 */

import { z } from 'zod';
import { languageSchema, SUPPORTED_LANGUAGES } from './common-enums';
import { enrichmentStatusSchema } from './lesson-enrichment';

export const SUPPORTED_CAREER_PLAYBOOK_CONTENT_LANGUAGES = SUPPORTED_LANGUAGES;
export const CAREER_PLAYBOOK_FREEFORM_TEXT_MAX_LENGTH = 20_000;

export const CareerPlaybookQuestionTypeSchema = z.enum(['open', 'single_choice', 'multi_choice']);
export type CareerPlaybookQuestionType = z.infer<typeof CareerPlaybookQuestionTypeSchema>;

export const CareerPlaybookFixedQuestionLanguageSchema = z.enum(['ru', 'en']);
export type CareerPlaybookFixedQuestionLanguage = z.infer<
  typeof CareerPlaybookFixedQuestionLanguageSchema
>;

export const CareerPlaybookPlaybookStatusSchema = z.enum([
  'draft',
  'answering_fixed',
  'awaiting_followups',
  'answering_followups',
  'ready_to_generate',
  'generating',
  'completed',
  'failed',
]);
export type CareerPlaybookPlaybookStatus = z.infer<typeof CareerPlaybookPlaybookStatusSchema>;

export const CareerPlaybookWizardPhaseSchema = z.enum([
  'fixed',
  'business_context',
  'followups',
  'completion',
]);
export type CareerPlaybookWizardPhase = z.infer<typeof CareerPlaybookWizardPhaseSchema>;

export const CareerPlaybookVisibilitySchema = z.enum(['private', 'organization', 'public']);
export type CareerPlaybookVisibility = z.infer<typeof CareerPlaybookVisibilitySchema>;

export const CareerPlaybookImageStatusSchema = enrichmentStatusSchema;
export type CareerPlaybookImageStatus = z.infer<typeof CareerPlaybookImageStatusSchema>;

export interface CareerPlaybookViewerPermissions {
  canEdit: boolean;
  canManageVisibility: boolean;
  canCreateCourse: boolean;
  canDelete: boolean;
}

export const CareerPlaybookLinkedCourseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  organizationSlug: z.string().min(1).nullable(),
  status: z.string().min(1).nullable().optional(),
  generationStatus: z.string().min(1).nullable().optional(),
});
export type CareerPlaybookLinkedCourse = z.infer<typeof CareerPlaybookLinkedCourseSchema>;

export const CareerPlaybookRoleLevelSchema = z.enum([
  'junior',
  'middle',
  'senior',
  'lead',
  'director',
  'c-level',
]);
export type CareerPlaybookRoleLevel = z.infer<typeof CareerPlaybookRoleLevelSchema>;

export const CareerPlaybookTeamSizeSchema = z.enum([
  '1-10',
  '11-50',
  '51-200',
  '201-1000',
  '1000+',
]);
export type CareerPlaybookTeamSize = z.infer<typeof CareerPlaybookTeamSizeSchema>;

export const CareerPlaybookCompanyStageSchema = z.enum(['pre-pmf', 'growth', 'scale', 'mature']);
export type CareerPlaybookCompanyStage = z.infer<typeof CareerPlaybookCompanyStageSchema>;

export const CareerPlaybookOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  helper: z.string().min(1).optional(),
});
export type CareerPlaybookOption = z.infer<typeof CareerPlaybookOptionSchema>;

export const CareerPlaybookDepartmentValueSchema = z.enum([
  'sales',
  'marketing',
  'product',
  'engineering',
  'design',
  'data',
  'operations',
  'hr',
  'finance',
  'support',
  'legal',
  'other',
]);
export type CareerPlaybookDepartmentValue = z.infer<typeof CareerPlaybookDepartmentValueSchema>;

export const CareerPlaybookDepartmentCandidateSchema = z.object({
  value: CareerPlaybookDepartmentValueSchema,
  label: z.string().min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).optional(),
});
export type CareerPlaybookDepartmentCandidate = z.infer<
  typeof CareerPlaybookDepartmentCandidateSchema
>;

export const CareerPlaybookDepartmentResolutionSchema = z.object({
  status: z.enum(['resolved', 'needs_user_choice', 'fallback']),
  source: z.enum(['local', 'llm', 'fallback']),
  candidates: z.array(CareerPlaybookDepartmentCandidateSchema).max(5).default([]),
  selectedDepartment: CareerPlaybookDepartmentValueSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type CareerPlaybookDepartmentResolution = z.infer<
  typeof CareerPlaybookDepartmentResolutionSchema
>;

export const CareerPlaybookBranchingRulesSchema = z
  .object({
    when: z.object({
      question_key: z.string().min(1),
      value: z.string().min(1).optional(),
      value_in: z.array(z.string().min(1)).min(1).optional(),
    }),
  })
  .refine(rule => Boolean(rule.when.value || rule.when.value_in), {
    message: 'Either value or value_in must be provided',
  });
export type CareerPlaybookBranchingRules = z.infer<typeof CareerPlaybookBranchingRulesSchema>;

export const CareerPlaybookFixedQuestionSchema = z.object({
  id: z.string().uuid().optional(),
  language: CareerPlaybookFixedQuestionLanguageSchema,
  position: z.number().int().positive(),
  question_key: z.string().min(1),
  question_type: CareerPlaybookQuestionTypeSchema,
  question_text: z.string().min(1),
  helper_text: z.string().min(1).nullable().optional(),
  options: z.array(CareerPlaybookOptionSchema).min(1).nullable().optional(),
  branching_rules: CareerPlaybookBranchingRulesSchema.nullable().optional(),
  is_required: z.boolean().default(true),
});
export type CareerPlaybookFixedQuestion = z.infer<typeof CareerPlaybookFixedQuestionSchema>;

export const CareerPlaybookFixedAnswerSchema = z.object({
  question_key: z.string().min(1),
  value: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  answered_at: z.string().datetime().optional(),
});
export type CareerPlaybookFixedAnswer = z.infer<typeof CareerPlaybookFixedAnswerSchema>;

export const CareerPlaybookFollowupAnswerSchema = z
  .object({
    question_id: z.string().uuid(),
    question_text: z.string().min(1),
    question_type: CareerPlaybookQuestionTypeSchema,
    value: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).optional(),
    skipped: z.boolean().default(false),
    answered_at: z.string().datetime().optional(),
  })
  .refine(answer => answer.skipped || answer.value !== undefined, {
    message: 'Follow-up answers must provide value unless skipped',
  });
export type CareerPlaybookFollowupAnswer = z.infer<typeof CareerPlaybookFollowupAnswerSchema>;

export const CareerPlaybookFollowupQuestionSchema = z.object({
  question_id: z.string().uuid(),
  question_text: z.string().min(1),
  question_type: CareerPlaybookQuestionTypeSchema,
  options: z.array(CareerPlaybookOptionSchema).min(1).nullable(),
  rationale: z.string().min(1),
});
export type CareerPlaybookFollowupQuestion = z.infer<typeof CareerPlaybookFollowupQuestionSchema>;

export const CareerPlaybookFollowupResponseSchema = z.object({
  questions: z.array(CareerPlaybookFollowupQuestionSchema).min(0).max(7),
  completeness_score: z.number().min(0).max(1),
  stop_recommendation: z.enum(['ask_more', 'ready_to_generate']),
});
export type CareerPlaybookFollowupResponse = z.infer<typeof CareerPlaybookFollowupResponseSchema>;

export const CAREER_PLAYBOOK_COMPLETENESS_READY_THRESHOLD = 0.75;

export function isCareerPlaybookFollowupResponseReady(
  response: Pick<
    CareerPlaybookFollowupResponse,
    'completeness_score' | 'questions' | 'stop_recommendation'
  >
): boolean {
  return (
    response.stop_recommendation === 'ready_to_generate' &&
    response.questions.length === 0 &&
    response.completeness_score >= CAREER_PLAYBOOK_COMPLETENESS_READY_THRESHOLD
  );
}

export function normalizeCareerPlaybookFollowupResponseReadiness(
  response: CareerPlaybookFollowupResponse
): CareerPlaybookFollowupResponse {
  if (
    response.stop_recommendation === 'ready_to_generate' &&
    !isCareerPlaybookFollowupResponseReady(response)
  ) {
    return { ...response, stop_recommendation: 'ask_more' };
  }

  return response;
}

export const CareerPlaybookFreeformAnswerSchema = z.object({
  text: z.string().min(1),
  parsed_signals: z.record(z.unknown()).optional(),
  submitted_at: z.string().datetime().optional(),
});
export type CareerPlaybookFreeformAnswer = z.infer<typeof CareerPlaybookFreeformAnswerSchema>;

export const CareerPlaybookBusinessContextModeSchema = z.enum(['company_specific', 'universal']);
export type CareerPlaybookBusinessContextMode = z.infer<
  typeof CareerPlaybookBusinessContextModeSchema
>;

export const CareerPlaybookBusinessContextStatusSchema = z.enum([
  'not_started',
  'collecting',
  'ready',
  'skipped',
  'failed',
]);
export type CareerPlaybookBusinessContextStatus = z.infer<
  typeof CareerPlaybookBusinessContextStatusSchema
>;

export const CareerPlaybookBusinessContextSourceStatusSchema = z.enum([
  'uploaded',
  'processing',
  'ready',
  'failed',
  'removed',
]);
export type CareerPlaybookBusinessContextSourceStatus = z.infer<
  typeof CareerPlaybookBusinessContextSourceStatusSchema
>;

export const CareerPlaybookBusinessContextSourceTypeSchema = z.enum(['file', 'text']);
export type CareerPlaybookBusinessContextSourceType = z.infer<
  typeof CareerPlaybookBusinessContextSourceTypeSchema
>;

export const CareerPlaybookBusinessContextDigestSchema = z.object({
  product: z.array(z.string().min(1)).default([]),
  customers: z.array(z.string().min(1)).default([]),
  sales_channels: z.array(z.string().min(1)).default([]),
  processes: z.array(z.string().min(1)).default([]),
  metrics: z.array(z.string().min(1)).default([]),
  org_structure: z.array(z.string().min(1)).default([]),
  constraints: z.array(z.string().min(1)).default([]),
  source_ids: z.array(z.string().uuid()).default([]),
  missing_signals: z.array(z.string().min(1)).default([]),
  user_edited: z.boolean().default(false),
  generated_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});
export type CareerPlaybookBusinessContextDigest = z.infer<
  typeof CareerPlaybookBusinessContextDigestSchema
>;

export const CareerPlaybookBusinessContextSchema = z.object({
  mode: CareerPlaybookBusinessContextModeSchema.default('universal'),
  status: CareerPlaybookBusinessContextStatusSchema.default('not_started'),
  digest: CareerPlaybookBusinessContextDigestSchema.nullable().default(null),
  source_ids: z.array(z.string().uuid()).default([]),
  skip_reason: z.string().min(1).optional(),
  updated_at: z.string().datetime().optional(),
});
export type CareerPlaybookBusinessContext = z.infer<typeof CareerPlaybookBusinessContextSchema>;

export const CareerPlaybookBusinessContextSourceSchema = z.object({
  id: z.string().uuid(),
  playbook_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  source_type: CareerPlaybookBusinessContextSourceTypeSchema,
  status: CareerPlaybookBusinessContextSourceStatusSchema,
  filename: z.string().min(1).optional(),
  file_catalog_id: z.string().uuid().nullable().optional(),
  text: z.string().min(1).optional(),
  error_message: z.string().min(1).nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});
export type CareerPlaybookBusinessContextSource = z.infer<
  typeof CareerPlaybookBusinessContextSourceSchema
>;

export const CareerPlaybookBusinessContextSourceSummarySchema = z.object({
  id: z.string().uuid(),
  playbookId: z.string().uuid(),
  sourceType: CareerPlaybookBusinessContextSourceTypeSchema,
  status: CareerPlaybookBusinessContextSourceStatusSchema,
  filename: z.string().min(1).nullable(),
  fileCatalogId: z.string().uuid().nullable(),
  errorMessage: z.string().min(1).nullable().optional(),
  createdAt: z.string().datetime().or(z.literal('')),
  updatedAt: z.string().datetime().or(z.literal('')),
});
export type CareerPlaybookBusinessContextSourceSummary = z.infer<
  typeof CareerPlaybookBusinessContextSourceSummarySchema
>;

export const CareerPlaybookWizardProgressSchema = z.object({
  phase: CareerPlaybookWizardPhaseSchema,
  current_fixed_question_key: z.string().min(1).optional(),
  current_fixed_index: z.number().int().nonnegative().optional(),
  current_followup_question_id: z.string().uuid().optional(),
  current_followup_index: z.number().int().nonnegative().optional(),
  updated_at: z.string().datetime().optional(),
});
export type CareerPlaybookWizardProgress = z.infer<typeof CareerPlaybookWizardProgressSchema>;

export const CareerPlaybookGenerationProgressStageSchema = z.enum([
  'queued',
  'preparing_context',
  'building_profile',
  'generating_foundation',
  'reviewing_foundation',
  'generating_operations',
  'reviewing_operations',
  'generating_people',
  'reviewing_people',
  'generating_growth',
  'reviewing_growth',
  'generating_system',
  'reviewing_system',
  'generating_wrap',
  'reviewing_wrap',
  'assembling',
  'final_review',
  'completed',
  'failed',
]);
export type CareerPlaybookGenerationProgressStage = z.infer<
  typeof CareerPlaybookGenerationProgressStageSchema
>;

export const CareerPlaybookGenerationProgressSchema = z.object({
  stage: CareerPlaybookGenerationProgressStageSchema,
  percent: z.number().min(0).max(100),
  message: z.string().min(1).optional(),
  started_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});
export type CareerPlaybookGenerationProgress = z.infer<
  typeof CareerPlaybookGenerationProgressSchema
>;

export const CareerPlaybookBlockIdSchema = z.union([
  z.literal('header'),
  z.string().regex(/^block_([1-9]|1[0-9]|2[0-6])$/, 'Expected header or block_1 through block_26'),
]);
export type CareerPlaybookBlockId = z.infer<typeof CareerPlaybookBlockIdSchema>;

export const CareerPlaybookQualityIssueSourceSchema = z.enum([
  'cross_block_judge',
  'block_regenerator',
  'mermaid',
  'system',
]);
export type CareerPlaybookQualityIssueSource = z.infer<
  typeof CareerPlaybookQualityIssueSourceSchema
>;

export const CareerPlaybookQualityIssueActionSchema = z.enum([
  'review',
  'edit',
  'regenerate',
  'none',
]);
export type CareerPlaybookQualityIssueAction = z.infer<
  typeof CareerPlaybookQualityIssueActionSchema
>;

export const CareerPlaybookQualityIssueSchema = z.object({
  id: z.string().min(1),
  source: CareerPlaybookQualityIssueSourceSchema,
  severity: z.enum(['critical', 'warning', 'info']),
  blockId: CareerPlaybookBlockIdSchema.optional(),
  title: z.string().min(1),
  message: z.string().min(1),
  suggestion: z.string().min(1).optional(),
  action: CareerPlaybookQualityIssueActionSchema,
});
export type CareerPlaybookQualityIssue = z.infer<typeof CareerPlaybookQualityIssueSchema>;

function normalizeCareerPlaybookDiagnosticText(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

export function isInternalCareerPlaybookGenerationWarning(warning: string): boolean {
  return /^crossBlockJudge advanced after max regeneration attempts\b/i.test(warning.trim());
}

export function getUserVisibleCareerPlaybookWarnings(warnings: string[]): string[] {
  const visible: string[] = [];
  const seen = new Set<string>();

  for (const warning of warnings) {
    const normalized = normalizeCareerPlaybookDiagnosticText(warning);
    if (!normalized || isInternalCareerPlaybookGenerationWarning(normalized)) continue;
    if (seen.has(normalized)) continue;
    visible.push(normalized);
    seen.add(normalized);
  }

  return visible;
}

export function careerPlaybookQualityIssueKey(issue: CareerPlaybookQualityIssue): string {
  return JSON.stringify([
    issue.source,
    issue.severity,
    issue.action,
    issue.blockId ?? '',
    normalizeCareerPlaybookDiagnosticText(issue.message),
    normalizeCareerPlaybookDiagnosticText(issue.suggestion),
  ]);
}

export function dedupeCareerPlaybookQualityIssues(
  issues: CareerPlaybookQualityIssue[]
): CareerPlaybookQualityIssue[] {
  const deduped: CareerPlaybookQualityIssue[] = [];
  const seen = new Set<string>();

  for (const issue of issues) {
    const key = careerPlaybookQualityIssueKey(issue);
    if (seen.has(key)) continue;
    deduped.push(issue);
    seen.add(key);
  }

  return deduped;
}

export const CareerPlaybookQADataSchema = z.object({
  fixed: z.array(CareerPlaybookFixedAnswerSchema).default([]),
  followups: z.array(CareerPlaybookFollowupAnswerSchema).default([]),
  freeform: z.array(CareerPlaybookFreeformAnswerSchema).default([]),
  business_context: CareerPlaybookBusinessContextSchema.default({
    mode: 'universal',
    status: 'not_started',
    digest: null,
    source_ids: [],
  }),
  completeness_score: z.number().min(0).max(1).optional(),
  ui_progress: CareerPlaybookWizardProgressSchema.optional(),
  generation_progress: CareerPlaybookGenerationProgressSchema.optional(),
  generation_warnings: z.array(z.string().min(1)).default([]),
  quality_issues: z.array(CareerPlaybookQualityIssueSchema).default([]),
});
export type CareerPlaybookQAData = z.infer<typeof CareerPlaybookQADataSchema>;

export const CAREER_PLAYBOOK_JUDGE_ISSUE_CATEGORIES = [
  'contradiction',
  'format_minimum',
  'wrong_language',
  'unresolved_placeholder',
  'invented_number',
  // Quality contract v2 categories. Each has a deterministic check as its first
  // line of defence; the LLM judge is the second contour for the cases a regex
  // cannot see (a semantic clash between blocks, a duty that violates an
  // anti-goal). See docs/career-playbook/quality-contract.md section 7.
  'metric_conflict',
  'unsourced_claim',
  'stale_date',
  'unmarked_example',
  'style',
] as const;
export const CareerPlaybookJudgeIssueCategorySchema = z.enum(
  CAREER_PLAYBOOK_JUDGE_ISSUE_CATEGORIES
);
export type CareerPlaybookJudgeIssueCategory = z.infer<
  typeof CareerPlaybookJudgeIssueCategorySchema
>;

// Critical taxonomy: the only issue categories that justify LLM-driven block
// regeneration. 'style' is intentionally excluded — stylistic/tone findings stay
// visible as warnings but never trigger regeneration, because the deterministic
// checks already gate the hard failures and forcing style opinions into
// regeneration only burns cycles.
export const CAREER_PLAYBOOK_JUDGE_CRITICAL_CATEGORIES = [
  'contradiction',
  'format_minimum',
  'wrong_language',
  'unresolved_placeholder',
  'invented_number',
  'metric_conflict',
  'unsourced_claim',
  'stale_date',
  'unmarked_example',
] as const satisfies readonly CareerPlaybookJudgeIssueCategory[];
export type CareerPlaybookJudgeCriticalCategory =
  (typeof CAREER_PLAYBOOK_JUDGE_CRITICAL_CATEGORIES)[number];

export function isCareerPlaybookJudgeCriticalCategory(
  category: string | null | undefined
): category is CareerPlaybookJudgeCriticalCategory {
  return (
    typeof category === 'string' &&
    (CAREER_PLAYBOOK_JUDGE_CRITICAL_CATEGORIES as readonly string[]).includes(category)
  );
}

export const CareerPlaybookJudgeIssueSchema = z.object({
  block_id: CareerPlaybookBlockIdSchema,
  severity: z.enum(['critical', 'warning', 'info']),
  // Optional so verdicts persisted before the severity rubric landed still parse.
  category: CareerPlaybookJudgeIssueCategorySchema.optional(),
  description: z.string().min(1),
  suggestion: z.string().min(1).optional(),
});
export type CareerPlaybookJudgeIssue = z.infer<typeof CareerPlaybookJudgeIssueSchema>;

export const CareerPlaybookJudgeVerdictSchema = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(100),
  issues: z.array(CareerPlaybookJudgeIssueSchema).default([]),
  needs_regeneration: z.array(CareerPlaybookBlockIdSchema).default([]),
});
export type CareerPlaybookJudgeVerdict = z.infer<typeof CareerPlaybookJudgeVerdictSchema>;

export const CareerPlaybookBlockStatusSchema = z.enum([
  'pending',
  'generating',
  'generated',
  'failed',
  'regenerating',
]);
export type CareerPlaybookBlockStatus = z.infer<typeof CareerPlaybookBlockStatusSchema>;

export const CareerPlaybookBlockStateSchema = z.object({
  content: z.string(),
  status: CareerPlaybookBlockStatusSchema,
  judge_verdict: CareerPlaybookJudgeVerdictSchema.nullable().optional(),
  generated_at: z.string().datetime().optional(),
  llm_model: z.string().min(1).optional(),
  attempt: z.number().int().nonnegative().default(0),
});
export type CareerPlaybookBlockState = z.infer<typeof CareerPlaybookBlockStateSchema>;

export const CareerPlaybookBlockGroupKeySchema = z.enum([
  'group_1_foundation',
  'group_2_operations',
  'group_3_people',
  'group_4_growth',
  'group_5_system',
  'group_6_wrap',
]);
export type CareerPlaybookBlockGroupKey = z.infer<typeof CareerPlaybookBlockGroupKeySchema>;

export interface CareerPlaybookBlockCatalogItem {
  blockId: CareerPlaybookBlockId;
  title: string;
  groupKey: CareerPlaybookBlockGroupKey;
  groupLabel: string;
  position: number;
}

export const CAREER_PLAYBOOK_BLOCK_CATALOG = [
  {
    blockId: 'header',
    title: 'Role guide header',
    groupKey: 'group_1_foundation',
    groupLabel: 'Foundation',
    position: 0,
  },
  {
    blockId: 'block_1',
    title: 'Mission and key results',
    groupKey: 'group_1_foundation',
    groupLabel: 'Foundation',
    position: 1,
  },
  {
    blockId: 'block_2',
    title: 'Anti-goals',
    groupKey: 'group_1_foundation',
    groupLabel: 'Foundation',
    position: 2,
  },
  {
    blockId: 'block_3',
    title: 'Responsibility zones',
    groupKey: 'group_2_operations',
    groupLabel: 'Operations',
    position: 3,
  },
  {
    blockId: 'block_4',
    title: 'Duties',
    groupKey: 'group_2_operations',
    groupLabel: 'Operations',
    position: 4,
  },
  {
    blockId: 'block_5',
    title: 'Decision authority matrix',
    groupKey: 'group_1_foundation',
    groupLabel: 'Foundation',
    position: 5,
  },
  {
    blockId: 'block_6',
    title: 'KPI and metrics',
    groupKey: 'group_2_operations',
    groupLabel: 'Operations',
    position: 6,
  },
  {
    blockId: 'block_7',
    title: 'Competencies',
    groupKey: 'group_3_people',
    groupLabel: 'People',
    position: 7,
  },
  {
    blockId: 'block_8',
    title: 'Tools and technologies',
    groupKey: 'group_2_operations',
    groupLabel: 'Operations',
    position: 8,
  },
  {
    blockId: 'block_9',
    title: 'Human-AI collaboration',
    groupKey: 'group_3_people',
    groupLabel: 'People',
    position: 9,
  },
  {
    blockId: 'block_10',
    title: 'Dependencies',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 10,
  },
  {
    blockId: 'block_11',
    title: 'Career path',
    groupKey: 'group_4_growth',
    groupLabel: 'Growth',
    position: 11,
  },
  {
    blockId: 'block_12',
    title: 'Candidate profile',
    groupKey: 'group_3_people',
    groupLabel: 'People',
    position: 12,
  },
  {
    blockId: 'block_13',
    title: 'Day in the life',
    groupKey: 'group_3_people',
    groupLabel: 'People',
    position: 13,
  },
  {
    blockId: 'block_14',
    title: 'Onboarding',
    groupKey: 'group_4_growth',
    groupLabel: 'Growth',
    position: 14,
  },
  {
    blockId: 'block_15',
    title: 'Motivation',
    groupKey: 'group_4_growth',
    groupLabel: 'Growth',
    position: 15,
  },
  {
    blockId: 'block_16',
    title: 'Main process',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 16,
  },
  {
    blockId: 'block_17',
    title: 'Red flags',
    groupKey: 'group_4_growth',
    groupLabel: 'Growth',
    position: 17,
  },
  {
    blockId: 'block_18',
    title: 'FAQ',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 18,
  },
  {
    blockId: 'block_19',
    title: 'Industry context',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 19,
  },
  {
    blockId: 'block_20',
    title: 'Business model',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 20,
  },
  {
    blockId: 'block_21',
    title: 'Failure modes',
    groupKey: 'group_5_system',
    groupLabel: 'System',
    position: 21,
  },
  {
    blockId: 'block_22',
    title: 'Role README',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 22,
  },
  {
    blockId: 'block_23',
    title: 'Continuity plan',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 23,
  },
  {
    blockId: 'block_24',
    title: 'Role Canvas',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 24,
  },
  {
    blockId: 'block_25',
    title: 'Footer',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 25,
  },
  {
    blockId: 'block_26',
    title: 'Implementation checklist',
    groupKey: 'group_6_wrap',
    groupLabel: 'Wrap-up',
    position: 26,
  },
] as const satisfies readonly CareerPlaybookBlockCatalogItem[];

export interface CareerPlaybookViewerSnapshot {
  playbookId: string;
  title: string;
  department?: string | null;
  level?: string | null;
  contentLanguage: string;
  status: CareerPlaybookPlaybookStatus;
  blocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
  shareSlug?: string | null;
  organizationSlug?: string | null;
  imageUrl?: string | null;
  imageStatus?: CareerPlaybookImageStatus | null;
  imageAltText?: string | null;
  imageErrorMessage?: string | null;
  isPublic?: boolean;
  visibility?: CareerPlaybookVisibility;
  ownerId?: string | null;
  viewerPermissions?: CareerPlaybookViewerPermissions;
  thinkingStream?: string | null;
  currentGenerationGroup?: string | null;
  qualityWarnings?: string[];
  qualityIssues?: CareerPlaybookQualityIssue[];
  linkedCourse?: CareerPlaybookLinkedCourse | null;
}

export const CareerPlaybookNodeCostSchema = z.object({
  node: z.string().min(1),
  model: z.string().min(1),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative(),
  // Per-call telemetry (optional for backward compatibility with rows written
  // before instrumentation): total wall-clock across all attempts and the number
  // of attempts consumed by the LLM call that produced this node cost.
  duration_ms: z.number().nonnegative().optional(),
  attempts: z.number().int().positive().optional(),
  // An attempt that never returned (timeout, transport failure) has no usage
  // record, so its cost is genuinely unknown rather than zero: the provider may
  // still bill for tokens it generated before the abort. Recording it as an
  // explicit unknown keeps the receipt honest instead of silently omitting it,
  // which is what made the 2026-08-11 cost claim unprovable.
  outcome: z.enum(['succeeded', 'aborted']).optional(),
  cost_unknown: z.boolean().optional(),
  error: z.string().min(1).optional(),
});
export type CareerPlaybookNodeCost = z.infer<typeof CareerPlaybookNodeCostSchema>;

export const CareerPlaybookCostBreakdownSchema = z.object({
  nodeCosts: z.array(CareerPlaybookNodeCostSchema).default([]),
  total_cost_usd: z.number().nonnegative().default(0),
  // How many recorded attempts carry an unknown cost. Non-zero means
  // total_cost_usd is a lower bound on real provider spend, not the final figure.
  unknown_cost_attempts: z.number().int().nonnegative().optional(),
  // Ground-truth block regeneration counts keyed by block id. Optional so legacy
  // breakdowns without the field still parse and round-trip unchanged.
  regeneration_attempts: z.record(z.string(), z.number().int().nonnegative()).optional(),
});
export type CareerPlaybookCostBreakdown = z.infer<typeof CareerPlaybookCostBreakdownSchema>;

/**
 * Where a metric target came from. Drives how the guide is allowed to phrase it:
 * company_source/user_answer may be stated as fact, benchmark needs an
 * evidence_ledger citation, assumption must read as a hypothesis to agree on.
 */
export const CareerPlaybookMetricProvenanceSchema = z.enum([
  'company_source',
  'user_answer',
  'benchmark',
  'assumption',
]);
export type CareerPlaybookMetricProvenance = z.infer<typeof CareerPlaybookMetricProvenanceSchema>;

/**
 * One row of the canonical numeric ledger. Before this existed, focus_areas
 * carried only metric *names*, so every block invented its own thresholds and
 * the same metric appeared with conflicting targets across the document (the
 * 2026-08-11 review found four such conflicts). Blocks now quote these values
 * verbatim instead of inventing them.
 */
export const CareerPlaybookMetricLedgerEntrySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().default(''),
  target: z.string().min(1),
  green: z.string().default(''),
  yellow: z.string().default(''),
  red: z.string().default(''),
  review_period: z.string().default(''),
  provenance: CareerPlaybookMetricProvenanceSchema,
  source_ref: z.string().nullable().default(null),
});
export type CareerPlaybookMetricLedgerEntry = z.infer<typeof CareerPlaybookMetricLedgerEntrySchema>;

/**
 * One citable source. Filled deterministically by the application from the web
 * research result, never by the model: the model previously wrote "research
 * shows" with no traceable URL because sources stopped at the spec-builder
 * prompt and never reached block generation.
 */
export const CareerPlaybookEvidenceEntrySchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  claim: z.string().min(1),
  retrieved_at: z.string().min(1),
});
export type CareerPlaybookEvidenceEntry = z.infer<typeof CareerPlaybookEvidenceEntrySchema>;

export const CareerPlaybookRoleProfileSpecSchema = z.object({
  position: z.object({
    title: z.string().min(1),
    slug: z.string().min(1),
    department: z.string().min(1),
    specialization: z.string().min(1).optional(),
    level: CareerPlaybookRoleLevelSchema,
  }),
  context: z.object({
    company_stage: CareerPlaybookCompanyStageSchema.optional(),
    team_size: CareerPlaybookTeamSizeSchema,
    reports_to: z.string().min(1),
    has_subordinates: z.boolean(),
    subordinates_description: z.string().min(1).optional(),
    industry: z.string().min(1).optional(),
    region: z.string().min(1).optional(),
  }),
  focus_areas: z.object({
    primary_kpis: z.array(z.string().min(1)).min(1),
    key_tools: z.array(z.string().min(1)).default([]),
    critical_competencies: z.array(z.string().min(1)).min(1),
    anti_goals: z.array(z.string().min(1)).min(1),
    failure_patterns: z.array(z.string().min(1)).min(1),
  }),
  // Canonical numeric ledger: the single source of truth for every repeated
  // threshold in the guide. Defaults to empty so specs persisted before the
  // quality contract still parse and round-trip.
  metric_ledger: z.array(CareerPlaybookMetricLedgerEntrySchema).default([]),
  // Citable sources, application-filled. Anything the model puts here is
  // discarded and overwritten by the real research result.
  evidence_ledger: z.array(CareerPlaybookEvidenceEntrySchema).default([]),
  // Generation date, application-filled. Optional so legacy specs parse; when
  // absent the stale-date check has no anchor and skips rather than guessing.
  generated_on: z.string().min(1).optional(),
  research: z
    .object({
      kpis_insights: z.array(z.string().min(1)).default([]),
      trends_insights: z.array(z.string().min(1)).default([]),
      onboarding_insights: z.array(z.string().min(1)).default([]),
      sources: z.array(z.string().min(1)).default([]),
    })
    .nullable(),
  business_context: z
    .object({
      mode: CareerPlaybookBusinessContextModeSchema,
      digest: CareerPlaybookBusinessContextDigestSchema.nullable(),
      source_ids: z.array(z.string().uuid()).default([]),
    })
    .optional(),
  block_boundaries: z.record(
    z.object({
      primary_topics: z.array(z.string().min(1)).default([]),
      do_not_repeat: z.array(z.string().min(1)).default([]),
    })
  ),
  content_language: languageSchema,
});
export type CareerPlaybookRoleProfileSpec = z.infer<typeof CareerPlaybookRoleProfileSpecSchema>;

export const CareerPlaybookAnswerSubmissionSchema = z
  .object({
    question_key: z.string().min(1).optional(),
    question_id: z.string().uuid().optional(),
    value: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).optional(),
    skipped: z.boolean().optional(),
    freeform_text: z.string().max(CAREER_PLAYBOOK_FREEFORM_TEXT_MAX_LENGTH).optional(),
    business_context: CareerPlaybookBusinessContextSchema.optional(),
  })
  .refine(
    answer =>
      answer.value !== undefined ||
      answer.skipped === true ||
      answer.freeform_text !== undefined ||
      answer.business_context !== undefined,
    {
      message:
        'Answer submission must include a value, skip flag, free-form text, or business context',
    }
  );
export type CareerPlaybookAnswerSubmission = z.infer<typeof CareerPlaybookAnswerSubmissionSchema>;
