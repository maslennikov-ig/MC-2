/**
 * Validation Domain Logger
 *
 * Логирование валидационных правил: Bloom's taxonomy, placeholders, duration.
 * WARN/ERROR автоматически пишутся в error_logs через enhanced logger.
 */

import logger from '../index';

export interface ValidationIssueParams {
  courseId: string;
  ruleId: string;
  severity: 'ERROR' | 'WARNING';
  path: string;
  suggestion?: string;
  issues?: string[];
  warnings?: string[];
}

export interface ValidationSuccessParams {
  courseId: string;
  ruleId: string;
  itemsChecked: number;
  passedItems: number;
  durationMs: number;
}

/**
 * Логирует ошибку или предупреждение валидации.
 * ERROR → logger.error → error_logs (severity=ERROR)
 * WARNING → logger.warn → error_logs (severity=WARNING)
 */
export function logValidationIssue(params: ValidationIssueParams): void {
  const { courseId, ruleId, severity, path, suggestion, issues, warnings } = params;
  const logData = {
    courseId,
    ruleId,
    severity,
    path,
    suggestion,
    ...(issues && { issues }),
    ...(warnings && { warnings }),
  };

  if (severity === 'ERROR') {
    logger.error(logData, `Validation error: ${ruleId}`);
  } else {
    logger.warn(logData, `Validation warning: ${ruleId}`);
  }
}

/**
 * Логирует успешную валидацию (INFO level, НЕ пишется в error_logs).
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
 */
export function logValidationStart(params: {
  courseId: string;
  ruleId: string;
  itemsCount: number;
}): void {
  logger.info(params, `Validation started: ${params.ruleId}`);
}
