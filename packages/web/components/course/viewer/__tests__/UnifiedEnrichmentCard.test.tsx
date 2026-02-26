/* eslint-disable */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { Database } from '@/types/database.generated'

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']

vi.mock('next-intl', () => ({
  useTranslations: vi.fn(() => (key: string) => key),
}))

vi.mock('framer-motion', () => ({
  // Strip motion-only props to avoid React DOM warnings in test output.
  motion: {
    div: ({ children, initial, animate, exit, transition, whileHover, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
    h3: ({ children, initial, animate, exit, transition, whileHover, ...props }: any) => (
      <h3 {...props}>{children}</h3>
    ),
    p: ({ children, initial, animate, exit, transition, whileHover, ...props }: any) => (
      <p {...props}>{children}</p>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock('../components/EnrichmentCardImage', () => ({
  EnrichmentCardImage: () => <div data-testid="enrichment-card-image" />,
}))

vi.mock('../components/EnrichmentCardOptions', () => ({
  EnrichmentCardOptions: () => <div data-testid="enrichment-card-options" />,
  getOptionsSectionTitle: () => 'options',
}))

import { UnifiedEnrichmentCard } from '@/components/course/viewer/components/UnifiedEnrichmentCard'

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

describe('UnifiedEnrichmentCard draft preview behavior', () => {
  const defaultProps = {
    onGenerate: vi.fn(),
    disabled: false,
    isGenerating: false,
  }

  it('does not render draft preview badge for draft_ready nlm_audio', () => {
    const draftReadyNlmAudio = makeEnrichment({
      enrichment_type: 'nlm_audio' as any,
      status: 'draft_ready',
      content: {
        type: 'nlm_audio',
        script: 'NLM audio draft script',
        duration_seconds: 90,
      },
    })

    render(
      <UnifiedEnrichmentCard
        {...defaultProps}
        type="nlm_audio"
        existingEnrichment={draftReadyNlmAudio}
      />
    )

    expect(screen.queryByText('draftReady')).not.toBeInTheDocument()
  })

  it('does not render draft preview badge for draft_ready nlm_video', () => {
    const draftReadyNlmVideo = makeEnrichment({
      enrichment_type: 'nlm_video' as any,
      status: 'draft_ready',
      content: {
        type: 'nlm_video',
        script: 'NLM video draft script',
        estimated_duration_seconds: 120,
      },
    })

    render(
      <UnifiedEnrichmentCard
        {...defaultProps}
        type="nlm_video"
        existingEnrichment={draftReadyNlmVideo}
      />
    )

    expect(screen.queryByText('draftReady')).not.toBeInTheDocument()
  })

  it('keeps presentation draft preview badge for draft_ready presentation', () => {
    const draftReadyPresentation = makeEnrichment({
      enrichment_type: 'presentation' as any,
      status: 'draft_ready',
      content: {
        type: 'presentation',
        theme: 'default',
        slides: [
          {
            index: 0,
            title: 'Slide 1',
            content: 'Intro content',
            layout: 'content',
          },
          {
            index: 1,
            title: 'Slide 2',
            content: 'Summary content',
            layout: 'content',
          },
        ],
        total_slides: 2,
      },
    })

    render(
      <UnifiedEnrichmentCard
        {...defaultProps}
        type="presentation"
        existingEnrichment={draftReadyPresentation}
      />
    )

    expect(screen.getByText('draftReady')).toBeInTheDocument()
  })
})
