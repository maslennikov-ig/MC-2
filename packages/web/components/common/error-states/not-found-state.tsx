'use client'

import React from 'react'
import { Link, useRouter } from '@/src/i18n/navigation'
import { useTranslations } from 'next-intl'
import { FileQuestion, Home, ArrowLeft } from 'lucide-react'
import { ErrorStateBase } from './error-state-base'
import { cn } from '@/lib/utils'

export interface NotFoundStateProps {
  variant?: 'fullpage' | 'card'
  title?: string
  message?: string
  showBackButton?: boolean
  homeUrl?: string
}

export function NotFoundState({
  variant = 'fullpage',
  title,
  message,
  showBackButton = true,
  homeUrl = '/',
}: NotFoundStateProps) {
  const router = useRouter()
  const t = useTranslations('common.errors.notFound')

  const actions = (
    <>
      <Link
        href={homeUrl}
        aria-label={t('goHome')}
        className={cn(
          'inline-flex items-center gap-2 px-6 py-3',
          'bg-gradient-to-r from-violet-600 to-purple-600',
          'hover:from-violet-700 hover:to-purple-700',
          'rounded-xl font-semibold text-white',
          'shadow-lg transition-all hover:shadow-xl',
          'focus:ring-primary focus:ring-2 focus:ring-offset-2 focus:outline-none'
        )}
      >
        <Home className="h-5 w-5" />
        {t('goHome')}
      </Link>
      {showBackButton && (
        <button
          onClick={() => router.back()}
          aria-label={t('goBack')}
          className={cn(
            'inline-flex items-center gap-2 px-6 py-3',
            'bg-muted hover:bg-muted/80 text-foreground rounded-xl',
            'border-border border transition-all',
            'focus:ring-primary focus:ring-2 focus:ring-offset-2 focus:outline-none'
          )}
        >
          <ArrowLeft className="h-5 w-5" />
          {t('goBack')}
        </button>
      )}
    </>
  )

  return (
    <ErrorStateBase
      icon={FileQuestion}
      iconColor="text-blue-400"
      iconBg="bg-gradient-to-br from-blue-500/20 to-indigo-500/20"
      title={title ?? t('title')}
      message={message ?? t('message')}
      actions={actions}
      variant={variant}
    />
  )
}
