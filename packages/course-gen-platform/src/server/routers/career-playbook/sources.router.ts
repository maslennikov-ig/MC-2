import { router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rate-limit';
import { uploadBusinessContextSourceInputSchema } from './_shared';
import { uploadCareerPlaybookBusinessContextSource } from './sources.service';

export const careerPlaybookSourcesRouter = router({
  uploadFile: protectedProcedure
    .use(
      createRateLimiter({ requests: 30, window: 60, keyPrefix: 'career-playbook-source-upload' })
    )
    .input(uploadBusinessContextSourceInputSchema)
    .mutation(({ ctx, input }) => {
      return uploadCareerPlaybookBusinessContextSource(ctx, input);
    }),
});

export type CareerPlaybookSourcesRouter = typeof careerPlaybookSourcesRouter;
