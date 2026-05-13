import { extractJSON, safeJSONParse } from '@megacampus/shared-utils';
import {
  CareerPlaybookJudgeVerdictSchema,
  type CareerPlaybookBlockId,
  type CareerPlaybookBlockState,
  type CareerPlaybookJudgeIssue,
  type CareerPlaybookJudgeVerdict,
  type CareerPlaybookNodeCost,
} from '@megacampus/shared-types';
import type {
  CareerPlaybookGraphStateType,
  CareerPlaybookGraphStateUpdate,
  CareerPlaybookGroupResult,
  CareerPlaybookGraphNode,
} from '../state';
import { createCareerPlaybookRuntime, type CareerPlaybookRuntime } from './runtime';

const JUDGE_PROMPT_KEY = 'career_playbook_cross_block_judge';
const JUDGE_PHASE = 'stage_career_playbook_judge';

export interface MermaidDiagramRequirement {
  blockId: CareerPlaybookBlockId;
  label: string;
  minDiagrams: number;
}

export interface ValidateMermaidCoverageOptions {
  requirements?: MermaidDiagramRequirement[];
  requireAll?: boolean;
}

export interface RunDeterministicChecksInput {
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
  mermaid?: ValidateMermaidCoverageOptions;
}

export interface CreateCrossBlockJudgeNodeOptions {
  currentBlockIds?: CareerPlaybookBlockId[];
  useLLMJudge?: boolean;
  runtime?: CareerPlaybookRuntime;
  currentNode?: CareerPlaybookGraphNode;
}

export const CAREER_PLAYBOOK_MERMAID_REQUIREMENTS: MermaidDiagramRequirement[] = [
  { blockId: 'block_10', label: 'dependencies', minDiagrams: 1 },
  { blockId: 'block_11', label: 'career path', minDiagrams: 1 },
  { blockId: 'block_16', label: 'main process', minDiagrams: 1 },
];

const TABLE_SEPARATOR_PATTERN = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.includes('|', 1);
}

function isNonEmptyTableRow(line: string): boolean {
  return (
    line
      .split('|')
      .map(cell => cell.trim())
      .filter(Boolean).length > 0
  );
}

function countMarkdownTableBodyRows(markdown: string): number {
  const lines = markdown.split(/\r?\n/);
  let total = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (!TABLE_SEPARATOR_PATTERN.test(lines[index])) {
      continue;
    }

    let rowIndex = index + 1;
    while (rowIndex < lines.length && isTableLine(lines[rowIndex])) {
      if (!TABLE_SEPARATOR_PATTERN.test(lines[rowIndex]) && isNonEmptyTableRow(lines[rowIndex])) {
        total += 1;
      }
      rowIndex += 1;
    }
  }

  return total;
}

function countMarkdownListItems(markdown: string): number {
  return markdown.split(/\r?\n/).filter(line => /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line)).length;
}

function countStructuredItems(markdown: string): number {
  return Math.max(countMarkdownTableBodyRows(markdown), countMarkdownListItems(markdown));
}

function buildMinimumIssue(
  blockId: CareerPlaybookBlockId,
  label: string,
  found: number,
  minimum: number
): CareerPlaybookJudgeIssue {
  return {
    block_id: blockId,
    severity: 'critical',
    description: `Expected ${blockId} to contain at least ${minimum} ${label}; found ${found}.`,
    suggestion: `Add concrete rows until ${blockId} has at least ${minimum} ${label}.`,
  };
}

export function validateAntiGoalsMinimum(
  markdown: string,
  minimum = 4
): CareerPlaybookJudgeIssue[] {
  const found = countStructuredItems(markdown);
  return found >= minimum ? [] : [buildMinimumIssue('block_2', 'anti-goals', found, minimum)];
}

export function validateDecisionMatrixMinimum(
  markdown: string,
  minimum = 4
): CareerPlaybookJudgeIssue[] {
  const found = countStructuredItems(markdown);
  return found >= minimum ? [] : [buildMinimumIssue('block_5', 'decisions', found, minimum)];
}

export function validateFailureModesMinimum(
  markdown: string,
  minimum = 3
): CareerPlaybookJudgeIssue[] {
  const found = countStructuredItems(markdown);
  return found >= minimum ? [] : [buildMinimumIssue('block_21', 'failure modes', found, minimum)];
}

export function countMermaidDiagrams(markdown: string): number {
  return markdown.match(/```mermaid[\s\S]*?```/gi)?.length ?? 0;
}

export function validateMermaidCoverage(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  options: ValidateMermaidCoverageOptions = {}
): CareerPlaybookJudgeIssue[] {
  const requirements = options.requirements ?? CAREER_PLAYBOOK_MERMAID_REQUIREMENTS;
  const applicableRequirements = options.requireAll
    ? requirements
    : requirements.filter(requirement => Boolean(generatedBlocks[requirement.blockId]?.content));

  return applicableRequirements.flatMap(requirement => {
    const content = generatedBlocks[requirement.blockId]?.content ?? '';
    const found = countMermaidDiagrams(content);

    if (found >= requirement.minDiagrams) {
      return [];
    }

    return [
      {
        block_id: requirement.blockId,
        severity: 'critical',
        description: `Expected ${requirement.label} Mermaid coverage in ${requirement.blockId}: at least ${requirement.minDiagrams} diagram(s), found ${found}.`,
        suggestion: `Add a fenced mermaid diagram for the ${requirement.label} view.`,
      } satisfies CareerPlaybookJudgeIssue,
    ];
  });
}

function scoreFromIssues(issues: CareerPlaybookJudgeIssue[]): number {
  return Math.max(
    0,
    100 -
      issues.reduce((penalty, issue) => {
        if (issue.severity === 'critical') return penalty + 20;
        if (issue.severity === 'warning') return penalty + 10;
        return penalty + 5;
      }, 0)
  );
}

function uniqueBlockIds(blockIds: CareerPlaybookBlockId[]): CareerPlaybookBlockId[] {
  return Array.from(new Set(blockIds));
}

function verdictFromIssues(issues: CareerPlaybookJudgeIssue[]): CareerPlaybookJudgeVerdict {
  const needsRegeneration = uniqueBlockIds(
    issues.filter(issue => issue.severity !== 'info').map(issue => issue.block_id)
  );

  return {
    pass: issues.length === 0,
    score: scoreFromIssues(issues),
    issues,
    needs_regeneration: needsRegeneration,
  };
}

export function runCareerPlaybookDeterministicChecks(
  input: RunDeterministicChecksInput
): CareerPlaybookJudgeVerdict {
  const { generatedBlocks } = input;
  const issues: CareerPlaybookJudgeIssue[] = [];

  const antiGoals = generatedBlocks.block_2?.content;
  if (antiGoals) {
    issues.push(...validateAntiGoalsMinimum(antiGoals));
  }

  const decisionMatrix = generatedBlocks.block_5?.content;
  if (decisionMatrix) {
    issues.push(...validateDecisionMatrixMinimum(decisionMatrix));
  }

  const failureModes = generatedBlocks.block_21?.content;
  if (failureModes) {
    issues.push(...validateFailureModesMinimum(failureModes));
  }

  issues.push(...validateMermaidCoverage(generatedBlocks, input.mermaid));

  return verdictFromIssues(issues);
}

export function parseCareerPlaybookJudgeVerdict(rawContent: string): CareerPlaybookJudgeVerdict {
  const parsed = safeJSONParse(extractJSON(rawContent));
  return CareerPlaybookJudgeVerdictSchema.parse(parsed);
}

function mergeJudgeVerdicts(
  deterministic: CareerPlaybookJudgeVerdict,
  llm: CareerPlaybookJudgeVerdict
): CareerPlaybookJudgeVerdict {
  return {
    pass: deterministic.pass && llm.pass,
    score: Math.min(deterministic.score, llm.score),
    issues: [...deterministic.issues, ...llm.issues],
    needs_regeneration: uniqueBlockIds([
      ...deterministic.needs_regeneration,
      ...llm.needs_regeneration,
    ]),
  };
}

function buildNodeCost(result: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}): CareerPlaybookNodeCost {
  return {
    node: 'crossBlockJudge',
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: result.costUsd,
  };
}

function selectGeneratedBlocks(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  blockIds?: CareerPlaybookBlockId[]
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  if (!blockIds) {
    return generatedBlocks;
  }

  return Object.fromEntries(
    blockIds
      .map(blockId => [blockId, generatedBlocks[blockId]] as const)
      .filter((entry): entry is readonly [CareerPlaybookBlockId, CareerPlaybookBlockState] =>
        Boolean(entry[1])
      )
  );
}

function joinBlockMarkdown(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>
): string {
  return Object.entries(generatedBlocks)
    .map(([, blockState]) => blockState?.content)
    .filter((content): content is string => Boolean(content))
    .join('\n\n');
}

function groupContainsAnyBlock(
  group: CareerPlaybookGroupResult,
  blockIds: CareerPlaybookBlockId[]
): boolean {
  return group.blockIds.some(blockId => blockIds.includes(blockId));
}

function joinPreviousGroupMarkdown(
  generatedGroups: Partial<Record<string, CareerPlaybookGroupResult>>,
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  currentBlockIds: CareerPlaybookBlockId[]
): string {
  return Object.values(generatedGroups)
    .filter((group): group is CareerPlaybookGroupResult => Boolean(group))
    .filter(group => !groupContainsAnyBlock(group, currentBlockIds))
    .map(group => {
      const regeneratedMarkdown = group.blockIds
        .map(blockId => generatedBlocks[blockId]?.content)
        .filter((content): content is string => Boolean(content))
        .join('\n\n');

      return regeneratedMarkdown || group.markdown;
    })
    .join('\n\n');
}

function attachVerdictToBlocks(
  generatedBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>,
  verdict: CareerPlaybookJudgeVerdict
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  return Object.fromEntries(
    Object.entries(generatedBlocks).map(([blockId, blockState]) => [
      blockId,
      blockState
        ? {
            ...blockState,
            judge_verdict: verdict,
          }
        : blockState,
    ])
  );
}

export function createCrossBlockJudgeNode(options: CreateCrossBlockJudgeNodeOptions = {}) {
  const runtime = options.runtime ?? createCareerPlaybookRuntime();

  return async function crossBlockJudgeNode(
    state: CareerPlaybookGraphStateType
  ): Promise<CareerPlaybookGraphStateUpdate> {
    const currentBlocks = selectGeneratedBlocks(state.generatedBlocks, options.currentBlockIds);
    const currentBlockIds = Object.keys(currentBlocks);

    if (currentBlockIds.length === 0) {
      return {
        errors: ['crossBlockJudge failed: no generated blocks to judge'],
        currentNode: options.currentNode ?? 'crossBlockJudge',
      };
    }

    const deterministicVerdict = runCareerPlaybookDeterministicChecks({
      generatedBlocks: currentBlocks,
    });

    let verdict = deterministicVerdict;
    const nodeCosts: CareerPlaybookNodeCost[] = [];

    if (options.useLLMJudge) {
      if (!state.roleProfileSpec) {
        return {
          generatedBlocks: attachVerdictToBlocks(currentBlocks, deterministicVerdict),
          lastJudgeVerdict: deterministicVerdict,
          lastJudgedBlockIds: currentBlockIds,
          errors: ['crossBlockJudge failed: roleProfileSpec is missing'],
          currentNode: options.currentNode ?? 'crossBlockJudge',
        };
      }

      try {
        const prompt = await runtime.renderPrompt(JUDGE_PROMPT_KEY, {
          group_id: currentBlockIds.join(', '),
          spec_json: JSON.stringify(state.roleProfileSpec, null, 2),
          prev_groups_content:
            joinPreviousGroupMarkdown(
              state.generatedGroups,
              state.generatedBlocks,
              currentBlockIds
            ) || 'none',
          current_group_content: joinBlockMarkdown(currentBlocks),
        });
        const llmResult = await runtime.invokeLLM(prompt, {
          phaseName: JUDGE_PHASE,
          promptKey: JUDGE_PROMPT_KEY,
          node: 'crossBlockJudge',
          temperature: 0.2,
          maxTokens: 4_000,
        });
        const llmVerdict = parseCareerPlaybookJudgeVerdict(llmResult.content);
        verdict = mergeJudgeVerdicts(deterministicVerdict, llmVerdict);
        nodeCosts.push(buildNodeCost(llmResult));
      } catch (error) {
        return {
          generatedBlocks: attachVerdictToBlocks(currentBlocks, deterministicVerdict),
          lastJudgeVerdict: deterministicVerdict,
          lastJudgedBlockIds: currentBlockIds,
          errors: [
            `crossBlockJudge failed: ${error instanceof Error ? error.message : String(error)}`,
          ],
          currentNode: options.currentNode ?? 'crossBlockJudge',
        };
      }
    }

    return {
      generatedBlocks: attachVerdictToBlocks(currentBlocks, verdict),
      judgeVerdicts: [verdict],
      lastJudgeVerdict: verdict,
      lastJudgedBlockIds: currentBlockIds,
      nodeCosts,
      currentNode: options.currentNode ?? 'crossBlockJudge',
    };
  };
}

export const crossBlockJudgeNode = createCrossBlockJudgeNode();
