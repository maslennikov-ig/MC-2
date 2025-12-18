/**
 * Stage 1 Document Upload Phases
 *
 * Re-exports all phase modules for Stage 1 upload workflow.
 *
 * Phase Structure:
 * - Phase 1: Input validation (course ownership, tier, file restrictions)
 * - Phase 2: File storage (quota, disk write, database insert)
 *
 * Note: Stage 1 is NOT a BullMQ job - it's a synchronous tRPC endpoint.
 * Unlike Stages 2-5, there is no async job processing.
 *
 * @module stages/stage1-document-upload/phases
 */

// Phase 1: Validation
export {
  runPhase1Validation,
  isValidationError,
  type ValidationError,
} from './phase-1-validation';

// Phase 2: Storage
export {
  runPhase2Storage,
  performRollback,
  isStorageError,
  type StorageError,
} from './phase-2-storage';
