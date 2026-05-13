import { publicProcedure, router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import {
  publicShareInputSchema,
  shareToggleInputSchema,
  throwCareerPlaybookNotImplemented,
} from './_shared';

export const careerPlaybookShareRouter = router({
  shareToggle: protectedProcedure.input(shareToggleInputSchema).mutation(() => {
    throwCareerPlaybookNotImplemented('share.shareToggle');
  }),

  getPublicBySlug: publicProcedure.input(publicShareInputSchema).query(() => {
    throwCareerPlaybookNotImplemented('share.getPublicBySlug');
  }),
});

export type CareerPlaybookShareRouter = typeof careerPlaybookShareRouter;
