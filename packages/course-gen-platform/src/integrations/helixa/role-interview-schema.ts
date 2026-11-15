import { z } from 'zod';
import {
  CareerPlaybookFixedAnswerSchema,
  CareerPlaybookFixedQuestionSchema,
  CareerPlaybookFollowupQuestionSchema,
  CareerPlaybookOptionSchema,
} from '@megacampus/shared-types';

const id = z.string().trim().min(1).max(300);
export const interviewHash = z.string().regex(/^[a-f0-9]{64}$/u);
const binding = z.object({ bindingId: id }).strict();
export const RoleInterviewQuestionsRequestSchema = z
  .object({
    schemaVersion: z.literal('helixa.role-interview-questions.v1'),
    binding,
    uiLanguage: z.enum(['ru', 'en']),
  })
  .strict();
export const RoleInterviewFollowupsRequestSchema = z
  .object({
    schemaVersion: z.literal('helixa.role-interview-followups.v1'),
    binding,
    interviewId: id,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    round: z.union([z.literal(1), z.literal(2)]),
    methodologyHash: interviewHash,
    previousResultHash: interviewHash.nullable(),
    contentLanguage: z.enum(['ru', 'en']),
    fixedAnswers: z
      .array(
        CareerPlaybookFixedAnswerSchema.omit({ answered_at: true })
          .extend({
            value: z.union([
              z.string().min(1).max(12000),
              z.array(z.string().min(1).max(2000)).min(1).max(32),
            ]),
          })
          .strict()
      )
      .max(16),
    followupAnswers: z
      .array(
        z
          .object({
            question_id: z.string().uuid(),
            value: z
              .union([
                z.string().min(1).max(12000),
                z.array(z.string().min(1).max(2000)).min(1).max(32),
              ])
              .optional(),
            skipped: z.boolean(),
          })
          .strict()
      )
      .max(7),
    context: z
      .object({
        text: z.string().min(1).max(12000),
        source: z
          .object({ documentId: id, sourceRevisionHash: interviewHash, citationId: id })
          .strict(),
      })
      .strict(),
  })
  .strict();
export type RoleInterviewFollowupsRequest = z.infer<typeof RoleInterviewFollowupsRequestSchema>;
export const RoleInterviewLookupRequestSchema = z
  .object({
    schemaVersion: z.literal('helixa.role-interview-lookup.v1'),
    binding,
    interviewId: id,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    round: z.union([z.literal(1), z.literal(2)]),
    requestHash: interviewHash,
    methodologyHash: interviewHash,
  })
  .strict();
export const ROLE_INTERVIEW_LIMITS = Object.freeze({
  maxRounds: 2,
  maxQuestions: 7,
  readyScoreBps: 7500,
  maxContextCharacters: 12000,
});

export class RoleInterviewError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

export const RoleInterviewQuestionsResultSchema = z
  .object({
    schemaVersion: z.literal('helixa.role-interview-questions-result.v1'),
    methodologyHash: interviewHash,
    questions: z.array(CareerPlaybookFixedQuestionSchema).min(1).max(16),
    limits: z
      .object({
        maxRounds: z.literal(2),
        maxQuestions: z.literal(7),
        readyScoreBps: z.literal(7500),
        maxContextCharacters: z.literal(12000),
      })
      .strict(),
  })
  .strict();

// Helixa's v1 consumer renders these native fields into a bounded display prompt.
// Keep its transport limits local to this facade, not the native career workflow.
const roleInterviewFollowupQuestion = CareerPlaybookFollowupQuestionSchema.extend({
  question_text: z.string().min(1).max(3000),
  rationale: z.string().min(1).max(3000),
  options: z
    .array(
      CareerPlaybookOptionSchema.extend({
        value: z.string().min(1).max(1000),
        label: z.string().min(1).max(1000),
        helper: z.string().min(1).max(3000).optional(),
      }).strict()
    )
    .min(1)
    .max(100)
    .nullable(),
}).strict();

export const RoleInterviewFollowupsResultSchema = z
  .object({
    schemaVersion: z.literal('helixa.role-interview-followups-result.v1'),
    interviewId: id,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    round: z.union([z.literal(1), z.literal(2)]),
    requestHash: interviewHash,
    methodologyHash: interviewHash,
    state: z.enum(['pending', 'completed', 'uncertain', 'action_required']),
    resultHash: interviewHash.optional(),
    result: z
      .object({
        questions: z.array(roleInterviewFollowupQuestion).max(7),
        completenessScoreBps: z.number().int().min(0).max(10000),
        stopRecommendation: z.enum(['ask_more', 'ready_to_generate']),
        readyToGenerate: z.boolean(),
      })
      .strict()
      .optional(),
    error: z
      .object({ code: id, retryable: z.literal(false) })
      .strict()
      .optional(),
  })
  .strict();
