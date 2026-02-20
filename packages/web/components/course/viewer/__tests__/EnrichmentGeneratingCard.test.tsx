/* eslint-disable */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies BEFORE imports
const mockSmoothProgress = { progress: 50, isAnimating: false, isCrawling: false }
vi.mock('@/lib/hooks/useSmoothProgress', () => ({
  useSmoothProgress: vi.fn(() => mockSmoothProgress),
}))

const mockStatusMessage = {
  message: 'Генерируем контент...',
  messageIndex: 0,
  totalMessages: 5,
  isLastMessage: false,
}
vi.mock('@/lib/hooks/useRotatingStatusMessage', () => ({
  useRotatingStatusMessage: vi.fn(() => mockStatusMessage),
}))

vi.mock('@megacampus/shared-types', () => ({
  getNextMilestone: vi.fn(() => 50),
}))

vi.mock('next-intl', () => ({
  useTranslations: vi.fn(() => (key: string) => {
    const translations: Record<string, string> = {
      'placeholder.quiz.title': 'Quiz',
      'placeholder.audio.title': 'Audio',
      'placeholder.nlm_audio.title': 'NLM Audio',
      'placeholder.presentation.title': 'Presentation',
      'placeholder.video.title': 'Video',
      'placeholder.nlm_video.title': 'NLM Video',
      'images.cover.title': 'Cover',
      'images.card.title': 'Card',
      generating: 'Generating...',
      cancel: 'Cancel',
    }
    return translations[key] || key
  }),
}))

// Mock framer-motion used by StagedProgress
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}))

// Mock StagedProgress to simplify testing
vi.mock('@/components/ui/staged-progress', () => ({
  StagedProgress: ({
    stages,
    currentStageIndex,
    stageProgress,
    isComplete,
  }: {
    stages: Array<{ id: string; label: string }>
    currentStageIndex: number
    stageProgress: number
    isComplete: boolean
  }) => (
    <div data-testid="staged-progress">
      <div data-stage-index={currentStageIndex}>{stageProgress}%</div>
      <div data-is-complete={isComplete}>{isComplete ? 'Complete' : 'In Progress'}</div>
    </div>
  ),
}))

import { EnrichmentGeneratingCard } from '@/components/course/viewer/components/EnrichmentGeneratingCard'
import { useSmoothProgress } from '@/lib/hooks/useSmoothProgress'
import { useRotatingStatusMessage } from '@/lib/hooks/useRotatingStatusMessage'

describe('EnrichmentGeneratingCard', () => {
  const defaultProps = {
    type: 'quiz' as const,
    progress: 50,
    currentStep: 'generating',
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSmoothProgress.progress = 50
    mockSmoothProgress.isCrawling = false
    mockStatusMessage.message = 'Генерируем контент...'
  })

  describe('Rendering with different types', () => {
    it('should render correctly with quiz type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="quiz" />)

      expect(screen.getByText('Quiz - Generating...')).toBeInTheDocument()
    })

    it('should render correctly with audio type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="audio" />)

      expect(screen.getByText('Audio - Generating...')).toBeInTheDocument()
    })

    it('should render correctly with presentation type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="presentation" />)

      expect(screen.getByText('Presentation - Generating...')).toBeInTheDocument()
    })

    it('should render correctly with nlm_audio type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="nlm_audio" />)

      expect(screen.getByText('NLM Audio - Generating...')).toBeInTheDocument()
    })

    it('should render correctly with video type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="video" />)

      expect(screen.getByText('Video - Generating...')).toBeInTheDocument()
    })

    it('should render correctly with nlm_video type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="nlm_video" />)

      expect(screen.getByText('NLM Video - Generating...')).toBeInTheDocument()
    })

    it('should render correctly with cover type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="cover" />)

      expect(screen.getByText('Cover - Generating...')).toBeInTheDocument()
    })

    it('should render correctly with card type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="card" />)

      expect(screen.getByText('Card - Generating...')).toBeInTheDocument()
    })
  })

  describe('Progress display with StagedProgress', () => {
    it('should pass smooth progress to StagedProgress', () => {
      mockSmoothProgress.progress = 75

      render(<EnrichmentGeneratingCard {...defaultProps} progress={70} />)

      const stagedProgress = screen.getByTestId('staged-progress')
      expect(stagedProgress).toBeInTheDocument()
      expect(stagedProgress.textContent).toContain('75%')
    })

    it('should render indeterminate bar when syncing (progress === -1)', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} progress={-1} currentStep="syncing" />)

      // Should NOT render StagedProgress when syncing
      expect(screen.queryByTestId('staged-progress')).not.toBeInTheDocument()
    })

    it('should pass correct stage index to StagedProgress for "queued" step', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} currentStep="queued" />)

      const stagedProgress = screen.getByTestId('staged-progress')
      expect(stagedProgress.querySelector('[data-stage-index="0"]')).toBeInTheDocument()
    })

    it('should pass correct stage index to StagedProgress for "generating" step', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} currentStep="generating" />)

      const stagedProgress = screen.getByTestId('staged-progress')
      expect(stagedProgress.querySelector('[data-stage-index="1"]')).toBeInTheDocument()
    })

    it('should pass correct stage index to StagedProgress for "finalizing" step', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} currentStep="finalizing" />)

      const stagedProgress = screen.getByTestId('staged-progress')
      expect(stagedProgress.querySelector('[data-stage-index="2"]')).toBeInTheDocument()
    })

    it('should mark as complete when progress >= 100', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} progress={100} />)

      const stagedProgress = screen.getByTestId('staged-progress')
      expect(stagedProgress.querySelector('[data-is-complete="true"]')).toBeInTheDocument()
    })

    it('should call useSmoothProgress with correct params', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} progress={60} />)

      expect(useSmoothProgress).toHaveBeenCalledWith({
        targetProgress: 60,
        isComplete: false,
        enableAsymptoticCrawl: true,
        nextMilestone: 50,
        crawlDelay: 3000,
        crawlIncrement: 0.15,
      })
    })

    it('should use 0 as targetProgress when syncing', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} progress={-1} currentStep="syncing" />)

      expect(useSmoothProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          targetProgress: 0,
        })
      )
    })
  })

  describe('Status message display', () => {
    it('should display rotating status message', () => {
      mockStatusMessage.message = 'Обрабатываем данные...'

      render(<EnrichmentGeneratingCard {...defaultProps} />)

      expect(screen.getByText('Обрабатываем данные...')).toBeInTheDocument()
    })

    it('should call useRotatingStatusMessage with "syncing" for syncing step', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} currentStep="syncing" />)

      expect(useRotatingStatusMessage).toHaveBeenCalledWith({
        status: 'syncing',
        interval: 5000,
      })
    })

    it('should call useRotatingStatusMessage with "quiz_generating" for quiz type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="quiz" currentStep="generating" />)

      expect(useRotatingStatusMessage).toHaveBeenCalledWith({
        status: 'quiz_generating',
        interval: 5000,
      })
    })

    it('should call useRotatingStatusMessage with "audio_generating" for audio type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="audio" currentStep="generating" />)

      expect(useRotatingStatusMessage).toHaveBeenCalledWith({
        status: 'audio_generating',
        interval: 5000,
      })
    })

    it('should call useRotatingStatusMessage with "audio_generating" for nlm_audio type', () => {
      render(
        <EnrichmentGeneratingCard {...defaultProps} type="nlm_audio" currentStep="generating" />
      )

      expect(useRotatingStatusMessage).toHaveBeenCalledWith({
        status: 'audio_generating',
        interval: 5000,
      })
    })

    it('should call useRotatingStatusMessage with "video_generating" for video type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="video" currentStep="generating" />)

      expect(useRotatingStatusMessage).toHaveBeenCalledWith({
        status: 'video_generating',
        interval: 5000,
      })
    })

    it('should call useRotatingStatusMessage with "video_generating" for nlm_video type', () => {
      render(
        <EnrichmentGeneratingCard {...defaultProps} type="nlm_video" currentStep="generating" />
      )

      expect(useRotatingStatusMessage).toHaveBeenCalledWith({
        status: 'video_generating',
        interval: 5000,
      })
    })

    it('should call useRotatingStatusMessage with "presentation_generating" for presentation type', () => {
      render(
        <EnrichmentGeneratingCard {...defaultProps} type="presentation" currentStep="generating" />
      )

      expect(useRotatingStatusMessage).toHaveBeenCalledWith({
        status: 'presentation_generating',
        interval: 5000,
      })
    })

    it('should call useRotatingStatusMessage with "cover_generating" for cover type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="cover" currentStep="generating" />)

      expect(useRotatingStatusMessage).toHaveBeenCalledWith({
        status: 'cover_generating',
        interval: 5000,
      })
    })

    it('should call useRotatingStatusMessage with "cover_generating" for card type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="card" currentStep="generating" />)

      expect(useRotatingStatusMessage).toHaveBeenCalledWith({
        status: 'cover_generating',
        interval: 5000,
      })
    })

    it('should use currentStep as-is for non-generating steps', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} currentStep="queued" />)

      expect(useRotatingStatusMessage).toHaveBeenCalledWith({
        status: 'queued',
        interval: 5000,
      })
    })
  })

  describe('Cancel button', () => {
    it('should call onCancel when clicking Cancel button', () => {
      const handleCancel = vi.fn()
      render(<EnrichmentGeneratingCard {...defaultProps} onCancel={handleCancel} />)

      const cancelButton = screen.getByLabelText('Cancel quiz generation')
      fireEvent.click(cancelButton)

      expect(handleCancel).toHaveBeenCalledOnce()
    })

    it('should call onCancel multiple times when clicked multiple times', () => {
      const handleCancel = vi.fn()
      render(<EnrichmentGeneratingCard {...defaultProps} onCancel={handleCancel} />)

      const cancelButton = screen.getByLabelText('Cancel quiz generation')
      fireEvent.click(cancelButton)
      fireEvent.click(cancelButton)
      fireEvent.click(cancelButton)

      expect(handleCancel).toHaveBeenCalledTimes(3)
    })

    it('cancel button should have proper aria-label for quiz', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="quiz" />)

      const cancelButton = screen.getByLabelText('Cancel quiz generation')
      expect(cancelButton).toBeInTheDocument()
    })

    it('cancel button should have proper aria-label for audio', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="audio" />)

      const cancelButton = screen.getByLabelText('Cancel audio generation')
      expect(cancelButton).toBeInTheDocument()
    })

    it('cancel button should have proper aria-label for nlm_audio', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="nlm_audio" />)

      const cancelButton = screen.getByLabelText('Cancel nlm_audio generation')
      expect(cancelButton).toBeInTheDocument()
    })

    it('cancel button should have proper aria-label for presentation', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="presentation" />)

      const cancelButton = screen.getByLabelText('Cancel presentation generation')
      expect(cancelButton).toBeInTheDocument()
    })

    it('cancel button should have proper aria-label for video', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="video" />)

      const cancelButton = screen.getByLabelText('Cancel video generation')
      expect(cancelButton).toBeInTheDocument()
    })

    it('cancel button should have proper aria-label for nlm_video', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="nlm_video" />)

      const cancelButton = screen.getByLabelText('Cancel nlm_video generation')
      expect(cancelButton).toBeInTheDocument()
    })

    it('cancel button should have proper aria-label for cover', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="cover" />)

      const cancelButton = screen.getByLabelText('Cancel cover generation')
      expect(cancelButton).toBeInTheDocument()
    })

    it('cancel button should have proper aria-label for card', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="card" />)

      const cancelButton = screen.getByLabelText('Cancel card generation')
      expect(cancelButton).toBeInTheDocument()
    })
  })

  describe('Icon styling', () => {
    it('should have animate-pulse class on quiz icon', () => {
      const { container } = render(<EnrichmentGeneratingCard {...defaultProps} type="quiz" />)

      const iconElement = container.querySelector('.animate-pulse')
      expect(iconElement).toBeInTheDocument()
    })

    it('should have animate-pulse class on audio icon', () => {
      const { container } = render(<EnrichmentGeneratingCard {...defaultProps} type="audio" />)

      const iconElement = container.querySelector('.animate-pulse')
      expect(iconElement).toBeInTheDocument()
    })

    it('should have animate-pulse class on presentation icon', () => {
      const { container } = render(
        <EnrichmentGeneratingCard {...defaultProps} type="presentation" />
      )

      const iconElement = container.querySelector('.animate-pulse')
      expect(iconElement).toBeInTheDocument()
    })

    it('should have animate-pulse class on video icon', () => {
      const { container } = render(<EnrichmentGeneratingCard {...defaultProps} type="video" />)

      const iconElement = container.querySelector('.animate-pulse')
      expect(iconElement).toBeInTheDocument()
    })

    it('should have correct color class for quiz icon (green)', () => {
      const { container } = render(<EnrichmentGeneratingCard {...defaultProps} type="quiz" />)

      const iconElement = container.querySelector('.text-green-500')
      expect(iconElement).toBeInTheDocument()
    })

    it('should have correct color class for audio icon (purple)', () => {
      const { container } = render(<EnrichmentGeneratingCard {...defaultProps} type="audio" />)

      const iconElement = container.querySelector('.text-purple-500')
      expect(iconElement).toBeInTheDocument()
    })

    it('should have correct color class for nlm_audio icon (purple)', () => {
      const { container } = render(<EnrichmentGeneratingCard {...defaultProps} type="nlm_audio" />)

      const iconElement = container.querySelector('.text-purple-500')
      expect(iconElement).toBeInTheDocument()
    })

    it('should have correct color class for presentation icon (orange)', () => {
      const { container } = render(
        <EnrichmentGeneratingCard {...defaultProps} type="presentation" />
      )

      const iconElement = container.querySelector('.text-orange-500')
      expect(iconElement).toBeInTheDocument()
    })

    it('should have correct color class for video icon (red)', () => {
      const { container } = render(<EnrichmentGeneratingCard {...defaultProps} type="video" />)

      const iconElement = container.querySelector('.text-red-500')
      expect(iconElement).toBeInTheDocument()
    })

    it('should have correct color class for nlm_video icon (red)', () => {
      const { container } = render(<EnrichmentGeneratingCard {...defaultProps} type="nlm_video" />)

      const iconElement = container.querySelector('.text-red-500')
      expect(iconElement).toBeInTheDocument()
    })

    it('should have correct color class for cover icon (cyan)', () => {
      const { container } = render(<EnrichmentGeneratingCard {...defaultProps} type="cover" />)

      const iconElement = container.querySelector('.text-cyan-500')
      expect(iconElement).toBeInTheDocument()
    })

    it('should have correct color class for card icon (indigo)', () => {
      const { container } = render(<EnrichmentGeneratingCard {...defaultProps} type="card" />)

      const iconElement = container.querySelector('.text-indigo-500')
      expect(iconElement).toBeInTheDocument()
    })
  })

  describe('Integration scenarios', () => {
    it('should handle complete generation flow (queued → generating → finalizing)', () => {
      const { rerender } = render(
        <EnrichmentGeneratingCard {...defaultProps} progress={10} currentStep="queued" />
      )

      let stagedProgress = screen.getByTestId('staged-progress')
      expect(stagedProgress.querySelector('[data-stage-index="0"]')).toBeInTheDocument()

      rerender(
        <EnrichmentGeneratingCard {...defaultProps} progress={50} currentStep="generating" />
      )

      stagedProgress = screen.getByTestId('staged-progress')
      expect(stagedProgress.querySelector('[data-stage-index="1"]')).toBeInTheDocument()

      rerender(
        <EnrichmentGeneratingCard {...defaultProps} progress={90} currentStep="finalizing" />
      )

      stagedProgress = screen.getByTestId('staged-progress')
      expect(stagedProgress.querySelector('[data-stage-index="2"]')).toBeInTheDocument()
    })

    it('should handle syncing state correctly', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} progress={-1} currentStep="syncing" />)

      // Should not render StagedProgress
      expect(screen.queryByTestId('staged-progress')).not.toBeInTheDocument()

      // Should call hooks with syncing-specific params
      expect(useSmoothProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          targetProgress: 0,
        })
      )
      expect(useRotatingStatusMessage).toHaveBeenCalledWith({
        status: 'syncing',
        interval: 5000,
      })
    })

    it('should handle edge case of 0% progress', () => {
      mockSmoothProgress.progress = 0

      render(<EnrichmentGeneratingCard {...defaultProps} progress={0} />)

      const stagedProgress = screen.getByTestId('staged-progress')
      expect(stagedProgress.textContent).toContain('0%')
    })

    it('should handle edge case of 100% progress', () => {
      mockSmoothProgress.progress = 100

      render(<EnrichmentGeneratingCard {...defaultProps} progress={100} />)

      const stagedProgress = screen.getByTestId('staged-progress')
      expect(stagedProgress.querySelector('[data-is-complete="true"]')).toBeInTheDocument()
    })

    it('should render all elements for a complete generation scenario', () => {
      mockStatusMessage.message = 'Создаем презентацию...'

      render(
        <EnrichmentGeneratingCard
          type="presentation"
          progress={65}
          currentStep="generating"
          onCancel={vi.fn()}
        />
      )

      expect(screen.getByText('Presentation - Generating...')).toBeInTheDocument()
      expect(screen.getByTestId('staged-progress')).toBeInTheDocument()
      expect(screen.getByText('Создаем презентацию...')).toBeInTheDocument()
      expect(screen.getByLabelText('Cancel presentation generation')).toBeInTheDocument()
    })
  })
})
