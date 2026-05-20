import { publicProcedure, router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import { publicShareInputSchema, shareToggleInputSchema } from './_shared';
import { getPublicCareerPlaybookBySlug, toggleCareerPlaybookShare } from './library-service';

export const careerPlaybookShareRouter = router({
  shareToggle: protectedProcedure.input(shareToggleInputSchema).mutation(({ ctx, input }) => {
    return toggleCareerPlaybookShare(ctx, input);
  }),

  getPublicBySlug: publicProcedure.input(publicShareInputSchema).query(({ input }) => {
    return getPublicCareerPlaybookBySlug(input);
  }),
});

export type CareerPlaybookShareRouter = typeof careerPlaybookShareRouter;
