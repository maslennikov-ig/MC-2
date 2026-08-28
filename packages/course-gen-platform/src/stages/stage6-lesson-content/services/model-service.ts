import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

/**
 * `getJobTimeout` used to live here and was deleted on 2026-08-28 (mc2-jm25g).
 *
 * It read `stage_6_content`'s `timeout_ms` and called the result the Stage 6
 * BullMQ job timeout — and nothing called it. It was exported from `handler.ts`
 * and imported by no module, so the 300 000 ms it would have returned bounded
 * nothing, and the `DEFAULT_JOB_TIMEOUT_MS = 1_800_000` it fell back to, with
 * its comment about budget models needing generous timeouts, was never once
 * consulted. Both are gone rather than wired up: a BullMQ job is bounded by the
 * worker's lock and its renewal (`factory.ts`), and the per-request timeout is a
 * property of the request, which is where it now goes.
 */

/**
 * Detect language from lesson specification
 */
export function detectLanguage(spec: LessonSpecificationV2): 'ru' | 'en' {
  const hasCyrillic = /[а-яА-ЯёЁ]/.test(spec.title);
  return hasCyrillic ? 'ru' : 'en';
}
