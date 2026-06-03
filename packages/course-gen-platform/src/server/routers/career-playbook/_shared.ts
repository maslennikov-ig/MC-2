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

const MAX_BUSINESS_CONTEXT_UPLOAD_BYTES = 104_857_600;
const MAX_BUSINESS_CONTEXT_BASE64_LENGTH =
  Math.ceil((MAX_BUSINESS_CONTEXT_UPLOAD_BYTES * 4) / 3) + 8;

export const playbookIdInputSchema = z.object({
  playbookId: z.string().uuid('Invalid playbook ID'),
});

export const createCourseFromPlaybookInputSchema = playbookIdInputSchema.extend({
  includeWebResearch: z.boolean().default(true),
});

export const blockInputSchema = playbookIdInputSchema.extend({
  blockId: CareerPlaybookBlockIdSchema,
});

export const fixedQuestionsInputSchema = z.object({
  uiLanguage: CareerPlaybookFixedQuestionLanguageSchema.default('ru'),
});

export const resolveDepartmentOptionsInputSchema = z.object({
  title: z.string().min(2).max(160),
  language: CareerPlaybookFixedQuestionLanguageSchema.default('ru'),
});

export const startSessionInputSchema = z.object({
  language: languageSchema.default('ru'),
});

export const submitAnswerInputSchema = playbookIdInputSchema.extend({
  phase: z.enum(['fixed', 'followup', 'freeform', 'business_context']),
  answer: CareerPlaybookAnswerSubmissionSchema,
});

export const uploadBusinessContextSourceInputSchema = playbookIdInputSchema.extend({
  filename: z.string().min(1, 'Filename is required').max(255, 'Filename too long'),
  fileSize: z
    .number()
    .int('File size must be an integer')
    .positive('File size must be positive')
    .max(MAX_BUSINESS_CONTEXT_UPLOAD_BYTES, 'File size exceeds 100MB limit'),
  mimeType: z.string().min(1, 'MIME type is required'),
  fileContent: z
    .string()
    .min(1, 'File content is required')
    .max(MAX_BUSINESS_CONTEXT_BASE64_LENGTH, 'File content exceeds upload limit'),
});

export const removeBusinessContextSourceInputSchema = playbookIdInputSchema.extend({
  sourceId: z.string().uuid('Invalid source ID'),
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
  status: z
    .enum([
      'draft',
      'answering_fixed',
      'awaiting_followups',
      'answering_followups',
      'ready_to_generate',
      'generating',
      'completed',
      'failed',
    ])
    .optional(),
  department: z.string().max(120).optional(),
  level: z.string().max(120).optional(),
  sort: z.enum(['created_desc', 'created_asc', 'title_asc', 'title_desc']).default('created_desc'),
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
