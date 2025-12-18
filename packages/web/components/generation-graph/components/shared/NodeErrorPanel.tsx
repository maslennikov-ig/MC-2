'use client';

import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NodeErrorPanelProps {
  /** Error message to display */
  message: string;
  /** Callback when restart button is clicked */
  onRestart?: () => void;
  /** Label for restart button (default: "Перезапустить") */
  restartLabel?: string;
  /** Show restart button (default: true if onRestart provided) */
  showRestartButton?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Test ID for restart button */
  testId?: string;
}

/**
 * NodeErrorPanel Component
 *
 * Error panel with message and optional restart button.
 * Used in node error states to display prominent error information.
 *
 * Features:
 * - Red-themed error background
 * - Error message with icon
 * - Optional restart button
 * - Dark mode support
 * - Accessible button with test ID
 */
export const NodeErrorPanel = ({
  message,
  onRestart,
  restartLabel = 'Перезапустить',
  showRestartButton = !!onRestart,
  className,
  testId,
}: NodeErrorPanelProps) => {
  return (
    <div className={cn(
      "px-3 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800",
      className
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-xs">
          <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
          <span className="font-medium truncate">{message}</span>
        </div>
        {showRestartButton && onRestart && (
          <button
            className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors shadow-sm shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onRestart();
            }}
            data-testid={testId}
            aria-label={restartLabel}
          >
            <RotateCcw size={12} aria-hidden="true" />
            {restartLabel}
          </button>
        )}
      </div>
    </div>
  );
};
