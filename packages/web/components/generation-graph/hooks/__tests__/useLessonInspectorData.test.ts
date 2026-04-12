import { describe, expect, it } from 'vitest'
import {
  resolveLessonInspectorQualityScore,
  selectLessonInspectorContentRows,
} from '../useLessonInspectorData'

type LessonContentRowFixture = {
  id: string
  status: string | null
  created_at: string
  content: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

function createLessonContentRow(
  overrides: Partial<LessonContentRowFixture> = {}
): LessonContentRowFixture {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    status: overrides.status ?? 'completed',
    created_at: overrides.created_at ?? new Date().toISOString(),
    content: overrides.content ?? null,
    metadata: overrides.metadata ?? null,
  }
}

describe('selectLessonInspectorContentRows', () => {
  it('keeps an empty latest review_required row as review-needed without falling back to older preview', () => {
    const latestReviewRequired = createLessonContentRow({
      id: 'latest-review-required',
      status: 'review_required',
      created_at: '2026-04-06T12:00:00.000Z',
      content: null,
      metadata: null,
    })
    const olderCompleted = createLessonContentRow({
      id: 'older-completed',
      status: 'completed',
      created_at: '2026-04-06T11:00:00.000Z',
      metadata: { markdownContent: '# Older lesson preview' },
    })

    const selection = selectLessonInspectorContentRows([latestReviewRequired, olderCompleted])

    expect(selection.statusRow?.id).toBe('latest-review-required')
    expect(selection.previewRow).toBeNull()
  })

  it('uses the latest review_required row when it still has usable preview content', () => {
    const latestReviewRequired = createLessonContentRow({
      id: 'latest-review-required',
      status: 'review_required',
      created_at: '2026-04-06T12:00:00.000Z',
      metadata: { markdownContent: '# Latest review preview' },
    })
    const olderCompleted = createLessonContentRow({
      id: 'older-completed',
      status: 'completed',
      created_at: '2026-04-06T11:00:00.000Z',
      metadata: { markdownContent: '# Older lesson preview' },
    })

    const selection = selectLessonInspectorContentRows([latestReviewRequired, olderCompleted])

    expect(selection.statusRow?.id).toBe('latest-review-required')
    expect(selection.previewRow?.id).toBe('latest-review-required')
  })
})

describe('resolveLessonInspectorQualityScore', () => {
  it('prefers persisted metadata quality when judge payload is missing', () => {
    const statusRow = createLessonContentRow({
      metadata: {
        qualityScore: 0.88,
      },
    })

    const qualityScore = resolveLessonInspectorQualityScore({
      judgeResult: null,
      statusRow,
      previewRow: null,
    })

    expect(qualityScore).toBe(88)
  })

  it('falls back to the latest non-zero quality-recovery score instead of rendering 0%', () => {
    const statusRow = createLessonContentRow({
      status: 'review_required',
      metadata: {
        qualityRecovery: {
          mode: 'manual',
          manual_triggered: true,
          attempts: [
            {
              sequence_index: 0,
              phase_name: 'stage_6_auto_last_chance',
              mode: 'automatic',
              is_initial_rung: false,
              max_regeneration_retries: 0,
              selected_model: 'z-ai/glm-5',
              fallback_model: 'qwen/qwen3.5-plus-02-15',
              model_used: 'z-ai/glm-5',
              quality_score: 0.7161,
            },
            {
              sequence_index: 1,
              phase_name: 'stage_6_manual_regeneration',
              mode: 'manual',
              is_initial_rung: true,
              max_regeneration_retries: 0,
              manual_triggered: true,
              selected_model: 'openai/gpt-5.4',
              fallback_model: 'z-ai/glm-5',
              model_used: 'xiaomi/mimo-v2-flash',
              quality_score: 0,
            },
          ],
          final_disposition: {
            outcome: 'review_required',
            terminal_phase_name: 'stage_6_manual_regeneration',
            terminal_mode: 'manual',
            human_review_required: true,
          },
        },
      },
    })

    const qualityScore = resolveLessonInspectorQualityScore({
      judgeResult: null,
      statusRow,
      previewRow: null,
    })

    expect(qualityScore).toBe(72)
  })
})
