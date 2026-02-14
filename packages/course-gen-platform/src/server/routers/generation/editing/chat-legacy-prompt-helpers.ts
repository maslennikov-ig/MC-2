import {
  STAGE4_EDITABLE_FIELDS,
  STAGE5_EDITABLE_FIELDS,
} from '@megacampus/shared-types/regeneration-types';
import type { CourseStructure } from '@megacampus/shared-types';
import { generateCourseOutline } from '../../../../shared/intent';
import { buildRefinementPrompt } from './chat-helpers';

export interface LegacyPromptParams {
  chatType: 'node' | 'global';
  course: {
    title: string | null;
    language: string | null;
    style: string | null;
    analysis_result: unknown;
    course_structure: unknown;
  };
  nodeContext?: { stageId: string; nodeId?: string; blockPath?: string };
  previousOutput?: string;
  intent?: 'refine' | 'regenerate';
}

export interface ProposalContext {
  shouldGenerateProposal: boolean;
  stageId: 'stage_4' | 'stage_5' | null;
  allowedFields: readonly string[];
  currentData: unknown;
}

export function resolveProposalContext(params: LegacyPromptParams): ProposalContext {
  const { intent, chatType, nodeContext, course } = params;

  const shouldGenerateProposal =
    intent !== 'regenerate' &&
    chatType === 'node' &&
    !!nodeContext &&
    (nodeContext.stageId === 'stage_4' || nodeContext.stageId === 'stage_5');

  if (!shouldGenerateProposal || !nodeContext) {
    return {
      shouldGenerateProposal: false,
      stageId: null,
      allowedFields: [],
      currentData: null,
    };
  }

  const stageId = nodeContext.stageId as 'stage_4' | 'stage_5';
  const allowedFields = stageId === 'stage_4' ? STAGE4_EDITABLE_FIELDS : STAGE5_EDITABLE_FIELDS;

  if (stageId === 'stage_5') {
    const structure = course.course_structure as CourseStructure | null;
    const outline =
      structure && typeof structure === 'object' && Array.isArray(structure.sections)
        ? generateCourseOutline(structure)
        : null;

    return {
      shouldGenerateProposal,
      stageId,
      allowedFields,
      currentData: {
        target_location: {
          stageId: nodeContext.stageId,
          nodeId: nodeContext.nodeId ?? null,
          blockPath: nodeContext.blockPath ?? null,
        },
        current_output: params.previousOutput ?? null,
        course_outline: outline,
      },
    };
  }

  return {
    shouldGenerateProposal,
    stageId,
    allowedFields,
    currentData: course.analysis_result,
  };
}

export function buildLegacySystemPrompt(
  params: LegacyPromptParams,
  proposalCtx: ProposalContext
): string {
  if (proposalCtx.shouldGenerateProposal && proposalCtx.stageId && proposalCtx.currentData) {
    return buildRefinementPrompt(
      proposalCtx.stageId,
      proposalCtx.currentData,
      proposalCtx.allowedFields
    );
  }

  const courseContext = `
<course_context>
  Title: ${params.course.title || 'Untitled Course'}
  Language: ${params.course.language || 'ru'}
  Style: ${params.course.style || 'formal'}
</course_context>`;

  let contentContext = '';
  if (params.chatType === 'node' && params.nodeContext && params.previousOutput) {
    contentContext = `
<current_content>
${params.previousOutput}
</current_content>

<target_location>
  Stage: ${params.nodeContext.stageId}
  ${params.nodeContext.nodeId ? `Node ID: ${params.nodeContext.nodeId}` : ''}
  ${params.nodeContext.blockPath ? `Block Path: ${params.nodeContext.blockPath}` : ''}
</target_location>`;
  }

  return `You are an expert instructional designer helping refine course content.
${courseContext}
${contentContext}

<instructions>
- Respond in the user's language (detect from their message)
- If the user wants to REFINE content: provide specific improvements, suggestions, or refined content
- If the user wants to REGENERATE: acknowledge their request and explain what will be regenerated
- Be concise but helpful
- If returning content, format appropriately for the content type
- For JSON content, return valid JSON without markdown code blocks
- Focus on pedagogical quality and alignment with course goals
</instructions>`;
}

export function buildLLMMessages(
  systemPrompt: string,
  history: Array<{ role: string; content: string }> | null,
  userMessage: string
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  if (history) {
    for (const msg of history) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }
  }

  messages.push({ role: 'user', content: userMessage });
  return messages;
}
