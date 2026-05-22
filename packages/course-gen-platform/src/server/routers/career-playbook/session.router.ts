import { router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import {
  fixedQuestionsInputSchema,
  playbookIdInputSchema,
  startSessionInputSchema,
  submitAnswerInputSchema,
} from './_shared';
import {
  getCareerPlaybookDraft,
  getCareerPlaybookFixedQuestions,
  startCareerPlaybookSession,
  submitCareerPlaybookAnswer,
} from './service';

export const careerPlaybookSessionRouter = router({
  start: protectedProcedure.input(startSessionInputSchema).mutation(({ ctx, input }) => {
    return startCareerPlaybookSession(ctx, input);
  }),

  get: protectedProcedure.input(playbookIdInputSchema).query(({ ctx, input }) => {
    return getCareerPlaybookDraft(ctx, input);
  }),

  submitAnswer: protectedProcedure.input(submitAnswerInputSchema).mutation(({ ctx, input }) => {
    return submitCareerPlaybookAnswer(ctx, input);
  }),

  getDraft: protectedProcedure.input(playbookIdInputSchema).query(({ ctx, input }) => {
    return getCareerPlaybookDraft(ctx, input);
  }),

  getFixedQuestions: protectedProcedure.input(fixedQuestionsInputSchema).query(({ ctx, input }) => {
    return getCareerPlaybookFixedQuestions(ctx, input);
  }),
});

export type CareerPlaybookSessionRouter = typeof careerPlaybookSessionRouter;
