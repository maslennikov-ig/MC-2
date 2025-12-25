import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  ProgressSummaryDisplay,
  AttemptSummaryCard,
  type ProgressSummaryDisplayProps,
  type AttemptSummaryCardProps,
} from '@/components/generation-graph/components/ProgressSummaryDisplay';
import type {
  ProgressSummary,
  NodeAttemptSummary,
  SummaryItem,
} from '@megacampus/shared-types/judge-types';

// =============================================================================
// Test Fixtures
// =============================================================================

const createSummaryItem = (
  text: string,
  severity: SummaryItem['severity'] = 'info'
): SummaryItem => ({
  text,
  severity,
});

const createAttemptSummary = (
  overrides: Partial<NodeAttemptSummary> = {}
): NodeAttemptSummary => ({
  node: 'selfReviewer',
  attempt: 1,
  status: 'completed',
  resultLabel: 'PASS',
  issuesFound: [],
  actionsPerformed: [],
  ...overrides,
});

const createProgressSummary = (
  overrides: Partial<ProgressSummary> = {}
): ProgressSummary => ({
  status: 'completed',
  currentPhase: 'Test Phase',
  language: 'en',
  attempts: [],
  ...overrides,
});

// =============================================================================
// ProgressSummaryDisplay Tests
// =============================================================================

describe('ProgressSummaryDisplay', () => {
  describe('null/empty states', () => {
    it('should render null without crashing when progressSummary is null', () => {
      const { container } = render(
        <ProgressSummaryDisplay progressSummary={null} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('should render null when progressSummary is undefined', () => {
      const { container } = render(
        <ProgressSummaryDisplay progressSummary={undefined} />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('compact view', () => {
    it('should render compact view with status icon and phase', () => {
      const summary = createProgressSummary({
        status: 'completed',
        currentPhase: 'Self-Review Complete',
      });

      render(<ProgressSummaryDisplay progressSummary={summary} compact />);

      expect(screen.getByText('Self-Review Complete')).toBeInTheDocument();
    });

    it('should include outcome in compact view when provided', () => {
      const summary = createProgressSummary({
        status: 'completed',
        currentPhase: 'Self-Review',
        outcome: 'Passed all checks',
      });

      render(<ProgressSummaryDisplay progressSummary={summary} compact />);

      expect(
        screen.getByText(/Self-Review - Passed all checks/)
      ).toBeInTheDocument();
    });

    it('should show status icon in compact view for generating status', () => {
      const summary = createProgressSummary({
        status: 'generating',
        currentPhase: 'Generating content',
      });

      const { container } = render(
        <ProgressSummaryDisplay progressSummary={summary} compact />
      );

      // Check for spinning loader icon by looking for animation class
      const animatedElement = container.querySelector('.animate-spin');
      expect(animatedElement).toBeInTheDocument();
    });

    it('should show status icon in compact view for reviewing status', () => {
      const summary = createProgressSummary({
        status: 'reviewing',
        currentPhase: 'Reviewing content',
      });

      const { container } = render(
        <ProgressSummaryDisplay progressSummary={summary} compact />
      );

      // Check for pulsing animation
      const animatedElement = container.querySelector('.animate-pulse');
      expect(animatedElement).toBeInTheDocument();
    });
  });

  describe('full view', () => {
    it('should render full view with attempts', () => {
      const attempt = createAttemptSummary({
        node: 'selfReviewer',
        attempt: 1,
        status: 'completed',
        resultLabel: 'PASS',
      });

      const summary = createProgressSummary({
        status: 'completed',
        currentPhase: 'Self-Review Complete',
        attempts: [attempt],
      });

      render(<ProgressSummaryDisplay progressSummary={summary} />);

      expect(screen.getByText('Self-Review Complete')).toBeInTheDocument();
      expect(screen.getByText('Self-Review')).toBeInTheDocument(); // Attempt card
    });

    it('should show status badge with correct styling', () => {
      const summary = createProgressSummary({
        status: 'completed',
        currentPhase: 'Test Phase',
        language: 'en',
      });

      render(<ProgressSummaryDisplay progressSummary={summary} />);

      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should show "No attempts yet" when attempts array is empty', () => {
      const summary = createProgressSummary({
        status: 'reviewing',
        currentPhase: 'Starting review',
        attempts: [],
      });

      render(<ProgressSummaryDisplay progressSummary={summary} />);

      expect(screen.getByText('No attempts yet')).toBeInTheDocument();
    });

    it('should render multiple attempts', () => {
      const attempts = [
        createAttemptSummary({
          node: 'selfReviewer',
          attempt: 1,
          status: 'completed',
          resultLabel: 'PASS_WITH_FLAGS',
        }),
        createAttemptSummary({
          node: 'judge',
          attempt: 1,
          status: 'completed',
          resultLabel: 'ACCEPT',
        }),
      ];

      const summary = createProgressSummary({
        status: 'completed',
        currentPhase: 'Evaluation Complete',
        attempts,
      });

      render(<ProgressSummaryDisplay progressSummary={summary} />);

      expect(screen.getByText('Self-Review')).toBeInTheDocument();
      expect(screen.getByText('Evaluation')).toBeInTheDocument();
    });
  });

  describe('localization', () => {
    it('should display Russian labels when language=ru', () => {
      const attempt = createAttemptSummary({
        node: 'selfReviewer',
        attempt: 1,
        status: 'completed',
        resultLabel: 'PASS',
      });

      const summary = createProgressSummary({
        status: 'completed',
        currentPhase: 'Самопроверка завершена',
        language: 'ru',
        attempts: [attempt],
      });

      render(<ProgressSummaryDisplay progressSummary={summary} />);

      // Check for Russian localized labels
      expect(screen.getByText('Самопроверка')).toBeInTheDocument(); // Self-Review
      expect(screen.getByText('Завершено')).toBeInTheDocument(); // Completed
    });

    it('should display English labels when language=en', () => {
      const attempt = createAttemptSummary({
        node: 'selfReviewer',
        attempt: 1,
        status: 'completed',
        resultLabel: 'PASS',
      });

      const summary = createProgressSummary({
        status: 'completed',
        currentPhase: 'Self-Review Complete',
        language: 'en',
        attempts: [attempt],
      });

      render(<ProgressSummaryDisplay progressSummary={summary} />);

      expect(screen.getByText('Self-Review')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should display Russian result labels (e.g., Пройдено for PASS)', () => {
      const attempt = createAttemptSummary({
        node: 'selfReviewer',
        attempt: 1,
        status: 'completed',
        resultLabel: 'PASS',
      });

      const summary = createProgressSummary({
        status: 'completed',
        currentPhase: 'Test',
        language: 'ru',
        attempts: [attempt],
      });

      render(<ProgressSummaryDisplay progressSummary={summary} />);

      expect(screen.getByText('Пройдено')).toBeInTheDocument(); // Russian for "Passed"
    });

    it('should display Russian judge node label', () => {
      const attempt = createAttemptSummary({
        node: 'judge',
        attempt: 1,
        status: 'completed',
        resultLabel: 'ACCEPT',
      });

      const summary = createProgressSummary({
        status: 'completed',
        currentPhase: 'Test',
        language: 'ru',
        attempts: [attempt],
      });

      render(<ProgressSummaryDisplay progressSummary={summary} />);

      expect(screen.getByText('Оценка')).toBeInTheDocument(); // Russian for "Evaluation"
    });
  });

  describe('status colors', () => {
    it('should show green for completed status', () => {
      const summary = createProgressSummary({
        status: 'completed',
        currentPhase: 'Done',
        language: 'en',
      });

      const { container } = render(
        <ProgressSummaryDisplay progressSummary={summary} />
      );

      // Check for emerald/green color classes
      const badge = screen.getByText('Completed');
      expect(badge.className).toMatch(/emerald/);
    });

    it('should show red for failed status', () => {
      const summary = createProgressSummary({
        status: 'failed',
        currentPhase: 'Error',
        language: 'en',
      });

      const { container } = render(
        <ProgressSummaryDisplay progressSummary={summary} />
      );

      const badge = screen.getByText('Failed');
      expect(badge.className).toMatch(/red/);
    });

    it('should show amber for fixing status', () => {
      const summary = createProgressSummary({
        status: 'fixing',
        currentPhase: 'Applying fixes',
        language: 'en',
      });

      const { container } = render(
        <ProgressSummaryDisplay progressSummary={summary} />
      );

      const badge = screen.getByText('Fixing');
      expect(badge.className).toMatch(/amber/);
    });

    it('should show blue for reviewing status', () => {
      const summary = createProgressSummary({
        status: 'reviewing',
        currentPhase: 'Reviewing content quality',
        language: 'en',
      });

      const { container } = render(
        <ProgressSummaryDisplay progressSummary={summary} />
      );

      // Get all elements with "Reviewing" text and find the badge
      const badges = screen.getAllByText('Reviewing');
      const badge = badges.find(el => el.tagName === 'DIV' && el.className.includes('bg-blue'));
      expect(badge).toBeDefined();
      expect(badge?.className).toMatch(/blue/);
    });

    it('should show blue for generating status', () => {
      const summary = createProgressSummary({
        status: 'generating',
        currentPhase: 'Generating content',
        language: 'en',
      });

      const { container } = render(
        <ProgressSummaryDisplay progressSummary={summary} />
      );

      // Get all elements with "Generating" text and find the badge
      const badges = screen.getAllByText('Generating');
      const badge = badges.find(el => el.tagName === 'DIV' && el.className.includes('bg-blue'));
      expect(badge).toBeDefined();
      expect(badge?.className).toMatch(/blue/);
    });
  });

  describe('custom className', () => {
    it('should apply custom className in compact view', () => {
      const summary = createProgressSummary({
        status: 'completed',
        currentPhase: 'Test',
      });

      const { container } = render(
        <ProgressSummaryDisplay
          progressSummary={summary}
          compact
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('should apply custom className in full view', () => {
      const summary = createProgressSummary({
        status: 'completed',
        currentPhase: 'Test',
      });

      const { container } = render(
        <ProgressSummaryDisplay
          progressSummary={summary}
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});

// =============================================================================
// AttemptSummaryCard Tests
// =============================================================================

describe('AttemptSummaryCard', () => {
  describe('node labels', () => {
    it('should render selfReviewer node with correct label', () => {
      const attempt = createAttemptSummary({
        node: 'selfReviewer',
      });

      render(<AttemptSummaryCard attempt={attempt} language="en" />);

      expect(screen.getByText('Self-Review')).toBeInTheDocument();
    });

    it('should render judge node with correct label', () => {
      const attempt = createAttemptSummary({
        node: 'judge',
      });

      render(<AttemptSummaryCard attempt={attempt} language="en" />);

      expect(screen.getByText('Evaluation')).toBeInTheDocument();
    });

    it('should render selfReviewer with Russian label', () => {
      const attempt = createAttemptSummary({
        node: 'selfReviewer',
      });

      render(<AttemptSummaryCard attempt={attempt} language="ru" />);

      expect(screen.getByText('Самопроверка')).toBeInTheDocument();
    });

    it('should render judge with Russian label', () => {
      const attempt = createAttemptSummary({
        node: 'judge',
      });

      render(<AttemptSummaryCard attempt={attempt} language="ru" />);

      expect(screen.getByText('Оценка')).toBeInTheDocument();
    });
  });

  describe('latest badge', () => {
    it('should show "Current" badge when isLatest=true', () => {
      const attempt = createAttemptSummary();

      render(<AttemptSummaryCard attempt={attempt} isLatest language="en" />);

      expect(screen.getByText('Current')).toBeInTheDocument();
    });

    it('should not show badge when isLatest=false', () => {
      const attempt = createAttemptSummary();

      render(
        <AttemptSummaryCard attempt={attempt} isLatest={false} language="en" />
      );

      expect(screen.queryByText('Current')).not.toBeInTheDocument();
    });

    it('should show Russian "Текущая" badge when language=ru', () => {
      const attempt = createAttemptSummary();

      render(<AttemptSummaryCard attempt={attempt} isLatest language="ru" />);

      expect(screen.getByText('Текущая')).toBeInTheDocument();
    });
  });

  describe('issues and actions', () => {
    it('should show issues found with severity icons', () => {
      const attempt = createAttemptSummary({
        issuesFound: [
          createSummaryItem('Language mismatch detected', 'error'),
          createSummaryItem('Markdown formatting issues', 'warning'),
          createSummaryItem('Minor style issue', 'info'),
        ],
      });

      render(<AttemptSummaryCard attempt={attempt} language="en" />);

      expect(screen.getByText('Issues found:')).toBeInTheDocument();
      expect(screen.getByText('Language mismatch detected')).toBeInTheDocument();
      expect(screen.getByText('Markdown formatting issues')).toBeInTheDocument();
      expect(screen.getByText('Minor style issue')).toBeInTheDocument();
    });

    it('should show actions performed', () => {
      const attempt = createAttemptSummary({
        actionsPerformed: [
          createSummaryItem('Fixed markdown syntax', 'info'),
          createSummaryItem('Removed chatbot artifacts', 'info'),
        ],
      });

      render(<AttemptSummaryCard attempt={attempt} language="en" />);

      expect(screen.getByText('Actions performed:')).toBeInTheDocument();
      expect(screen.getByText('Fixed markdown syntax')).toBeInTheDocument();
      expect(
        screen.getByText('Removed chatbot artifacts')
      ).toBeInTheDocument();
    });

    it('should show outcome message', () => {
      const attempt = createAttemptSummary({
        outcome: 'Routed to judge for final evaluation',
      });

      render(<AttemptSummaryCard attempt={attempt} language="en" />);

      expect(
        screen.getByText('Routed to judge for final evaluation')
      ).toBeInTheDocument();
    });

    it('should not show issues section when empty', () => {
      const attempt = createAttemptSummary({
        issuesFound: [],
      });

      render(<AttemptSummaryCard attempt={attempt} language="en" />);

      expect(screen.queryByText('Issues found:')).not.toBeInTheDocument();
    });

    it('should not show actions section when empty', () => {
      const attempt = createAttemptSummary({
        actionsPerformed: [],
      });

      render(<AttemptSummaryCard attempt={attempt} language="en" />);

      expect(screen.queryByText('Actions performed:')).not.toBeInTheDocument();
    });
  });

  describe('metrics', () => {
    it('should show duration in seconds', () => {
      const attempt = createAttemptSummary({
        durationMs: 2500, // 2.5 seconds
      });

      render(<AttemptSummaryCard attempt={attempt} language="en" />);

      expect(screen.getByText('2.5s')).toBeInTheDocument();
    });

    it('should show tokens with locale formatting', () => {
      const attempt = createAttemptSummary({
        tokensUsed: 1234,
      });

      render(<AttemptSummaryCard attempt={attempt} language="en" />);

      // English locale formats as "1,234"
      expect(screen.getByText(/1,234 tok/)).toBeInTheDocument();
    });

    it('should show tokens with Russian locale formatting', () => {
      const attempt = createAttemptSummary({
        tokensUsed: 1234,
      });

      render(<AttemptSummaryCard attempt={attempt} language="ru" />);

      // Russian locale formats as "1 234" (space separator)
      expect(screen.getByText(/1\s234 tok/)).toBeInTheDocument();
    });

    it('should show both duration and tokens', () => {
      const attempt = createAttemptSummary({
        durationMs: 1500,
        tokensUsed: 500,
      });

      render(<AttemptSummaryCard attempt={attempt} language="en" />);

      expect(screen.getByText('1.5s')).toBeInTheDocument();
      expect(screen.getByText(/500 tok/)).toBeInTheDocument();
    });

    it('should not show tokens when zero', () => {
      const attempt = createAttemptSummary({
        tokensUsed: 0,
      });

      render(<AttemptSummaryCard attempt={attempt} language="en" />);

      expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
    });

    it('should not show metrics section when no metrics provided', () => {
      const attempt = createAttemptSummary({
        durationMs: undefined,
        tokensUsed: undefined,
      });

      const { container } = render(
        <AttemptSummaryCard attempt={attempt} language="en" />
      );

      // No metrics section should be rendered
      expect(container.querySelector('.font-mono')).not.toBeInTheDocument();
    });
  });

  describe('result labels', () => {
    it('should show English result label for PASS', () => {
      const attempt = createAttemptSummary({
        resultLabel: 'PASS',
      });

      render(<AttemptSummaryCard attempt={attempt} language="en" />);

      expect(screen.getByText('Passed')).toBeInTheDocument();
    });

    it('should show Russian result label for PASS', () => {
      const attempt = createAttemptSummary({
        resultLabel: 'PASS',
      });

      render(<AttemptSummaryCard attempt={attempt} language="ru" />);

      expect(screen.getByText('Пройдено')).toBeInTheDocument();
    });

    it('should show English result label for PASS_WITH_FLAGS', () => {
      const attempt = createAttemptSummary({
        resultLabel: 'PASS_WITH_FLAGS',
      });

      render(<AttemptSummaryCard attempt={attempt} language="en" />);

      expect(screen.getByText('Passed with flags')).toBeInTheDocument();
    });

    it('should show Russian result label for ACCEPT', () => {
      const attempt = createAttemptSummary({
        node: 'judge',
        resultLabel: 'ACCEPT',
      });

      render(<AttemptSummaryCard attempt={attempt} language="ru" />);

      expect(screen.getByText('Принято')).toBeInTheDocument();
    });

    it('should show Russian result label for ESCALATE_TO_HUMAN', () => {
      const attempt = createAttemptSummary({
        node: 'judge',
        resultLabel: 'ESCALATE_TO_HUMAN',
      });

      render(<AttemptSummaryCard attempt={attempt} language="ru" />);

      expect(screen.getByText('Требует проверки')).toBeInTheDocument();
    });
  });

  describe('custom className', () => {
    it('should apply custom className', () => {
      const attempt = createAttemptSummary();

      const { container } = render(
        <AttemptSummaryCard
          attempt={attempt}
          language="en"
          className="custom-card-class"
        />
      );

      expect(container.firstChild).toHaveClass('custom-card-class');
    });
  });

  describe('default language', () => {
    it('should default to English when language not provided', () => {
      const attempt = createAttemptSummary({
        node: 'selfReviewer',
      });

      render(<AttemptSummaryCard attempt={attempt} />);

      expect(screen.getByText('Self-Review')).toBeInTheDocument();
    });
  });

  describe('visual styling for isLatest', () => {
    it('should apply blue styling when isLatest=true', () => {
      const attempt = createAttemptSummary();

      const { container } = render(
        <AttemptSummaryCard attempt={attempt} isLatest language="en" />
      );

      const card = container.firstChild as HTMLElement;
      expect(card.className).toMatch(/blue/);
    });

    it('should apply slate styling when isLatest=false', () => {
      const attempt = createAttemptSummary();

      const { container } = render(
        <AttemptSummaryCard attempt={attempt} isLatest={false} language="en" />
      );

      const card = container.firstChild as HTMLElement;
      expect(card.className).toMatch(/slate/);
    });
  });
});
