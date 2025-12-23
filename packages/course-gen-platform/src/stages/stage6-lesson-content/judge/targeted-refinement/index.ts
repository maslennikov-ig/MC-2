/**
 * Targeted Refinement Orchestration Module
 * @module stages/stage6-lesson-content/judge/targeted-refinement
 *
 * Main entry point for orchestrating the targeted refinement loop.
 *
 * Reference:
 * - specs/018-judge-targeted-refinement/quickstart.md (Phase 6: Main Loop)
 * - specs/018-judge-targeted-refinement/spec.md (FR-021 to FR-028)
 */

// Re-export submodules
export * from './iteration-controller';
export * from './best-effort-selector';
export * from './types';
export * from './constants';
export * from './events';
export * from './orchestrator';

// Re-export quality lock checking for convenience
export { checkQualityLocks } from '../verifier/quality-lock';