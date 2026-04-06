import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LessonMatrix } from '../module/LessonMatrix'
import { Stage6ControlTower } from '../stage6/dashboard/Stage6ControlTower'
import { Stage6InspectorContent } from '../stage6/inspector/Stage6InspectorContent'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations:
    (namespace?: string) =>
    (key: string) => {
      const messages: Record<string, string> = {
        'generation.lessonMatrix.title': 'Title',
        'generation.lessonMatrix.quality': 'Quality',
        'generation.lessonMatrix.action': 'Action',
        'generation.lessonMatrix.preview': 'Preview',
        'generation.lessonMatrix.pause': 'Pause',
        'generation.lessonMatrix.retry': 'Retry',
        'generation.lessonMatrix.prioritize': 'Prioritize',
        'generation.lessonMatrix.reviewRequired': 'Needs review',
        'generation.stage6.controlTower.ready': 'ready',
        'generation.stage6.controlTower.regenerateAll': 'Retry Failed',
        'generation.stage6.controlTower.exportAll': 'Export',
        'generation.stage6.controlTower.tokensUsed': 'Tokens',
        'generation.stage6.controlTower.quality': 'Quality',
        'generation.stage6.status.completed': 'completed',
        'generation.stage6.status.approved': 'approved',
        'generation.stage6.status.active': 'active',
        'generation.stage6.status.pending': 'pending',
        'generation.stage6.status.error': 'failed',
        'generation.stage6.status.reviewRequired': 'needs review',
        'generation.stage6.inspector.preview': 'Preview',
        'generation.stage6.inspector.quality': 'Quality',
        'generation.stage6.inspector.sources': 'Sources',
        'generation.stage6.inspector.input': 'Input',
        'generation.stage6.inspector.blueprint': 'Blueprint',
        'generation.stage6.inspector.trace': 'Trace',
        'generation.stage6.inspector.card': 'Card',
        'generation.stage6.inspector.approve': 'Approve',
        'generation.stage6.inspector.edit': 'Edit',
        'generation.stage6.inspector.regenerate': 'Regenerate',
        'generation.stage6.inspector.approving': 'Approving...',
        'generation.stage6.inspector.regenerating': 'Regenerating...',
        'generation.stage6.inspector.noContent': 'Lesson content unavailable',
        'generation.stage6.inspector.noMetadata': 'Metadata unavailable',
        'generation.stage6.inspector.error': 'Generation error',
        'generation.stage6.inspector.retryLabel': 'Retry',
        'generation.stage6.inspector.cardUnavailable': 'Card unavailable',
        'generation.stage6.inspector.reviewRequiredTitle': 'Manual review required',
        'generation.stage6.inspector.reviewRequiredDescription':
          'Generation finished fail-open and now requires manual review.',
      }

      return messages[namespace ? `${namespace}.${key}` : key] ?? key
    },
}))

vi.mock('../../../contexts/LessonEditContext', () => ({
  useLessonEdit: () => null,
}))

describe('review-required UI surfaces', () => {
  it('renders a needs-review badge in the lesson matrix', () => {
    render(
      <LessonMatrix
        lessons={[
          {
            lessonId: '1.1',
            lessonNumber: 1,
            title: 'Lesson 1',
            status: 'completed',
            pipelineState: { nodes: [] },
            qualityScore: 0.72,
            costUsd: 0,
            durationMs: 1000,
            retryCount: 0,
            canRetry: false,
            totalTokens: 100,
            needsReview: true,
          } as never,
        ]}
        onLessonClick={() => {}}
        onLessonAction={() => {}}
      />
    )

    expect(screen.getByText('Needs review')).toBeInTheDocument()
  })

  it('renders review-required counts in the control tower', () => {
    render(
      <Stage6ControlTower
        moduleTitle="Module 1"
        moduleId="module_1"
        stats={{
          totalTokens: 1200,
          avgQuality: 72,
          statusCounts: {
            completed: 1,
            approved: 0,
            active: 0,
            pending: 0,
            failed: 0,
            reviewRequired: 1,
          },
          totalDurationMs: 1000,
        } as never}
        modelTier="standard"
        onRegenerateAll={() => {}}
        onExportAll={() => {}}
      />
    )

    expect(screen.getByText(/needs review/i)).toBeInTheDocument()
  })

  it('renders a manual-review callout in the lesson inspector', () => {
    render(
      <Stage6InspectorContent
        content={null}
        rawMarkdown={null}
        metadata={null}
        logs={[]}
        selfReviewResult={null}
        judgeResult={null}
        stats={{
          tokens: 100,
          durationMs: 1000,
          modelTier: 'standard',
          quality: 72,
        }}
        status="completed"
        needsReview={true as never}
        onApprove={() => {}}
        onEdit={() => {}}
        onRegenerate={() => {}}
        locale="en"
      />
    )

    expect(screen.getByText('Manual review required')).toBeInTheDocument()
    expect(
      screen.getByText('Generation finished fail-open and now requires manual review.')
    ).toBeInTheDocument()
  })
})
