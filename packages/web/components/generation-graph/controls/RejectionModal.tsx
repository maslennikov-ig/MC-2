import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTranslations } from 'next-intl'

interface RejectionModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (feedback: string) => void
}

export const RejectionModal = ({ isOpen, onClose, onConfirm }: RejectionModalProps) => {
  const t = useTranslations('generation')
  const [feedback, setFeedback] = useState('')

  const handleConfirm = () => {
    onConfirm(feedback)
    setFeedback('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('actions.reject')}</DialogTitle>
          <DialogDescription>Please provide feedback for regeneration.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Enter feedback..."
          className="min-h-[100px]"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            {t('actions.reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
