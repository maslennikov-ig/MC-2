/**
 * Validators Index
 *
 * Central export point for all RT-006 validators
 *
 * FR-015: Minimum lessons validator for course completeness
 */

export * from './placeholder-validator';
export * from './duration-validator';
export * from './minimum-lessons-validator';

// Re-export types from shared-types for convenience
export { ValidationSeverity, type ValidationResult } from '@megacampus/shared-types';
