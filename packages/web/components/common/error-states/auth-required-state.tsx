'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { LogIn, UserPlus } from 'lucide-react'
import { ErrorStateBase } from './error-state-base'
import { cn } from '@/lib/utils'

export interface AuthRequiredStateProps {
  variant?: 'fullpage' | 'card'
  title?: string
  message?: string
  onSignIn?: () => void
  onRegister?: () => void
  showRegisterButton?: boolean
}

export function AuthRequiredState({
  variant = 'fullpage',
  title,
  message,
  onSignIn,
  onRegister,
  showRegisterButton = true,
}: AuthRequiredStateProps) {
  const t = useTranslations('common.errors.unauthorized')

  const actions = (
    <>
      {onSignIn && (
        <button
          onClick={onSignIn}
          aria-label={t('signIn')}
          className={cn(
            'inline-flex items-center gap-2 px-6 py-3',
            'bg-gradient-to-r from-violet-600 to-purple-600',
            'hover:from-violet-700 hover:to-purple-700',
            'rounded-xl font-semibold text-white',
            'shadow-lg transition-all hover:shadow-xl',
            'focus:ring-primary focus:ring-2 focus:ring-offset-2 focus:outline-none'
          )}
        >
          <LogIn className="h-5 w-5" />
          {t('signIn')}
        </button>
      )}
      {showRegisterButton && onRegister && (
        <button
          onClick={onRegister}
          aria-label={t('register')}
          className={cn(
            'inline-flex items-center gap-2 px-6 py-3',
            'bg-muted hover:bg-muted/80 text-foreground rounded-xl',
            'border-border border transition-all',
            'focus:ring-primary focus:ring-2 focus:ring-offset-2 focus:outline-none'
          )}
        >
          <UserPlus className="h-5 w-5" />
          {t('register')}
        </button>
      )}
    </>
  )

  return (
    <ErrorStateBase
      icon={LogIn}
      iconColor="text-blue-400"
      iconBg="bg-gradient-to-br from-blue-500/20 to-indigo-500/20"
      title={title ?? t('title')}
      message={message ?? t('message')}
      actions={actions}
      variant={variant}
    />
  )
}
