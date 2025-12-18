'use client';

import { useState } from 'react';
import { approveStage, cancelGeneration } from '@/app/actions/admin-generation';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, ArrowRight } from 'lucide-react';

interface StageApprovalBannerProps {
  courseId: string;
  currentStage: number; // e.g. 2 for stage_2_awaiting_approval
  onApproved?: () => void;
  onCancelled?: () => void;
}

export default function StageApprovalBanner({ courseId, currentStage, onApproved, onCancelled }: StageApprovalBannerProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      await approveStage(courseId, currentStage);
      if (onApproved) onApproved();
    } catch (error) {
      console.error('Failed to approve stage:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel the generation?')) return;

    setIsProcessing(true);
    try {
      await cancelGeneration(courseId);
      if (onCancelled) onCancelled();
    } catch (error) {
      console.error('Failed to cancel generation:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const getStageName = (stage: number) => {
    switch (stage) {
      case 2: return 'Document Processing';
      case 3: return 'Summarization';
      case 4: return 'Analysis';
      case 5: return 'Structure Generation';
      default: return `Stage ${stage}`;
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm border-t border-border z-40 shadow-lg">
      <div className="container mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
           <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded-full">
             <CheckCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
           </div>
           <div>
             <h3 className="font-semibold text-lg">
               {getStageName(currentStage)} Complete
             </h3>
             <p className="text-sm text-muted-foreground">
               Review results and approve to continue to next stage.
             </p>
           </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            variant="outline"
            className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            onClick={handleCancel}
            disabled={isProcessing}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Cancel
          </Button>

          <Button
            onClick={handleApprove}
            disabled={isProcessing}
            className="bg-green-600 hover:bg-green-700 text-white min-w-[200px]"
          >
            {isProcessing ? (
              'Processing...'
            ) : (
              <>
                Continue to Next Stage
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
