/**
 * Stage 6 Hardcoded Prompts - Lesson Content Generation (2 prompts)
 * @module shared/prompts/stage6-prompts
 *
 * Stage 6: Lesson Content Generation
 * - Single-Call Generator: the whole lesson in one call, with a duration-aware word budget
 * - Serial Generator: one section at a time, used by the section regenerator
 *
 * There were seven. Stage 6 was refactored from a six-node pipeline to three nodes and then to
 * the single call, and the prompts of the retired nodes — `stage6_planner`, `stage6_expander`,
 * `stage6_assembler`, `stage6_smoother`, `stage6_judge` — were kept "for historical reference".
 * Nothing rendered them: `renderPrompt` is called with two Stage 6 keys and no other, and the live
 * Section-Expander builds its own prompt in `judge/section-expander/expander-prompt.ts`.
 *
 * Kept prompts that nothing renders are not free. On 2026-08-28 a fix (`mc2-udj0b`) edited
 * `stage6_expander` to stop demanding that the mandatory practical example be a callout — a correct
 * edit, delivered, reviewed, and read by no model. The measurement that followed (`mc2-ctlar`) is
 * what found it. They were also **active rows** in `prompt_templates`, so the pipeline-admin screen
 * offered all five for editing, where changing one would have looked like changing the pipeline —
 * the same failure `prompt-deactivation.ts` was written for (`mc2-jraut`).
 */

import type { HardcodedPrompt } from './types.js';

// ============================================================================
// STAGE 6 PROMPTS (2 total)
// ============================================================================

import { serialGeneratorPrompt } from './stage6/serial-generator.js';
import { singleCallGeneratorPrompt } from './stage6/single-call-generator.js';

export const stage6Prompts: HardcodedPrompt[] = [serialGeneratorPrompt, singleCallGeneratorPrompt];
