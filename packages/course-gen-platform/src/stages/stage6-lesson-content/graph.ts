import { StateGraph, START, END } from '@langchain/langgraph';
import { LessonGraphState } from './state';
import { generatorNode } from './nodes/generator';
import { selfReviewerNode } from './nodes/self-reviewer-node';
import { judgeNode } from './nodes/judge-node';
import { sectionRegeneratorNode } from './nodes/section-regenerator';
import { shouldProceedToJudge, shouldRetryAfterJudge } from './routing/conditional-edges';
import { logger } from '@/shared/logger';

// ============================================================================
// GRAPH CREATION
// ============================================================================

/**
 * Create the Stage 6 StateGraph workflow
 *
 * @returns Compiled StateGraph ready for invocation
 */
export function createStage6Graph() {
  const builder = new StateGraph(LessonGraphState)
    // Add nodes
    .addNode('generator', generatorNode)
    .addNode('selfReviewer', selfReviewerNode)
    .addNode('sectionRegenerator', sectionRegeneratorNode)
    .addNode('judge', judgeNode)
    // Define edges
    .addEdge(START, 'generator')
    .addEdge('generator', 'selfReviewer')
    // Conditional edge from selfReviewer: proceed to judge, sectionRegenerator, or regenerate
    .addConditionalEdges('selfReviewer', shouldProceedToJudge, {
      judge: 'judge',
      generator: 'generator',
      sectionRegenerator: 'sectionRegenerator',
      __end__: END,
    })
    // After section regeneration, proceed to judge
    .addEdge('sectionRegenerator', 'judge')
    // Conditional edge from judge: either end or retry
    .addConditionalEdges('judge', shouldRetryAfterJudge, {
      generator: 'generator',
      __end__: END,
    });

  return builder.compile();
}

// Singleton compiled graph for efficiency
let compiledGraph: ReturnType<typeof createStage6Graph> | null = null;

/**
 * Get or create the compiled graph (singleton pattern)
 *
 * Lazy initialization ensures graph is only compiled once.
 *
 * @returns Compiled StateGraph instance
 */
export function getGraph() {
  if (!compiledGraph) {
    compiledGraph = createStage6Graph();
    logger.debug('Stage 6 graph compiled');
  }
  return compiledGraph;
}

/**
 * Reset the singleton graph (for testing only)
 * Forces graph recompilation on next getGraph() call
 */
export function resetGraph(): void {
  compiledGraph = null;
  logger.debug('Stage 6 graph reset');
}
