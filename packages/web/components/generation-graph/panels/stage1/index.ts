/**
 * Stage 1 "Course Passport" Components
 *
 * Specialized UI components for the initialization stage.
 * User is the AUTHOR (not reviewer) - UI is authoritative and contractual.
 */

export { Stage1InputTab } from './Stage1InputTab';
export { Stage1ProcessTab } from './Stage1ProcessTab';
export { Stage1OutputTab } from './Stage1OutputTab';
export { Stage1ActivityTab } from './Stage1ActivityTab';

export type {
  Stage1InputData,
  Stage1OutputData,
  Stage1FileMetadata,
  StoragePath,
  ValidationStep,
  ValidationStepStatus,
  ActivityEvent,
  ActivityActor,
  Stage1InputTabProps,
  Stage1ProcessTabProps,
  Stage1OutputTabProps,
  Stage1ActivityTabProps,
} from './types';
