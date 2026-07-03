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
  CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS,
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

type CareerPlaybookGroupGeneratorNodeName = (typeof GROUP_PIPELINE)[number]['generatorNode'];
type CareerPlaybookGroupJudgeNodeName = (typeof GROUP_PIPELINE)[number]['judgeNode'];

const CAREER_PLAYBOOK_GRAPH_REGENERATION_STEP_COST = 2;
const CAREER_PLAYBOOK_GRAPH_RECURSION_BUFFER_STEPS = 5;

export const CAREER_PLAYBOOK_GRAPH_BASE_STEP_COUNT = 1 + GROUP_PIPELINE.length * 2 + 2;
export const DEFAULT_CAREER_PLAYBOOK_GRAPH_RECURSION_LIMIT =
  CAREER_PLAYBOOK_GRAPH_BASE_STEP_COUNT +
  CAREER_PLAYBOOK_FINAL_BLOCK_ORDER.length *
    CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS *
    CAREER_PLAYBOOK_GRAPH_REGENERATION_STEP_COST +
  CAREER_PLAYBOOK_GRAPH_RECURSION_BUFFER_STEPS;

export function getCareerPlaybookGraphRecursionLimit(
  value = process.env.CAREER_PLAYBOOK_GRAPH_RECURSION_LIMIT
): number {
  if (!value) {
    return DEFAULT_CAREER_PLAYBOOK_GRAPH_RECURSION_LIMIT;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < DEFAULT_CAREER_PLAYBOOK_GRAPH_RECURSION_LIMIT) {
    return DEFAULT_CAREER_PLAYBOOK_GRAPH_RECURSION_LIMIT;
  }

  return parsed;
}

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

  if (group) {
    return group.judgeNode;
  }

  // Post-assembly regeneration: the finalJudge window spans the full final-block
  // order rather than a single group, so no group matches here. Route back through
  // finalAssembler so finalMarkdown is re-derived from the regenerated blocks and
  // stays in sync with generatedBlocks before finalJudge/END. Routing straight to
  // finalJudge would leave finalMarkdown stale while generatedBlocks moved on, and
  // the handler persists both.
  return 'finalAssembler';
}

function routeAfterSpecBuilder(state: CareerPlaybookGraphStateType) {
  if ((state.errors?.length ?? 0) > 0 || !state.roleProfileSpec) {
    return END;
  }

  return 'group1Generator';
}

export function createCareerPlaybookGraph(options: CreateCareerPlaybookGraphOptions = {}) {
  const runtime = options.runtime ?? createCareerPlaybookRuntime();

  // Data-drive the six group generator/judge nodes from GROUP_PIPELINE so node
  // names, withProgress wrapping, and per-group block IDs stay in a single source
  // of truth. Batch addNode preserves the literal node-name union in the graph
  // type so the explicit edges below remain type-checked.
  const groupGeneratorNodes = Object.fromEntries(
    GROUP_PIPELINE.map(entry => [
      entry.generatorNode,
      withProgress(
        entry.generatorNode,
        createGroupGeneratorNode(entry.groupKey, runtime),
        options.progressReporter
      ),
    ])
  ) as Record<CareerPlaybookGroupGeneratorNodeName, CareerPlaybookNodeFunction>;

  const groupJudgeNodes = Object.fromEntries(
    GROUP_PIPELINE.map(entry => [
      entry.judgeNode,
      withProgress(
        entry.judgeNode,
        createCrossBlockJudgeNode({
          runtime,
          useLLMJudge: true,
          currentBlockIds: getGroupBlockIds(entry.groupKey),
        }),
        options.progressReporter
      ),
    ])
  ) as Record<CareerPlaybookGroupJudgeNodeName, CareerPlaybookNodeFunction>;

  const builder = new StateGraph(CareerPlaybookGraphState)
    .addNode(
      'specBuilder',
      withProgress(
        'specBuilder',
        createSpecBuilderNode({ ...options.specBuilder, runtime }),
        options.progressReporter
      )
    )
    .addNode(groupGeneratorNodes)
    .addNode('blockRegenerator', createBlockRegeneratorNode(runtime))
    .addNode(
      'finalAssembler',
      withProgress('finalAssembler', createFinalAssemblerNode(), options.progressReporter)
    )
    .addNode(groupJudgeNodes)
    .addNode(
      'finalJudge',
      withProgress(
        'finalJudge',
        createCrossBlockJudgeNode({ runtime, useLLMJudge: true }),
        options.progressReporter
      )
    );

  builder
    .addEdge(START, 'specBuilder')
    .addConditionalEdges('specBuilder', routeAfterSpecBuilder)
    .addEdge('finalAssembler', 'finalJudge')
    .addConditionalEdges('finalJudge', routeAfterJudge(CAREER_PLAYBOOK_FINAL_BLOCK_ORDER, END))
    .addConditionalEdges('blockRegenerator', routeAfterBlockRegeneration);

  for (const entry of GROUP_PIPELINE) {
    builder.addEdge(entry.generatorNode, entry.judgeNode);
  }
  for (const entry of GROUP_PIPELINE) {
    builder.addConditionalEdges(
      entry.judgeNode,
      routeAfterJudge(getGroupBlockIds(entry.groupKey), entry.nextNode)
    );
  }

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
