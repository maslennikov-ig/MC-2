/**
 * Branded types for lesson identifiers
 *
 * Prevents confusion between lesson UUIDs (database primary keys)
 * and lesson labels (human-readable "1.1" format)
 *
 * Uses TypeScript branded types pattern (nominal typing) to enforce
 * type safety at compile time.
 *
 * @see https://github.com/microsoft/typescript/wiki/FAQ#can-i-make-a-type-alias-nominal
 */

/**
 * Branded type for lesson UUID (database primary key)
 *
 * Format: UUID v4 (e.g., "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
 *
 * The brand property creates a unique type identity that prevents
 * accidental assignment between similar string types.
 */
export type LessonUUID = string & { readonly __brand: 'LessonUUID' };

/**
 * Branded type for lesson label (human-readable identifier)
 *
 * Format: "section.lesson" (e.g., "1.1", "2.3", "10.15")
 *
 * The brand property creates a unique type identity that prevents
 * accidental assignment between similar string types.
 */
export type LessonLabel = string & { readonly __brand: 'LessonLabel' };

/**
 * Regular expression for validating UUID v4 format
 * @internal
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Regular expression for validating lesson label format (section.lesson)
 * @internal
 */
const LESSON_LABEL_REGEX = /^\d+\.\d+$/;

/**
 * Validate and create a LessonUUID from a string
 *
 * @param uuid - String to validate as UUID
 * @returns Branded LessonUUID type
 * @throws Error if not a valid UUID v4 format
 *
 * @example
 * ```typescript
 * const lessonUuid = createLessonUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
 * // Valid: can use in functions expecting LessonUUID
 *
 * createLessonUUID('1.1');
 * // Error: Invalid LessonUUID format: "1.1". Expected UUID v4.
 * ```
 */
export function createLessonUUID(uuid: string): LessonUUID {
  if (!UUID_V4_REGEX.test(uuid)) {
    throw new Error(`Invalid LessonUUID format: "${uuid}". Expected UUID v4.`);
  }
  return uuid as LessonUUID;
}

/**
 * Validate and create a LessonLabel from a string
 *
 * @param label - String to validate as lesson label
 * @returns Branded LessonLabel type
 * @throws Error if not a valid "section.lesson" format
 *
 * @example
 * ```typescript
 * const lessonLabel = createLessonLabel('1.1');
 * // Valid: can use in functions expecting LessonLabel
 *
 * createLessonLabel('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
 * // Error: Invalid LessonLabel format: "a1b2...". Expected "section.lesson" (e.g., "1.1").
 * ```
 */
export function createLessonLabel(label: string): LessonLabel {
  if (!LESSON_LABEL_REGEX.test(label)) {
    throw new Error(
      `Invalid LessonLabel format: "${label}". Expected "section.lesson" (e.g., "1.1").`
    );
  }
  return label as LessonLabel;
}

/**
 * Type guard to check if a string is a valid UUID format
 *
 * @param value - String to check
 * @returns true if valid UUID v4 format
 *
 * @example
 * ```typescript
 * if (isValidUUID(someString)) {
 *   const uuid = someString as LessonUUID;
 *   // Use uuid safely
 * }
 * ```
 */
export function isValidUUID(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}

/**
 * Type guard to check if a string is a valid lesson label format
 *
 * @param value - String to check
 * @returns true if valid "section.lesson" format
 *
 * @example
 * ```typescript
 * if (isValidLessonLabel(someString)) {
 *   const label = someString as LessonLabel;
 *   // Use label safely
 * }
 * ```
 */
export function isValidLessonLabel(value: string): boolean {
  return LESSON_LABEL_REGEX.test(value);
}

/**
 * Safely try to create LessonUUID, returns null if invalid
 *
 * @param uuid - String to validate
 * @returns LessonUUID if valid, null otherwise
 *
 * @example
 * ```typescript
 * const maybeUuid = tryCreateLessonUUID(userInput);
 * if (maybeUuid !== null) {
 *   // Use maybeUuid as LessonUUID
 * } else {
 *   // Handle invalid input
 * }
 * ```
 */
export function tryCreateLessonUUID(uuid: string): LessonUUID | null {
  return isValidUUID(uuid) ? (uuid as LessonUUID) : null;
}

/**
 * Safely try to create LessonLabel, returns null if invalid
 *
 * @param label - String to validate
 * @returns LessonLabel if valid, null otherwise
 *
 * @example
 * ```typescript
 * const maybeLabel = tryCreateLessonLabel(userInput);
 * if (maybeLabel !== null) {
 *   // Use maybeLabel as LessonLabel
 * } else {
 *   // Handle invalid input
 * }
 * ```
 */
export function tryCreateLessonLabel(label: string): LessonLabel | null {
  return isValidLessonLabel(label) ? (label as LessonLabel) : null;
}
