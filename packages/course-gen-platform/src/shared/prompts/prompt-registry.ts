/**
 * Hardcoded Prompt Registry - 22 Prompts from Stage 3-7
 *
 * Central registry of all hardcoded prompts extracted from stage files.
 * Provides fallback when prompts are not available in the database.
 *
 * @module shared/prompts/prompt-registry
 *
 * Prompt Inventory:
 * - Stage 3: 2 classification prompts (comparative, independent)
 * - Stage 4: 4 analysis phases (classification, scope, expert, synthesis)
 * - Stage 5: 2 metadata/sections prompts (metadata, sections)
 * - Stage 6: 6 lesson content prompts (serial_generator, planner, expander, assembler, smoother, judge)
 * - Stage 7: 4 enrichment prompts (course_card, lesson_card, cover_system, cover_user)
 *
 * Structure:
 * - promptKey: Unique identifier (e.g., "stage4_phase1_classification")
 * - promptName: Human-readable name
 * - promptDescription: Brief description of prompt purpose
 * - promptTemplate: Full prompt template with {{variable}} placeholders
 * - variables: List of required/optional variables
 *
 * @example
 * ```typescript
 * const prompt = PROMPT_REGISTRY.get('stage6_planner');
 * console.log(prompt.promptName); // "Stage 6 - Planner: Lesson Outline Generation"
 * console.log(prompt.variables); // [{ name: 'lessonSpec', required: true, ... }]
 * ```
 */

import type { PromptStage } from '@megacampus/shared-types';

// ============================================================================
// RE-EXPORTS: Types
// ============================================================================

export type { HardcodedPrompt, PromptVariable, PromptStage } from './types.js';

// ============================================================================
// RE-EXPORTS: Stage Prompts
// ============================================================================

export { stage3Prompts } from './stage3-prompts.js';
export { stage4Prompts } from './stage4-prompts.js';
export { stage5Prompts } from './stage5-prompts.js';
export { stage6Prompts } from './stage6-prompts.js';
export { stage7Prompts } from './stage7-prompts.js';

// ============================================================================
// IMPORTS: For Registry Construction
// ============================================================================

import type { HardcodedPrompt } from './types.js';
import { stage3Prompts } from './stage3-prompts.js';
import { stage4Prompts } from './stage4-prompts.js';
import { stage5Prompts } from './stage5-prompts.js';
import { stage6Prompts } from './stage6-prompts.js';
import { stage7Prompts } from './stage7-prompts.js';

// ============================================================================
// REGISTRY CONSTRUCTION
// ============================================================================

/**
 * Central prompt registry: Map<promptKey, HardcodedPrompt>
 *
 * All 22 prompts indexed by promptKey for fast lookup.
 */
export const PROMPT_REGISTRY = new Map<string, HardcodedPrompt>([
  ...stage3Prompts.map(p => [p.promptKey, p] as [string, HardcodedPrompt]),
  ...stage4Prompts.map(p => [p.promptKey, p] as [string, HardcodedPrompt]),
  ...stage5Prompts.map(p => [p.promptKey, p] as [string, HardcodedPrompt]),
  ...stage6Prompts.map(p => [p.promptKey, p] as [string, HardcodedPrompt]),
  ...stage7Prompts.map(p => [p.promptKey, p] as [string, HardcodedPrompt]),
]);

/**
 * Get all prompts for a specific stage
 *
 * @param stage - Stage identifier
 * @returns Array of prompts for that stage
 */
export function getPromptsByStage(stage: PromptStage): HardcodedPrompt[] {
  return Array.from(PROMPT_REGISTRY.values()).filter(p => p.stage === stage);
}

/**
 * Get prompt by key
 *
 * @param promptKey - Unique prompt identifier
 * @returns Prompt or undefined if not found
 */
export function getPrompt(promptKey: string): HardcodedPrompt | undefined {
  return PROMPT_REGISTRY.get(promptKey);
}
