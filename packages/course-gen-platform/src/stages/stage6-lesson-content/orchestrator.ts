/**
 * Stage 6 LangGraph Orchestrator
 * @module stages/stage6-lesson-content/orchestrator
 *
 * Wires together the LangGraph nodes (generator -> selfReviewer -> sectionRegenerator/judge)
 * using StateGraph for lesson content generation pipeline.
 *
 * This module acts as the public API for Stage 6, re-exporting all necessary components.
 */

// Re-export types
export type { Stage6Input, Stage6Output } from './types';

// Re-export execution functions (Primary API)
export { executeStage6, executeStage6Batch } from './execution/execute-stage6';

// Re-export graph creation and management (Advanced API / Testing)
export { createStage6Graph, getGraph, resetGraph } from './graph';

// Re-export routing functions (Testing)
export { shouldProceedToJudge, shouldRetryAfterJudge } from './routing/conditional-edges';
