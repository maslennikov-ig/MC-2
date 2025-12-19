/**
 * Shared Prompt Utilities
 * @module shared/prompts
 *
 * Re-exports utilities for prompt generation and RAG context formatting.
 */

export {
  escapeXml,
  estimateTokens,
  formatRAGContextXML,
  filterChunksForSection,
  DEFAULT_CHARS_PER_TOKEN,
  DEFAULT_RAG_MAX_TOKENS,
} from './prompt-utils';

export type { PromptService } from './prompt-service';
export { createPromptService } from './prompt-service';
