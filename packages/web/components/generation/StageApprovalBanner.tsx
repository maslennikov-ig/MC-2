'use client'

import { useState } from 'react'
import { approveStage, cancelGeneration } from '@/app/actions/admin-generation'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, ArrowRight } from 'lucide-react'

interface StageApprovalBannerProps {
  courseId: string
  currentStage: number // e.g. 2 for stage_2_awaiting_approval
  onApproved?: () => void
  onCancelled?: () => void
}

export default function StageApprovalBanner({
  courseId,
  currentStage,
  onApproved,
  onCancelled,
}: StageApprovalBannerProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  const handleApprove = async () => {
    setIsProcessing(true)
    try {
      await approveStage(courseId, currentStage)
      if (onApproved) onApproved()
    } catch (error) {
      console.error('Failed to approve stage:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel the generation?')) return

    setIsProcessing(true)
    try {
      await cancelGeneration(courseId)
      if (onCancelled) onCancelled()
    } catch (error) {
      console.error('Failed to cancel generation:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const getStageName = (stage: number) => {
    switch (stage) {
      case 2:
        return 'Document Processing'
      case 3:
        return 'Summarization'
      case 4:
        return 'Analysis'
      case 5:
        return 'Structure Generation'
      default:
        return `Stage ${stage}`
    }
  }

  return (
    <div className="bg-background/80 border-border fixed right-0 bottom-0 left-0 z-40 border-t p-4 shadow-lg backdrop-blur-sm">
      <div className="container mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-4">
          <div className="rounded-full bg-yellow-100 p-2 dark:bg-yellow-900/30">
            <CheckCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">{getStageName(currentStage)} Complete</h3>
            <p className="text-muted-foreground text-sm">
              Review results and approve to continue to next stage.
            </p>
          </div>
        </div>

        <div className="flex w-full items-center gap-3 sm:w-auto">
          <Button
            variant="outline"
            className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            onClick={handleCancel}
            disabled={isProcessing}
          >
            <XCircle className="mr-2 h-4 w-4" />
            Cancel
          </Button>

          <Button
            onClick={handleApprove}
            disabled={isProcessing}
            className="min-w-[200px] bg-green-600 text-white hover:bg-green-700"
          >
            {isProcessing ? (
              'Processing...'
            ) : (
              <>
                Continue to Next Stage
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
