'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Home, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { ErrorStateBase } from './error-state-base'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'

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

  useEffect(() => {
    if (error) {
      logger.error('Error state rendered', {
        message: error.message,
        digest: error.digest,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
            'text-white font-semibold rounded-xl',
            'transition-all shadow-lg hover:shadow-xl',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
          )}
        >
          <RefreshCw className="w-5 h-5" />
          {t('tryAgain')}
        </button>
      )}
      {showHomeButton && (
        <Link
          href="/"
          aria-label={useTranslations('common.errors.notFound')('goHome')}
          className={cn(
            'inline-flex items-center gap-2 px-6 py-3',
            'bg-muted hover:bg-muted/80 text-foreground rounded-xl',
            'border border-border transition-all',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
          )}
        >
          <Home className="w-5 h-5" />
          {useTranslations('common.errors.notFound')('goHome')}
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
          'flex items-center gap-2 text-muted-foreground hover:text-foreground',
          'text-sm font-medium transition-colors'
        )}
      >
        {detailsOpen ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
        {t('errorDetails')}
      </button>
      {detailsOpen && (
        <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-border">
          <pre className="text-xs text-muted-foreground overflow-auto max-h-64 whitespace-pre-wrap break-words">
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
