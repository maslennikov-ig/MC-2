/**
 * Stage 6 LangGraph Nodes - Index
 * @module stages/stage6-lesson-content/nodes
 *
 * Exports all LangGraph nodes for the lesson content generation pipeline.
 *
 * Pipeline flow:
 * Planner -> Expander -> Assembler -> Smoother -> (Judge)
 *
 * Each node:
 * - Takes LessonGraphStateType as input
 * - Returns Partial<LessonGraphStateType> with updates
 * - Sets currentNode for routing
 * - Adds errors to state.errors on failure
 */

export { plannerNode } from './planner';
export { expanderNode } from './expander';
export { assemblerNode } from './assembler';
export { smootherNode } from './smoother';

/**
 * Node function type for LangGraph integration
 */
export type { LessonGraphStateType, LessonGraphStateUpdate, NodeCost } from '../state';
