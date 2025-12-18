import { z } from 'zod';
import { router, publicProcedure } from '../../trpc';

export const testRouter = router({
  test: publicProcedure
    .input(
      z
        .object({
          message: z.string().optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      return {
        message: 'tRPC server is operational',
        timestamp: new Date().toISOString(),
        echo: input?.message,
      };
    }),
});
