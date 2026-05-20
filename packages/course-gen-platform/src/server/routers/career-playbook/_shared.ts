import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  CareerPlaybookAnswerSubmissionSchema,
  CareerPlaybookBlockIdSchema,
  CareerPlaybookFixedAnswerSchema,
  CareerPlaybookFixedQuestionLanguageSchema,
  CareerPlaybookFollowupAnswerSchema,
  languageSchema,
} from '@megacampus/shared-types';

export const playbookIdInputSchema = z.object({
  playbookId: z.string().uuid('Invalid playbook ID'),
});

export const blockInputSchema = playbookIdInputSchema.extend({
  blockId: CareerPlaybookBlockIdSchema,
});

export const fixedQuestionsInputSchema = z.object({
  uiLanguage: CareerPlaybookFixedQuestionLanguageSchema.default('ru'),
});

export const startSessionInputSchema = z.object({
  language: languageSchema.default('ru'),
});

export const submitAnswerInputSchema = playbookIdInputSchema.extend({
  phase: z.enum(['fixed', 'followup', 'freeform']),
  answer: CareerPlaybookAnswerSubmissionSchema,
});

export const requestFollowupsInputSchema = playbookIdInputSchema.extend({
  fixedAnswers: z.record(CareerPlaybookFixedAnswerSchema),
  followupAnswers: z.record(CareerPlaybookFollowupAnswerSchema),
  contentLanguage: languageSchema,
});

export const listInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  search: z.string().max(200).optional(),
});

export const editBlockInputSchema = blockInputSchema.extend({
  content: z.string().min(1),
});

export const regenerateBlockInputSchema = blockInputSchema.extend({
  instruction: z.string().min(1).max(1000),
});

export const shareToggleInputSchema = playbookIdInputSchema.extend({
  isPublic: z.boolean(),
});

export const publicShareInputSchema = z.object({
  shareSlug: z.string().min(3).max(120),
});

export function throwCareerPlaybookNotImplemented(procedure: string): never {
  throw new TRPCError({
    code: 'METHOD_NOT_SUPPORTED',
    message: `careerPlaybook.${procedure} is not implemented in Phase 1`,
  });
}
