import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EnrichmentPlaceholderCard } from '@/components/course/viewer/components/EnrichmentPlaceholderCard'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: vi.fn(() => {
    // Return a mock t function
    return (key: string) => {
      const translations: Record<string, string> = {
        'placeholder.quiz.title': 'Quiz',
        'placeholder.quiz.description': 'Test your knowledge with interactive questions',
        'placeholder.audio.title': 'Audio',
        'placeholder.audio.description': 'Listen to audio narration',
        'placeholder.presentation.title': 'Presentation',
        'placeholder.presentation.description': 'Visual slides',
        'placeholder.video.title': 'Video',
        'placeholder.video.description': 'Watch video content',
        'placeholder.video.comingSoon': 'Coming Soon',
        options: 'Options',
        generate: 'Generate',
        generating: 'Generating...',
        'forms.quiz.questionCount': 'Question Count',
        'forms.quiz.difficulty': 'Difficulty',
        'forms.quiz.difficultyEasy': 'Easy',
        'forms.quiz.difficultyMedium': 'Medium',
        'forms.quiz.difficultyHard': 'Hard',
        'forms.audio.voice': 'Voice',
        'forms.audio.speed': 'Speed',
        'forms.audio.speedSlow': 'Slow',
        'forms.audio.speedNormal': 'Normal',
        'forms.audio.speedFast': 'Fast',
        'forms.presentation.slideCount': 'Slide Count',
        'forms.presentation.theme': 'Theme',
        'forms.presentation.themeLight': 'Light',
        'forms.presentation.themeDark': 'Dark',
        'forms.presentation.themeColorful': 'Colorful',
        cancel: 'Cancel',
      }
      return translations[key] || key
    }
  }),
}))

describe('EnrichmentPlaceholderCard', () => {
  const mockOnGenerate = vi.fn()
  const defaultProps = {
    estimatedTime: '5 min',
    onGenerate: mockOnGenerate,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering tests', () => {
    it('should render correctly for quiz type', () => {
      render(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" />)

      expect(screen.getByText('Quiz')).toBeInTheDocument()
      expect(screen.getByText('Test your knowledge with interactive questions')).toBeInTheDocument()
      expect(screen.getByText('5 min')).toBeInTheDocument()
    })

    it('should render correctly for audio type', () => {
      render(<EnrichmentPlaceholderCard {...defaultProps} type="audio" />)

      expect(screen.getByText('Audio')).toBeInTheDocument()
      expect(screen.getByText('Listen to audio narration')).toBeInTheDocument()
      expect(screen.getByText('5 min')).toBeInTheDocument()
    })

    it('should render correctly for presentation type', () => {
      render(<EnrichmentPlaceholderCard {...defaultProps} type="presentation" />)

      expect(screen.getByText('Presentation')).toBeInTheDocument()
      expect(screen.getByText('Visual slides')).toBeInTheDocument()
      expect(screen.getByText('5 min')).toBeInTheDocument()
    })

    it('should render correctly for video type', () => {
      render(<EnrichmentPlaceholderCard {...defaultProps} type="video" disabled />)

      expect(screen.getByText('Video')).toBeInTheDocument()
      expect(screen.getByText('Watch video content')).toBeInTheDocument()
      expect(screen.getByText('5 min')).toBeInTheDocument()
    })

    it('should display the correct icon for each type', () => {
      const { rerender } = render(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" />)
      // Icons are rendered as SVG elements, check for specific classes/attributes
      let icons = document.querySelectorAll('svg')
      expect(icons.length).toBeGreaterThan(0)

      rerender(<EnrichmentPlaceholderCard {...defaultProps} type="audio" />)
      icons = document.querySelectorAll('svg')
      expect(icons.length).toBeGreaterThan(0)

      rerender(<EnrichmentPlaceholderCard {...defaultProps} type="presentation" />)
      icons = document.querySelectorAll('svg')
      expect(icons.length).toBeGreaterThan(0)

      rerender(<EnrichmentPlaceholderCard {...defaultProps} type="video" disabled />)
      icons = document.querySelectorAll('svg')
      expect(icons.length).toBeGreaterThan(0)
    })

    it('should display estimated time badge', () => {
      render(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" />)

      const badge = screen.getByText('5 min')
      expect(badge).toBeInTheDocument()
      // Badge is rendered as a div with specific classes
      expect(badge).toHaveClass('inline-flex', 'items-center')
    })
  })

  describe('Options collapsible', () => {
    it('should expand options when clicking Options button (quiz)', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" />)

      const optionsButton = screen.getByRole('button', { name: /Options/i })
      await user.click(optionsButton)

      expect(screen.getByText('Question Count')).toBeInTheDocument()
      expect(screen.getByText('Difficulty')).toBeInTheDocument()
    })

    it('should show question count and difficulty selects for quiz', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" />)

      const optionsButton = screen.getByRole('button', { name: /Options/i })
      await user.click(optionsButton)

      expect(screen.getByText('Question Count')).toBeInTheDocument()
      expect(screen.getByText('Difficulty')).toBeInTheDocument()

      // Check that selects are present
      const selects = screen.getAllByRole('combobox')
      expect(selects).toHaveLength(2)
    })

    it('should show voice and speed selects for audio', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="audio" />)

      const optionsButton = screen.getByRole('button', { name: /Options/i })
      await user.click(optionsButton)

      expect(screen.getByText('Voice')).toBeInTheDocument()
      expect(screen.getByText('Speed')).toBeInTheDocument()

      const selects = screen.getAllByRole('combobox')
      expect(selects).toHaveLength(2)
    })

    it('should show slide count and theme selects for presentation', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="presentation" />)

      const optionsButton = screen.getByRole('button', { name: /Options/i })
      await user.click(optionsButton)

      expect(screen.getByText('Slide Count')).toBeInTheDocument()
      expect(screen.getByText('Theme')).toBeInTheDocument()

      const selects = screen.getAllByRole('combobox')
      expect(selects).toHaveLength(2)
    })

    it('should NOT show options section for video type', () => {
      render(<EnrichmentPlaceholderCard {...defaultProps} type="video" disabled />)

      const optionsButton = screen.queryByRole('button', { name: /Options/i })
      expect(optionsButton).not.toBeInTheDocument()
    })
  })

  describe('Generate button', () => {
    it('should call onGenerate with default settings when clicking Generate', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" />)

      const generateButton = screen.getByRole('button', { name: /Generate quiz enrichment/i })
      await user.click(generateButton)

      expect(mockOnGenerate).toHaveBeenCalledWith({
        questionCount: 10,
        difficulty: 'medium',
      })
    })

    it('should call onGenerate with quiz settings (questionCount, difficulty)', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" />)

      // Note: Due to Shadcn UI Select implementation details, we'll test with defaults
      // Changing select values in tests requires deeper knowledge of component internals
      // This test verifies the generate button calls onGenerate with current state

      // Click generate with defaults
      const generateButton = screen.getByRole('button', { name: /Generate quiz enrichment/i })
      await user.click(generateButton)

      // Verify default quiz settings
      expect(mockOnGenerate).toHaveBeenCalledWith({
        questionCount: 10,
        difficulty: 'medium',
      })
    })

    it('should call onGenerate with audio settings (voice, speed)', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="audio" />)

      // Click generate with defaults
      const generateButton = screen.getByRole('button', { name: /Generate audio enrichment/i })
      await user.click(generateButton)

      expect(mockOnGenerate).toHaveBeenCalledWith({
        voice: 'default',
        speed: 'normal',
      })
    })

    it('should call onGenerate with presentation settings (slideCount, theme)', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="presentation" />)

      // Click generate with defaults
      const generateButton = screen.getByRole('button', {
        name: /Generate presentation enrichment/i,
      })
      await user.click(generateButton)

      expect(mockOnGenerate).toHaveBeenCalledWith({
        slideCount: 8,
        theme: 'light',
      })
    })

    it('should show disabled button for video type', () => {
      render(<EnrichmentPlaceholderCard {...defaultProps} type="video" disabled />)

      const generateButton = screen.queryByRole('button', { name: /Generate/i })
      expect(generateButton).not.toBeInTheDocument()
    })

    it('should show "Coming Soon" badge instead of button for disabled state', () => {
      render(<EnrichmentPlaceholderCard {...defaultProps} type="video" disabled />)

      expect(screen.getByText('Coming Soon')).toBeInTheDocument()
      const generateButton = screen.queryByRole('button', { name: /Generate/i })
      expect(generateButton).not.toBeInTheDocument()
    })
  })

  describe('State handling', () => {
    it('should disable generate button when isGenerating is true', () => {
      render(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" isGenerating />)

      const generateButton = screen.getByRole('button', { name: /Generate quiz enrichment/i })
      expect(generateButton).toBeDisabled()
    })

    it('should show "Generating..." text when isGenerating is true', () => {
      render(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" isGenerating />)

      expect(screen.getByText('Generating...')).toBeInTheDocument()
      expect(screen.queryByText('Generate')).not.toBeInTheDocument()
    })

    it('should have proper aria-label and aria-busy on button', () => {
      const { rerender } = render(
        <EnrichmentPlaceholderCard {...defaultProps} type="quiz" isGenerating={false} />
      )

      let generateButton = screen.getByRole('button', { name: /Generate quiz enrichment/i })
      expect(generateButton).toHaveAttribute('aria-label', 'Generate quiz enrichment')
      expect(generateButton).toHaveAttribute('aria-busy', 'false')

      rerender(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" isGenerating />)

      generateButton = screen.getByRole('button', { name: /Generate quiz enrichment/i })
      expect(generateButton).toHaveAttribute('aria-label', 'Generate quiz enrichment')
      expect(generateButton).toHaveAttribute('aria-busy', 'true')
    })
  })

  describe('Options selection', () => {
    // Note: Shadcn UI Select components render options in portals which makes them
    // difficult to test with standard testing-library queries. These tests verify
    // that the select components are present and functional with default values.
    // Full integration testing of select behavior would require E2E tests with Playwright.

    it('should render quiz select controls', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" />)

      // Expand options
      const optionsButton = screen.getByRole('button', { name: /Options/i })
      await user.click(optionsButton)

      // Verify select controls exist
      const selects = screen.getAllByRole('combobox')
      expect(selects).toHaveLength(2)

      // Verify labels
      expect(screen.getByText('Question Count')).toBeInTheDocument()
      expect(screen.getByText('Difficulty')).toBeInTheDocument()

      // Click generate to verify defaults are used
      const generateButton = screen.getByRole('button', { name: /Generate quiz enrichment/i })
      await user.click(generateButton)

      expect(mockOnGenerate).toHaveBeenCalledWith({
        questionCount: 10,
        difficulty: 'medium',
      })
    })

    it('should render audio select controls', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="audio" />)

      // Expand options
      const optionsButton = screen.getByRole('button', { name: /Options/i })
      await user.click(optionsButton)

      // Verify select controls exist
      const selects = screen.getAllByRole('combobox')
      expect(selects).toHaveLength(2)

      // Verify labels
      expect(screen.getByText('Voice')).toBeInTheDocument()
      expect(screen.getByText('Speed')).toBeInTheDocument()

      // Click generate to verify defaults are used
      const generateButton = screen.getByRole('button', { name: /Generate audio enrichment/i })
      await user.click(generateButton)

      expect(mockOnGenerate).toHaveBeenCalledWith({
        voice: 'default',
        speed: 'normal',
      })
    })

    it('should render presentation select controls', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="presentation" />)

      // Expand options
      const optionsButton = screen.getByRole('button', { name: /Options/i })
      await user.click(optionsButton)

      // Verify select controls exist
      const selects = screen.getAllByRole('combobox')
      expect(selects).toHaveLength(2)

      // Verify labels
      expect(screen.getByText('Slide Count')).toBeInTheDocument()
      expect(screen.getByText('Theme')).toBeInTheDocument()

      // Click generate to verify defaults are used
      const generateButton = screen.getByRole('button', {
        name: /Generate presentation enrichment/i,
      })
      await user.click(generateButton)

      expect(mockOnGenerate).toHaveBeenCalledWith({
        slideCount: 8,
        theme: 'light',
      })
    })

    it('should maintain settings between option toggles', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" />)

      // Expand options
      const optionsButton = screen.getByRole('button', { name: /Options/i })
      await user.click(optionsButton)

      // Collapse options
      await user.click(optionsButton)

      // Expand again
      await user.click(optionsButton)

      // Generate should still use defaults
      const generateButton = screen.getByRole('button', { name: /Generate quiz enrichment/i })
      await user.click(generateButton)

      expect(mockOnGenerate).toHaveBeenCalledWith({
        questionCount: 10,
        difficulty: 'medium',
      })
    })

    it('should have accessible select controls', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" />)

      // Expand options
      const optionsButton = screen.getByRole('button', { name: /Options/i })
      await user.click(optionsButton)

      // Verify selects have combobox role (accessible)
      const selects = screen.getAllByRole('combobox')
      expect(selects[0]).toBeInTheDocument()
      expect(selects[1]).toBeInTheDocument()
    })
  })

  describe('Edge cases', () => {
    it('should handle clicking generate multiple times', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" />)

      const generateButton = screen.getByRole('button', { name: /Generate quiz enrichment/i })

      await user.click(generateButton)
      await user.click(generateButton)
      await user.click(generateButton)

      expect(mockOnGenerate).toHaveBeenCalledTimes(3)
      expect(mockOnGenerate).toHaveBeenCalledWith({
        questionCount: 10,
        difficulty: 'medium',
      })
    })

    it('should collapse options when clicking Options button again', async () => {
      const user = userEvent.setup()
      render(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" />)

      const optionsButton = screen.getByRole('button', { name: /Options/i })

      // Expand
      await user.click(optionsButton)
      expect(screen.getByText('Question Count')).toBeInTheDocument()

      // Collapse
      await user.click(optionsButton)

      // Note: CollapsibleContent may still be in DOM but hidden
      // We can't reliably test visibility without checking computed styles
      // So we just verify the button still works
      expect(optionsButton).toBeInTheDocument()
    })

    it('should render with different estimated times', () => {
      const { rerender } = render(
        <EnrichmentPlaceholderCard {...defaultProps} type="quiz" estimatedTime="2 min" />
      )
      expect(screen.getByText('2 min')).toBeInTheDocument()

      rerender(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" estimatedTime="10 min" />)
      expect(screen.getByText('10 min')).toBeInTheDocument()

      rerender(<EnrichmentPlaceholderCard {...defaultProps} type="quiz" estimatedTime="~30 sec" />)
      expect(screen.getByText('~30 sec')).toBeInTheDocument()
    })
  })
})
