import { router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import {
  editBlockInputSchema,
  listInputSchema,
  playbookIdInputSchema,
  regenerateBlockInputSchema,
  throwCareerPlaybookNotImplemented,
} from './_shared';

export const careerPlaybookLibraryRouter = router({
  list: protectedProcedure.input(listInputSchema).query(() => {
    throwCareerPlaybookNotImplemented('library.list');
  }),

  get: protectedProcedure.input(playbookIdInputSchema).query(() => {
    throwCareerPlaybookNotImplemented('library.get');
  }),

  delete: protectedProcedure.input(playbookIdInputSchema).mutation(() => {
    throwCareerPlaybookNotImplemented('library.delete');
  }),

  regenerateBlock: protectedProcedure.input(regenerateBlockInputSchema).mutation(() => {
    throwCareerPlaybookNotImplemented('library.regenerateBlock');
  }),

  edit: protectedProcedure.input(editBlockInputSchema).mutation(() => {
    throwCareerPlaybookNotImplemented('library.edit');
  }),
});

export type CareerPlaybookLibraryRouter = typeof careerPlaybookLibraryRouter;
