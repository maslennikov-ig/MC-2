import { router } from '../../trpc';
import { instructorProcedure } from '../../procedures';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import {
  createCourseFromPlaybookInputSchema,
  previewCourseFromPlaybookInputSchema,
} from './_shared';
import { createCourseFromPlaybook, previewCourseFromPlaybook } from './course-bridge.service';

export const careerPlaybookCourseBridgeRouter = router({
  previewCourseFromPlaybook: instructorProcedure
    .use(
      createRateLimiter({
        requests: 20,
        window: 60,
        keyPrefix: 'career-playbook-course-bridge-preview',
      })
    )
    .input(previewCourseFromPlaybookInputSchema)
    .query(({ ctx, input }) => previewCourseFromPlaybook(ctx, input)),

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
