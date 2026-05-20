import { router } from '../../trpc';
import { instructorProcedure } from '../../procedures';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { createCourseFromPlaybookInputSchema } from './_shared';
import { createCourseFromPlaybook } from './course-bridge.service';

export const careerPlaybookCourseBridgeRouter = router({
  createCourseFromPlaybook: instructorProcedure
    .use(
      createRateLimiter({
        requests: 5,
        window: 60,
        keyPrefix: 'career-playbook-course-bridge',
      })
    )
    .input(createCourseFromPlaybookInputSchema)
    .mutation(({ ctx, input }) => createCourseFromPlaybook(ctx, input)),
});

export type CareerPlaybookCourseBridgeRouter = typeof careerPlaybookCourseBridgeRouter;
