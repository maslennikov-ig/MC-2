export type Stage5StructuralQualityStatus = 'critical' | 'warning' | 'pass';
export type Stage5StructuralIssueSeverity = 'critical' | 'warning';

export interface Stage5StructuralQualityIssue {
  code: string;
  severity: Stage5StructuralIssueSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface Stage5StructuralQualityState {
  status: Stage5StructuralQualityStatus;
  passed: boolean;
  hasCriticalIssues: boolean;
  profileId: string;
  totalLessons: number;
  computedDurationHours: number;
  criticalIssues: Stage5StructuralQualityIssue[];
  warnings: Stage5StructuralQualityIssue[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseIssues(
  value: unknown,
  fallbackSeverity: Stage5StructuralIssueSeverity
): Stage5StructuralQualityIssue[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap(item => {
    const issue = asRecord(item);
    if (!issue || typeof issue.code !== 'string' || typeof issue.message !== 'string') return [];

    const details = asRecord(issue.details);
    return [
      {
        code: issue.code,
        message: issue.message,
        severity:
          issue.severity === 'critical' || issue.severity === 'warning'
            ? issue.severity
            : fallbackSeverity,
        ...(details ? { details } : {}),
      },
    ];
  });
}

/**
 * Normalize the persisted Stage 5 structural-quality result for every UI and
 * approval consumer. Returns null when the metadata has no recognizable
 * structural-quality signal.
 */
export function deriveStage5StructuralQualityState(
  generationMetadata: unknown
): Stage5StructuralQualityState | null {
  const metadata = asRecord(generationMetadata);
  const qualityScores = asRecord(metadata?.quality_scores);
  const structure = asRecord(qualityScores?.structure);
  if (!structure) return null;

  const rawCriticalIssues = Array.isArray(structure.criticalIssues) ? structure.criticalIssues : [];
  const rawWarnings = Array.isArray(structure.warnings) ? structure.warnings : [];
  const hasKnownSignal =
    typeof structure.passed === 'boolean' ||
    typeof structure.hasCriticalIssues === 'boolean' ||
    Array.isArray(structure.criticalIssues) ||
    Array.isArray(structure.warnings);
  if (!hasKnownSignal) return null;

  const criticalIssues = parseIssues(rawCriticalIssues, 'critical');
  const warnings = parseIssues(rawWarnings, 'warning');
  const hasCriticalIssues = structure.hasCriticalIssues === true || rawCriticalIssues.length > 0;
  const status: Stage5StructuralQualityStatus = hasCriticalIssues
    ? 'critical'
    : rawWarnings.length > 0 || structure.passed === false
      ? 'warning'
      : 'pass';

  return {
    status,
    passed: structure.passed === true && !hasCriticalIssues,
    hasCriticalIssues,
    profileId: typeof structure.profileId === 'string' ? structure.profileId : 'unknown',
    totalLessons: typeof structure.totalLessons === 'number' ? structure.totalLessons : 0,
    computedDurationHours:
      typeof structure.computedDurationHours === 'number' ? structure.computedDurationHours : 0,
    criticalIssues,
    warnings,
  };
}
