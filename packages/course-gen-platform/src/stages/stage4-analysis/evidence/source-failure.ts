export interface AuditedDocumentSourceFailure {
  reason: 'source_file_unrecoverable';
  recoveryRunId: string;
}

const LOWER_CASE_UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SOURCE_FAILURE_PREFIX = 'source_file_unrecoverable; recovery_run=';

export function parseLowerCaseUuidV4(value: string): string | undefined {
  return LOWER_CASE_UUID_V4_PATTERN.test(value) ? value : undefined;
}

export function parseAuditedSourceFailure(
  vectorStatus: string,
  errorMessage: string | null
): AuditedDocumentSourceFailure | undefined {
  if (vectorStatus !== 'failed' || errorMessage === null) return undefined;
  if (!errorMessage.startsWith(SOURCE_FAILURE_PREFIX)) return undefined;
  const recoveryRunId = parseLowerCaseUuidV4(errorMessage.slice(SOURCE_FAILURE_PREFIX.length));
  if (!recoveryRunId) return undefined;
  return { reason: 'source_file_unrecoverable', recoveryRunId };
}
