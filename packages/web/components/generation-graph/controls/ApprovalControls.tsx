'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Loader2, Rocket, RotateCcw } from 'lucide-react';
import { approveStage } from '@/app/actions/admin-generation';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/generation-graph/useTranslation';
import { useRestartStage } from '../hooks/useRestartStage';
import { cn } from '@/lib/utils';

interface ApprovalControlsProps {
  courseId: string;
  courseSlug: string;
  stageNumber: number;
  onApproved?: () => void;
  onRegenerated?: () => void;
  /**
   * Visual variant:
   * - 'compact': Small outline buttons (approve/regenerate side by side)
   * - 'prominent': Large gradient button with rocket icon, matching stage gate style
   */
  variant?: 'compact' | 'prominent';
  /**
   * Show regenerate button
   */
  showRegenerate?: boolean;
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
  courseSlug,
  stageNumber,
  onApproved,
  onRegenerated,
  variant = 'compact',
  showRegenerate = true,
  approveText,
  className
}: ApprovalControlsProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [action, setAction] = useState<'approve' | 'regenerate' | null>(null);
  const { t } = useTranslation();
  const { restartStage, isRestarting } = useRestartStage(courseSlug);

  // Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const handleApprove = async () => {
    setIsProcessing(true);
    setAction('approve');
    try {
      await approveStage(courseId, stageNumber);
      onApproved?.();
    } catch (error) {
      if (mountedRef.current) {
        toast.error(t('actions.approvalFailed') || 'Approval failed', {
          description: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    } finally {
      if (mountedRef.current) {
        setIsProcessing(false);
        setAction(null);
      }
    }
  };

  const handleRegenerate = async () => {
    setIsProcessing(true);
    setAction('regenerate');
    try {
      const result = await restartStage(stageNumber);
      if (mountedRef.current) {
        if (result.success) {
          toast.success(t('actions.regenerationStarted') || 'Перегенерация запущена');
          onRegenerated?.();
        } else {
          toast.error(t('actions.regenerationFailed') || 'Ошибка перегенерации', {
            description: result.error
          });
        }
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(t('actions.regenerationFailed') || 'Ошибка перегенерации', {
          description: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    } finally {
      if (mountedRef.current) {
        setIsProcessing(false);
        setAction(null);
      }
    }
  };

  // Fix operator precedence with explicit parentheses
  const isRegenerating = (isProcessing && action === 'regenerate') || isRestarting;

  // Prominent variant - large gradient button matching PrioritizationPanel style
  if (variant === 'prominent') {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <Button
          size="compact"
          onClick={handleApprove}
          disabled={isProcessing || isRestarting}
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
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          data-testid="approval-approve-btn"
        >
          {isProcessing && action === 'approve' ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <Rocket size={14} className="mr-1.5" />
          )}
          {approveText || t('actions.approveAndContinue') || 'Подтвердить и продолжить'}
        </Button>

        {/* Regenerate link for prominent mode */}
        {showRegenerate && (
          <button
            onClick={handleRegenerate}
            disabled={isProcessing || isRestarting}
            className={cn(
              'text-sm underline-offset-4 hover:underline',
              'text-slate-500 hover:text-orange-600',
              'dark:text-slate-400 dark:hover:text-orange-400',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors flex items-center gap-1'
            )}
            data-testid="approval-regenerate-btn"
          >
            {isRegenerating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {t('actions.regenerating') || 'Перегенерация...'}
              </>
            ) : (
              <>
                <RotateCcw size={14} />
                {t('actions.regenerate') || 'Перегенерировать'}
              </>
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
        size="compact"
        onClick={handleApprove}
        disabled={isProcessing || isRestarting}
        className={cn(
          // Light mode
          'text-emerald-600 border-emerald-300 hover:bg-emerald-50',
          // Dark mode
          'dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-900/30'
        )}
        data-testid="approval-approve-btn"
      >
        {isProcessing && action === 'approve' ? (
          <Loader2 size={14} className="mr-1 animate-spin" />
        ) : (
          <Check size={14} className="mr-1" />
        )}
        {t('actions.approve')}
      </Button>

      {showRegenerate && (
        <Button
          variant="outline"
          size="compact"
          onClick={handleRegenerate}
          disabled={isProcessing || isRestarting}
          className={cn(
            // Light mode
            'text-orange-600 border-orange-300 hover:bg-orange-50',
            // Dark mode
            'dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-900/30'
          )}
          data-testid="approval-regenerate-btn"
        >
          {isRegenerating ? (
            <Loader2 size={14} className="mr-1 animate-spin" />
          ) : (
            <RotateCcw size={14} className="mr-1" />
          )}
          {t('actions.regenerate') || 'Перегенерировать'}
        </Button>
      )}
    </div>
  );
};
