import {
  LessonQualitySignalsSchema,
  QualityRecoverySchema,
  STAGE6_QUALITY_RUNG_MODEL_IDS,
  type JudgeVerdictDisplay,
  type Stage6AutomaticQualityRungPhaseName,
  type LessonInspectorQualityRecoveryReason,
  type LessonInspectorQualityRecoverySummary,
  type LessonQualitySignals,
  type QualityRecovery,
} from '@megacampus/shared-types'

type LessonContentHistoryRow = {
  status: string | null
  metadata: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => getNonEmptyString(item))
    .filter((item): item is string => item !== null)
}

function parseQualityRecovery(metadata: unknown): QualityRecovery | null {
  if (!isRecord(metadata) || !isRecord(metadata.qualityRecovery)) {
    return null
  }

  const parsed = QualityRecoverySchema.safeParse(metadata.qualityRecovery)
  return parsed.success ? parsed.data : null
}

function parseQaSignals(metadata: unknown): LessonQualitySignals | null {
  if (!isRecord(metadata) || !isRecord(metadata.qa_signals)) {
    return null
  }

  const parsed = LessonQualitySignalsSchema.safeParse(metadata.qa_signals)
  return parsed.success ? parsed.data : null
}

function getMetadataModelId(metadata: unknown): string | null {
  if (!isRecord(metadata)) {
    return null
  }

  return getNonEmptyString(metadata.model_used) ?? getNonEmptyString(metadata.modelUsed)
}

function extractSelfReviewReason(rows: LessonContentHistoryRow[]): string | null {
  for (const row of rows) {
    const metadata = isRecord(row.metadata) ? row.metadata : null
    if (!metadata) {
      continue
    }

    const rejectionReason = getNonEmptyString(metadata.rejectionReason)
    if (rejectionReason) {
      return rejectionReason
    }

    if (!Array.isArray(metadata.issues)) {
      continue
    }

    for (const issue of metadata.issues) {
      if (!isRecord(issue)) {
        continue
      }

      const description = getNonEmptyString(issue.description)
      if (description) {
        return description
      }
    }
  }

  return null
}

function extractJudgeReason(judgeResult: JudgeVerdictDisplay | null): string | null {
  if (!judgeResult) {
    return null
  }

  const heuristicReason =
    judgeResult.heuristicsIssues?.find((reason) => getNonEmptyString(reason)) ??
    judgeResult.heuristicsResult?.failureReasons?.find((reason) => getNonEmptyString(reason))
  if (heuristicReason) {
    return heuristicReason
  }

  const voteReason = judgeResult.votingResult.votes
    .map((vote) => getNonEmptyString(vote.reasoning))
    .find((reason): reason is string => Boolean(reason))
  if (voteReason) {
    return voteReason
  }

  const singleJudgeIssue = judgeResult.singleJudgeResult?.issues?.find((issue) =>
    getNonEmptyString(issue.description)
  )
  if (singleJudgeIssue) {
    return singleJudgeIssue.description
  }

  return null
}

function extractQaSignalsReason(qaSignals: LessonQualitySignals | null): string | null {
  if (!qaSignals) {
    return null
  }

  const flags = [
    ...getStringArray(qaSignals.lesson_flags),
    ...getStringArray(qaSignals.course_flags),
  ]
  const uniqueFlags = [...new Set(flags)]
  const parts = [
    getNonEmptyString(qaSignals.remediation_action),
    uniqueFlags.length > 0 ? uniqueFlags.slice(0, 2).join(', ') : null,
    getNonEmptyString(qaSignals.selective_critic?.upgraded_action),
  ].filter((part): part is string => Boolean(part))

  return parts.length > 0 ? parts.join(' | ') : null
}

export function buildLessonInspectorQualityRecoverySummary({
  lessonContentRows,
  judgeResult,
}: {
  lessonContentRows: LessonContentHistoryRow[] | null | undefined
  judgeResult: JudgeVerdictDisplay | null
}): LessonInspectorQualityRecoverySummary | null {
  const rows = lessonContentRows ?? []

  const recoveryRow = rows.find((row) => parseQualityRecovery(row.metadata) !== null)
  if (!recoveryRow) {
    return null
  }

  const recovery = parseQualityRecovery(recoveryRow.metadata)
  if (!recovery) {
    return null
  }

  const qaSignals = parseQaSignals(recoveryRow.metadata)
  const finalDisposition = recovery.final_disposition
  const terminalPhaseName =
    finalDisposition?.terminal_phase_name ?? recovery.attempts.at(-1)?.phase_name
  if (!terminalPhaseName) {
    return null
  }

  const reasons: LessonInspectorQualityRecoveryReason[] = []
  const selfReviewReason = extractSelfReviewReason(rows)
  if (selfReviewReason) {
    reasons.push({ source: 'self_review', text: selfReviewReason })
  }

  const judgeReason = extractJudgeReason(judgeResult)
  if (judgeReason) {
    reasons.push({ source: 'judge', text: judgeReason })
  }

  const qaSignalsReason = extractQaSignalsReason(qaSignals)
  if (qaSignalsReason) {
    reasons.push({ source: 'qa_signals', text: qaSignalsReason })
  }

  return {
    recoveryMode: finalDisposition?.terminal_mode ?? recovery.mode,
    outcome:
      finalDisposition?.outcome ??
      (recoveryRow.status?.toLowerCase() === 'review_required' ? 'review_required' : 'completed'),
    humanReviewRequired:
      finalDisposition?.human_review_required ??
      recoveryRow.status?.toLowerCase() === 'review_required',
    automaticRungs: recovery.attempts
      .filter((attempt) => attempt.mode === 'automatic')
      .map((attempt) => attempt.phase_name as Stage6AutomaticQualityRungPhaseName),
    terminalPhaseName,
    terminalModelId:
      STAGE6_QUALITY_RUNG_MODEL_IDS[
        terminalPhaseName as keyof typeof STAGE6_QUALITY_RUNG_MODEL_IDS
      ] ?? getMetadataModelId(recoveryRow.metadata),
    manualRegenerationRequested:
      recovery.manual_triggered === true ||
      recovery.attempts.some((attempt) => attempt.mode === 'manual'),
    reasons,
  }
}
