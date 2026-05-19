/**
 * Career Playbook shared schemas.
 * @module shared-types/career-playbook
 */

import { z } from 'zod';
import { languageSchema, SUPPORTED_LANGUAGES } from './common-enums';

export const SUPPORTED_CAREER_PLAYBOOK_CONTENT_LANGUAGES = SUPPORTED_LANGUAGES;

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

export const CareerPlaybookFreeformAnswerSchema = z.object({
  text: z.string().min(1),
  parsed_signals: z.record(z.unknown()).optional(),
  submitted_at: z.string().datetime().optional(),
});
export type CareerPlaybookFreeformAnswer = z.infer<typeof CareerPlaybookFreeformAnswerSchema>;

export const CareerPlaybookQADataSchema = z.object({
  fixed: z.array(CareerPlaybookFixedAnswerSchema).default([]),
  followups: z.array(CareerPlaybookFollowupAnswerSchema).default([]),
  freeform: z.array(CareerPlaybookFreeformAnswerSchema).default([]),
  completeness_score: z.number().min(0).max(1).optional(),
});
export type CareerPlaybookQAData = z.infer<typeof CareerPlaybookQADataSchema>;

export const CareerPlaybookBlockIdSchema = z.union([
  z.literal('header'),
  z.string().regex(/^block_([1-9]|1[0-9]|2[0-6])$/, 'Expected header or block_1 through block_26'),
]);
export type CareerPlaybookBlockId = z.infer<typeof CareerPlaybookBlockIdSchema>;

export const CareerPlaybookJudgeIssueSchema = z.object({
  block_id: CareerPlaybookBlockIdSchema,
  severity: z.enum(['critical', 'warning', 'info']),
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

export const CareerPlaybookNodeCostSchema = z.object({
  node: z.string().min(1),
  model: z.string().min(1),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative(),
});
export type CareerPlaybookNodeCost = z.infer<typeof CareerPlaybookNodeCostSchema>;

export const CareerPlaybookCostBreakdownSchema = z.object({
  nodeCosts: z.array(CareerPlaybookNodeCostSchema).default([]),
  total_cost_usd: z.number().nonnegative().default(0),
});
export type CareerPlaybookCostBreakdown = z.infer<typeof CareerPlaybookCostBreakdownSchema>;

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
  research: z
    .object({
      kpis_insights: z.array(z.string().min(1)).default([]),
      trends_insights: z.array(z.string().min(1)).default([]),
      onboarding_insights: z.array(z.string().min(1)).default([]),
      sources: z.array(z.string().min(1)).default([]),
    })
    .nullable(),
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
    freeform_text: z.string().min(1).optional(),
  })
  .refine(
    answer =>
      answer.value !== undefined || answer.skipped === true || answer.freeform_text !== undefined,
    {
      message: 'Answer submission must include a value, skip flag, or free-form text',
    }
  );
export type CareerPlaybookAnswerSubmission = z.infer<typeof CareerPlaybookAnswerSubmissionSchema>;
