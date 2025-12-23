/**
 * Map technical step names to user-friendly labels.
 * Supports both Russian (ru) and English (en) locales.
 */

// Import translations from i18n messages
import ruMessages from '@/messages/ru/generation.json';
import enMessages from '@/messages/en/generation.json';

type StepNamesTranslations = typeof ruMessages.stepNames;

const TRANSLATIONS: Record<string, StepNamesTranslations> = {
  ru: ruMessages.stepNames,
  en: enMessages.stepNames,
};

// Default locale
let currentLocale: string = 'ru';

/**
 * Set the current locale for translations.
 * Call this when locale changes in the app.
 */
export function setTranslationLocale(locale: string): void {
  currentLocale = locale === 'en' ? 'en' : 'ru';
}

/**
 * Get current translation locale
 */
export function getTranslationLocale(): string {
  return currentLocale;
}

/**
 * Translate technical step name to user-friendly label.
 *
 * @param stepName - Technical step name (e.g., 'phase_start', 'section_1_complete')
 * @param locale - Optional locale override (defaults to current locale)
 * @returns Translated user-friendly label
 *
 * @example
 * translateStepName('phase_start') // "Начало фазы" (ru) or "Phase started" (en)
 * translateStepName('section_3_complete') // "Секция готова" (ru) or "Section complete" (en)
 */
export function translateStepName(stepName: string, locale?: string): string {
  const effectiveLocale = locale || currentLocale;
  const translations = TRANSLATIONS[effectiveLocale] || TRANSLATIONS.ru;

  // Check exact match first
  const key = stepName as keyof StepNamesTranslations;
  if (translations[key]) {
    return translations[key];
  }

  // Check lowercase
  const lowerKey = stepName.toLowerCase() as keyof StepNamesTranslations;
  if (translations[lowerKey]) {
    return translations[lowerKey];
  }

  // Handle dynamic section names like 'section_1_start', 'section_2_complete'
  const sectionStartMatch = stepName.match(/^section_(\d+)_start$/);
  if (sectionStartMatch) {
    const sectionNum = sectionStartMatch[1];
    return `${translations.section_start} ${sectionNum}`;
  }

  const sectionCompleteMatch = stepName.match(/^section_(\d+)_complete$/);
  if (sectionCompleteMatch) {
    const sectionNum = sectionCompleteMatch[1];
    return `${translations.section_complete} ${sectionNum}`;
  }

  const sectionErrorMatch = stepName.match(/^section_(\d+)_error$/);
  if (sectionErrorMatch) {
    const sectionNum = sectionErrorMatch[1];
    return `${translations.section_error} ${sectionNum}`;
  }

  // Check if contains known keywords
  for (const [dictKey, translation] of Object.entries(translations)) {
    if (stepName.toLowerCase().includes(dictKey.toLowerCase())) {
      return translation;
    }
  }

  // Return original with basic formatting
  return stepName.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Legacy export for backward compatibility.
 * Use translateStepName() instead.
 * @deprecated Use translateStepName() with locale parameter
 */
export const STEP_NAME_TRANSLATIONS = TRANSLATIONS.ru;
