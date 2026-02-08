/**
 * Stage Names - Single Source of Truth
 *
 * Localized stage names for course generation pipeline.
 * Used in notifications, UI, and logging.
 */

export interface StageName {
  ru: string;
  en: string;
}

/**
 * Stage names by stage number
 */
export const STAGE_NAMES: Record<number, StageName> = {
  2: { ru: 'Обработка документов', en: 'Document Processing' },
  3: { ru: 'Классификация документов', en: 'Document Classification' },
  4: { ru: 'Анализ структуры', en: 'Structure Analysis' },
  5: { ru: 'Генерация структуры', en: 'Structure Generation' },
  6: { ru: 'Генерация уроков', en: 'Lesson Content Generation' },
  7: { ru: 'Обогащение уроков', en: 'Lesson Enrichments' },
};

/**
 * Get localized stage name
 *
 * @param stage - Stage number (2-7)
 * @param locale - Locale ('ru' or 'en'), defaults to 'ru'
 * @returns Localized stage name or fallback
 *
 * @example
 * ```typescript
 * getStageName(2, 'ru') // 'Обработка документов'
 * getStageName(4, 'en') // 'Structure Analysis'
 * getStageName(99, 'ru') // 'Этап 99'
 * ```
 */
export function getStageName(stage: number, locale: 'ru' | 'en' = 'ru'): string {
  const stageName = STAGE_NAMES[stage];
  if (stageName) {
    return stageName[locale];
  }
  // Fallback for unknown stages
  return locale === 'ru' ? `Этап ${stage}` : `Stage ${stage}`;
}

/**
 * Get all stage names for a locale
 *
 * @param locale - Locale ('ru' or 'en')
 * @returns Record of stage number to localized name
 */
export function getAllStageNames(locale: 'ru' | 'en' = 'ru'): Record<number, string> {
  const result: Record<number, string> = {};
  for (const [stage, names] of Object.entries(STAGE_NAMES)) {
    result[Number(stage)] = names[locale];
  }
  return result;
}
