'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X, Loader2, Rocket } from 'lucide-react';
import { approveStage, cancelGeneration } from '@/app/actions/admin-generation';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/generation-graph/useTranslation';
import { cn } from '@/lib/utils';

interface ApprovalControlsProps {
  courseId: string;
  stageNumber: number;
  onApproved?: () => void;
  onRejected?: () => void;
  /**
   * Visual variant:
   * - 'compact': Small outline buttons (approve/reject side by side)
   * - 'prominent': Large gradient button with rocket icon, matching stage gate style
   */
  variant?: 'compact' | 'prominent';
  /**
   * Show reject button (only for compact variant)
   */
  showReject?: boolean;
  /**
   * Custom approve button text (prominent variant only)
   */
  approveText?: string;
  /**
   * Additional CSS class for container
   */
  className?: string;
}

export const ApprovalControls = ({
  courseId,
  stageNumber,
  onApproved,
  onRejected,
  variant = 'compact',
  showReject = true,
  approveText,
  className
}: ApprovalControlsProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const { t } = useTranslation();

  const handleApprove = async () => {
    setIsProcessing(true);
    setAction('approve');
    try {
      await approveStage(courseId, stageNumber);
      onApproved?.();
    } catch (error) {
      toast.error(t('actions.approvalFailed') || 'Approval failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsProcessing(false);
      setAction(null);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    setAction('reject');
    try {
      await cancelGeneration(courseId);
      onRejected?.();
    } catch (error) {
      toast.error(t('actions.rejectionFailed') || 'Rejection failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsProcessing(false);
      setAction(null);
    }
  };

  // Prominent variant - large gradient button matching PrioritizationPanel style
  if (variant === 'prominent') {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <Button
          onClick={handleApprove}
          disabled={isProcessing}
          className={cn(
            // Light mode gradient
            'bg-gradient-to-r from-purple-500 to-indigo-600',
            'hover:from-purple-600 hover:to-indigo-700',
            'text-white shadow-lg shadow-purple-500/25',
            // Dark mode gradient (same gradient works well in dark)
            'dark:from-purple-600 dark:to-indigo-700',
            'dark:hover:from-purple-500 dark:hover:to-indigo-600',
            'dark:shadow-purple-500/40',
            // Disabled state
            'disabled:opacity-50 disabled:cursor-not-allowed',
            // Sizing
            'h-10 px-6'
          )}
          data-testid="approval-approve-btn"
        >
          {isProcessing && action === 'approve' ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Rocket className="w-4 h-4 mr-2" />
          )}
          {approveText || t('actions.approveAndContinue') || 'Подтвердить и продолжить'}
        </Button>

        {/* Cancel link for prominent mode */}
        {showReject && (
          <button
            onClick={handleReject}
            disabled={isProcessing}
            className={cn(
              'text-sm underline-offset-4 hover:underline',
              'text-slate-500 hover:text-red-600',
              'dark:text-slate-400 dark:hover:text-red-400',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors'
            )}
            data-testid="approval-reject-btn"
          >
            {isProcessing && action === 'reject' ? (
              <span className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('actions.canceling') || 'Отмена...'}
              </span>
            ) : (
              t('actions.cancelGeneration') || 'Отменить генерацию'
            )}
          </button>
        )}
      </div>
    );
  }

  // Compact variant - original small buttons
  return (
    <div className={cn('flex gap-2', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleApprove}
        disabled={isProcessing}
        className={cn(
          // Light mode
          'text-emerald-600 border-emerald-300 hover:bg-emerald-50',
          // Dark mode
          'dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-900/30'
        )}
        data-testid="approval-approve-btn"
      >
        {isProcessing && action === 'approve' ? (
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <Check className="w-4 h-4 mr-1" />
        )}
        {t('actions.approve')}
      </Button>

      {showReject && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleReject}
          disabled={isProcessing}
          className={cn(
            // Light mode
            'text-red-600 border-red-300 hover:bg-red-50',
            // Dark mode
            'dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/30'
          )}
          data-testid="approval-reject-btn"
        >
          {isProcessing && action === 'reject' ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <X className="w-4 h-4 mr-1" />
          )}
          {t('actions.reject')}
        </Button>
      )}
    </div>
  );
};
