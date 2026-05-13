import { router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import {
  blockInputSchema,
  playbookIdInputSchema,
  throwCareerPlaybookNotImplemented,
} from './_shared';

export const careerPlaybookGenerationRouter = router({
  approveAndGenerate: protectedProcedure.input(playbookIdInputSchema).mutation(() => {
    throwCareerPlaybookNotImplemented('generation.approveAndGenerate');
  }),

  getStatus: protectedProcedure.input(playbookIdInputSchema).query(() => {
    throwCareerPlaybookNotImplemented('generation.getStatus');
  }),

  getBlock: protectedProcedure.input(blockInputSchema).query(() => {
    throwCareerPlaybookNotImplemented('generation.getBlock');
  }),
});

export type CareerPlaybookGenerationRouter = typeof careerPlaybookGenerationRouter;
