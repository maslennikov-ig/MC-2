import { END, START, StateGraph } from '@langchain/langgraph';
import type { CareerPlaybookBlockId } from '@megacampus/shared-types';
import { logger } from '@/shared/logger';
import { CareerPlaybookGraphState } from './state';
import { createSpecBuilderNode, type CreateSpecBuilderNodeOptions } from './nodes/spec-builder';
import { createGroupGeneratorNode, getCareerPlaybookGroupSpec } from './nodes/group-generator';
import { createCareerPlaybookRuntime, type CareerPlaybookRuntime } from './nodes/runtime';
import { createCrossBlockJudgeNode } from './nodes/cross-block-judge';
import {
  CAREER_PLAYBOOK_FINAL_BLOCK_ORDER,
  createFinalAssemblerNode,
} from './nodes/final-assembler';
import {
  createBlockRegeneratorNode,
  selectPendingCareerPlaybookRegeneration,
} from './nodes/block-regenerator';
import type { CareerPlaybookGraphStateType, CareerPlaybookGroupKey } from './state';

export interface CreateCareerPlaybookGraphOptions {
  runtime?: CareerPlaybookRuntime;
  specBuilder?: Omit<CreateSpecBuilderNodeOptions, 'runtime'>;
}

const GROUP_PIPELINE = [
  {
    groupKey: 'group_1_foundation',
    generatorNode: 'group1Generator',
    judgeNode: 'group1Judge',
    nextNode: 'group2Generator',
  },
  {
    groupKey: 'group_2_operations',
    generatorNode: 'group2Generator',
    judgeNode: 'group2Judge',
    nextNode: 'group3Generator',
  },
  {
    groupKey: 'group_3_people',
    generatorNode: 'group3Generator',
    judgeNode: 'group3Judge',
    nextNode: 'group4Generator',
  },
  {
    groupKey: 'group_4_growth',
    generatorNode: 'group4Generator',
    judgeNode: 'group4Judge',
    nextNode: 'group5Generator',
  },
  {
    groupKey: 'group_5_system',
    generatorNode: 'group5Generator',
    judgeNode: 'group5Judge',
    nextNode: 'group6Generator',
  },
  {
    groupKey: 'group_6_wrap',
    generatorNode: 'group6Generator',
    judgeNode: 'group6Judge',
    nextNode: 'finalAssembler',
  },
] as const satisfies Array<{
  groupKey: CareerPlaybookGroupKey;
  generatorNode: string;
  judgeNode: string;
  nextNode: string;
}>;

function getGroupBlockIds(groupKey: CareerPlaybookGroupKey): CareerPlaybookBlockId[] {
  return getCareerPlaybookGroupSpec(groupKey).blocks.map(block => block.blockId);
}

function hasSameBlockIdSet(left: CareerPlaybookBlockId[], right: CareerPlaybookBlockId[]): boolean {
  return left.length === right.length && left.every(blockId => right.includes(blockId));
}

function routeAfterJudge(blockIds: CareerPlaybookBlockId[], nextNode: string) {
  return function routeCareerPlaybookAfterJudge(state: CareerPlaybookGraphStateType) {
    const pending = selectPendingCareerPlaybookRegeneration({
      verdict: state.lastJudgeVerdict,
      blockIds,
      attempts: state.blockRegenerationAttempts,
    });

    return pending ? 'blockRegenerator' : nextNode;
  };
}

function routeAfterBlockRegeneration(state: CareerPlaybookGraphStateType) {
  const group = GROUP_PIPELINE.find(entry =>
    hasSameBlockIdSet(getGroupBlockIds(entry.groupKey), state.lastJudgedBlockIds)
  );

  return group?.judgeNode ?? 'finalJudge';
}

export function createCareerPlaybookGraph(options: CreateCareerPlaybookGraphOptions = {}) {
  const runtime = options.runtime ?? createCareerPlaybookRuntime();
  const group1BlockIds = getGroupBlockIds('group_1_foundation');
  const group2BlockIds = getGroupBlockIds('group_2_operations');
  const group3BlockIds = getGroupBlockIds('group_3_people');
  const group4BlockIds = getGroupBlockIds('group_4_growth');
  const group5BlockIds = getGroupBlockIds('group_5_system');
  const group6BlockIds = getGroupBlockIds('group_6_wrap');

  const builder = new StateGraph(CareerPlaybookGraphState)
    .addNode('specBuilder', createSpecBuilderNode({ ...options.specBuilder, runtime }))
    .addNode('group1Generator', createGroupGeneratorNode('group_1_foundation', runtime))
    .addNode('group2Generator', createGroupGeneratorNode('group_2_operations', runtime))
    .addNode('group3Generator', createGroupGeneratorNode('group_3_people', runtime))
    .addNode('group4Generator', createGroupGeneratorNode('group_4_growth', runtime))
    .addNode('group5Generator', createGroupGeneratorNode('group_5_system', runtime))
    .addNode('group6Generator', createGroupGeneratorNode('group_6_wrap', runtime))
    .addNode('blockRegenerator', createBlockRegeneratorNode(runtime))
    .addNode('finalAssembler', createFinalAssemblerNode())
    .addNode(
      'group1Judge',
      createCrossBlockJudgeNode({
        runtime,
        useLLMJudge: true,
        currentBlockIds: group1BlockIds,
      })
    )
    .addNode(
      'group2Judge',
      createCrossBlockJudgeNode({
        runtime,
        useLLMJudge: true,
        currentBlockIds: group2BlockIds,
      })
    )
    .addNode(
      'group3Judge',
      createCrossBlockJudgeNode({
        runtime,
        useLLMJudge: true,
        currentBlockIds: group3BlockIds,
      })
    )
    .addNode(
      'group4Judge',
      createCrossBlockJudgeNode({
        runtime,
        useLLMJudge: true,
        currentBlockIds: group4BlockIds,
      })
    )
    .addNode(
      'group5Judge',
      createCrossBlockJudgeNode({
        runtime,
        useLLMJudge: true,
        currentBlockIds: group5BlockIds,
      })
    )
    .addNode(
      'group6Judge',
      createCrossBlockJudgeNode({
        runtime,
        useLLMJudge: true,
        currentBlockIds: group6BlockIds,
      })
    )
    .addNode('finalJudge', createCrossBlockJudgeNode({ runtime, useLLMJudge: true }))
    .addEdge(START, 'specBuilder')
    .addEdge('specBuilder', 'group1Generator')
    .addEdge('group1Generator', 'group1Judge')
    .addEdge('group2Generator', 'group2Judge')
    .addEdge('group3Generator', 'group3Judge')
    .addEdge('group4Generator', 'group4Judge')
    .addEdge('group5Generator', 'group5Judge')
    .addEdge('group6Generator', 'group6Judge')
    .addEdge('finalAssembler', 'finalJudge')
    .addConditionalEdges('group1Judge', routeAfterJudge(group1BlockIds, 'group2Generator'))
    .addConditionalEdges('group2Judge', routeAfterJudge(group2BlockIds, 'group3Generator'))
    .addConditionalEdges('group3Judge', routeAfterJudge(group3BlockIds, 'group4Generator'))
    .addConditionalEdges('group4Judge', routeAfterJudge(group4BlockIds, 'group5Generator'))
    .addConditionalEdges('group5Judge', routeAfterJudge(group5BlockIds, 'group6Generator'))
    .addConditionalEdges('group6Judge', routeAfterJudge(group6BlockIds, 'finalAssembler'))
    .addConditionalEdges('finalJudge', routeAfterJudge(CAREER_PLAYBOOK_FINAL_BLOCK_ORDER, END))
    .addConditionalEdges('blockRegenerator', routeAfterBlockRegeneration);

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
