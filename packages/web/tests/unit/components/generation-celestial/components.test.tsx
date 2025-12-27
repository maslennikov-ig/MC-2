import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { MissionControlBanner } from '@/components/generation-celestial/MissionControlBanner';

// Translations for tests
const messages = {
  generation: {
    missionControl: {
      awaitingStatus: 'Ожидание',
      cancel: 'Отмена',
      view: 'Просмотр',
      confirming: 'Подтверждение...',
      stage0: { compact: 'Запуск', full: 'Запустить генерацию', description: 'Запуск генерации курса', hint: 'Нажмите для запуска' },
      stage5: { compact: 'Далее', full: 'Продолжить', description: 'Генерация структуры завершена', hint: 'Нажмите для продолжения' },
      default: { compact: 'Далее', full: 'Продолжить генерацию', description: 'Этап {stageName} завершен', hint: 'Нажмите для подтверждения' },
    }
  }
};

const renderWithIntl = (ui: React.ReactElement) => {
  return render(
    <NextIntlClientProvider locale="ru" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
};

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onClick, onDragEnd, style, ...props }: any) => (
      <div onClick={onClick} role={props.role} tabIndex={props.tabIndex} aria-label={props['aria-label']} onKeyDown={props.onKeyDown} className={props.className}>
        {children}
      </div>
    ),
    button: ({ children, onClick, ...props }: any) => (
      <button onClick={onClick} aria-label={props['aria-label']} className={props.className}>
        {children}
      </button>
    ),
  },
  useReducedMotion: () => false,
  useMotionValue: () => ({ set: vi.fn(), get: () => 0 }),
  useTransform: () => 1,
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('MissionControlBanner', () => {
  beforeEach(() => {
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
  });

  it('calls onApprove when approve button clicked', () => {
    const handleApprove = vi.fn();
    renderWithIntl(
      <MissionControlBanner
        courseId="123"
        awaitingStage={0}
        onApprove={handleApprove}
        onCancel={() => {}}
        onViewResults={() => {}}
        isProcessing={false}
      />
    );

    // Find button by role and text - stage 0 uses "Запуск" (Launch) text
    const button = screen.getByRole('button', { name: /Запуск/ });
    fireEvent.click(button);
    expect(handleApprove).toHaveBeenCalled();
  });

  it('calls onCancel when abort button clicked', () => {
    const handleCancel = vi.fn();
    renderWithIntl(
      <MissionControlBanner
        courseId="123"
        awaitingStage={0}
        onApprove={() => {}}
        onCancel={handleCancel}
        onViewResults={() => {}}
        isProcessing={false}
      />
    );

    // First expand the banner to reveal the cancel button
    const header = screen.getByText((content) => content.includes('Ожидание'));
    fireEvent.click(header);

    // Find button by Russian text "Отмена" (Cancel)
    const button = screen.getByText((content) => content.includes('Отмена'));
    fireEvent.click(button);
    expect(handleCancel).toHaveBeenCalled();
  });

  it('auto-minimizes when isNodePanelOpen becomes true', () => {
    const { rerender } = renderWithIntl(
      <MissionControlBanner
        courseId="123"
        awaitingStage={0}
        onApprove={() => {}}
        onCancel={() => {}}
        onViewResults={() => {}}
        isProcessing={false}
        isNodePanelOpen={false}
      />
    );

    // Initially should show the full banner (check for "Ожидание" text)
    expect(screen.getByText((content) => content.includes('Ожидание'))).toBeInTheDocument();

    // Re-render with isNodePanelOpen=true
    rerender(
      <NextIntlClientProvider locale="ru" messages={messages}>
        <MissionControlBanner
          courseId="123"
          awaitingStage={0}
          onApprove={() => {}}
          onCancel={() => {}}
          onViewResults={() => {}}
          isProcessing={false}
          isNodePanelOpen={true}
        />
      </NextIntlClientProvider>
    );

    // Should save minimized state to localStorage with course-specific key
    expect(localStorageMock.setItem).toHaveBeenCalledWith('mission-control-banner-minimized-123', 'true');
  });

  it('expands from edge tab when clicked', () => {
    // Set localStorage to start minimized
    localStorageMock.getItem.mockReturnValue('true');

    renderWithIntl(
      <MissionControlBanner
        courseId="123"
        awaitingStage={0}
        onApprove={() => {}}
        onCancel={() => {}}
        onViewResults={() => {}}
        isProcessing={false}
      />
    );

    // Find the edge tab expand button by aria-label
    const expandButton = screen.getByLabelText('Развернуть панель подтверждения');
    fireEvent.click(expandButton);

    // Should now show the full banner with "Ожидание" text
    expect(screen.getByText((content) => content.includes('Ожидание'))).toBeInTheDocument();

    // Should update localStorage with course-specific key
    expect(localStorageMock.setItem).toHaveBeenCalledWith('mission-control-banner-minimized-123', 'false');
  });
});
