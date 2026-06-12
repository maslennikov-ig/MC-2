import { router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rate-limit';
import {
  playbookIdInputSchema,
  removeBusinessContextSourceInputSchema,
  retryBusinessContextSourceInputSchema,
  uploadBusinessContextSourceInputSchema,
} from './_shared';
import {
  listCareerPlaybookBusinessContextSources,
  removeCareerPlaybookBusinessContextSource,
  retryCareerPlaybookBusinessContextSource,
  uploadCareerPlaybookBusinessContextSource,
} from './sources.service';

export const careerPlaybookSourcesRouter = router({
  listSources: protectedProcedure.input(playbookIdInputSchema).query(({ ctx, input }) => {
    return listCareerPlaybookBusinessContextSources(ctx, input.playbookId);
  }),

  uploadFile: protectedProcedure
    .use(
      createRateLimiter({ requests: 30, window: 60, keyPrefix: 'career-playbook-source-upload' })
    )
    .input(uploadBusinessContextSourceInputSchema)
    .mutation(({ ctx, input }) => {
      return uploadCareerPlaybookBusinessContextSource(ctx, input);
    }),

  removeSource: protectedProcedure
    .input(removeBusinessContextSourceInputSchema)
    .mutation(({ ctx, input }) => {
      return removeCareerPlaybookBusinessContextSource(ctx, input);
    }),

  retrySource: protectedProcedure
    .input(retryBusinessContextSourceInputSchema)
    .mutation(({ ctx, input }) => {
      return retryCareerPlaybookBusinessContextSource(ctx, input);
    }),
});

export type CareerPlaybookSourcesRouter = typeof careerPlaybookSourcesRouter;
