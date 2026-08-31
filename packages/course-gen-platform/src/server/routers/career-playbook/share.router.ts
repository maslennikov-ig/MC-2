import { publicProcedure, router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import { playbookIdInputSchema, publicShareInputSchema, shareToggleInputSchema } from './_shared';
import { viewShareInputSchema } from './_shared';
import {
  getCareerPlaybookViewByToken,
  getPublicCareerPlaybookBySlug,
  listCareerPlaybookViewLinks,
  toggleCareerPlaybookShare,
} from './library-service';

export const careerPlaybookShareRouter = router({
  shareToggle: protectedProcedure.input(shareToggleInputSchema).mutation(({ ctx, input }) => {
    return toggleCareerPlaybookShare(ctx, input);
  }),

  getPublicBySlug: publicProcedure.input(publicShareInputSchema).query(({ input }) => {
    return getPublicCareerPlaybookBySlug(input);
  }),

  /**
   * One reader's own guide. The link decides which view; nothing the client
   * sends can widen it, and turning sharing off revokes all three at once.
   */
  getViewByToken: publicProcedure.input(viewShareInputSchema).query(({ input }) => {
    return getCareerPlaybookViewByToken(input);
  }),

  /** The three links the owner hands out. Owner-only, by definition. */
  listViewLinks: protectedProcedure.input(playbookIdInputSchema).query(({ ctx, input }) => {
    return listCareerPlaybookViewLinks(ctx, input);
  }),
});

export type CareerPlaybookShareRouter = typeof careerPlaybookShareRouter;
