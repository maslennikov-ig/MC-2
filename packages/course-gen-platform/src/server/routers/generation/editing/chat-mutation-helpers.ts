/**
 * Chat Mutation Phase Helpers
 * @module server/routers/generation/editing/chat-mutation-helpers
 *
 * Helper functions for the chat mutation phases, extracted from chat.router.ts
 * to reduce file size and cyclomatic complexity. Each function handles a
 * distinct phase of the chat mutation flow:
 * - Input validation and auth checks
 * - Course/context loading
 * - Legacy LLM flow execution
 * - Message persistence
 *
 * Intent classification routing is handled separately in chat-intent-flow.ts.
 */

import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../../../shared/logger/index.js';
import { PAUSABLE_STATUSES } from '@megacampus/shared-types';
import type { ChatResponse, Proposal } from '@megacampus/shared-types/chat-types';
import {
  STAGE4_EDITABLE_FIELDS,
  STAGE5_EDITABLE_FIELDS,
} from '@megacampus/shared-types/regeneration-types';
import type { Database } from '@megacampus/shared-types';
import { llmClient } from '../../../../shared/llm/client';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';
import { buildRefinementPrompt, parseProposalFromLLMResponse } from './chat-helpers';

// ============================================================================
// Types
// ============================================================================

/** Fallback configuration for LLM when ModelConfigService is unavailable */
export interface ChatFallbackConfig {
  modelId: string;
  temperature: number;
  maxTokens: number;
}

/** Intent classification confidence thresholds */
export interface IntentConfidenceThresholds {
  DIRECT_EXECUTION: number;
  GET_INFO: number;
  LLM_REQUIRED: number;
}

// ============================================================================
// Course Loading and Validation
// ============================================================================

/**
 * Validate conversation belongs to the specified course.
 * Returns silently if valid or no conversation exists yet.
 */
export async function validateConversationOwnership(
  supabaseAdmin: SupabaseClient<Database>,
  conversationId: string | undefined,
  courseId: string
): Promise<void> {
  if (!conversationId) return;

  const { data: existingConv } = await supabaseAdmin
    .from('course_chat_messages')
    .select('course_id')
    .eq('conversation_id', conversationId)
    .limit(1)
    .maybeSingle();

  if (existingConv && existingConv.course_id !== courseId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Conversation does not belong to this course',
    });
  }
}

/**
 * Check if generation is currently active and block chat if so.
 * Uses PAUSABLE_STATUSES from shared-types as Single Source of Truth.
 */
export function assertGenerationNotActive(
  generationStatus: string | null,
  requestId: string,
  courseId: string
): void {
  const status = generationStatus || '';
  const isGenerationActive = (PAUSABLE_STATUSES as readonly string[]).includes(status);

  if (isGenerationActive) {
    logger.info(
      { requestId, courseId, generationStatus: status },
      'Chat blocked: generation is active'
    );
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Chat is unavailable during active generation. Please wait for the current stage to complete.',
    });
  }
}

/**
 * Fetch conversation history from database.
 * Returns last 10 messages for context window management.
 */
export async function fetchConversationHistory(
  supabaseAdmin: SupabaseClient<Database>,
  convId: string,
  requestId: string,
  courseId: string
): Promise<Array<{ role: string; content: string }> | null> {
  const { data: history, error: historyError } = await supabaseAdmin
    .from('course_chat_messages')
    .select('role, content')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(10);

  if (historyError) {
    logger.warn(
      { requestId, courseId, conversationId: convId, error: historyError },
      'Failed to fetch conversation history (non-blocking, will continue without history)'
    );
  }

  return history;
}

// ============================================================================
// Message Persistence
// ============================================================================

/**
 * Save user message to conversation history.
 * Non-blocking: logs warnings but continues on failure.
 */
export async function persistUserMessage(
  supabaseAdmin: SupabaseClient<Database>,
  params: {
    courseId: string;
    convId: string;
    userMessage: string;
    chatType: 'node' | 'global';
    nodeContext?: { stageId: string; nodeId?: string; blockPath?: string } | null;
    intent: 'refine' | 'regenerate';
    requestId: string;
  }
): Promise<void> {
  const { error: insertUserMsgError } = await supabaseAdmin.from('course_chat_messages').insert({
    course_id: params.courseId,
    conversation_id: params.convId,
    role: 'user',
    content: params.userMessage,
    chat_type: params.chatType,
    node_context: params.nodeContext || null,
    intent: params.intent,
  });

  if (insertUserMsgError) {
    logger.warn(
      { requestId: params.requestId, courseId: params.courseId, error: insertUserMsgError },
      'Failed to save user message (non-blocking)'
    );
  }
}

/**
 * Save assistant message to conversation history.
 * Non-blocking: logs warnings but continues on failure.
 */
export async function persistAssistantMessage(
  supabaseAdmin: SupabaseClient<Database>,
  params: {
    courseId: string;
    convId: string;
    content: string;
    chatType: 'node' | 'global';
    nodeContext?: { stageId: string; nodeId?: string; blockPath?: string } | null;
    intent: 'refine' | 'regenerate';
    modelUsed: string;
    inputTokens?: number;
    outputTokens?: number;
    requestId: string;
  }
): Promise<void> {
  const { error: insertAssistantMsgError } = await supabaseAdmin
    .from('course_chat_messages')
    .insert({
      course_id: params.courseId,
      conversation_id: params.convId,
      role: 'assistant',
      content: params.content,
      chat_type: params.chatType,
      node_context: params.nodeContext || null,
      intent: params.intent,
      model_used: params.modelUsed,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
    });

  if (insertAssistantMsgError) {
    logger.warn(
      { requestId: params.requestId, courseId: params.courseId, error: insertAssistantMsgError },
      'Failed to save assistant message (non-blocking)'
    );
  }
}

// ============================================================================
// Legacy LLM Flow
// ============================================================================

/** Parameters for the legacy LLM flow */
export interface LegacyLLMFlowParams {
  courseId: string;
  course: {
    title: string | null;
    language: string | null;
    style: string | null;
    analysis_result: unknown;
    course_structure: unknown;
  };
  userMessage: string;
  chatType: 'node' | 'global';
  nodeContext?: { stageId: string; nodeId?: string; blockPath?: string };
  previousOutput?: string;
  intent: 'refine' | 'regenerate';
  convId: string;
  history: Array<{ role: string; content: string }> | null;
  requestId: string;
  supabaseAdmin: SupabaseClient<Database>;
  fallbackConfig: ChatFallbackConfig;
}

/** Resolved model configuration for LLM call */
interface ResolvedModelConfig {
  modelId: string;
  temperature: number;
  maxTokens: number;
}

/** Resolved proposal context for field update proposals */
interface ProposalContext {
  shouldGenerateProposal: boolean;
  stageId: 'stage_4' | 'stage_5' | null;
  allowedFields: readonly string[];
  currentData: unknown;
}

/**
 * Resolve the model configuration for the chat LLM call.
 * Tries ModelConfigService first, falls back to default config.
 */
async function resolveModelConfig(
  chatType: 'node' | 'global',
  courseId: string,
  courseLanguage: string | null,
  fallbackConfig: ChatFallbackConfig,
  requestId: string
): Promise<ResolvedModelConfig> {
  const modelConfigService = createModelConfigService();
  const phaseName = chatType === 'node' ? 'chat_node_refinement' : 'chat_global_guidance';

  try {
    const config = await modelConfigService.getModelForPhase(
      phaseName,
      courseId,
      undefined,
      (courseLanguage as 'ru' | 'en') || 'ru'
    );
    return {
      modelId: config.modelId,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    };
  } catch (configError) {
    logger.warn(
      { requestId, phaseName, error: configError, fallback: fallbackConfig },
      'Failed to get model config, using fallback'
    );
    return {
      modelId: fallbackConfig.modelId,
      temperature: fallbackConfig.temperature,
      maxTokens: fallbackConfig.maxTokens,
    };
  }
}

/**
 * Resolve proposal context: whether to generate a proposal and which fields/data to use.
 */
function resolveProposalContext(params: LegacyLLMFlowParams): ProposalContext {
  const { intent, chatType, nodeContext, course } = params;

  const shouldGenerateProposal =
    intent === 'refine' &&
    chatType === 'node' &&
    !!nodeContext &&
    (nodeContext.stageId === 'stage_4' || nodeContext.stageId === 'stage_5');

  if (!shouldGenerateProposal || !nodeContext) {
    return { shouldGenerateProposal: false, stageId: null, allowedFields: [], currentData: null };
  }

  const stageId = nodeContext.stageId as 'stage_4' | 'stage_5';
  const allowedFields = stageId === 'stage_4' ? STAGE4_EDITABLE_FIELDS : STAGE5_EDITABLE_FIELDS;
  const currentData = stageId === 'stage_4' ? course.analysis_result : course.course_structure;

  return { shouldGenerateProposal, stageId, allowedFields, currentData };
}

/**
 * Build the system prompt for the legacy LLM flow.
 * Returns either a refinement prompt (for proposals) or a standard prompt.
 */
function buildLegacySystemPrompt(
  params: LegacyLLMFlowParams,
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

/**
 * Build the messages array for LLM multi-turn conversation.
 */
function buildLLMMessages(
  systemPrompt: string,
  history: Array<{ role: string; content: string }> | null,
  userMessage: string
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  if (history && history.length > 0) {
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

/**
 * Parse proposal from LLM response and build the final chat response.
 */
function buildChatResponseWithProposal(
  llmContent: string,
  proposalCtx: ProposalContext,
  requestId: string,
  courseId: string
): { assistantMessage: string; proposal: Proposal | undefined } {
  if (!proposalCtx.shouldGenerateProposal || !proposalCtx.stageId) {
    return { assistantMessage: llmContent, proposal: undefined };
  }

  const parsedProposal = parseProposalFromLLMResponse(
    llmContent,
    proposalCtx.stageId,
    proposalCtx.allowedFields,
    requestId
  );

  if (parsedProposal) {
    logger.info(
      {
        requestId,
        courseId,
        proposalType: parsedProposal.type,
        updateCount: parsedProposal.updates.length,
      },
      'Chat: Proposal generated'
    );
    return {
      assistantMessage: parsedProposal.summary || llmContent,
      proposal: parsedProposal,
    };
  }

  logger.info(
    { requestId, courseId },
    'Chat: No valid proposal extracted, returning text response'
  );
  return { assistantMessage: llmContent, proposal: undefined };
}

/**
 * Execute the legacy LLM flow (non-intent-classified).
 * Builds prompts, calls LLM, parses proposals, and persists messages.
 */
export async function executeLegacyLLMFlow(params: LegacyLLMFlowParams): Promise<ChatResponse> {
  const {
    courseId,
    course,
    userMessage,
    chatType,
    nodeContext,
    intent,
    convId,
    history,
    requestId,
    supabaseAdmin,
    fallbackConfig,
  } = params;

  // Resolve model config
  const modelConfig = await resolveModelConfig(
    chatType,
    courseId,
    course.language,
    fallbackConfig,
    requestId
  );

  // Resolve proposal context
  const proposalCtx = resolveProposalContext(params);

  // Build system prompt and messages
  const systemPrompt = buildLegacySystemPrompt(params, proposalCtx);
  const messages = buildLLMMessages(systemPrompt, history, userMessage);

  // Generate LLM response
  let llmResponse;
  try {
    llmResponse = await llmClient.generateChatCompletion(messages, {
      model: modelConfig.modelId,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
    });
  } catch (llmError) {
    logger.error(
      {
        requestId,
        courseId,
        modelId: modelConfig.modelId,
        error: llmError instanceof Error ? llmError.message : String(llmError),
      },
      'LLM generation failed in chat'
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to generate response. Please try again.',
    });
  }

  // Save assistant message
  await persistAssistantMessage(supabaseAdmin, {
    courseId,
    convId,
    content: llmResponse.content,
    chatType,
    nodeContext: nodeContext || null,
    intent,
    modelUsed: modelConfig.modelId,
    inputTokens: llmResponse.inputTokens,
    outputTokens: llmResponse.outputTokens,
    requestId,
  });

  // Parse proposal and build response
  const { assistantMessage, proposal } = buildChatResponseWithProposal(
    llmResponse.content,
    proposalCtx,
    requestId,
    courseId
  );

  logger.info(
    {
      requestId,
      courseId,
      intent,
      modelUsed: modelConfig.modelId,
      inputTokens: llmResponse.inputTokens,
      outputTokens: llmResponse.outputTokens,
      hasProposal: !!proposal,
    },
    'Chat: Response generated'
  );

  return {
    conversationId: convId,
    assistantMessage,
    intent,
    proposal,
    modelUsed: modelConfig.modelId,
    inputTokens: llmResponse.inputTokens || 0,
    outputTokens: llmResponse.outputTokens || 0,
  };
}
