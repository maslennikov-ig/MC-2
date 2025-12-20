'use client'

import React from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
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
        href={homeUrl as Route}
        aria-label={t('goHome')}
        className={cn(
          'inline-flex items-center gap-2 px-6 py-3',
          'bg-gradient-to-r from-violet-600 to-purple-600',
          'hover:from-violet-700 hover:to-purple-700',
          'text-white font-semibold rounded-xl',
          'transition-all shadow-lg hover:shadow-xl',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
        )}
      >
        <Home className="w-5 h-5" />
        {t('goHome')}
      </Link>
      {showBackButton && (
        <button
          onClick={() => router.back()}
          aria-label={t('goBack')}
          className={cn(
            'inline-flex items-center gap-2 px-6 py-3',
            'bg-muted hover:bg-muted/80 text-foreground rounded-xl',
            'border border-border transition-all',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
          )}
        >
          <ArrowLeft className="w-5 h-5" />
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
