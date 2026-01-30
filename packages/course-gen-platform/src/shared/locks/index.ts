/**
 * Distributed locking utilities
 * @module shared/locks
 */

export {
  GenerationLockService,
  generationLockService,
  type GenerationLock,
  type LockAcquisitionResult,
  type LockOptions,
} from './generation-lock';

export { acquireGenerationLock, type LockGuard } from './generation-lock-helper';
