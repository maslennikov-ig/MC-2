'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { X, Download, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useInstallPrompt } from '@/lib/hooks/use-install-prompt'
import { cn } from '@/lib/utils'

// Animation timing constants
const INSTALL_PROMPT_DELAY_MS = 2000
const INSTALL_PROMPT_ANIMATION_MS = 300

/**
 * PWA Install Prompt Component
 *
 * Shows a subtle banner when the app can be installed.
 * Features:
 * - Only shows when beforeinstallprompt is captured
 * - Doesn't show on iOS Safari (different install flow)
 * - Respects user dismissal for 7 days
 * - Responsive design for mobile and desktop
 * - Smooth enter/exit animations
 */
export function InstallPrompt() {
  const t = useTranslations('common.pwa')
  const { canInstall, promptInstall, dismissPrompt } = useInstallPrompt()
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  // Delay showing the prompt slightly to avoid jarring UX on page load
  useEffect(() => {
    if (canInstall) {
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, INSTALL_PROMPT_DELAY_MS)

      return () => clearTimeout(timer)
    }

    setIsVisible(false)
    return undefined
  }, [canInstall])

  const handleClose = useCallback(() => {
    setIsExiting(true)
    // Wait for animation to complete before hiding
    const timer = setTimeout(() => {
      setIsVisible(false)
      setIsExiting(false)
    }, INSTALL_PROMPT_ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [])

  const handleInstall = useCallback(async () => {
    const accepted = await promptInstall()
    if (accepted) {
      handleClose()
    }
  }, [promptInstall, handleClose])

  const handleDismiss = useCallback(() => {
    dismissPrompt()
    handleClose()
  }, [dismissPrompt, handleClose])

  if (!isVisible) {
    return null
  }

  return (
    <>
      {/* Screen reader announcement */}
      <div className="sr-only" role="status" aria-live="polite">
        {!isExiting && 'Install app prompt is now available'}
      </div>

      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="pwa-install-title"
        aria-describedby="pwa-install-description"
        className={cn(
          // Base styles
          'fixed z-50 mx-4 p-4',
          // Positioning - bottom on mobile, bottom-right on desktop
          'right-0 bottom-4 left-0 md:right-4 md:left-auto md:max-w-sm',
          // Card styles
          'rounded-xl border border-gray-200 dark:border-gray-700',
          'bg-white dark:bg-gray-900',
          'shadow-lg shadow-gray-200/50 dark:shadow-gray-900/50',
          // Animation
          'transition-all duration-300 ease-out',
          isExiting ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'
        )}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          aria-label={t('close')}
          className={cn(
            'absolute top-3 right-3',
            'rounded-full p-1.5',
            'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
            'hover:bg-gray-100 dark:hover:bg-gray-800',
            'transition-colors duration-200',
            'focus:ring-primary/50 focus:ring-2 focus:outline-none'
          )}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3 pr-6">
          {/* Icon */}
          <div
            className={cn(
              'flex-shrink-0 rounded-xl p-2.5',
              'from-primary/10 to-primary/5 bg-gradient-to-br',
              'dark:from-primary/20 dark:to-primary/10'
            )}
          >
            <Smartphone className="text-primary h-5 w-5" />
          </div>

          {/* Text */}
          <div className="min-w-0 flex-1">
            <h3
              id="pwa-install-title"
              className="text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              {t('title')}
            </h3>
            <p
              id="pwa-install-description"
              className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400"
            >
              {t('description')}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2 pl-12">
          <Button onClick={handleDismiss} variant="ghost" size="sm" className="h-8 px-3 text-xs">
            {t('later')}
          </Button>
          <Button onClick={handleInstall} size="sm" className="h-8 gap-1.5 px-3 text-xs">
            <Download className="h-3.5 w-3.5" />
            {t('install')}
          </Button>
        </div>
      </div>
    </>
  )
}
