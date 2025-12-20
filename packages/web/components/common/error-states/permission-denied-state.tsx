'use client'

import React from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useTranslations } from 'next-intl'
import { ShieldAlert, BookOpen, Mail } from 'lucide-react'
import { ErrorStateBase } from './error-state-base'
import { cn } from '@/lib/utils'

export interface PermissionDeniedStateProps {
  variant?: 'fullpage' | 'card'
  title?: string
  message?: string
  userRole?: string
  requiredRoles?: string[]
  returnUrl?: string
  contactUrl?: string
  hint?: string
}

export function PermissionDeniedState({
  variant = 'fullpage',
  title,
  message,
  userRole,
  requiredRoles,
  returnUrl = '/courses',
  contactUrl = '/profile',
  hint,
}: PermissionDeniedStateProps) {
  const t = useTranslations('common.errors.forbidden')

  const getRoleLabel = (role: string): string => {
    const roleKey = `roles.${role}` as any
    try {
      return t(roleKey)
    } catch {
      return role.charAt(0).toUpperCase() + role.slice(1)
    }
  }

  const roleLabel = userRole ? getRoleLabel(userRole) : t('roles.unknown')

  const roleDisplay = userRole && (
    <div className="mb-6">
      <p className="text-muted-foreground text-lg">
        {t('yourRole')}{' '}
        <span className="font-semibold text-orange-400">{roleLabel}</span>
      </p>
      {requiredRoles && requiredRoles.length > 0 && (
        <p className="text-muted-foreground/70 text-sm mt-2">
          {t('requiredRoles')} {requiredRoles.map(r => getRoleLabel(r)).join(', ')}
        </p>
      )}
    </div>
  )

  const actions = (
    <>
      <Link
        href={returnUrl as Route}
        aria-label={t('returnToCourses')}
        className={cn(
          'inline-flex items-center gap-2 px-6 py-3',
          'bg-muted hover:bg-muted/80 text-foreground rounded-xl',
          'border border-border transition-all',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
        )}
      >
        <BookOpen className="w-5 h-5" />
        {t('returnToCourses')}
      </Link>
      <Link
        href={contactUrl as Route}
        aria-label={t('contactAdmin')}
        className={cn(
          'inline-flex items-center gap-2 px-6 py-3',
          'bg-gradient-to-r from-orange-600 to-red-600',
          'hover:from-orange-700 hover:to-red-700',
          'text-white font-semibold rounded-xl',
          'transition-all shadow-lg hover:shadow-xl',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
        )}
      >
        <Mail className="w-5 h-5" />
        {t('contactAdmin')}
      </Link>
    </>
  )

  return (
    <ErrorStateBase
      icon={ShieldAlert}
      iconColor="text-orange-400"
      iconBg="bg-gradient-to-br from-orange-500/20 to-red-500/20"
      title={title ?? t('title')}
      message={message ?? t('message')}
      hint={hint ?? t('hint')}
      actions={actions}
      variant={variant}
    >
      {roleDisplay}
    </ErrorStateBase>
  )
}
