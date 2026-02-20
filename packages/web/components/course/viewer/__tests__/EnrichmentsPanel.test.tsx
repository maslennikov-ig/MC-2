/* eslint-disable */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Database } from '@/types/database.generated'

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

const mockStartGeneration = vi.fn()
const mockCancelGeneration = vi.fn()
const mockResumeGeneration = vi.fn()
const mockIsGenerating = vi.fn(() => false)
const mockGetProgress = vi.fn(() => undefined)

vi.mock('next-intl', () => ({
  useTranslations: vi.fn(() => (key: string) => key),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/lib/hooks/useEnrichmentGeneration', () => ({
  useEnrichmentGeneration: vi.fn(() => ({
    startGeneration: mockStartGeneration,
    cancelGeneration: mockCancelGeneration,
    isGenerating: mockIsGenerating,
    getProgress: mockGetProgress,
    resumeGeneration: mockResumeGeneration,
    isRecentlyCompleted: vi.fn(() => false),
    clearRecentlyCompleted: vi.fn(),
  })),
}))

vi.mock('@megacampus/shared-types', () => ({
  isOnDemandType: vi.fn((type: string) =>
    ['quiz', 'audio', 'presentation', 'cover', 'card', 'nlm_audio', 'nlm_video'].includes(type)
  ),
  isActiveGenerationStatus: vi.fn((status: string) =>
    ['pending', 'draft_generating', 'draft_ready', 'generating'].includes(status)
  ),
}))

vi.mock('../components/UnifiedEnrichmentCard', () => ({
  UnifiedEnrichmentCard: ({ type, existingEnrichment, onGenerate }: any) => (
    <button
      data-testid={`placeholder-${type}`}
      data-existing-id={existingEnrichment?.id ?? ''}
      onClick={() => onGenerate({ source: 'test' })}
    >
      {type}
    </button>
  ),
}))

vi.mock('../components/EnrichmentGeneratingCard', () => ({
  EnrichmentGeneratingCard: ({ type }: any) => <div data-testid={`generating-${type}`} />,
}))

vi.mock('../components/EnrichmentCard', () => ({
  EnrichmentCard: ({ enrichment }: any) => <div data-testid={`card-${enrichment.id}`} />,
}))

vi.mock('../enrichments/EnrichmentErrorBoundary', () => ({
  EnrichmentErrorBoundary: ({ children }: any) => <>{children}</>,
}))

import { EnrichmentsPanel } from '@/components/course/viewer/components/EnrichmentsPanel'

function makeEnrichment(overrides: Partial<EnrichmentRow>): EnrichmentRow {
  return {
    id: 'enrichment-1',
    lesson_id: 'lesson-1',
    course_id: 'course-1',
    enrichment_type: 'quiz',
    status: 'completed',
    order_index: 1,
    title: null,
    content: null,
    asset_id: null,
    metadata: null,
    generation_attempt: 1,
    error_message: null,
    error_details: null,
    generated_at: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  } as EnrichmentRow
}

describe('EnrichmentsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes nlm generation through startGeneration', () => {
    render(
      <EnrichmentsPanel
        enrichments={[]}
        lessonId="lesson-1"
        courseId="course-1"
        onRefreshEnrichments={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('placeholder-nlm_audio'))
    fireEvent.click(screen.getByTestId('placeholder-nlm_video'))
    fireEvent.click(screen.getByTestId('placeholder-video'))

    expect(mockStartGeneration).toHaveBeenCalledWith('nlm_audio', { source: 'test' })
    expect(mockStartGeneration).toHaveBeenCalledWith('nlm_video', { source: 'test' })
    expect(mockStartGeneration).not.toHaveBeenCalledWith('video', { source: 'test' })
  })

  it('passes draft_ready nlm enrichments into unified placeholder cards', () => {
    const draftReadyNlmAudio = makeEnrichment({
      id: 'nlm-audio-draft',
      enrichment_type: 'nlm_audio' as any,
      status: 'draft_ready',
      content: {
        type: 'nlm_audio',
        script: 'Draft script',
        duration_seconds: 60,
      },
    })

    render(
      <EnrichmentsPanel
        enrichments={[draftReadyNlmAudio]}
        lessonId="lesson-1"
        courseId="course-1"
        onRefreshEnrichments={vi.fn()}
      />
    )

    expect(screen.getByTestId('placeholder-nlm_audio')).toHaveAttribute(
      'data-existing-id',
      'nlm-audio-draft'
    )
  })
})
