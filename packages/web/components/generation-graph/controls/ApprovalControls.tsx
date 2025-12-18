'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X, Loader2 } from 'lucide-react';
import { approveStage, cancelGeneration } from '@/app/actions/admin-generation';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/generation-graph/useTranslation';

interface ApprovalControlsProps {
  courseId: string;
  stageNumber: number;
  onApproved?: () => void;
  onRejected?: () => void;
}

export const ApprovalControls = ({
  courseId,
  stageNumber,
  onApproved,
  onRejected
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
      toast.error('Approval failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsProcessing(false);
      setAction(null);
    }
  };

  const handleReject = async (_feedback?: string) => {
    setIsProcessing(true);
    setAction('reject');
    try {
      await cancelGeneration(courseId);
      onRejected?.();
    } catch (error) {
      toast.error('Rejection failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsProcessing(false);
      setAction(null);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleApprove}
        disabled={isProcessing}
        className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
        data-testid="approval-approve-btn"
      >
        {isProcessing && action === 'approve' ? (
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <Check className="w-4 h-4 mr-1" />
        )}
        {t('actions.approve')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleReject()}
        disabled={isProcessing}
        className="text-red-600 border-red-300 hover:bg-red-50"
        data-testid="approval-reject-btn"
      >
        {isProcessing && action === 'reject' ? (
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <X className="w-4 h-4 mr-1" />
        )}
        {t('actions.reject')}
      </Button>
    </div>
  );
};