import { END, START, StateGraph } from '@langchain/langgraph';
import { logger } from '@/shared/logger';
import { CareerPlaybookGraphState } from './state';
import { createSpecBuilderNode, type CreateSpecBuilderNodeOptions } from './nodes/spec-builder';
import { createGroupGeneratorNode } from './nodes/group-generator';
import { createCareerPlaybookRuntime, type CareerPlaybookRuntime } from './nodes/runtime';

export interface CreateCareerPlaybookGraphOptions {
  runtime?: CareerPlaybookRuntime;
  specBuilder?: Omit<CreateSpecBuilderNodeOptions, 'runtime'>;
}

export function createCareerPlaybookGraph(options: CreateCareerPlaybookGraphOptions = {}) {
  const runtime = options.runtime ?? createCareerPlaybookRuntime();
  const builder = new StateGraph(CareerPlaybookGraphState)
    .addNode('specBuilder', createSpecBuilderNode({ ...options.specBuilder, runtime }))
    .addNode('group1Generator', createGroupGeneratorNode('group_1_foundation', runtime))
    .addNode('group2Generator', createGroupGeneratorNode('group_2_operations', runtime))
    .addEdge(START, 'specBuilder')
    .addEdge('specBuilder', 'group1Generator')
    .addEdge('group1Generator', 'group2Generator')
    .addEdge('group2Generator', END);

  return builder.compile();
}

let compiledGraph: ReturnType<typeof createCareerPlaybookGraph> | null = null;

export function getCareerPlaybookGraph() {
  if (!compiledGraph) {
    compiledGraph = createCareerPlaybookGraph();
    logger.debug('Career Playbook graph compiled');
  }
  return compiledGraph;
}

export function resetCareerPlaybookGraph(): void {
  compiledGraph = null;
}
