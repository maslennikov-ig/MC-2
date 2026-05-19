import { router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rate-limit';
import { playbookIdInputSchema } from './_shared';
import { careerPlaybookCourseBridgeRouter } from './course-bridge.router';
import { careerPlaybookGenerationRouter } from './generation.router';
import { careerPlaybookLibraryRouter } from './library.router';
import { careerPlaybookSessionRouter } from './session.router';
import { careerPlaybookShareRouter } from './share.router';
import { exportCareerPlaybookPdf } from './library-service';

export const careerPlaybookRouter = router({
  exportPdf: protectedProcedure
    .use(createRateLimiter({ requests: 5, window: 60, keyPrefix: 'career-playbook-pdf-export' }))
    .input(playbookIdInputSchema)
    .query(({ ctx, input }) => {
      return exportCareerPlaybookPdf(ctx, input);
    }),
  session: careerPlaybookSessionRouter,
  generation: careerPlaybookGenerationRouter,
  library: careerPlaybookLibraryRouter,
  share: careerPlaybookShareRouter,
  courseBridge: careerPlaybookCourseBridgeRouter,
});

export type CareerPlaybookRouter = typeof careerPlaybookRouter;
