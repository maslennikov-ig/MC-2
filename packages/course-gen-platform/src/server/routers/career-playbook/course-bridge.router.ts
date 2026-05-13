import { router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import { playbookIdInputSchema, throwCareerPlaybookNotImplemented } from './_shared';

export const careerPlaybookCourseBridgeRouter = router({
  createCourseFromPlaybook: protectedProcedure.input(playbookIdInputSchema).mutation(() => {
    throwCareerPlaybookNotImplemented('courseBridge.createCourseFromPlaybook');
  }),
});

export type CareerPlaybookCourseBridgeRouter = typeof careerPlaybookCourseBridgeRouter;
