/**
 * Arbiter module - Consolidates judge verdicts using Krippendorff's Alpha
 * @module stages/stage6-lesson-content/judge/arbiter
 *
 * The Arbiter consolidates verdicts from multiple judges (CLEV voting) into
 * a unified RefinementPlan with conflict resolution and agreement scoring.
 *
 * Key responsibilities:
 * - Calculate Krippendorff's Alpha for inter-rater agreement
 * - Filter issues based on agreement level
 * - Resolve conflicts using PRIORITY_HIERARCHY
 * - Create execution batches for parallel processing
 *
 * Reference:
 * - specs/018-judge-targeted-refinement/
 * - packages/shared-types/src/judge-types.ts
 */

export * from './krippendorff';
export * from './conflict-resolver';
export * from './consolidate-verdicts';
export * from './section-utils';
