import { router } from '../../trpc';
import { careerPlaybookCourseBridgeRouter } from './course-bridge.router';
import { careerPlaybookGenerationRouter } from './generation.router';
import { careerPlaybookLibraryRouter } from './library.router';
import { careerPlaybookSessionRouter } from './session.router';
import { careerPlaybookShareRouter } from './share.router';

export const careerPlaybookRouter = router({
  session: careerPlaybookSessionRouter,
  generation: careerPlaybookGenerationRouter,
  library: careerPlaybookLibraryRouter,
  share: careerPlaybookShareRouter,
  courseBridge: careerPlaybookCourseBridgeRouter,
});

export type CareerPlaybookRouter = typeof careerPlaybookRouter;
