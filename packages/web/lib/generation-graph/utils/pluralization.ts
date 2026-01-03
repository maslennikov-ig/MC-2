/**
 * Pluralization utilities for Russian language.
 *
 * Russian has three forms:
 * - Singular (1, 21, 31, etc.)
 * - Dual/Paucal (2-4, 22-24, 32-34, etc.)
 * - Plural (0, 5-20, 25-30, etc.)
 *
 * @example
 * getModuleWord(1, t)  // "модуль"
 * getModuleWord(3, t)  // "модуля"
 * getModuleWord(5, t)  // "модулей"
 * getModuleWord(21, t) // "модуль"
 */

type TranslationFn = (key: string) => string;

/**
 * Determines Russian plural form based on count.
 * @param count - The number to determine plural form for
 * @returns 'one' | 'few' | 'many' - The plural form category
 */
export function getRussianPluralForm(count: number): 'one' | 'few' | 'many' {
  const absCount = Math.abs(count);
  const lastTwo = absCount % 100;
  const lastOne = absCount % 10;

  // Special case for 11-14 (always "many")
  if (lastTwo >= 11 && lastTwo <= 14) {
    return 'many';
  }

  if (lastOne === 1) {
    return 'one';
  }

  if (lastOne >= 2 && lastOne <= 4) {
    return 'few';
  }

  return 'many';
}

/**
 * Get the correct plural form for "module" in Russian.
 * @param count - Number of modules
 * @param t - Translation function
 * @param namespace - Translation namespace (default: 'common')
 */
export function getModuleWord(
  count: number,
  t: TranslationFn,
  namespace: 'common' | 'endNode' | 'selectionToolbar' = 'common'
): string {
  const form = getRussianPluralForm(count);
  const keys = {
    common: {
      one: 'common.moduleWord',
      few: 'common.modulesWord',
      many: 'common.modulesManyWord',
    },
    endNode: {
      one: 'endNode.moduleWord',
      few: 'endNode.modulesWord',
      many: 'endNode.modulesManyWord',
    },
    selectionToolbar: {
      one: 'selectionToolbar.moduleWord',
      few: 'selectionToolbar.modulesWord',
      many: 'selectionToolbar.modulesManyWord',
    },
  };

  return t(keys[namespace][form]);
}

/**
 * Get the correct plural form for "lesson" in Russian.
 * @param count - Number of lessons
 * @param t - Translation function
 * @param namespace - Translation namespace (default: 'common')
 */
export function getLessonWord(
  count: number,
  t: TranslationFn,
  namespace: 'common' | 'endNode' | 'selectionToolbar' = 'common'
): string {
  const form = getRussianPluralForm(count);
  const keys = {
    common: {
      one: 'common.lessonWord',
      few: 'common.lessonsWord',
      many: 'common.lessonsManyWord',
    },
    endNode: {
      one: 'endNode.lessonWord',
      few: 'endNode.lessonsWord',
      many: 'endNode.lessonsManyWord',
    },
    selectionToolbar: {
      one: 'selectionToolbar.lesson',
      few: 'selectionToolbar.lessons2_4',
      many: 'selectionToolbar.lessonsMany',
    },
  };

  return t(keys[namespace][form]);
}

/**
 * Format a count with its plural word.
 * @param count - The number
 * @param getWord - Function to get the word (getModuleWord or getLessonWord)
 * @param t - Translation function
 */
export function formatCountWithWord(
  count: number,
  getWord: (count: number, t: TranslationFn) => string,
  t: TranslationFn
): string {
  return `${count} ${getWord(count, t)}`;
}
