import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookNodeCost,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import type {
  CareerPlaybookGraphStateType,
  CareerPlaybookGraphStateUpdate,
  CareerPlaybookGroupKey,
  CareerPlaybookGroupResult,
  CareerPlaybookGraphNode,
} from '../state';
import { createCareerPlaybookRuntime, type CareerPlaybookRuntime } from './runtime';

export interface CareerPlaybookBlockSpec {
  blockId: CareerPlaybookBlockId;
  title: string;
  headingPattern: RegExp;
}

export interface CareerPlaybookGroupSpec {
  groupKey: CareerPlaybookGroupKey;
  promptKey: string;
  phaseName: string;
  node: CareerPlaybookGraphNode;
  blocks: CareerPlaybookBlockSpec[];
}

export interface GenerateCareerPlaybookGroupInput {
  groupKey: CareerPlaybookGroupKey;
  roleProfileSpec: CareerPlaybookRoleProfileSpec;
  language: string;
}

export interface GenerateCareerPlaybookGroupResult {
  group: CareerPlaybookGroupResult;
  blocks: Record<CareerPlaybookBlockId, CareerPlaybookBlockState>;
  nodeCost: CareerPlaybookNodeCost;
}

const GROUP_SPECS: Record<CareerPlaybookGroupKey, CareerPlaybookGroupSpec> = {
  group_1_foundation: {
    groupKey: 'group_1_foundation',
    promptKey: 'career_playbook_group_1_foundation',
    phaseName: 'stage_career_playbook_group_1',
    node: 'group1Generator',
    blocks: [
      { blockId: 'header', title: 'Header', headingPattern: /^##\s+Header\s*$/im },
      {
        blockId: 'block_1',
        title: 'Mission and key results',
        headingPattern: /^##\s+1\.\s+/im,
      },
      {
        blockId: 'block_2',
        title: 'Anti-goals',
        headingPattern: /^##\s+2\.\s+/im,
      },
      {
        blockId: 'block_5',
        title: 'Decision authority matrix',
        headingPattern: /^##\s+5\.\s+/im,
      },
    ],
  },
  group_2_operations: {
    groupKey: 'group_2_operations',
    promptKey: 'career_playbook_group_2_operations',
    phaseName: 'stage_career_playbook_group_2',
    node: 'group2Generator',
    blocks: [
      {
        blockId: 'block_3',
        title: 'Responsibility zones',
        headingPattern: /^##\s+3\.\s+/im,
      },
      {
        blockId: 'block_4',
        title: 'Duties',
        headingPattern: /^##\s+4\.\s+/im,
      },
      {
        blockId: 'block_6',
        title: 'KPI and metrics',
        headingPattern: /^##\s+6\.\s+/im,
      },
      {
        blockId: 'block_8',
        title: 'Tools and technologies',
        headingPattern: /^##\s+8\.\s+/im,
      },
    ],
  },
  group_3_people: {
    groupKey: 'group_3_people',
    promptKey: 'career_playbook_group_3_people',
    phaseName: 'stage_career_playbook_group_3',
    node: 'group3Generator',
    blocks: [
      {
        blockId: 'block_7',
        title: 'Competencies',
        headingPattern: /^##\s+7\.\s+/im,
      },
      {
        blockId: 'block_9',
        title: 'Human-AI collaboration',
        headingPattern: /^##\s+9\.\s+/im,
      },
      {
        blockId: 'block_12',
        title: 'Candidate profile',
        headingPattern: /^##\s+12\.\s+/im,
      },
      {
        blockId: 'block_13',
        title: 'Typical working day',
        headingPattern: /^##\s+13\.\s+/im,
      },
    ],
  },
  group_4_growth: {
    groupKey: 'group_4_growth',
    promptKey: 'career_playbook_group_4_growth',
    phaseName: 'stage_career_playbook_group_4',
    node: 'group4Generator',
    blocks: [
      {
        blockId: 'block_11',
        title: 'Career growth',
        headingPattern: /^##\s+11\.\s+/im,
      },
      {
        blockId: 'block_14',
        title: 'Onboarding',
        headingPattern: /^##\s+14\.\s+/im,
      },
      {
        blockId: 'block_15',
        title: 'Motivation system',
        headingPattern: /^##\s+15\.\s+/im,
      },
      {
        blockId: 'block_17',
        title: 'Red flags',
        headingPattern: /^##\s+17\.\s+/im,
      },
    ],
  },
  group_5_system: {
    groupKey: 'group_5_system',
    promptKey: 'career_playbook_group_5_system',
    phaseName: 'stage_career_playbook_group_5',
    node: 'group5Generator',
    blocks: [
      {
        blockId: 'block_10',
        title: 'Dependencies',
        headingPattern: /^##\s+10\.\s+/im,
      },
      {
        blockId: 'block_16',
        title: 'Processes',
        headingPattern: /^##\s+16\.\s+/im,
      },
      {
        blockId: 'block_19',
        title: 'Industry context',
        headingPattern: /^##\s+19\.\s+/im,
      },
      {
        blockId: 'block_20',
        title: 'Business goals',
        headingPattern: /^##\s+20\.\s+/im,
      },
      {
        blockId: 'block_21',
        title: 'Failure modes',
        headingPattern: /^##\s+21\.\s+/im,
      },
    ],
  },
  group_6_wrap: {
    groupKey: 'group_6_wrap',
    promptKey: 'career_playbook_group_6_wrap',
    phaseName: 'stage_career_playbook_group_6',
    node: 'group6Generator',
    blocks: [
      {
        blockId: 'block_18',
        title: 'FAQ',
        headingPattern: /^##\s+18\.\s+/im,
      },
      {
        blockId: 'block_22',
        title: 'Working with me README',
        headingPattern: /^##\s+22\.\s+/im,
      },
      {
        blockId: 'block_23',
        title: 'Continuity protocol',
        headingPattern: /^##\s+23\.\s+/im,
      },
      {
        blockId: 'block_24',
        title: 'Role Canvas',
        headingPattern: /^##\s+24\.\s+/im,
      },
      {
        blockId: 'block_25',
        title: 'Footer and revision cadence',
        headingPattern: /^##\s+25\.\s+/im,
      },
      {
        blockId: 'block_26',
        title: 'Implementation checklist',
        headingPattern: /^##\s+26\.\s+/im,
      },
    ],
  },
};

const NEXT_GROUP_NODE: Partial<Record<CareerPlaybookGroupKey, CareerPlaybookGraphNode>> = {
  group_1_foundation: 'group2Generator',
  group_2_operations: 'group3Generator',
  group_3_people: 'group4Generator',
  group_4_growth: 'group5Generator',
  group_5_system: 'group6Generator',
};

const GROUP_HEADING_LABELS = {
  ru: {
    heading_header: '## Header',
    heading_block_1: '## 1. Миссия и ключевые результаты',
    heading_block_2: '## 2. Анти-цели: что эта роль НЕ делает',
    heading_block_3: '## 3. Ключевые зоны ответственности',
    heading_block_4: '## 4. Обязанности',
    heading_block_5: '## 5. Матрица решений (Decision Authority)',
    heading_block_6: '## 6. KPI и метрики',
    heading_block_8: '## 8. Инструменты и технологии',
  },
  en: {
    heading_header: '## Header',
    heading_block_1: '## 1. Mission and key results',
    heading_block_2: '## 2. Anti-goals: what this role does NOT do',
    heading_block_3: '## 3. Key responsibility zones',
    heading_block_4: '## 4. Duties',
    heading_block_5: '## 5. Decision authority matrix',
    heading_block_6: '## 6. KPI and metrics',
    heading_block_8: '## 8. Tools and technologies',
  },
} as const;

function getGroupHeadingLabels(language: string) {
  return language === 'en' ? GROUP_HEADING_LABELS.en : GROUP_HEADING_LABELS.ru;
}

export function getCareerPlaybookGroupSpec(
  groupKey: CareerPlaybookGroupKey
): CareerPlaybookGroupSpec {
  return GROUP_SPECS[groupKey];
}

function findBlockStarts(markdown: string, groupSpec: CareerPlaybookGroupSpec) {
  return groupSpec.blocks
    .map(block => {
      const match = markdown.match(block.headingPattern);
      return match?.index === undefined ? null : { block, index: match.index };
    })
    .filter((entry): entry is { block: CareerPlaybookBlockSpec; index: number } => entry !== null)
    .sort((a, b) => a.index - b.index);
}

export function splitCareerPlaybookGroupMarkdown(
  markdown: string,
  groupSpec: CareerPlaybookGroupSpec
): Record<CareerPlaybookBlockId, string> {
  const starts = findBlockStarts(markdown, groupSpec);
  const blocks: Partial<Record<CareerPlaybookBlockId, string>> = {};

  for (const [position, start] of starts.entries()) {
    const next = starts[position + 1];
    blocks[start.block.blockId] = markdown.slice(start.index, next?.index).trim();
  }

  const missingBlockIds = groupSpec.blocks
    .filter(block => !blocks[block.blockId])
    .map(block => block.blockId);
  if (missingBlockIds.length > 0) {
    throw new Error(
      `Career Playbook group ${groupSpec.groupKey} is missing blocks: ${missingBlockIds.join(', ')}`
    );
  }

  return blocks as Record<CareerPlaybookBlockId, string>;
}

function toGeneratedBlocks(
  blockContent: Record<CareerPlaybookBlockId, string>,
  model: string,
  generatedAt: string
): Record<CareerPlaybookBlockId, CareerPlaybookBlockState> {
  const entries = Object.entries(blockContent).map(([blockId, content]) => [
    blockId,
    {
      content,
      status: 'generated',
      judge_verdict: null,
      generated_at: generatedAt,
      llm_model: model,
      attempt: 1,
    },
  ]);

  return Object.fromEntries(entries) as Record<CareerPlaybookBlockId, CareerPlaybookBlockState>;
}

export async function generateCareerPlaybookGroup(
  input: GenerateCareerPlaybookGroupInput,
  runtime: CareerPlaybookRuntime = createCareerPlaybookRuntime()
): Promise<GenerateCareerPlaybookGroupResult> {
  const groupSpec = getCareerPlaybookGroupSpec(input.groupKey);
  const prompt = await runtime.renderPrompt(groupSpec.promptKey, {
    spec_json: JSON.stringify(input.roleProfileSpec, null, 2),
    content_language: input.language,
    ...getGroupHeadingLabels(input.language),
  });
  const llmResult = await runtime.invokeLLM(prompt, {
    phaseName: groupSpec.phaseName,
    promptKey: groupSpec.promptKey,
    node: groupSpec.node,
    temperature: 0.7,
    maxTokens: 14_000,
  });
  const generatedAt = new Date().toISOString();
  const blockContent = splitCareerPlaybookGroupMarkdown(llmResult.content, groupSpec);
  const blocks = toGeneratedBlocks(blockContent, llmResult.model, generatedAt);

  return {
    group: {
      groupKey: input.groupKey,
      promptKey: groupSpec.promptKey,
      markdown: llmResult.content,
      blockIds: groupSpec.blocks.map(block => block.blockId),
      generatedAt,
      model: llmResult.model,
    },
    blocks,
    nodeCost: {
      node: groupSpec.node,
      model: llmResult.model,
      input_tokens: llmResult.inputTokens,
      output_tokens: llmResult.outputTokens,
      cost_usd: llmResult.costUsd,
    },
  };
}

export function createGroupGeneratorNode(
  groupKey: CareerPlaybookGroupKey,
  runtime: CareerPlaybookRuntime = createCareerPlaybookRuntime()
) {
  const groupSpec = getCareerPlaybookGroupSpec(groupKey);

  return async function groupGeneratorNode(
    state: CareerPlaybookGraphStateType
  ): Promise<CareerPlaybookGraphStateUpdate> {
    if (!state.roleProfileSpec) {
      return {
        errors: [`${groupSpec.node} failed: roleProfileSpec is missing`],
        currentNode: groupSpec.node,
      };
    }

    try {
      const result = await generateCareerPlaybookGroup(
        {
          groupKey,
          roleProfileSpec: state.roleProfileSpec,
          language: state.language,
        },
        runtime
      );

      return {
        generatedGroups: { [groupKey]: result.group },
        generatedBlocks: result.blocks,
        nodeCosts: [result.nodeCost],
        currentNode: NEXT_GROUP_NODE[groupKey] ?? groupSpec.node,
      };
    } catch (error) {
      return {
        errors: [
          `${groupSpec.node} failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
        currentNode: groupSpec.node,
      };
    }
  };
}
