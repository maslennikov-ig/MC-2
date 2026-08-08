import { router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import {
  editBlockInputSchema,
  listInputSchema,
  playbookIdInputSchema,
  regenerateBlockInputSchema,
  visibilityInputSchema,
} from './_shared';
import {
  deleteCareerPlaybookFromLibrary,
  editCareerPlaybookBlock,
  getCareerPlaybookFromLibrary,
  listCareerPlaybooks,
  regenerateCareerPlaybookImage,
  regenerateCareerPlaybookBlockFromLibrary,
  updateCareerPlaybookVisibility,
} from './library-service';

export const careerPlaybookLibraryRouter = router({
  list: protectedProcedure.input(listInputSchema).query(({ ctx, input }) => {
    return listCareerPlaybooks(ctx, input);
  }),

  get: protectedProcedure.input(playbookIdInputSchema).query(({ ctx, input }) => {
    return getCareerPlaybookFromLibrary(ctx, input);
  }),

  delete: protectedProcedure.input(playbookIdInputSchema).mutation(({ ctx, input }) => {
    return deleteCareerPlaybookFromLibrary(ctx, input);
  }),

  updateVisibility: protectedProcedure.input(visibilityInputSchema).mutation(({ ctx, input }) => {
    return updateCareerPlaybookVisibility(ctx, input);
  }),

  regenerateImage: protectedProcedure.input(playbookIdInputSchema).mutation(({ ctx, input }) => {
    return regenerateCareerPlaybookImage(ctx, input);
  }),

  regenerateBlock: protectedProcedure
    .input(regenerateBlockInputSchema)
    .mutation(({ ctx, input }) => {
      return regenerateCareerPlaybookBlockFromLibrary(ctx, input);
    }),

  edit: protectedProcedure.input(editBlockInputSchema).mutation(({ ctx, input }) => {
    return editCareerPlaybookBlock(ctx, input);
  }),
});

export type CareerPlaybookLibraryRouter = typeof careerPlaybookLibraryRouter;
