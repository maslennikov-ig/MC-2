import { router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import {
  fixedQuestionsInputSchema,
  playbookIdInputSchema,
  startSessionInputSchema,
  submitAnswerInputSchema,
  throwCareerPlaybookNotImplemented,
} from './_shared';

export const careerPlaybookSessionRouter = router({
  start: protectedProcedure.input(startSessionInputSchema).mutation(() => {
    throwCareerPlaybookNotImplemented('session.start');
  }),

  get: protectedProcedure.input(playbookIdInputSchema).query(() => {
    throwCareerPlaybookNotImplemented('session.get');
  }),

  submitAnswer: protectedProcedure.input(submitAnswerInputSchema).mutation(() => {
    throwCareerPlaybookNotImplemented('session.submitAnswer');
  }),

  getDraft: protectedProcedure.input(playbookIdInputSchema).query(() => {
    throwCareerPlaybookNotImplemented('session.getDraft');
  }),

  getFixedQuestions: protectedProcedure.input(fixedQuestionsInputSchema).query(() => {
    throwCareerPlaybookNotImplemented('session.getFixedQuestions');
  }),
});

export type CareerPlaybookSessionRouter = typeof careerPlaybookSessionRouter;
