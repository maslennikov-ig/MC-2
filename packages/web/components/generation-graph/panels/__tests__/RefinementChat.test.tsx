import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RefinementChat } from '../RefinementChat'
import { Proposal } from '@megacampus/shared-types/chat-types'
import { type ChatMessage } from '../../hooks/useRefinement'

/**
 * Unit tests for RefinementChat component
 *
 * Tests the pending message clearing logic including:
 * - When history grows (new messages), pending messages are cleared
 * - When history length is unchanged, pending messages persist
 * - When user sends message, it appears as pending (opacity-60%)
 * - After response, pending message is replaced by history message (no duplication)
 * - On send error, pending message is removed
 */

// =============================================================================
// Mock Setup
// =============================================================================

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn()

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'generation.refinementChat.panelTitle': 'Refinement Chat',
      'generation.refinementChat.placeholder': 'Type your message...',
      'generation.refinementChat.send': 'Send',
      'generation.refinementChat.thinking': 'Thinking...',
      'generation.refinementChat.modes.selectModeRequired': 'Please select a mode',
      'generation.refinementChat.modes.modeSelectionLabel': 'Select mode',
      'generation.refinementChat.modes.refineAriaLabel': 'Refine mode',
      'generation.refinementChat.modes.refine': 'Refine',
      'generation.refinementChat.modes.refineTooltip': 'Refine current content',
      'generation.refinementChat.modes.regenerateAriaLabel': 'Regenerate mode',
      'generation.refinementChat.modes.regenerate': 'Regenerate',
      'generation.refinementChat.modes.regenerateTooltip': 'Regenerate from scratch',
      // Proposal-related translations
      'refinementChat.proposal.suggestedChanges': 'Предложенные изменения',
      'refinementChat.proposal.accept': 'Принять',
      'refinementChat.proposal.applying': 'Применяю...',
      'refinementChat.proposal.supplement': 'Дополнить',
      'refinementChat.proposal.reject': 'Отклонить',
      'refinementChat.proposal.retry': 'Повторить',
      'refinementChat.proposal.changesApplied': 'Изменения применены',
      'refinementChat.proposal.emptyResponseFallback': 'Ответ обрабатывается...',
    }
    return translations[key] || key
  },
}))

// Mock toast
vi.mock('@/lib/toast', () => ({
  toast: {
    warning: vi.fn(),
  },
}))

// Mock MarkdownRendererClient
vi.mock('@/components/markdown', () => ({
  MarkdownRendererClient: ({ content }: { content: string }) => <div>{content}</div>,
}))

// Mock QuickActions
vi.mock('../QuickActions', () => ({
  QuickActions: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid="quick-actions" aria-disabled={disabled}>
      Quick Actions
    </div>
  ),
}))

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, disabled, ...props }: any) => (
    <textarea value={value} onChange={onChange} disabled={disabled} {...props} />
  ),
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children }: any) => <div>{children}</div>,
  CollapsibleContent: ({ children }: any) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@/components/ui/toggle-group', () => ({
  ToggleGroup: ({ children, value, onValueChange, disabled }: any) => (
    <div data-testid="toggle-group" data-value={value} aria-disabled={disabled}>
      {children}
    </div>
  ),
  ToggleGroupItem: ({ children, value, onClick }: any) => (
    <button data-testid={`toggle-${value}`} onClick={onClick}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}))

// =============================================================================
// Test Fixtures
// =============================================================================

const createMessage = (
  role: 'user' | 'assistant' | 'system',
  content: string,
  pending = false
): ChatMessage => ({
  role,
  content,
  timestamp: new Date().toISOString(),
  pending,
})

const createMockProposal = (): Proposal => ({
  type: 'field_updates',
  stageId: 'stage_4',
  updates: [
    {
      path: 'course_title',
      oldValue: 'Old Title',
      newValue: 'New Title',
    },
  ],
  summary: 'Updated course title',
})

// =============================================================================
// Tests
// =============================================================================

describe('RefinementChat', () => {
  const defaultProps = {
    courseId: 'test-course-id',
    stageId: 'stage_4',
    attemptNumber: 1,
    onRefine: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock localStorage
    Storage.prototype.getItem = vi.fn(() => 'true')
    Storage.prototype.setItem = vi.fn()
  })

  // ===========================================================================
  // Pending Message Clearing Logic Tests
  // ===========================================================================

  describe('pending message clearing logic', () => {
    it('should clear pending messages when history grows', async () => {
      const user = userEvent.setup()
      const onRefine = vi.fn().mockResolvedValue(undefined)

      const initialHistory: ChatMessage[] = [createMessage('user', 'Hello')]

      const { rerender } = render(
        <RefinementChat {...defaultProps} onRefine={onRefine} history={initialHistory} />
      )

      // Send a message (creates pending message)
      const input = screen.getByTestId('refinement-input')
      await user.type(input, 'New message')

      const submitButton = screen.getByTestId('refinement-submit')
      await user.click(submitButton)

      // Verify pending message appears (opacity-60%)
      await waitFor(() => {
        const messages = screen.getAllByText(/New message/)
        const pendingMessage = messages.find((el) =>
          el.parentElement?.className.includes('opacity-60')
        )
        expect(pendingMessage).toBeDefined()
      })

      // Simulate history growing (server confirmed the message)
      const updatedHistory: ChatMessage[] = [
        ...initialHistory,
        createMessage('user', 'New message'),
        createMessage('assistant', 'Response to new message'),
      ]

      rerender(<RefinementChat {...defaultProps} onRefine={onRefine} history={updatedHistory} />)

      // Wait for pending message to be cleared
      await waitFor(() => {
        // Pending message should be gone (no opacity-60%)
        const messages = screen.getAllByText(/New message/)
        const pendingMessage = messages.find((el) =>
          el.parentElement?.className.includes('opacity-60')
        )
        expect(pendingMessage).toBeUndefined()
      })

      // History message should still be present (without opacity-60%)
      const messages = screen.getAllByText(/New message/)
      expect(messages.length).toBeGreaterThan(0)
    })

    it('should persist pending messages when history length is unchanged', async () => {
      const user = userEvent.setup()
      const onRefine = vi.fn().mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      const initialHistory: ChatMessage[] = [createMessage('user', 'Hello')]

      render(<RefinementChat {...defaultProps} onRefine={onRefine} history={initialHistory} />)

      // Send a message (creates pending message)
      const input = screen.getByTestId('refinement-input')
      await user.type(input, 'Pending message')

      const submitButton = screen.getByTestId('refinement-submit')
      await user.click(submitButton)

      // Verify pending message appears
      await waitFor(() => {
        const messages = screen.getAllByText(/Pending message/)
        const pendingMessage = messages.find((el) =>
          el.parentElement?.className.includes('opacity-60')
        )
        expect(pendingMessage).toBeDefined()
      })

      // Wait a bit to ensure pending message persists
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Pending message should still be present
      const messages = screen.getAllByText(/Pending message/)
      const pendingMessage = messages.find((el) =>
        el.parentElement?.className.includes('opacity-60')
      )
      expect(pendingMessage).toBeDefined()
    })

    it('should display user message as pending with opacity-60%', async () => {
      const user = userEvent.setup()
      const onRefine = vi.fn().mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      render(<RefinementChat {...defaultProps} onRefine={onRefine} />)

      // Send a message
      const input = screen.getByTestId('refinement-input')
      await user.type(input, 'Pending message')

      const submitButton = screen.getByTestId('refinement-submit')
      await user.click(submitButton)

      // Verify message appears with opacity-60% class
      await waitFor(() => {
        const messages = screen.getAllByText(/Pending message/)
        const pendingMessage = messages.find((el) =>
          el.parentElement?.className.includes('opacity-60')
        )
        expect(pendingMessage).toBeDefined()
        expect(pendingMessage?.parentElement?.className).toContain('opacity-60')
      })
    })

    it('should replace pending message with history message (no duplication)', async () => {
      const user = userEvent.setup()
      const onRefine = vi.fn().mockResolvedValue(undefined)

      const { rerender } = render(<RefinementChat {...defaultProps} onRefine={onRefine} />)

      // Send a message (creates pending message)
      const input = screen.getByTestId('refinement-input')
      await user.type(input, 'Test message')

      const submitButton = screen.getByTestId('refinement-submit')
      await user.click(submitButton)

      // Verify pending message appears
      await waitFor(() => {
        const messages = screen.getAllByText(/Test message/)
        expect(messages.length).toBe(1) // Only pending message
      })

      // Simulate history update (server confirmed)
      const updatedHistory: ChatMessage[] = [
        createMessage('user', 'Test message'),
        createMessage('assistant', 'Response'),
      ]

      rerender(<RefinementChat {...defaultProps} onRefine={onRefine} history={updatedHistory} />)

      // Wait for pending message to be cleared
      await waitFor(() => {
        const messages = screen.getAllByText(/Test message/)
        expect(messages.length).toBe(1) // Only history message (no duplication)

        // Should NOT have opacity-60% anymore
        const hasPending = messages.some((el) => el.parentElement?.className.includes('opacity-60'))
        expect(hasPending).toBe(false)
      })
    })

    it('should remove pending message on send error', async () => {
      const user = userEvent.setup()
      const onRefine = vi.fn().mockRejectedValue(new Error('Send failed'))

      render(<RefinementChat {...defaultProps} onRefine={onRefine} />)

      // Send a message
      const input = screen.getByTestId('refinement-input')
      await user.type(input, 'Error message')

      const submitButton = screen.getByTestId('refinement-submit')
      await user.click(submitButton)

      // Wait for error to be handled
      await waitFor(() => {
        expect(onRefine).toHaveBeenCalled()
      })

      // Wait for pending message to be removed
      await waitFor(() => {
        const messages = screen.queryAllByText(/Error message/)
        expect(messages.length).toBe(0) // Pending message should be removed
      })
    })
  })

  // ===========================================================================
  // Message Display Tests
  // ===========================================================================

  describe('message display', () => {
    it('should render history messages correctly', () => {
      const history: ChatMessage[] = [
        createMessage('user', 'User message'),
        createMessage('assistant', 'Assistant response'),
        createMessage('system', '✅ Changes applied'),
      ]

      render(<RefinementChat {...defaultProps} history={history} />)

      expect(screen.getByText('User message')).toBeDefined()
      expect(screen.getByText('Assistant response')).toBeDefined()
      expect(screen.getByText('✅ Changes applied')).toBeDefined()
    })

    it('should apply correct styles to system messages', () => {
      const history: ChatMessage[] = [createMessage('system', '✅ Success message')]

      render(<RefinementChat {...defaultProps} history={history} />)

      const systemMessage = screen.getByText('✅ Success message')
      // System message div is nested inside message container
      const messageDiv = systemMessage.closest('div')
      expect(messageDiv?.className).toContain('border-green-200')
    })

    it('should apply error styles to system error messages', () => {
      const history: ChatMessage[] = [createMessage('system', '❌ Error: Something went wrong')]

      render(<RefinementChat {...defaultProps} history={history} />)

      const errorMessage = screen.getByText('❌ Error: Something went wrong')
      // Error message div is nested inside message container
      const messageDiv = errorMessage.closest('div')
      expect(messageDiv?.className).toContain('border-red-200')
    })
  })

  // ===========================================================================
  // User Interaction Tests
  // ===========================================================================

  describe('user interaction', () => {
    it('should clear input after sending message', async () => {
      const user = userEvent.setup()
      const onRefine = vi.fn().mockResolvedValue(undefined)

      render(<RefinementChat {...defaultProps} onRefine={onRefine} />)

      const input = screen.getByTestId('refinement-input')
      await user.type(input, 'Test message')

      expect(input.value).toBe('Test message')

      const submitButton = screen.getByTestId('refinement-submit')
      await user.click(submitButton)

      // Input should be cleared
      await waitFor(() => {
        expect(input.value).toBe('')
      })
    })

    it('should disable input and button when processing', () => {
      render(<RefinementChat {...defaultProps} isProcessing={true} />)

      const input = screen.getByTestId('refinement-input')
      const submitButton = screen.getByTestId('refinement-submit')

      expect(input).toHaveProperty('disabled', true)
      expect(submitButton).toHaveProperty('disabled', true)
    })

    it('should disable input and button when generating', () => {
      render(<RefinementChat {...defaultProps} isGenerating={true} />)

      const input = screen.getByTestId('refinement-input')
      const submitButton = screen.getByTestId('refinement-submit')

      expect(input).toHaveProperty('disabled', true)
      expect(submitButton).toHaveProperty('disabled', true)
    })

    it('should not send message when input is empty', async () => {
      const user = userEvent.setup()
      const onRefine = vi.fn()

      render(<RefinementChat {...defaultProps} onRefine={onRefine} />)

      const submitButton = screen.getByTestId('refinement-submit')
      await user.click(submitButton)

      expect(onRefine).not.toHaveBeenCalled()
    })

    it('should not send message when blocked', async () => {
      const user = userEvent.setup()
      const onRefine = vi.fn()

      render(<RefinementChat {...defaultProps} onRefine={onRefine} isProcessing={true} />)

      const input = screen.getByTestId('refinement-input')
      await user.type(input, 'Test message')

      const submitButton = screen.getByTestId('refinement-submit')
      await user.click(submitButton)

      expect(onRefine).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // Proposal Display Tests
  // ===========================================================================

  describe('proposal display', () => {
    it('should render proposal when present', () => {
      const proposal = createMockProposal()

      render(<RefinementChat {...defaultProps} latestProposal={proposal} />)

      expect(screen.getByText('Предложенные изменения')).toBeDefined()
    })

    it('should show accept button when proposal is present', () => {
      const proposal = createMockProposal()

      render(<RefinementChat {...defaultProps} latestProposal={proposal} />)

      expect(screen.getByText('Принять')).toBeDefined()
    })

    it('should disable accept button when applying', () => {
      const proposal = createMockProposal()

      render(<RefinementChat {...defaultProps} latestProposal={proposal} isApplying={true} />)

      const acceptButton = screen.getByText('Применяю...')
      const buttonElement = acceptButton.closest('button')
      expect(buttonElement).toHaveProperty('disabled', true)
    })

    it('should show retry button on proposal error', () => {
      const proposal = createMockProposal()

      render(
        <RefinementChat
          {...defaultProps}
          latestProposal={proposal}
          proposalError="Failed to apply"
        />
      )

      expect(screen.getByText('Повторить')).toBeDefined()
      expect(screen.getByText('Failed to apply')).toBeDefined()
    })
  })

  // ===========================================================================
  // Integration Tests
  // ===========================================================================

  describe('integration scenarios', () => {
    it('should handle complete message flow (send → pending → confirmed)', async () => {
      const user = userEvent.setup()
      const onRefine = vi.fn().mockResolvedValue(undefined)

      const { rerender } = render(<RefinementChat {...defaultProps} onRefine={onRefine} />)

      // 1. Send message
      const input = screen.getByTestId('refinement-input')
      await user.type(input, 'Complete flow test')

      const submitButton = screen.getByTestId('refinement-submit')
      await user.click(submitButton)

      // 2. Verify pending state
      await waitFor(() => {
        const messages = screen.getAllByText(/Complete flow test/)
        const pendingMessage = messages.find((el) =>
          el.parentElement?.className.includes('opacity-60')
        )
        expect(pendingMessage).toBeDefined()
      })

      // 3. Simulate server confirmation
      const updatedHistory: ChatMessage[] = [
        createMessage('user', 'Complete flow test'),
        createMessage('assistant', 'Response'),
      ]

      rerender(<RefinementChat {...defaultProps} onRefine={onRefine} history={updatedHistory} />)

      // 4. Verify pending cleared and history displayed
      await waitFor(() => {
        const messages = screen.getAllByText(/Complete flow test/)
        const hasPending = messages.some((el) => el.parentElement?.className.includes('opacity-60'))
        expect(hasPending).toBe(false)
      })
    })
  })
})
