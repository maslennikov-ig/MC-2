'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { Card } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'

interface ProfileErrorBoundaryProps {
  error: string
  onRetry: () => void
}

export function ProfileErrorBoundary({ error, onRetry }: ProfileErrorBoundaryProps) {
  const t = useTranslations('profile')

  return (
    <Card className="mx-auto max-w-md p-8 text-center">
      <AlertTriangle className="text-destructive mx-auto mb-4 h-12 w-12" />
      <h2 className="mb-2 text-lg font-semibold">{t('errors.occurred')}</h2>
      <p className="text-muted-foreground mb-4">{error}</p>
      <button
        onClick={onRetry}
        className="btn-primary transform rounded-md px-4 py-2 transition-all duration-300 hover:scale-105"
      >
        {t('errors.tryAgain')}
      </button>
    </Card>
  )
}
