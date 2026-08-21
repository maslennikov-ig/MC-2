import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookNodeCost,
  CareerPlaybookQAData,
  CareerPlaybookQualityIssue,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import type {
  CareerPlaybookGraphStateType,
  CareerPlaybookGraphStateUpdate,
  CareerPlaybookGroupKey,
  CareerPlaybookGroupResult,
  CareerPlaybookGraphNode,
} from '../state';
import {
  buildCareerPlaybookAbortedAttemptCosts,
  CareerPlaybookLLMCallError,
  createCareerPlaybookRuntime,
  type CareerPlaybookRuntime,
} from './runtime';
import type { CareerPlaybookWebResearchResult } from '../rag/web-research';
import {
  formatCareerPlaybookEvidenceLedgerForPrompt,
  formatCareerPlaybookMetricLedgerForPrompt,
  getCareerPlaybookEvidenceLedger,
  getCareerPlaybookMetricLedger,
} from './quality-ledger';
import { buildCareerPlaybookPriorBlocksDigest } from './prior-blocks-digest';

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
  qaData?: CareerPlaybookQAData;
  webResearch?: CareerPlaybookWebResearchResult | null;
  /** Blocks accepted by earlier groups; source of the anti-contradiction digest. */
  generatedBlocks?: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
}

export interface GenerateCareerPlaybookGroupResult {
  group: CareerPlaybookGroupResult;
  blocks: Record<CareerPlaybookBlockId, CareerPlaybookBlockState>;
  qualityIssues: CareerPlaybookQualityIssue[];
  nodeCost: CareerPlaybookNodeCost;
  /** Unknown-cost rows for attempts that never returned before this call succeeded. */
  abortedCosts: CareerPlaybookNodeCost[];
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
    heading_block_5: '## 5. Матрица полномочий',
    heading_block_6: '## 6. KPI и метрики',
    heading_block_7: '## 7. Необходимые компетенции',
    heading_block_8: '## 8. Инструменты и технологии',
    heading_block_9: '## 9. Как ИИ меняет эту роль',
    heading_block_10: '## 10. Взаимодействие и зависимости',
    heading_block_11: '## 11. Карьерный рост',
    heading_block_12: '## 12. Профиль кандидата',
    heading_block_13: '## 13. Типичный рабочий день',
    heading_block_14: '## 14. Онбординг: первые 5 результатов + план 30-60-90',
    heading_block_15: '## 15. Система мотивации',
    heading_block_16: '## 16. Регламенты и процессы',
    heading_block_17: '## 17. Красные флаги и система раннего предупреждения',
    heading_block_18: '## 18. Частые вопросы',
    heading_block_19: '## 19. Отраслевой контекст',
    heading_block_20: '## 20. Связь с бизнес-целями',
    heading_block_21: '## 21. Как люди обычно проваливаются на этой роли',
    heading_block_22: '## 22. "Как со мной работать" (заполняется сотрудником)',
    heading_block_23: '## 23. Протокол непрерывности',
    heading_block_24: '## 24. Карта роли',
    heading_block_25: '## 25. Когда пересматривать эту инструкцию',
    heading_block_26: '## 26. Чеклист внедрения',
  },
  en: {
    heading_header: '## Header',
    heading_block_1: '## 1. Mission and key results',
    heading_block_2: '## 2. Anti-goals: what this role does NOT do',
    heading_block_3: '## 3. Key responsibility zones',
    heading_block_4: '## 4. Duties',
    heading_block_5: '## 5. Decision authority matrix',
    heading_block_6: '## 6. KPI and metrics',
    heading_block_7: '## 7. Required competencies',
    heading_block_8: '## 8. Tools and technologies',
    heading_block_9: '## 9. How AI changes this role',
    heading_block_10: '## 10. Dependencies and collaboration',
    heading_block_11: '## 11. Career growth',
    heading_block_12: '## 12. Candidate profile',
    heading_block_13: '## 13. Typical working day',
    heading_block_14: '## 14. Onboarding: First 5 Wins + 30-60-90 plan',
    heading_block_15: '## 15. Motivation system',
    heading_block_16: '## 16. Workflows and processes',
    heading_block_17: '## 17. Red flags and early warning system',
    heading_block_18: '## 18. FAQ',
    heading_block_19: '## 19. Industry context',
    heading_block_20: '## 20. Link to business goals',
    heading_block_21: '## 21. How people usually fail in this role',
    heading_block_22: '## 22. "How to work with me" (completed by the employee)',
    heading_block_23: '## 23. Continuity protocol',
    heading_block_24: '## 24. Role Canvas',
    heading_block_25: '## 25. When to review this guide',
    heading_block_26: '## 26. Implementation checklist',
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
  const { blocks, missingBlockIds } = splitCareerPlaybookGroupMarkdownPartial(markdown, groupSpec);
  if (missingBlockIds.length > 0) {
    throw new Error(
      `Career Playbook group ${groupSpec.groupKey} is missing blocks: ${missingBlockIds.join(', ')}`
    );
  }

  return blocks as Record<CareerPlaybookBlockId, string>;
}

function splitCareerPlaybookGroupMarkdownPartial(
  markdown: string,
  groupSpec: CareerPlaybookGroupSpec
): {
  blocks: Partial<Record<CareerPlaybookBlockId, string>>;
  missingBlockIds: CareerPlaybookBlockId[];
} {
  const starts = findBlockStarts(markdown, groupSpec);
  const blocks: Partial<Record<CareerPlaybookBlockId, string>> = {};

  for (const [position, start] of starts.entries()) {
    const next = starts[position + 1];
    blocks[start.block.blockId] = markdown.slice(start.index, next?.index).trim();
  }

  const missingBlockIds = groupSpec.blocks
    .filter(block => !blocks[block.blockId])
    .map(block => block.blockId);

  return { blocks, missingBlockIds };
}

function headingForBlock(
  blockId: CareerPlaybookBlockId,
  blockTitle: string,
  language: string
): string {
  const labels = getGroupHeadingLabels(language);
  if (blockId === 'header') return labels.heading_header;

  const headingKey = `heading_${blockId}` as keyof typeof labels;
  return labels[headingKey] ?? `## ${blockId.replace('block_', '')}. ${blockTitle}`;
}

function fallbackBlockContent(
  block: CareerPlaybookBlockSpec,
  input: GenerateCareerPlaybookGroupInput
): string {
  const language = input.language === 'en' ? 'en' : 'ru';
  const heading = headingForBlock(block.blockId, block.title, language);
  const roleTitle = input.roleProfileSpec.position.title;

  if (block.blockId === 'header') {
    const suffix = language === 'ru' ? 'должностная инструкция' : 'role guide';
    const note =
      language === 'ru'
        ? 'Этот заголовок восстановлен автоматически, потому что модель не вернула обязательный раздел. Проверьте формулировку перед публикацией.'
        : 'This header was restored automatically because the model omitted a required section. Review the wording before publishing.';

    return `${heading}

# ${roleTitle}: ${suffix}

> ${note}`;
  }

  if (language === 'ru') {
    return `${heading}

> Этот раздел восстановлен автоматически, потому что модель не вернула обязательный блок "${block.title}". Проверьте и дополните его вручную или запустите регенерацию блока.

- Что проверить: полноту раздела "${block.title}".
- Что сделать: открыть блок и запустить регенерацию или заполнить раздел вручную.`;
  }

  return `${heading}

> This section was restored automatically because the model omitted the required "${block.title}" block. Review and expand it manually or regenerate the block.

- What to check: completeness of the "${block.title}" section.
- Suggested action: open the block and regenerate it or fill it manually.`;
}

function buildFallbackBlockQualityIssue(
  groupKey: CareerPlaybookGroupKey,
  blockId: CareerPlaybookBlockId,
  blockTitle: string
): CareerPlaybookQualityIssue {
  return {
    id: `system:${blockId}:missing-${groupKey}`,
    source: 'system',
    severity: 'critical',
    blockId,
    title: 'Блок восстановлен автоматически',
    message: `Модель не вернула обязательный блок ${blockId} (${blockTitle}); система сохранила безопасный fallback вместо падения генерации.`,
    suggestion: 'Откройте блок, проверьте содержание и запустите регенерацию блока.',
    action: 'regenerate',
  };
}

function splitCareerPlaybookGroupMarkdownWithFallback(
  markdown: string,
  groupSpec: CareerPlaybookGroupSpec,
  input: GenerateCareerPlaybookGroupInput
): {
  blockContent: Record<CareerPlaybookBlockId, string>;
  qualityIssues: CareerPlaybookQualityIssue[];
} {
  const { blocks, missingBlockIds } = splitCareerPlaybookGroupMarkdownPartial(markdown, groupSpec);
  const qualityIssues: CareerPlaybookQualityIssue[] = [];

  for (const missingBlockId of missingBlockIds) {
    const spec = groupSpec.blocks.find(block => block.blockId === missingBlockId);
    if (!spec) continue;

    blocks[missingBlockId] = fallbackBlockContent(spec, input);
    qualityIssues.push(
      buildFallbackBlockQualityIssue(groupSpec.groupKey, missingBlockId, spec.title)
    );
  }

  return {
    blockContent: blocks as Record<CareerPlaybookBlockId, string>,
    qualityIssues,
  };
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
  const spec = input.roleProfileSpec;
  const prompt = await runtime.renderPrompt(groupSpec.promptKey, {
    spec_json: JSON.stringify(spec, null, 2),
    content_language: input.language,
    // The four contract variables. Passing the spec alone was the structural
    // reason blocks contradicted each other and cited nothing: numbers had no
    // canonical home, sources never left the spec-builder prompt, the model had
    // no idea what today's date was, and no generator could see earlier blocks.
    metric_ledger_md: formatCareerPlaybookMetricLedgerForPrompt(
      getCareerPlaybookMetricLedger(spec)
    ),
    evidence_ledger_md: formatCareerPlaybookEvidenceLedgerForPrompt(
      getCareerPlaybookEvidenceLedger(spec)
    ),
    generated_on: spec.generated_on ?? new Date().toISOString().slice(0, 10),
    prior_blocks_digest: buildCareerPlaybookPriorBlocksDigest(
      input.generatedBlocks ?? {},
      groupSpec.blocks.map(block => block.blockId)
    ),
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
  const { blockContent, qualityIssues } = splitCareerPlaybookGroupMarkdownWithFallback(
    llmResult.content,
    groupSpec,
    input
  );
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
    qualityIssues,
    nodeCost: {
      node: groupSpec.node,
      model: llmResult.model,
      input_tokens: llmResult.inputTokens,
      output_tokens: llmResult.outputTokens,
      cost_usd: llmResult.costUsd,
      ...(llmResult.generationId ? { generation_id: llmResult.generationId } : {}),
      duration_ms: llmResult.durationMs,
      attempts: llmResult.attemptCount,
      outcome: 'succeeded',
    },
    abortedCosts: buildCareerPlaybookAbortedAttemptCosts(groupSpec.node, llmResult.abortedAttempts),
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
          qaData: state.qaData,
          webResearch: state.webResearch,
          generatedBlocks: state.generatedBlocks,
        },
        runtime
      );

      return {
        generatedGroups: { [groupKey]: result.group },
        generatedBlocks: result.blocks,
        ...(result.qualityIssues.length > 0 ? { qualityIssues: result.qualityIssues } : {}),
        nodeCosts: [result.nodeCost, ...result.abortedCosts],
        currentNode: NEXT_GROUP_NODE[groupKey] ?? groupSpec.node,
      };
    } catch (error) {
      return {
        errors: [
          `${groupSpec.node} failed: ${error instanceof Error ? error.message : String(error)}`,
        ],
        nodeCosts:
          error instanceof CareerPlaybookLLMCallError
            ? buildCareerPlaybookAbortedAttemptCosts(groupSpec.node, error.abortedAttempts)
            : [],
        currentNode: groupSpec.node,
      };
    }
  };
}
