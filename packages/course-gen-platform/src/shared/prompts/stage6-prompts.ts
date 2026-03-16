/**
 * Stage 6 Hardcoded Prompts - Lesson Content Generation (7 prompts)
 * @module shared/prompts/stage6-prompts
 *
 * Stage 6: Lesson Content Generation
 * - Serial Generator: Section-by-section content with context window (ACTIVE - used by section-regenerator)
 * - Single-Call Generator: Complete lesson in one call with duration-aware word budget (ACTIVE - primary method)
 * - Planner: Lesson outline generation (DEPRECATED)
 * - Expander: Section expansion (DEPRECATED)
 * - Assembler: Content assembly (DEPRECATED)
 * - Smoother: Transition refinement (DEPRECATED)
 * - Judge: Quality validation (ACTIVE)
 *
 * Note: Stage 6 refactored from 6-node to 3-node pipeline, then to single-call approach.
 * Deprecated prompts kept for historical reference.
 */

import type { HardcodedPrompt } from './types.js';

// ============================================================================
// STAGE 6 PROMPTS (7 total)
// ============================================================================

import { serialGeneratorPrompt } from './stage6/serial-generator.js';
import { singleCallGeneratorPrompt } from './stage6/single-call-generator.js';
import { plannerPrompt } from './stage6/planner.js';
import { expanderPrompt } from './stage6/expander.js';
import { assemblerPrompt } from './stage6/assembler.js';
import { smootherPrompt } from './stage6/smoother.js';
import { judgePrompt } from './stage6/judge.js';

export const stage6Prompts: HardcodedPrompt[] = [
  serialGeneratorPrompt,
  singleCallGeneratorPrompt,
  plannerPrompt,
  expanderPrompt,
  assemblerPrompt,
  smootherPrompt,
  judgePrompt,
];
