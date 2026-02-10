/**
 * Prompt Type Definitions
 * @module shared/prompts/types
 *
 * Core types for hardcoded prompt system.
 * Re-exports shared types from @megacampus/shared-types for convenience.
 */

import type { PromptVariable, PromptStage } from '@megacampus/shared-types';

// ============================================================================
// RE-EXPORTS
// ============================================================================

/**
 * Prompt variable metadata (re-exported for convenience)
 */
export type { PromptVariable };

/**
 * Prompt stage identifier (re-exported for convenience)
 */
export type { PromptStage };

// ============================================================================
// TYPES
// ============================================================================

/**
 * Hardcoded prompt entry with template and metadata
 */
export interface HardcodedPrompt {
  stage: PromptStage;
  promptKey: string;
  promptName: string;
  promptDescription: string;
  promptTemplate: string;
  variables: PromptVariable[];
}
