/**
 * Intent Classification Service for Chat Optimization
 *
 * Classifies user messages to route them efficiently:
 * - Direct execution intents (DELETE, MOVE, UPDATE_FIELD) → No LLM generation needed
 * - LLM-required intents (REWRITE, EXPAND, etc.) → Use targeted context (~500 tokens vs 42K)
 *
 * Uses OpenRouter Structured Output with Zod schema for consistent classification.
 *
 * @module intent/classifier
 */

import { z } from 'zod';
import OpenAI from 'openai';
import { logger } from '../logger/index.js';

// ============================================================================
// Intent Schema (Zod + OpenRouter Structured Output)
// ============================================================================

export const IntentSchema = z.object({
  intent: z.enum([
    'DELETE_LESSON',
    'DELETE_SECTION',
    'MOVE_ELEMENT',
    'UPDATE_FIELD',
    'REWRITE_CONTENT',
    'EXPAND_CONTENT',
    'SIMPLIFY_CONTENT',
    'ADD_LESSON',
    'ADD_SECTION',
    'GET_INFO',
    'UNKNOWN',
  ]),
  confidence: z.number().min(0).max(1),
  target: z
    .object({
      elementType: z.enum(['lesson', 'section', 'course', 'field']).optional(),
      path: z.string().optional(), // "sections[0].lessons[2]"
      identifier: z.string().optional(), // "урок 2.3", "секция Введение"
    })
    .optional(),
  destination: z.string().optional(), // For MOVE_ELEMENT
  fieldName: z.string().optional(), // For UPDATE_FIELD
  newValue: z.unknown().optional(), // For UPDATE_FIELD
});

export type ClassifiedIntent = z.infer<typeof IntentSchema>;

// ============================================================================
// Intent Categories
// ============================================================================

/**
 * Direct execution intents - no LLM generation needed
 */
export const DIRECT_EXECUTION_INTENTS = [
  'DELETE_LESSON',
  'DELETE_SECTION',
  'MOVE_ELEMENT',
  'UPDATE_FIELD',
] as const;

/**
 * LLM-required intents - need content generation but with targeted context
 */
export const LLM_REQUIRED_INTENTS = [
  'REWRITE_CONTENT',
  'EXPAND_CONTENT',
  'SIMPLIFY_CONTENT',
  'ADD_LESSON',
  'ADD_SECTION',
] as const;

export type DirectExecutionIntent = (typeof DIRECT_EXECUTION_INTENTS)[number];
export type LLMRequiredIntent = (typeof LLM_REQUIRED_INTENTS)[number];

// ============================================================================
// Classification Prompt
// ============================================================================

const CLASSIFICATION_SYSTEM_PROMPT = `You are an intent classifier for a course editing system.
Classify the user's message into one of these intents:

STRUCTURAL OPERATIONS (no content generation needed):
- DELETE_LESSON: Remove a specific lesson (e.g., "удали урок 2.3", "remove lesson")
- DELETE_SECTION: Remove a section with all lessons (e.g., "удали секцию", "delete section")
- MOVE_ELEMENT: Relocate lesson/section (e.g., "перенеси урок в секцию 2", "move lesson")
- UPDATE_FIELD: Change specific field value (e.g., "измени название на X", "set duration to 20")

CONTENT MODIFICATION (requires LLM generation):
- REWRITE_CONTENT: Transform content style (e.g., "перепиши проще", "rewrite clearly")
- EXPAND_CONTENT: Add detail/depth (e.g., "расширь", "add more detail")
- SIMPLIFY_CONTENT: Reduce complexity (e.g., "упрости", "make simpler")
- ADD_LESSON: Create new lesson (e.g., "добавь урок про X", "add lesson about")
- ADD_SECTION: Create new section (e.g., "добавь секцию", "create section")

QUERY:
- GET_INFO: Request information (e.g., "сколько уроков?", "what's the duration?")

- UNKNOWN: Cannot determine intent

RULES:
1. For DELETE/MOVE/UPDATE: Extract the target element path or identifier
2. For MOVE: Also extract the destination
3. For UPDATE_FIELD: Extract field name and new value
4. Set confidence 0.0-1.0 based on clarity of the request
5. If user selected a specific element (nodeContext provided), use that as target

Current context: User is viewing {nodeContext}`;

// ============================================================================
// JSON Schema for OpenRouter Structured Output
// ============================================================================

const INTENT_JSON_SCHEMA = {
  name: 'intent_classification',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: [
          'DELETE_LESSON',
          'DELETE_SECTION',
          'MOVE_ELEMENT',
          'UPDATE_FIELD',
          'REWRITE_CONTENT',
          'EXPAND_CONTENT',
          'SIMPLIFY_CONTENT',
          'ADD_LESSON',
          'ADD_SECTION',
          'GET_INFO',
          'UNKNOWN',
        ],
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      target: {
        type: 'object',
        properties: {
          elementType: { type: 'string', enum: ['lesson', 'section', 'course', 'field'] },
          path: { type: 'string' },
          identifier: { type: 'string' },
        },
        additionalProperties: false,
      },
      destination: { type: 'string' },
      fieldName: { type: 'string' },
      newValue: {},
    },
    required: ['intent', 'confidence'],
    additionalProperties: false,
  },
} as const;

// ============================================================================
// Node Context Type
// ============================================================================

export interface NodeContextForClassification {
  stageId: string;
  path?: string;
  elementType?: string;
}

// ============================================================================
// Classifier Implementation
// ============================================================================

/**
 * Classify user message intent using a cheap, fast model (Xiaomi mimo-v2-flash)
 *
 * @param userMessage - User's chat message
 * @param nodeContext - Optional context about the currently selected node
 * @param client - Optional OpenAI client (for testing)
 * @returns Classified intent with confidence score
 *
 * @example
 * ```typescript
 * const intent = await classifyIntent("удали урок 2.3");
 * // { intent: 'DELETE_LESSON', confidence: 0.95, target: { identifier: 'урок 2.3' } }
 * ```
 */
export async function classifyIntent(
  userMessage: string,
  nodeContext?: NodeContextForClassification,
  client?: OpenAI
): Promise<ClassifiedIntent> {
  const openai =
    client ||
    new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    });

  const contextDescription = nodeContext
    ? `${nodeContext.elementType || 'element'} at ${nodeContext.path || 'course level'}`
    : 'course overview';

  const systemPrompt = CLASSIFICATION_SYSTEM_PROMPT.replace('{nodeContext}', contextDescription);

  try {
    // Using OpenRouter Structured Output
    const response = await openai.chat.completions.create({
      model: process.env.CHAT_CLASSIFICATION_MODEL || 'xiaomi/mimo-v2-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 200, // Classification needs few tokens
      temperature: 0.1, // Low temperature for consistent classification
      response_format: {
        type: 'json_schema',
        json_schema: INTENT_JSON_SCHEMA,
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      logger.warn({ userMessage }, 'Intent classification: empty response');
      return { intent: 'UNKNOWN', confidence: 0 };
    }

    const parsed = JSON.parse(content);
    const validated = IntentSchema.parse(parsed);

    logger.info(
      {
        userMessage: userMessage.substring(0, 100),
        intent: validated.intent,
        confidence: validated.confidence,
        target: validated.target,
      },
      'Intent classified'
    );

    return validated;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), userMessage },
      'Intent classification failed'
    );
    return { intent: 'UNKNOWN', confidence: 0 };
  }
}

/**
 * Check if intent is a direct execution type (no LLM generation needed)
 */
export function isDirectExecutionIntent(
  intent: ClassifiedIntent['intent']
): intent is DirectExecutionIntent {
  return (DIRECT_EXECUTION_INTENTS as readonly string[]).includes(intent);
}

/**
 * Check if intent requires LLM generation
 */
export function isLLMRequiredIntent(
  intent: ClassifiedIntent['intent']
): intent is LLMRequiredIntent {
  return (LLM_REQUIRED_INTENTS as readonly string[]).includes(intent);
}
