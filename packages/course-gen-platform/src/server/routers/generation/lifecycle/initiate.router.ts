import { instructorProcedure } from '../../../procedures';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { initiateGenerationInputSchema } from '../_shared/schemas';
import { initiateCourseGeneration } from './initiate.service';

export const initiateRouter = {
  initiate: instructorProcedure
    .use(createRateLimiter({ requests: 10, window: 60 }))
    .input(initiateGenerationInputSchema)
    .mutation(({ ctx, input }) => initiateCourseGeneration({ ctx, input })),
};
