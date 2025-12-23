/**
 * Stage 2 "Document Processing" Panel Components
 *
 * Re-exports for convenient importing:
 * import { Stage2InputTab, Stage2ProcessTab, ... } from './stage2';
 */

// Components
export { Stage2InputTab } from './Stage2InputTab';
export { Stage2ProcessTab } from './Stage2ProcessTab';
export { Stage2OutputTab } from './Stage2OutputTab';
export { Stage2ActivityTab } from './Stage2ActivityTab';

// Types
export type {
  Stage2InputData,
  Stage2OutputData,
  DocumentStats,
  ProcessingPhase,
  ProcessingPhaseId,
  ProcessingPhaseStatus,
  TerminalLogEntry,
  ActivityPhaseGroup,
  ActivityEvent,
  TierFeatures,
  Stage2InputTabProps,
  Stage2ProcessTabProps,
  Stage2OutputTabProps,
  Stage2ActivityTabProps,
} from './types';

// Utilities
export { getTierFeatures } from './types';
