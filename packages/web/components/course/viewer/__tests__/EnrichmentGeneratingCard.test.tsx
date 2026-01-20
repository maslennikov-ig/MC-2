/* eslint-disable */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EnrichmentGeneratingCard } from '@/components/course/viewer/components/EnrichmentGeneratingCard'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: vi.fn((namespace: string) => {
    return (key: string) => {
      const translations: Record<string, string> = {
        'placeholder.quiz.title': 'Quiz',
        'placeholder.audio.title': 'Audio',
        'placeholder.presentation.title': 'Presentation',
        'placeholder.video.title': 'Video',
        generating: 'Generating...',
        cancel: 'Cancel',
      }
      return translations[key] || key
    }
  }),
}))

describe('EnrichmentGeneratingCard', () => {
  const defaultProps = {
    type: 'quiz' as const,
    progress: 50,
    currentStep: 'Processing data...',
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering with different types', () => {
    it('should render correctly with quiz type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="quiz" />)

      expect(screen.getByText('Quiz - Generating...')).toBeInTheDocument()
      expect(screen.getByText('Processing data...')).toBeInTheDocument()
    })

    it('should render correctly with audio type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="audio" />)

      expect(screen.getByText('Audio - Generating...')).toBeInTheDocument()
    })

    it('should render correctly with presentation type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="presentation" />)

      expect(screen.getByText('Presentation - Generating...')).toBeInTheDocument()
    })

    it('should render correctly with video type', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="video" />)

      expect(screen.getByText('Video - Generating...')).toBeInTheDocument()
    })

    it('should display the correct title for each type with " - Generating..." suffix', () => {
      const types: Array<'quiz' | 'audio' | 'presentation' | 'video'> = [
        'quiz',
        'audio',
        'presentation',
        'video',
      ]
      const expectedTitles = [
        'Quiz - Generating...',
        'Audio - Generating...',
        'Presentation - Generating...',
        'Video - Generating...',
      ]

      types.forEach((type, index) => {
        const { unmount } = render(<EnrichmentGeneratingCard {...defaultProps} type={type} />)
        expect(screen.getByText(expectedTitles[index])).toBeInTheDocument()
        unmount()
      })
    })
  })

  describe('Progress display', () => {
    it('should display progress percentage (0%)', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} progress={0} />)

      expect(screen.getByText('0%')).toBeInTheDocument()
    })

    it('should display progress percentage (50%)', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} progress={50} />)

      expect(screen.getByText('50%')).toBeInTheDocument()
    })

    it('should display progress percentage (100%)', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} progress={100} />)

      expect(screen.getByText('100%')).toBeInTheDocument()
    })

    it('should round progress to whole number (75.5 -> 76%)', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} progress={75.5} />)

      expect(screen.getByText('76%')).toBeInTheDocument()
    })

    it('should round progress to whole number (33.3 -> 33%)', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} progress={33.3} />)

      expect(screen.getByText('33%')).toBeInTheDocument()
    })

    it('should round progress to whole number (66.7 -> 67%)', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} progress={66.7} />)

      expect(screen.getByText('67%')).toBeInTheDocument()
    })

    it('progress bar should have correct aria-label for quiz', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="quiz" progress={45} />)

      const progressBar = screen.getByLabelText('Quiz generation progress: 45%')
      expect(progressBar).toBeInTheDocument()
    })

    it('progress bar should have correct aria-label for audio', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="audio" progress={60} />)

      const progressBar = screen.getByLabelText('Audio generation progress: 60%')
      expect(progressBar).toBeInTheDocument()
    })

    it('progress bar should have correct aria-label for presentation', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="presentation" progress={75} />)

      const progressBar = screen.getByLabelText('Presentation generation progress: 75%')
      expect(progressBar).toBeInTheDocument()
    })

    it('progress bar should have correct aria-label for video', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} type="video" progress={90} />)

      const progressBar = screen.getByLabelText('Video generation progress: 90%')
      expect(progressBar).toBeInTheDocument()
    })
  })

  describe('Current step display', () => {
    it('should display current step text', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} currentStep="Analyzing content..." />)

      expect(screen.getByText('Analyzing content...')).toBeInTheDocument()
    })

    it('should update when currentStep changes', () => {
      const { rerender } = render(
        <EnrichmentGeneratingCard {...defaultProps} currentStep="Step 1: Initialization" />
      )

      expect(screen.getByText('Step 1: Initialization')).toBeInTheDocument()

      rerender(<EnrichmentGeneratingCard {...defaultProps} currentStep="Step 2: Processing" />)

      expect(screen.queryByText('Step 1: Initialization')).not.toBeInTheDocument()
      expect(screen.getByText('Step 2: Processing')).toBeInTheDocument()
    })

    it('should handle empty currentStep', () => {
      render(<EnrichmentGeneratingCard {...defaultProps} currentStep="" />)

      // Should still render the component, just with empty step text
      expect(screen.getByText('Quiz - Generating...')).toBeInTheDocument()
    })

    it('should handle long currentStep text', () => {
      const longStep =
        'This is a very long step description that might wrap to multiple lines in the UI'
      render(<EnrichmentGeneratingCard {...defaultProps} currentStep={longStep} />)

      expect(screen.getByText(longStep)).toBeInTheDocument()
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
  })

  describe('Icon styling', () => {
    it('should have animate-pulse class on quiz icon', () => {
      const { container } = render(<EnrichmentGeneratingCard {...defaultProps} type="quiz" />)

      // Check for animate-pulse class in the rendered output
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

    it('should have correct color class for quiz icon', () => {
      const { container } = render(<EnrichmentGeneratingCard {...defaultProps} type="quiz" />)

      // Quiz should have green color
      const iconElement = container.querySelector('.text-green-500')
      expect(iconElement).toBeInTheDocument()
    })

    it('should have correct color class for audio icon', () => {
      const { container } = render(<EnrichmentGeneratingCard {...defaultProps} type="audio" />)

      // Audio should have purple color
      const iconElement = container.querySelector('.text-purple-500')
      expect(iconElement).toBeInTheDocument()
    })

    it('should have correct color class for presentation icon', () => {
      const { container } = render(
        <EnrichmentGeneratingCard {...defaultProps} type="presentation" />
      )

      // Presentation should have orange color
      const iconElement = container.querySelector('.text-orange-500')
      expect(iconElement).toBeInTheDocument()
    })

    it('should have correct color class for video icon', () => {
      const { container } = render(<EnrichmentGeneratingCard {...defaultProps} type="video" />)

      // Video should have red color
      const iconElement = container.querySelector('.text-red-500')
      expect(iconElement).toBeInTheDocument()
    })
  })

  describe('Integration tests', () => {
    it('should update progress and currentStep together', () => {
      const { rerender } = render(
        <EnrichmentGeneratingCard {...defaultProps} progress={25} currentStep="Starting..." />
      )

      expect(screen.getByText('25%')).toBeInTheDocument()
      expect(screen.getByText('Starting...')).toBeInTheDocument()

      rerender(
        <EnrichmentGeneratingCard {...defaultProps} progress={75} currentStep="Finalizing..." />
      )

      expect(screen.getByText('75%')).toBeInTheDocument()
      expect(screen.getByText('Finalizing...')).toBeInTheDocument()
    })

    it('should render all elements correctly for a complete generation flow', () => {
      render(
        <EnrichmentGeneratingCard
          type="presentation"
          progress={65}
          currentStep="Generating slides..."
          onCancel={vi.fn()}
        />
      )

      // Check title
      expect(screen.getByText('Presentation - Generating...')).toBeInTheDocument()

      // Check progress
      expect(screen.getByText('65%')).toBeInTheDocument()

      // Check step
      expect(screen.getByText('Generating slides...')).toBeInTheDocument()

      // Check cancel button
      expect(screen.getByLabelText('Cancel presentation generation')).toBeInTheDocument()

      // Check progress bar
      expect(screen.getByLabelText('Presentation generation progress: 65%')).toBeInTheDocument()
    })

    it('should handle edge case of 0% progress', () => {
      render(
        <EnrichmentGeneratingCard {...defaultProps} progress={0} currentStep="Initializing..." />
      )

      expect(screen.getByText('0%')).toBeInTheDocument()
      expect(screen.getByText('Initializing...')).toBeInTheDocument()
    })

    it('should handle edge case of 100% progress', () => {
      render(
        <EnrichmentGeneratingCard {...defaultProps} progress={100} currentStep="Completing..." />
      )

      expect(screen.getByText('100%')).toBeInTheDocument()
      expect(screen.getByText('Completing...')).toBeInTheDocument()
    })
  })
})
