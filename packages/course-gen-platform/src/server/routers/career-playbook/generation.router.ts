import { router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import { blockInputSchema, playbookIdInputSchema, requestFollowupsInputSchema } from './_shared';
import {
  approveCareerPlaybookGeneration,
  getCareerPlaybookBlock,
  getCareerPlaybookGenerationStatus,
  requestCareerPlaybookFollowups,
} from './service';

export const careerPlaybookGenerationRouter = router({
  requestFollowups: protectedProcedure
    .input(requestFollowupsInputSchema)
    .mutation(({ ctx, input }) => {
      return requestCareerPlaybookFollowups(ctx, input);
    }),

  approveAndGenerate: protectedProcedure.input(playbookIdInputSchema).mutation(({ ctx, input }) => {
    return approveCareerPlaybookGeneration(ctx, input);
  }),

  getStatus: protectedProcedure.input(playbookIdInputSchema).query(({ ctx, input }) => {
    return getCareerPlaybookGenerationStatus(ctx, input);
  }),

  getBlock: protectedProcedure.input(blockInputSchema).query(({ ctx, input }) => {
    return getCareerPlaybookBlock(ctx, input);
  }),
});

export type CareerPlaybookGenerationRouter = typeof careerPlaybookGenerationRouter;
