/**
 * Stage 6 LangGraph Nodes - Index
 * @module stages/stage6-lesson-content/nodes
 *
 * Exports all LangGraph nodes for the lesson content generation pipeline.
 *
 * Pipeline flow (simplified):
 * Generator -> SelfReviewer -> (Judge)
 *
 * Each node:
 * - Takes LessonGraphStateType as input
 * - Returns Partial<LessonGraphStateType> with updates
 * - Sets currentNode for routing
 * - Adds errors to state.errors on failure
 */

// Active nodes
export { generatorNode } from './generator';
export { selfReviewerNode } from './self-reviewer-node';

// Note: Deprecated nodes (planner, expander, assembler, smoother) have been removed.
// See specs/023-stage6-architecture-simplification/ for migration details.

/**
 * Node function type for LangGraph integration
 */
export type { LessonGraphStateType, LessonGraphStateUpdate, NodeCost } from '../state';
