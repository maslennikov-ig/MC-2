'use client'

import { useCallback } from 'react'
import { Bell, BellOff, AlertCircle, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { usePushNotifications } from '@/lib/hooks/use-push-notifications'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface PushNotificationToggleProps {
  /** Additional className for the container */
  className?: string
  /** Show detailed status messages */
  showDetails?: boolean
}

/**
 * Toggle component for enabling/disabling push notifications
 *
 * Features:
 * - Shows current subscription state
 * - Handles permission request
 * - Shows appropriate UI for unsupported browsers
 * - Shows loading and error states
 *
 * @example
 * ```tsx
 * <PushNotificationToggle />
 * ```
 */
export function PushNotificationToggle({
  className,
  showDetails = false,
}: PushNotificationToggleProps) {
  const t = useTranslations('common.pwa.notifications')
  const { isSupported, permission, isSubscribed, isLoading, error, subscribe, unsubscribe } =
    usePushNotifications()

  // Handle toggle change - memoized to prevent unnecessary re-renders
  const handleToggle = useCallback(
    async (checked: boolean) => {
      if (checked) {
        await subscribe()
      } else {
        await unsubscribe()
      }
    },
    [subscribe, unsubscribe]
  )

  // Browser doesn't support push notifications
  if (!isSupported) {
    return (
      <div className={cn('text-muted-foreground flex items-center gap-3', className)}>
        <BellOff className="h-5 w-5" />
        <span className="text-sm">{t('title')}</span>
      </div>
    )
  }

  // Permission is denied - show instructions
  if (permission === 'denied') {
    return (
      <div className={cn('flex items-start gap-3', className)}>
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t('permissionDenied')}</span>
          {showDetails && <span className="text-muted-foreground text-xs">{t('description')}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isSubscribed ? (
            <Bell className="text-primary h-5 w-5" />
          ) : (
            <BellOff className="text-muted-foreground h-5 w-5" />
          )}
          <Label htmlFor="push-toggle" className="cursor-pointer text-sm font-medium">
            {t('title')}
          </Label>
        </div>

        <div className="flex items-center gap-2">
          {isLoading && <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />}
          <Switch
            id="push-toggle"
            checked={isSubscribed}
            onCheckedChange={handleToggle}
            disabled={isLoading}
            aria-label={t('title')}
          />
        </div>
      </div>

      {showDetails && (
        <p className="text-muted-foreground text-xs">
          {isSubscribed ? t('subscribed') : t('description')}
        </p>
      )}

      {error && (
        <div className="text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}
    </div>
  )
}
