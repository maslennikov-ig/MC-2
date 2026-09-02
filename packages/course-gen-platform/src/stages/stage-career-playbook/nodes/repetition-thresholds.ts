/**
 * Semantic repetition threshold selected from the 2026-08-29 Phase-0 baseline.
 *
 * At 0.85 the 14-playbook sample retained replicated, manually confirmed
 * repetition in both metric families: 8/6,594 within-view block pairs and
 * 18/6,829 within-block paragraph pairs.
 */
export const CAREER_PLAYBOOK_SEMANTIC_REPETITION_THRESHOLD = 0.85;

/** Must stay aligned with the baseline measurement unit. */
export const CAREER_PLAYBOOK_SEMANTIC_PARAGRAPH_MIN_CHARACTERS = 100;
