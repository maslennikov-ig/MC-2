/**
 * Unified setNestedValue utility
 *
 * Sets a nested value in an object using a dot-delimited path.
 * Supports array index notation like sections[0].lessons[1].title.
 * Includes prototype pollution protection.
 *
 * @module shared/utils/nested-value
 */

const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Set a nested value in an object using a path string.
 *
 * Supports:
 * - Dot notation: "course_title"
 * - Array indices: "sections[0].lessons[1].lesson_title"
 * - Mixed: "sections[0].section_learning_objectives"
 *
 * @param obj - The object to modify (mutated in place)
 * @param path - Dot-delimited path, optionally with array indices
 * @param value - The value to set
 * @throws Error if path is empty, object is invalid, or path contains forbidden keys
 */
export function setNestedValue(obj: unknown, path: string, value: unknown): void {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Invalid object: must be a non-null object');
  }

  // Normalize array indices: "sections[0].lessons[1].title"
  // becomes ["sections", "0", "lessons", "1", "title"]
  const keys = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(k => k !== '');

  if (keys.length === 0) {
    throw new Error('Invalid path: path cannot be empty');
  }

  if (keys.some(k => FORBIDDEN_KEYS.includes(k))) {
    throw new Error('Invalid path: contains restricted property name');
  }

  let current = obj as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];

    if (!(key in current)) {
      // Create array if next key is numeric, otherwise object
      const nextKey = keys[i + 1];
      current[key] = /^\d+$/.test(nextKey) ? [] : {};
    }

    if (typeof current[key] !== 'object' || current[key] === null) {
      throw new Error(`Cannot traverse path: "${key}" is not an object`);
    }

    current = current[key] as Record<string, unknown>;
  }

  const finalKey = keys[keys.length - 1];
  current[finalKey] = value;
}
