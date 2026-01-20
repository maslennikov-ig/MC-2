'use client'

import React, { useState, useEffect } from 'react'
import { Link } from '@/src/i18n/navigation'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Home, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { ErrorStateBase } from './error-state-base'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/client-logger'

export interface ErrorStateProps {
  error?: Error & { digest?: string }
  reset?: () => void
  variant?: 'fullpage' | 'card'
  title?: string
  message?: string
  showHomeButton?: boolean
  showDetails?: boolean
}

export function ErrorState({
  error,
  reset,
  variant = 'fullpage',
  title,
  message,
  showHomeButton = true,
  showDetails = process.env.NODE_ENV === 'development',
}: ErrorStateProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const t = useTranslations('common.errors.generic')
  const tNotFound = useTranslations('common.errors.notFound')

  useEffect(() => {
    if (error) {
      logger.error('Error state rendered', {
        message: error.message,
        digest: error.digest,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      })
    }
  }, [error])

  const actions = (
    <>
      {reset && (
        <button
          onClick={reset}
          aria-label={t('tryAgain')}
          className={cn(
            'inline-flex items-center gap-2 px-6 py-3',
            'bg-gradient-to-r from-violet-600 to-purple-600',
            'hover:from-violet-700 hover:to-purple-700',
            'rounded-xl font-semibold text-white',
            'shadow-lg transition-all hover:shadow-xl',
            'focus:ring-primary focus:ring-2 focus:ring-offset-2 focus:outline-none'
          )}
        >
          <RefreshCw className="h-5 w-5" />
          {t('tryAgain')}
        </button>
      )}
      {showHomeButton && (
        <Link
          href="/"
          aria-label={tNotFound('goHome')}
          className={cn(
            'inline-flex items-center gap-2 px-6 py-3',
            'bg-muted hover:bg-muted/80 text-foreground rounded-xl',
            'border-border border transition-all',
            'focus:ring-primary focus:ring-2 focus:ring-offset-2 focus:outline-none'
          )}
        >
          <Home className="h-5 w-5" />
          {tNotFound('goHome')}
        </Link>
      )}
    </>
  )

  const errorDetails = error && showDetails && (
    <div className="mt-6 text-left">
      <button
        onClick={() => setDetailsOpen(!detailsOpen)}
        aria-label={detailsOpen ? 'Hide error details' : 'Show error details'}
        className={cn(
          'text-muted-foreground hover:text-foreground flex items-center gap-2',
          'text-sm font-medium transition-colors'
        )}
      >
        {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {t('errorDetails')}
      </button>
      {detailsOpen && (
        <div className="bg-muted/50 border-border mt-4 rounded-lg border p-4">
          <pre className="text-muted-foreground max-h-64 overflow-auto text-xs break-words whitespace-pre-wrap">
            {error.toString()}
            {error.stack && `\n\n${error.stack}`}
            {error.digest && `\n\nDigest: ${error.digest}`}
          </pre>
        </div>
      )}
    </div>
  )

  return (
    <ErrorStateBase
      icon={AlertTriangle}
      iconColor="text-orange-400"
      iconBg="bg-gradient-to-br from-red-500/20 to-orange-500/20"
      title={title ?? t('title')}
      message={message ?? t('message')}
      actions={actions}
      variant={variant}
    >
      {errorDetails}
    </ErrorStateBase>
  )
}
