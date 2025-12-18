import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MissionControlBanner } from '@/components/generation-celestial/MissionControlBanner';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onClick, ...props }: any) => (
      <div onClick={onClick} role={props.role} tabIndex={props.tabIndex} aria-label={props['aria-label']} onKeyDown={props.onKeyDown} className={props.className}>
        {children}
      </div>
    ),
  },
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('MissionControlBanner', () => {
  it('calls onApprove when approve button clicked', () => {
    const handleApprove = vi.fn();
    render(
      <MissionControlBanner
        courseId="123"
        awaitingStage={2}
        onApprove={handleApprove}
        onCancel={() => {}}
        onViewResults={() => {}}
        isProcessing={false}
      />
    );

    // Find button by Russian text "Запуск" (Launch)
    const button = screen.getByText((content) => content.includes('Запуск'));
    fireEvent.click(button);
    expect(handleApprove).toHaveBeenCalled();
  });

  it('calls onCancel when abort button clicked', () => {
    const handleCancel = vi.fn();
    render(
      <MissionControlBanner
        courseId="123"
        awaitingStage={2}
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
});
