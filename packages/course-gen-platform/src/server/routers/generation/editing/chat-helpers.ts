/**
 * Chat Router Helper Functions
 * @module server/routers/generation/editing/chat-helpers
 *
 * Pure helper functions extracted from chat.router.ts to reduce file size
 * and cyclomatic complexity. These functions handle:
 * - Prompt building for LLM refinement
 * - LLM response parsing into proposals
 * - Intent-based flow handling (direct actions, info queries)
 */

import { logger } from '../../../../shared/logger/index.js';
import {
  type FieldUpdatesProposal,
  type FieldUpdateItem,
  type DirectActionProposal,
} from '@megacampus/shared-types/chat-types';
import { STAGE5_EDITABLE_FIELDS } from '@megacampus/shared-types/regeneration-types';
import type { CourseStructure, Section, Lesson } from '@megacampus/shared-types';
import {
  resolveTargetPath,
  resolveTargetPathWithMatches,
  getElementAtPath,
  isLessonPath,
  generateCourseOutline,
  type ClassifiedIntent,
  type TargetMatch,
} from '../../../../shared/intent';
import { normalizePathForValidation } from '../_shared/helpers';

// ============================================================================
// Constants
// ============================================================================

/**
 * Confidence threshold for accepting a single match without clarification.
 * Matches below this threshold or multiple matches above it require user clarification.
 */
const FUZZY_MATCH_CONFIDENCE_THRESHOLD = 0.7;

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build a refinement prompt that instructs LLM to return structured JSON with field updates.
 * Used for Stage 4 and Stage 5 refinement.
 */
export function buildRefinementPrompt(
  targetStageId: 'stage_4' | 'stage_5',
  currentData: unknown,
  allowedFields: readonly string[]
): string {
  const stageDescription =
    targetStageId === 'stage_4' ? 'lesson specifications' : 'course structure';
  return `You are an instructional designer assistant working on ${stageDescription}.
Analyze the user's refinement request and return a JSON object with proposed field updates.

IMPORTANT: You MUST respond with a valid JSON object (no markdown code blocks).

Current content:
${JSON.stringify(currentData, null, 2)}

Editable fields (you can ONLY update these fields):
${allowedFields.join('\n')}

Return JSON in this EXACT format:
{
  "message": "Human-readable explanation of what you're proposing to change",
  "updates": [
    {
      "path": "exact.field.path",
      "newValue": "the new value (can be string, array, object, etc.)",
      "description": "Brief description of this change"
    }
  ]
}

Rules:
1. Only include fields that actually need to change based on user request
2. The "path" must be one of the allowed editable fields
3. For Stage 5 array paths, use exact indices like "sections[0].lessons[1].lesson_title"
4. Always validate your JSON is properly formatted
5. If the user's request doesn't require field changes, return empty updates array with explanation
6. The "message" field MUST contain a clear, helpful explanation in Russian (2-3 sentences) of what you're proposing and why. NEVER leave it empty.
7. If the user asks to ADD a new lesson, section, or other structural element — return empty updates and explain in "message" that structural changes require using the "Перегенерировать" mode instead of "Уточнить". Do NOT make unrelated edits to approximate the request.`;
}

/**
 * Build prompt with targeted context (NOT full course_structure).
 * This is the key optimization: ~500 tokens instead of 42K.
 */
export function buildTargetedRefinementPrompt(
  intentType: string,
  targetedContext: unknown,
  allowedFields: readonly string[],
  targetPath?: string | null
): string {
  const intentInstructions: Record<string, string> = {
    REWRITE_CONTENT: 'Rewrite the content to be clearer and more engaging.',
    EXPAND_CONTENT: 'Expand the content with more detail and examples.',
    SIMPLIFY_CONTENT: 'Simplify the content for easier understanding.',
    ADD_LESSON: 'Generate a new lesson based on the user request.',
    ADD_SECTION: 'Generate a new section based on the user request.',
  };

  return `You are an instructional designer assistant.
${intentInstructions[intentType] || 'Help the user modify the content.'}

${targetPath ? `Target element path: ${targetPath}` : 'Working at course level.'}

Current content (ONLY the relevant element, not the full course):
${JSON.stringify(targetedContext, null, 2)}

Editable fields:
${allowedFields.join('\n')}

IMPORTANT: Return ONLY valid JSON (no markdown code blocks).

Return JSON in this exact format:
{
  "message": "Human-readable explanation of changes",
  "updates": [
    { "path": "field.path", "newValue": "...", "description": "..." }
  ]
}

Rules:
1. Only modify fields listed above
2. Keep changes focused on user's request
3. Preserve existing structure
4. For Stage 5 array paths, use exact indices like "sections[0].lessons[1].lesson_title"
5. The "message" field MUST contain a clear, helpful explanation in Russian (2-3 sentences) of what you're proposing and why. NEVER leave it empty.
6. If the user asks to ADD a new lesson, section, or other structural element — return empty updates and explain in "message" that structural changes require using the "Перегенерировать" mode instead of "Уточнить". Do NOT make unrelated edits to approximate the request.`;
}

// ============================================================================
// LLM Response Parsing
// ============================================================================

/**
 * Validate a single update item from LLM response.
 * Returns the validated FieldUpdateItem or null if invalid.
 */
function validateUpdateItem(
  update: unknown,
  stageId: 'stage_4' | 'stage_5',
  allowedFields: readonly string[],
  requestId: string
): FieldUpdateItem | null {
  if (!update || typeof update !== 'object') return null;

  const updateObj = update as Record<string, unknown>;
  const path = typeof updateObj.path === 'string' ? updateObj.path : '';
  if (!path) return null;

  // Normalize path for validation
  const normalizedPath = stageId === 'stage_5' ? normalizePathForValidation(path) : path;

  // Check if path is in whitelist
  if (!allowedFields.includes(normalizedPath)) {
    logger.warn(
      { requestId, path, normalizedPath, allowedFields },
      'Proposal parsing: field path not in whitelist, skipping'
    );
    return null;
  }

  // Validate newValue exists
  if (updateObj.newValue === undefined) {
    logger.warn({ requestId, path }, 'Proposal parsing: newValue is undefined, skipping');
    return null;
  }

  // Validate newValue is JSON-serializable
  try {
    JSON.stringify(updateObj.newValue);
  } catch {
    logger.warn({ requestId, path }, 'Proposal parsing: newValue is not serializable, skipping');
    return null;
  }

  return {
    path,
    newValue: updateObj.newValue,
    description: typeof updateObj.description === 'string' ? updateObj.description : undefined,
    oldValue: updateObj.oldValue, // Optional, may be undefined
  };
}

/**
 * Parse LLM response to extract field updates proposal.
 *
 * Returns `null` if parsing fails — this is intentional graceful degradation.
 * When null is returned, the chat flow continues without a proposal,
 * treating the LLM response as a plain text message.
 *
 * Callers MUST handle the null case (see chat-mutation-helpers.ts).
 *
 * @param llmContent - Raw LLM response text (may contain markdown code blocks)
 * @param stageId - Which stage the proposal targets ('stage_4' or 'stage_5')
 * @param allowedFields - Whitelist of fields that can be updated
 * @param requestId - Request ID for logging correlation
 * @returns Parsed FieldUpdatesProposal, or null if response is not a valid proposal
 */
export function parseProposalFromLLMResponse(
  llmContent: string,
  stageId: 'stage_4' | 'stage_5',
  allowedFields: readonly string[],
  requestId: string
): FieldUpdatesProposal | null {
  try {
    // Try to extract JSON from the response
    let jsonContent = llmContent.trim();

    // Handle markdown code blocks if present
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonContent) as unknown;

    if (!parsed || typeof parsed !== 'object') {
      logger.warn({ requestId }, 'Proposal parsing: invalid JSON structure');
      return null;
    }

    const parsedObj = parsed as Record<string, unknown>;

    // Extract message and updates
    const message = typeof parsedObj.message === 'string' ? parsedObj.message : '';
    const updates = Array.isArray(parsedObj.updates) ? parsedObj.updates : [];

    if (updates.length === 0) {
      logger.info({ requestId }, 'Proposal parsing: no updates in response');
      return null;
    }

    // Validate and transform updates
    const validatedUpdates: FieldUpdateItem[] = [];
    for (const update of updates) {
      const validItem = validateUpdateItem(update, stageId, allowedFields, requestId);
      if (validItem) {
        validatedUpdates.push(validItem);
      }
    }

    if (validatedUpdates.length === 0) {
      logger.info({ requestId }, 'Proposal parsing: no valid updates after validation');
      return null;
    }

    return {
      type: 'field_updates',
      stageId,
      updates: validatedUpdates,
      summary: message,
    };
  } catch (error) {
    logger.warn(
      { requestId, error: error instanceof Error ? error.message : String(error) },
      'Proposal parsing failed, returning without proposal'
    );
    return null;
  }
}

// ============================================================================
// Direct Intent Handlers
// ============================================================================

/**
 * Format multiple matches as a numbered list for user clarification.
 *
 * @param matches - Array of target matches
 * @returns Formatted message asking user to clarify
 */
export function formatMultipleMatchesMessage(matches: TargetMatch[]): string {
  const matchList = matches
    .slice(0, 5) // Limit to 5 options to avoid overwhelming the user
    .map((m, idx) => `${idx + 1}) ${m.displayLabel}: ${m.title}`)
    .join('\n');

  return `Найдено несколько совпадений:\n${matchList}\n\nУточните, какой именно элемент вы имеете в виду.`;
}

/** Result type for handleDirectIntent */
export interface DirectIntentResult {
  message: string;
  proposal?: DirectActionProposal;
  requiresClarification?: boolean;
}

/**
 * Handle DELETE_LESSON / DELETE_SECTION intents.
 * Creates a DirectActionProposal for user confirmation.
 */
function handleDeleteIntent(
  courseStructure: CourseStructure,
  targetPath: string
): DirectIntentResult {
  const element = getElementAtPath(courseStructure, targetPath);
  if (!element) {
    return { message: 'Элемент не найден.' };
  }

  const isSection = !isLessonPath(targetPath);
  const title = isSection ? (element as Section).section_title : (element as Lesson).lesson_title;

  const lessonCount = isSection ? (element as Section).lessons.length : 0;

  return {
    message: `Удалить "${title}"?`,
    proposal: {
      type: 'direct_action',
      action: 'DELETE',
      targetPath,
      elementType: isSection ? 'section' : 'lesson',
      title,
      impactSummary: isSection
        ? `Удаление секции удалит ${lessonCount} ${lessonCount === 1 ? 'урок' : 'уроков'}.`
        : 'Нумерация уроков будет пересчитана.',
    },
  };
}

/**
 * Handle MOVE_ELEMENT intents.
 * Resolves both source and destination paths.
 */
function handleMoveIntent(
  intent: ClassifiedIntent,
  courseStructure: CourseStructure,
  targetPath: string
): DirectIntentResult {
  if (!intent.destination) {
    return {
      message: 'Куда переместить элемент?',
      requiresClarification: true,
    };
  }

  // Use resolveTargetPath for destination (typically explicit, no ambiguity)
  const destinationPath = resolveTargetPath(intent.destination, undefined, courseStructure);

  if (!destinationPath) {
    return {
      message: 'Не удалось определить место назначения.',
      requiresClarification: true,
    };
  }

  const element = getElementAtPath(courseStructure, targetPath);
  const title = element
    ? isLessonPath(targetPath)
      ? (element as Lesson).lesson_title
      : (element as Section).section_title
    : 'Элемент';

  return {
    message: `Переместить "${title}" в ${intent.destination}?`,
    proposal: {
      type: 'direct_action',
      action: 'MOVE',
      targetPath,
      destinationPath,
      elementType: isLessonPath(targetPath) ? 'lesson' : 'section',
      title,
    },
  };
}

/**
 * Handle UPDATE_FIELD intents.
 * Returns a clarification or confirmation without a proposal
 * (UPDATE_FIELD uses field_updates via the normal LLM flow).
 */
function handleUpdateFieldIntent(intent: ClassifiedIntent): DirectIntentResult {
  if (!intent.fieldName || intent.newValue === undefined) {
    return {
      message: 'Уточните, какое поле и на какое значение изменить.',
      requiresClarification: true,
    };
  }

  // P2-3: Return without proposal - UPDATE_FIELD should use field_updates
  // via the normal LLM flow or be handled by a separate handler
  return {
    message: `Изменить ${String(intent.fieldName)} на "${typeof intent.newValue === 'string' ? intent.newValue : JSON.stringify(intent.newValue)}"?`,
  };
}

/**
 * Resolve the best target match from intent, handling ambiguous cases.
 * Returns the target path or a clarification result.
 */
function resolveDirectIntentTarget(
  intent: ClassifiedIntent,
  courseStructure: CourseStructure,
  nodeContextPath?: string
): { targetPath: string } | { clarification: DirectIntentResult } {
  // Use confidence-scored matching for better disambiguation
  const matches = resolveTargetPathWithMatches(
    intent.target?.identifier,
    intent.target?.path,
    courseStructure,
    nodeContextPath
  );

  // No matches found
  if (matches.length === 0) {
    return {
      clarification: {
        message:
          'Не удалось определить элемент. Уточните, какой именно урок или секцию вы хотите изменить.',
        requiresClarification: true,
      },
    };
  }

  // Check for ambiguous matches (multiple high-confidence matches)
  const highConfidenceMatches = matches.filter(
    m => m.confidence >= FUZZY_MATCH_CONFIDENCE_THRESHOLD
  );

  if (highConfidenceMatches.length > 1) {
    return {
      clarification: {
        message: formatMultipleMatchesMessage(highConfidenceMatches),
        requiresClarification: true,
      },
    };
  }

  // Single best match - proceed with action
  const bestMatch = matches[0];

  // If best match is below threshold and there are other matches, ask for clarification
  if (bestMatch.confidence < FUZZY_MATCH_CONFIDENCE_THRESHOLD && matches.length > 1) {
    return {
      clarification: {
        message: formatMultipleMatchesMessage(matches),
        requiresClarification: true,
      },
    };
  }

  return { targetPath: bestMatch.path };
}

/**
 * Handle direct execution intents (DELETE, MOVE) - no LLM generation needed.
 * Returns a DirectActionProposal for user confirmation.
 *
 * Uses confidence-scored fuzzy matching to handle ambiguous cases:
 * - Single match with confidence >= 0.7: execute directly
 * - Multiple matches: ask user to clarify
 * - No matches: ask for clarification
 */
export function handleDirectIntent(
  intent: ClassifiedIntent,
  courseStructure: CourseStructure,
  nodeContextPath?: string
): DirectIntentResult {
  const resolved = resolveDirectIntentTarget(intent, courseStructure, nodeContextPath);

  if ('clarification' in resolved) {
    return resolved.clarification;
  }

  const { targetPath } = resolved;

  switch (intent.intent) {
    case 'DELETE_LESSON':
    case 'DELETE_SECTION':
      return handleDeleteIntent(courseStructure, targetPath);

    case 'MOVE_ELEMENT':
      return handleMoveIntent(intent, courseStructure, targetPath);

    case 'UPDATE_FIELD':
      return handleUpdateFieldIntent(intent);

    default:
      return { message: 'Операция не поддерживается.' };
  }
}

// ============================================================================
// Info Query Handler
// ============================================================================

/**
 * Handle GET_INFO queries without modification.
 * Returns course information based on the user's question.
 */
export function handleInfoQuery(
  userMessage: string,
  courseStructure: CourseStructure
): { message: string } {
  const outline = generateCourseOutline(courseStructure);
  const sectionCount = outline.sections.length;
  const lessonCount = outline.sections.reduce((sum, s) => sum + s.lessons.length, 0);

  // Simple pattern matching for common queries
  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.includes('сколько') && lowerMessage.includes('урок')) {
    return { message: `В курсе ${lessonCount} уроков.` };
  }

  if (
    lowerMessage.includes('сколько') &&
    (lowerMessage.includes('секц') || lowerMessage.includes('раздел'))
  ) {
    return { message: `В курсе ${sectionCount} секций.` };
  }

  if (
    lowerMessage.includes('продолжительн') ||
    lowerMessage.includes('длительн') ||
    lowerMessage.includes('duration')
  ) {
    return { message: `Общая продолжительность курса: ${outline.total_duration_hours} часов.` };
  }

  // General info
  return {
    message: `Курс "${outline.course_title}" содержит ${sectionCount} секций и ${lessonCount} уроков. Общая продолжительность: ${outline.total_duration_hours} часов.`,
  };
}

// ============================================================================
// Targeted LLM Refinement
// ============================================================================

/** Parameters for resolving targeted context for LLM refinement */
export interface TargetedContextParams {
  classifiedIntent: ClassifiedIntent;
  courseStructure: CourseStructure;
  nodeContextBlockPath?: string;
}

/** Result of resolving targeted context */
export interface TargetedContextResult {
  targetedContext: unknown;
  allowedFieldsForTarget: readonly string[];
  targetPath: string | null;
}

/**
 * Resolve targeted context for LLM refinement.
 * Returns only the relevant element (~500 tokens) instead of the full course structure (~42K).
 */
export function resolveTargetedContext(params: TargetedContextParams): TargetedContextResult {
  const { classifiedIntent, courseStructure, nodeContextBlockPath } = params;

  const targetPath = resolveTargetPath(
    classifiedIntent.target?.identifier,
    classifiedIntent.target?.path,
    courseStructure,
    nodeContextBlockPath
  );

  if (targetPath) {
    // Send only the selected element (~500 tokens)
    const targetedContext = getElementAtPath(courseStructure, targetPath);
    const isLesson = isLessonPath(targetPath);
    const allowedFieldsForTarget = isLesson
      ? ['lesson_title', 'lesson_objectives', 'key_topics', 'estimated_duration_minutes']
      : ['section_title', 'section_description', 'learning_objectives'];

    return { targetedContext, allowedFieldsForTarget, targetPath };
  }

  // No specific element - use lightweight outline
  const targetedContext = generateCourseOutline(courseStructure);
  return {
    targetedContext,
    allowedFieldsForTarget: STAGE5_EDITABLE_FIELDS,
    targetPath: null,
  };
}
