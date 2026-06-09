import { END, START, StateGraph } from '@langchain/langgraph';
import type {
  CareerPlaybookBlockId,
  CareerPlaybookGenerationProgress,
  CareerPlaybookGenerationProgressStage,
} from '@megacampus/shared-types';
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
import type {
  CareerPlaybookGraphStateType,
  CareerPlaybookGraphStateUpdate,
  CareerPlaybookGroupKey,
} from './state';

export interface CreateCareerPlaybookGraphOptions {
  runtime?: CareerPlaybookRuntime;
  specBuilder?: Omit<CreateSpecBuilderNodeOptions, 'runtime'>;
  progressReporter?: (progress: CareerPlaybookGenerationProgress) => Promise<void> | void;
}

type CareerPlaybookNodeFunction = (
  state: CareerPlaybookGraphStateType
) => Promise<CareerPlaybookGraphStateUpdate> | CareerPlaybookGraphStateUpdate;

const NODE_PROGRESS: Record<
  string,
  { stage: CareerPlaybookGenerationProgressStage; percent: number }
> = {
  specBuilder: { stage: 'building_profile', percent: 72 },
  group1Generator: { stage: 'generating_foundation', percent: 76 },
  group1Judge: { stage: 'reviewing_foundation', percent: 78 },
  group2Generator: { stage: 'generating_operations', percent: 81 },
  group2Judge: { stage: 'reviewing_operations', percent: 83 },
  group3Generator: { stage: 'generating_people', percent: 86 },
  group3Judge: { stage: 'reviewing_people', percent: 88 },
  group4Generator: { stage: 'generating_growth', percent: 90 },
  group4Judge: { stage: 'reviewing_growth', percent: 92 },
  group5Generator: { stage: 'generating_system', percent: 94 },
  group5Judge: { stage: 'reviewing_system', percent: 95 },
  group6Generator: { stage: 'generating_wrap', percent: 96 },
  group6Judge: { stage: 'reviewing_wrap', percent: 97 },
  finalAssembler: { stage: 'assembling', percent: 98 },
  finalJudge: { stage: 'final_review', percent: 99 },
};

function withProgress<T extends CareerPlaybookNodeFunction>(
  nodeName: string,
  node: T,
  reporter?: CreateCareerPlaybookGraphOptions['progressReporter']
): T {
  if (!reporter) return node;

  return (async (state: CareerPlaybookGraphStateType) => {
    const progress = NODE_PROGRESS[nodeName];
    if (progress) {
      await reporter(progress);
    }

    return node(state);
  }) as T;
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
    .addNode(
      'specBuilder',
      withProgress(
        'specBuilder',
        createSpecBuilderNode({ ...options.specBuilder, runtime }),
        options.progressReporter
      )
    )
    .addNode(
      'group1Generator',
      withProgress(
        'group1Generator',
        createGroupGeneratorNode('group_1_foundation', runtime),
        options.progressReporter
      )
    )
    .addNode(
      'group2Generator',
      withProgress(
        'group2Generator',
        createGroupGeneratorNode('group_2_operations', runtime),
        options.progressReporter
      )
    )
    .addNode(
      'group3Generator',
      withProgress(
        'group3Generator',
        createGroupGeneratorNode('group_3_people', runtime),
        options.progressReporter
      )
    )
    .addNode(
      'group4Generator',
      withProgress(
        'group4Generator',
        createGroupGeneratorNode('group_4_growth', runtime),
        options.progressReporter
      )
    )
    .addNode(
      'group5Generator',
      withProgress(
        'group5Generator',
        createGroupGeneratorNode('group_5_system', runtime),
        options.progressReporter
      )
    )
    .addNode(
      'group6Generator',
      withProgress(
        'group6Generator',
        createGroupGeneratorNode('group_6_wrap', runtime),
        options.progressReporter
      )
    )
    .addNode('blockRegenerator', createBlockRegeneratorNode(runtime))
    .addNode(
      'finalAssembler',
      withProgress('finalAssembler', createFinalAssemblerNode(), options.progressReporter)
    )
    .addNode(
      'group1Judge',
      withProgress(
        'group1Judge',
        createCrossBlockJudgeNode({
          runtime,
          useLLMJudge: true,
          currentBlockIds: group1BlockIds,
        }),
        options.progressReporter
      )
    )
    .addNode(
      'group2Judge',
      withProgress(
        'group2Judge',
        createCrossBlockJudgeNode({
          runtime,
          useLLMJudge: true,
          currentBlockIds: group2BlockIds,
        }),
        options.progressReporter
      )
    )
    .addNode(
      'group3Judge',
      withProgress(
        'group3Judge',
        createCrossBlockJudgeNode({
          runtime,
          useLLMJudge: true,
          currentBlockIds: group3BlockIds,
        }),
        options.progressReporter
      )
    )
    .addNode(
      'group4Judge',
      withProgress(
        'group4Judge',
        createCrossBlockJudgeNode({
          runtime,
          useLLMJudge: true,
          currentBlockIds: group4BlockIds,
        }),
        options.progressReporter
      )
    )
    .addNode(
      'group5Judge',
      withProgress(
        'group5Judge',
        createCrossBlockJudgeNode({
          runtime,
          useLLMJudge: true,
          currentBlockIds: group5BlockIds,
        }),
        options.progressReporter
      )
    )
    .addNode(
      'group6Judge',
      withProgress(
        'group6Judge',
        createCrossBlockJudgeNode({
          runtime,
          useLLMJudge: true,
          currentBlockIds: group6BlockIds,
        }),
        options.progressReporter
      )
    )
    .addNode(
      'finalJudge',
      withProgress(
        'finalJudge',
        createCrossBlockJudgeNode({ runtime, useLLMJudge: true }),
        options.progressReporter
      )
    )
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

export function getCareerPlaybookGraph(options: CreateCareerPlaybookGraphOptions = {}) {
  if (options.progressReporter) {
    return createCareerPlaybookGraph(options);
  }

  if (!compiledGraph) {
    compiledGraph = createCareerPlaybookGraph();
    logger.debug('Career Playbook graph compiled');
  }
  return compiledGraph;
}

export function resetCareerPlaybookGraph(): void {
  compiledGraph = null;
}
