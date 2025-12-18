/**
 * Validators Index
 *
 * Central export point for all RT-006/RT-007 validators
 *
 * RT-007 Phase 3: Now includes severity-based validation orchestrator
 * FR-015: Minimum lessons validator for course completeness
 */

export * from './blooms-validators';
export * from './placeholder-validator';
export * from './duration-validator';
export * from './validation-orchestrator';
export * from './minimum-lessons-validator';

// Re-export types from shared-types for convenience
export { ValidationSeverity, type ValidationResult } from '@megacampus/shared-types';
