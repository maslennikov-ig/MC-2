import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookJudgeIssue,
  CareerPlaybookJudgeVerdict,
  CareerPlaybookNodeCost,
  CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import { CAREER_PLAYBOOK_FINAL_BLOCK_ORDER } from './final-assembler';
import { createCareerPlaybookRuntime, type CareerPlaybookRuntime } from './runtime';
import { annotateCareerPlaybookBlockNumericFacts } from '../numeric-facts';
import type { CareerPlaybookGraphStateType, CareerPlaybookGraphStateUpdate } from '../state';

export const BLOCK_REGENERATOR_PROMPT_KEY = 'career_playbook_block_regenerator';
export const BLOCK_REGENERATOR_PHASE = 'stage_career_playbook_regenerator';
export const CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS = 2;
export const CAREER_PLAYBOOK_MAX_JUDGE_WINDOW_REGENERATION_ATTEMPTS = 2;

const BLOCK_NAMES: Record<CareerPlaybookBlockId, string> = {
  header: 'Header',
  block_1: 'Mission and key results',
  block_2: 'Anti-goals',
  block_3: 'Responsibility zones',
  block_4: 'Duties',
  block_5: 'Decision authority matrix',
  block_6: 'KPI and metrics',
  block_7: 'Competencies',
  block_8: 'Tools and technologies',
  block_9: 'Human-AI collaboration',
  block_10: 'Dependencies',
  block_11: 'Career path',
  block_12: 'Candidate profile',
  block_13: 'Day in the life',
  block_14: 'Onboarding',
  block_15: 'Motivation',
  block_16: 'Main process',
  block_17: 'Red flags',
  block_18: 'FAQ',
  block_19: 'Industry context',
  block_20: 'Business model',
  block_21: 'Failure modes',
  block_22: 'Role README',
  block_23: 'Continuity plan',
  block_24: 'Role Canvas',
  block_25: 'Footer',
  block_26: 'Implementation checklist',
};

export interface RegenerateCareerPlaybookBlockInput {
  blockId: CareerPlaybookBlockId;
  roleProfileSpec: CareerPlaybookRoleProfileSpec;
  language: string;
  originalBlock?: CareerPlaybookBlockState | null;
  issue: Pick<CareerPlaybookJudgeIssue, 'description' | 'suggestion'>;
  userInstruction?: string | null;
  otherBlocks?: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>>;
  otherBlocksBrief?: string;
  now?: () => Date;
}

export interface RegenerateCareerPlaybookBlockResult {
  blockId: CareerPlaybookBlockId;
  block: CareerPlaybookBlockState;
  nodeCost: CareerPlaybookNodeCost;
}

export interface CareerPlaybookPendingRegeneration {
  blockId: CareerPlaybookBlockId;
  issue: CareerPlaybookJudgeIssue;
  attempts: number;
}

function compactMarkdown(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

export function getCareerPlaybookBlockName(blockId: CareerPlaybookBlockId): string {
  return BLOCK_NAMES[blockId];
}

function getExpectedHeadingPattern(blockId: CareerPlaybookBlockId): RegExp {
  if (blockId === 'header') {
    return /^##\s+Header\s*$/im;
  }

  const blockNumber = blockId.replace('block_', '');
  return new RegExp(`^##\\s+${blockNumber}\\.\\s+`, 'im');
}

function topLevelCareerPlaybookBlockHeadings(markdown: string): string[] {
  return markdown.match(/^##\s+(?:Header\s*$|(?:[1-9]|1[0-9]|2[0-6])\.\s+.*$)/gim) ?? [];
}

export function validateRegeneratedCareerPlaybookBlockMarkdown(
  blockId: CareerPlaybookBlockId,
  markdown: string
): string {
  const content = markdown.trim();
  if (!content) {
    throw new Error(`Regenerated ${blockId} returned empty markdown`);
  }

  const topLevelHeadings = topLevelCareerPlaybookBlockHeadings(content);
  if (topLevelHeadings.length !== 1) {
    throw new Error(
      `Regenerated ${blockId} must contain exactly one top-level Career Playbook block heading`
    );
  }

  if (!getExpectedHeadingPattern(blockId).test(content)) {
    throw new Error(`Regenerated ${blockId} is missing the expected heading for ${blockId}`);
  }

  return content;
}

export function buildOtherBlocksBrief(
  otherBlocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> | undefined,
  targetBlockId: CareerPlaybookBlockId
): string {
  const lines = CAREER_PLAYBOOK_FINAL_BLOCK_ORDER.flatMap(blockId => {
    if (blockId === targetBlockId) return [];

    const content = otherBlocks?.[blockId]?.content;
    if (!content || content.trim().length === 0) return [];

    return [`${blockId}: ${compactMarkdown(content).slice(0, 500)}`];
  });

  return lines.length > 0 ? lines.join('\n') : 'none';
}

export function buildBlockRegeneratorPromptVariables(
  input: RegenerateCareerPlaybookBlockInput
): Record<string, string> {
  return {
    block_id: input.blockId,
    block_name: getCareerPlaybookBlockName(input.blockId),
    original_content: input.originalBlock?.content.trim() || 'none',
    issue_description: input.issue.description,
    suggestion: input.issue.suggestion ?? 'none',
    user_instruction: input.userInstruction?.trim() || 'none',
    spec_json: JSON.stringify(input.roleProfileSpec, null, 2),
    other_blocks_brief:
      input.otherBlocksBrief ?? buildOtherBlocksBrief(input.otherBlocks, input.blockId),
    content_language: input.language,
  };
}

function buildNumericEvidenceText(input: RegenerateCareerPlaybookBlockInput): string {
  return JSON.stringify({
    roleProfileSpec: input.roleProfileSpec,
    otherBlocksBrief:
      input.otherBlocksBrief ?? buildOtherBlocksBrief(input.otherBlocks, input.blockId),
  });
}

function buildNodeCost(result: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}): CareerPlaybookNodeCost {
  return {
    node: 'blockRegenerator',
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: result.costUsd,
  };
}

export async function regenerateCareerPlaybookBlock(
  input: RegenerateCareerPlaybookBlockInput,
  runtime: CareerPlaybookRuntime = createCareerPlaybookRuntime()
): Promise<RegenerateCareerPlaybookBlockResult> {
  const prompt = await runtime.renderPrompt(
    BLOCK_REGENERATOR_PROMPT_KEY,
    buildBlockRegeneratorPromptVariables(input)
  );
  const llmResult = await runtime.invokeLLM(prompt, {
    phaseName: BLOCK_REGENERATOR_PHASE,
    promptKey: BLOCK_REGENERATOR_PROMPT_KEY,
    node: 'blockRegenerator',
    temperature: 0.4,
    maxTokens: 6_000,
  });
  const generatedAt = (input.now ?? (() => new Date()))().toISOString();
  const attempt = (input.originalBlock?.attempt ?? 0) + 1;
  const content = validateRegeneratedCareerPlaybookBlockMarkdown(input.blockId, llmResult.content);

  const block = annotateCareerPlaybookBlockNumericFacts({
    blockId: input.blockId,
    block: {
      content,
      status: 'generated',
      judge_verdict: null,
      generated_at: generatedAt,
      llm_model: llmResult.model,
      attempt,
    },
    evidenceText: buildNumericEvidenceText(input),
    language: input.language,
  });

  return {
    blockId: input.blockId,
    block,
    nodeCost: buildNodeCost(llmResult),
  };
}

function issueForBlock(
  verdict: CareerPlaybookJudgeVerdict,
  blockId: CareerPlaybookBlockId
): CareerPlaybookJudgeIssue {
  return (
    verdict.issues.find(issue => issue.block_id === blockId) ?? {
      block_id: blockId,
      severity: 'warning',
      description: `Regenerate ${blockId} based on the cross-block judge verdict.`,
      suggestion: 'Preserve the block contract and fix the judge finding.',
    }
  );
}

export function selectPendingCareerPlaybookRegeneration(input: {
  verdict?: CareerPlaybookJudgeVerdict | null;
  blockIds: CareerPlaybookBlockId[];
  attempts: Partial<Record<CareerPlaybookBlockId, number>>;
  maxAttempts?: number;
  maxWindowAttempts?: number;
}): CareerPlaybookPendingRegeneration | null {
  const maxAttempts = input.maxAttempts ?? CAREER_PLAYBOOK_MAX_BLOCK_REGENERATION_ATTEMPTS;
  const maxWindowAttempts =
    input.maxWindowAttempts ?? CAREER_PLAYBOOK_MAX_JUDGE_WINDOW_REGENERATION_ATTEMPTS;
  const verdict = input.verdict;
  if (!verdict?.needs_regeneration.length || verdict.pass) {
    return null;
  }

  if (
    countCareerPlaybookRegenerationAttemptsForBlocks(input.attempts, input.blockIds) >=
    maxWindowAttempts
  ) {
    return null;
  }

  for (const blockId of verdict.needs_regeneration) {
    if (!input.blockIds.includes(blockId)) continue;

    const attempts = input.attempts[blockId] ?? 0;
    if (attempts < maxAttempts) {
      return {
        blockId,
        issue: issueForBlock(verdict, blockId),
        attempts,
      };
    }
  }

  return null;
}

export function countCareerPlaybookRegenerationAttemptsForBlocks(
  attempts: Partial<Record<CareerPlaybookBlockId, number>>,
  blockIds: CareerPlaybookBlockId[]
): number {
  return blockIds.reduce((total, blockId) => total + (attempts[blockId] ?? 0), 0);
}

export function createBlockRegeneratorNode(
  runtime: CareerPlaybookRuntime = createCareerPlaybookRuntime()
) {
  return async function blockRegeneratorNode(
    state: CareerPlaybookGraphStateType
  ): Promise<CareerPlaybookGraphStateUpdate> {
    if (!state.roleProfileSpec) {
      return {
        errors: ['blockRegenerator failed: roleProfileSpec is missing'],
        currentNode: 'blockRegenerator',
      };
    }

    const pending = selectPendingCareerPlaybookRegeneration({
      verdict: state.lastJudgeVerdict,
      blockIds: state.lastJudgedBlockIds,
      attempts: state.blockRegenerationAttempts,
    });

    if (!pending) {
      return {
        currentNode: 'blockRegenerator',
      };
    }

    const originalBlock = state.generatedBlocks[pending.blockId];
    if (!originalBlock) {
      return {
        errors: [`blockRegenerator failed: ${pending.blockId} is missing`],
        currentNode: 'blockRegenerator',
      };
    }

    try {
      const result = await regenerateCareerPlaybookBlock(
        {
          blockId: pending.blockId,
          roleProfileSpec: state.roleProfileSpec,
          language: state.language,
          originalBlock,
          issue: pending.issue,
          otherBlocks: state.generatedBlocks,
        },
        runtime
      );

      return {
        generatedBlocks: { [pending.blockId]: result.block },
        blockRegenerationAttempts: { [pending.blockId]: pending.attempts + 1 },
        nodeCosts: [result.nodeCost],
        currentNode: 'blockRegenerator',
      };
    } catch (error) {
      return {
        blockRegenerationAttempts: { [pending.blockId]: pending.attempts + 1 },
        warnings: [
          `blockRegenerator retained ${pending.blockId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
        currentNode: 'blockRegenerator',
      };
    }
  };
}
