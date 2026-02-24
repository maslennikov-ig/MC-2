import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LessonMaterialsSwitcher } from '../lesson-materials-switcher'

// Mocks
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('../persistent-video-player', () => ({
  default: ({ src, mode }: any) => (
    <div data-testid="persistent-video-player" data-src={src} data-mode={mode} />
  ),
}))

vi.mock('@/components/course/viewer/enrichments/AudioPlayer', () => ({
  AudioPlayer: ({ playbackUrl }: any) => <div data-testid="audio-player" data-src={playbackUrl} />,
}))

vi.mock('@/components/course/viewer/enrichments/QuizPlayer', () => ({
  QuizPlayer: ({ enrichmentId }: any) => <div data-testid="quiz-player" data-id={enrichmentId} />,
}))

vi.mock('@/lib/helpers/storage-helpers', () => ({
  getEnrichmentPlaybackUrl: vi.fn((enrichment) =>
    Promise.resolve(`mocked-url-for-${enrichment.id}`)
  ),
}))

describe('LessonMaterialsSwitcher', () => {
  const mockLesson = { id: 'lesson-1', title: 'Test Lesson' } as any

  it('renders nothing when no materials are available', async () => {
    const { container } = render(<LessonMaterialsSwitcher lesson={mockLesson} />)
    await waitFor(() => expect(container.firstChild).toBeNull())
  })

  it('shows only completed materials and excludes cover/card', async () => {
    const enrichments = [
      { id: '1', enrichment_type: 'video', status: 'completed', content: {} },
      { id: '2', enrichment_type: 'audio', status: 'pending', content: {} }, // should not show
      { id: '3', enrichment_type: 'cover', status: 'completed', content: {} }, // should not show
    ] as any[]

    render(<LessonMaterialsSwitcher lesson={mockLesson} enrichments={enrichments} />)

    await waitFor(() => {
      expect(screen.getByTestId('material-content-video')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('tab-video')).not.toBeInTheDocument()
    expect(screen.queryByTestId('material-content-audio')).not.toBeInTheDocument()
  })

  it('renders tabs when multiple materials are available', async () => {
    const enrichments = [
      { id: '1', enrichment_type: 'nlm_video', status: 'completed', content: {} },
      { id: '2', enrichment_type: 'audio', status: 'completed', content: {} },
    ] as any[]

    render(<LessonMaterialsSwitcher lesson={mockLesson} enrichments={enrichments} />)

    await waitFor(() => {
      expect(screen.getByTestId('tab-video')).toBeInTheDocument()
    })

    expect(screen.getByTestId('tab-audio')).toBeInTheDocument()
    expect(screen.getByTestId('material-content-video')).toBeInTheDocument()
  })

  it('prioritizes video enrichment over legacy video asset', async () => {
    const enrichments = [
      { id: 'enr-vid-1', enrichment_type: 'video', status: 'completed', content: {} },
    ] as any[]
    const assets = [
      { id: 'asset-vid-1', filename: 'legacy.mp4', url: 'legacy.mp4', metadata: { type: 'video' } },
    ] as any[]

    render(
      <LessonMaterialsSwitcher lesson={mockLesson} enrichments={enrichments} assets={assets} />
    )

    // wait for async URL fetch
    const player = await screen.findByTestId('persistent-video-player')
    expect(player).toHaveAttribute('data-src', 'mocked-url-for-enr-vid-1')
  })

  it('falls back to legacy asset when no video enrichment is completed', async () => {
    const enrichments = [
      { id: 'enr-vid-1', enrichment_type: 'video', status: 'pending', content: {} },
    ] as any[]
    const assets = [
      {
        id: 'asset-vid-1',
        filename: 'legacy.mp4',
        url: '/api/assets/legacy.mp4',
        metadata: { type: 'video' },
      },
    ] as any[]

    render(
      <LessonMaterialsSwitcher lesson={mockLesson} enrichments={enrichments} assets={assets} />
    )

    await waitFor(() => {
      const player = screen.getByTestId('persistent-video-player')
      expect(player).toHaveAttribute('data-src', '/api/assets/legacy.mp4')
    })
  })

  it('renders correct fallback UI for empty presentation', async () => {
    const enrichments = [
      { id: '1', enrichment_type: 'presentation', status: 'completed', content: { slides: [] } },
    ] as any[]

    render(<LessonMaterialsSwitcher lesson={mockLesson} enrichments={enrichments} />)

    await waitFor(() => {
      expect(screen.getByText('fallback.presentationEmpty')).toBeInTheDocument()
    })
  })
})
