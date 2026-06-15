import { describe, expect, it } from 'vitest'
import type { JudgeVerdictDisplay } from '@megacampus/shared-types'
import { buildLessonInspectorQualityRecoverySummary } from '../lessonInspectorQualityRecovery'

type LessonContentHistoryRow = {
  id: string
  status: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

function createRow(overrides: Partial<LessonContentHistoryRow> = {}): LessonContentHistoryRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    status: overrides.status ?? 'completed',
    created_at: overrides.created_at ?? new Date().toISOString(),
    metadata: overrides.metadata ?? {},
  }
}

function createJudgeResult(reasoning?: string): JudgeVerdictDisplay {
  return {
    votingResult: {
      votes: [
        {
          judgeId: 'judge-1',
          modelId: 'judge-model',
          modelDisplayName: 'Judge Model',
          verdict: 'ESCALATE_TO_HUMAN',
          score: 0.42,
          criteria: {
            coherence: 0.42,
            accuracy: 0.42,
            completeness: 0.42,
            readability: 0.42,
          },
          reasoning,
          evaluatedAt: new Date('2026-04-07T10:00:00.000Z'),
        },
      ],
      consensusMethod: 'unanimous',
      finalVerdict: 'ESCALATE_TO_HUMAN',
      finalScore: 0.42,
      isThirdJudgeInvoked: false,
    },
    heuristicsPassed: false,
    heuristicsIssues: ['Judge found the lesson still incomplete after the final automatic rung'],
    highlightedSections: [],
    cascadeStage: 'clev_voting',
  }
}

describe('buildLessonInspectorQualityRecoverySummary', () => {
  it('maps final automatic review_required to the terminal rung, terminal model, and top reasons', () => {
    const rows = [
      createRow({
        id: 'review-required',
        status: 'review_required',
        created_at: '2026-04-07T10:05:00.000Z',
        metadata: {
          qualityRecovery: {
            mode: 'automatic',
            attempts: [
              {
                sequence_index: 0,
                phase_name: 'stage_6_simple',
                mode: 'automatic',
                is_initial_rung: true,
                max_regeneration_retries: 1,
              },
              {
                sequence_index: 1,
                phase_name: 'stage_6_normal',
                mode: 'automatic',
                is_initial_rung: false,
                promoted_from_phase_name: 'stage_6_simple',
                max_regeneration_retries: 0,
              },
              {
                sequence_index: 2,
                phase_name: 'stage_6_complex',
                mode: 'automatic',
                is_initial_rung: false,
                promoted_from_phase_name: 'stage_6_normal',
                max_regeneration_retries: 0,
              },
              {
                sequence_index: 3,
                phase_name: 'stage_6_auto_last_chance',
                mode: 'automatic',
                is_initial_rung: false,
                promoted_from_phase_name: 'stage_6_complex',
                max_regeneration_retries: 0,
                selected_model: 'z-ai/glm-5',
                model_used: 'z-ai/glm-5',
              },
            ],
            final_disposition: {
              outcome: 'review_required',
              terminal_phase_name: 'stage_6_auto_last_chance',
              terminal_mode: 'automatic',
              human_review_required: true,
            },
          },
          qa_signals: {
            remediation_action: 'manual_review_required',
            lesson_flags: ['critical_truncation'],
            course_flags: ['judge_score_below_threshold'],
          },
        },
      }),
      createRow({
        id: 'latest-rejected',
        status: 'rejected',
        created_at: '2026-04-07T10:04:00.000Z',
        metadata: {
          rejectionReason: 'Self-review blocked publication because the lesson ends mid-thought.',
        },
      }),
    ]

    const summary = buildLessonInspectorQualityRecoverySummary({
      lessonContentRows: rows as never,
      judgeResult: createJudgeResult(),
    })

    expect(summary).toMatchObject({
      recoveryMode: 'automatic',
      outcome: 'review_required',
      humanReviewRequired: true,
      automaticRungs: [
        'stage_6_simple',
        'stage_6_normal',
        'stage_6_complex',
        'stage_6_auto_last_chance',
      ],
      terminalPhaseName: 'stage_6_auto_last_chance',
      terminalModelId: 'z-ai/glm-5',
    })
    expect(summary?.reasons).toEqual([
      expect.objectContaining({
        source: 'self_review',
        text: 'Self-review blocked publication because the lesson ends mid-thought.',
      }),
      expect.objectContaining({
        source: 'judge',
        text: 'Judge found the lesson still incomplete after the final automatic rung',
      }),
      expect.objectContaining({
        source: 'qa_signals',
        text: expect.stringContaining('manual_review_required'),
      }),
    ])
  })

  it('keeps manual-top regeneration separate from the automatic ladder and exposes the manual model', () => {
    const rows = [
      createRow({
        id: 'manual-completed',
        status: 'completed',
        created_at: '2026-04-07T11:00:00.000Z',
        metadata: {
          qualityRecovery: {
            mode: 'manual',
            attempts: [
              {
                sequence_index: 0,
                phase_name: 'stage_6_manual_regeneration',
                mode: 'manual',
                is_initial_rung: true,
                max_regeneration_retries: 0,
                manual_triggered: true,
                selected_model: 'google/gemini-3.5-flash',
                model_used: 'google/gemini-3.5-flash',
              },
            ],
            final_disposition: {
              outcome: 'completed',
              terminal_phase_name: 'stage_6_manual_regeneration',
              terminal_mode: 'manual',
              human_review_required: false,
            },
            manual_triggered: true,
          },
        },
      }),
    ]

    const summary = buildLessonInspectorQualityRecoverySummary({
      lessonContentRows: rows as never,
      judgeResult: null,
    })

    expect(summary).toMatchObject({
      recoveryMode: 'manual',
      outcome: 'completed',
      humanReviewRequired: false,
      automaticRungs: [],
      terminalPhaseName: 'stage_6_manual_regeneration',
      terminalModelId: 'google/gemini-3.5-flash',
      manualRegenerationRequested: true,
    })
  })

  it('falls back to persisted row metadata when attempt-level model history is missing', () => {
    const rows = [
      createRow({
        id: 'review-required-legacy',
        status: 'review_required',
        created_at: '2026-04-07T12:00:00.000Z',
        metadata: {
          modelUsed: 'z-ai/glm-5',
          qualityRecovery: {
            mode: 'automatic',
            attempts: [
              {
                sequence_index: 0,
                phase_name: 'stage_6_complex',
                mode: 'automatic',
                is_initial_rung: true,
                max_regeneration_retries: 1,
              },
              {
                sequence_index: 1,
                phase_name: 'stage_6_auto_last_chance',
                mode: 'automatic',
                is_initial_rung: false,
                promoted_from_phase_name: 'stage_6_complex',
                max_regeneration_retries: 0,
              },
            ],
            final_disposition: {
              outcome: 'review_required',
              terminal_phase_name: 'stage_6_auto_last_chance',
              terminal_mode: 'automatic',
              human_review_required: true,
            },
          },
        },
      }),
    ]

    const summary = buildLessonInspectorQualityRecoverySummary({
      lessonContentRows: rows as never,
      judgeResult: null,
    })

    expect(summary?.terminalModelId).toBe('z-ai/glm-5')
  })

  it('returns null for legacy lessons without qualityRecovery metadata', () => {
    const rows = [
      createRow({
        id: 'legacy',
        status: 'completed',
        created_at: '2026-04-07T09:00:00.000Z',
        metadata: {
          quality_score: 0.88,
        },
      }),
    ]

    expect(
      buildLessonInspectorQualityRecoverySummary({
        lessonContentRows: rows as never,
        judgeResult: null,
      })
    ).toBeNull()
  })
})
