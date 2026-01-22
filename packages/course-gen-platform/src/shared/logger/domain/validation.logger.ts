/**
 * Validation Domain Logger
 *
 * Логирование валидационных правил: Bloom's taxonomy, placeholders, duration.
 * WARN/ERROR автоматически пишутся в error_logs через enhanced logger.
 *
 * NOTE: Uses camelCase for TypeScript interfaces (courseId, ruleId)
 * but enhanced logger automatically converts to snake_case for DB.
 */

import logger from '../index';

/**
 * Base params shared between ERROR and WARNING validation issues
 */
interface ValidationIssueBase {
  courseId: string;
  ruleId: string;
  path: string;
  suggestion?: string;
}

/**
 * Validation issue params using discriminated union.
 * TypeScript enforces that ERROR has 'issues' and WARNING has 'warnings'.
 */
export type ValidationIssueParams =
  | (ValidationIssueBase & {
      severity: 'ERROR';
      issues: string[];
      warnings?: never;
    })
  | (ValidationIssueBase & {
      severity: 'WARNING';
      warnings: string[];
      issues?: never;
    });

export interface ValidationSuccessParams {
  courseId: string;
  ruleId: string;
  itemsChecked: number;
  passedItems: number;
  durationMs: number;
}

/**
 * Type guard for ValidationIssueParams
 */
export function isValidationIssueParams(obj: unknown): obj is ValidationIssueParams {
  if (typeof obj !== 'object' || obj === null) return false;
  const params = obj as Record<string, unknown>;
  return (
    typeof params.courseId === 'string' &&
    typeof params.ruleId === 'string' &&
    typeof params.path === 'string' &&
    (params.severity === 'ERROR' || params.severity === 'WARNING') &&
    (params.severity === 'ERROR' ? Array.isArray(params.issues) : Array.isArray(params.warnings))
  );
}

/**
 * Type guard for ValidationSuccessParams
 */
export function isValidationSuccessParams(obj: unknown): obj is ValidationSuccessParams {
  if (typeof obj !== 'object' || obj === null) return false;
  const params = obj as Record<string, unknown>;
  return (
    typeof params.courseId === 'string' &&
    typeof params.ruleId === 'string' &&
    typeof params.itemsChecked === 'number' &&
    typeof params.passedItems === 'number' &&
    typeof params.durationMs === 'number'
  );
}

/**
 * Логирует ошибку или предупреждение валидации.
 * ERROR → logger.error → error_logs (severity=ERROR)
 * WARNING → logger.warn → error_logs (severity=WARNING)
 *
 * @example
 * ```typescript
 * // Log validation error
 * logValidationIssue({
 *   courseId: 'abc-123',
 *   ruleId: 'placeholder_detection',
 *   severity: 'ERROR',
 *   path: 'sections[0].lessons[1]',
 *   issues: ['Found placeholder: [TBD]'],
 *   suggestion: 'Replace placeholders with actual content'
 * });
 *
 * // Log validation warning
 * logValidationIssue({
 *   courseId: 'abc-123',
 *   ruleId: 'duration_check',
 *   severity: 'WARNING',
 *   path: 'sections[0]',
 *   warnings: ['Duration exceeds recommended maximum']
 * });
 * ```
 */
export function logValidationIssue(params: ValidationIssueParams): void {
  const { courseId, ruleId, severity, path, suggestion } = params;
  const logData = {
    courseId,
    ruleId,
    severity,
    path,
    suggestion,
    ...(params.severity === 'ERROR' && { issues: params.issues }),
    ...(params.severity === 'WARNING' && { warnings: params.warnings }),
  };

  if (severity === 'ERROR') {
    logger.error(logData, `Validation error: ${ruleId}`);
  } else {
    logger.warn(logData, `Validation warning: ${ruleId}`);
  }
}

/**
 * Логирует успешную валидацию (INFO level, НЕ пишется в error_logs).
 *
 * @example
 * ```typescript
 * logValidationSuccess({
 *   courseId: 'abc-123',
 *   ruleId: 'blooms_taxonomy',
 *   itemsChecked: 15,
 *   passedItems: 15,
 *   durationMs: 42
 * });
 * ```
 */
export function logValidationSuccess(params: ValidationSuccessParams): void {
  const { courseId, ruleId, itemsChecked, passedItems, durationMs } = params;
  logger.info(
    { courseId, ruleId, itemsChecked, passedItems, durationMs },
    `Validation passed: ${ruleId}`
  );
}

/**
 * Логирует начало валидации (INFO level).
 *
 * @example
 * ```typescript
 * logValidationStart({
 *   courseId: 'abc-123',
 *   ruleId: 'placeholder_detection',
 *   itemsCount: 25
 * });
 * ```
 */
export function logValidationStart(params: {
  courseId: string;
  ruleId: string;
  itemsCount: number;
}): void {
  logger.info(params, `Validation started: ${params.ruleId}`);
}
