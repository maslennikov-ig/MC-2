'use client'

import { useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Send, Loader2, CheckCircle, XCircle } from 'lucide-react'

// Telegram auth data returned from widget
export interface TelegramAuthData {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

// Extend Window interface for Telegram callback
declare global {
  interface Window {
    TelegramLoginCallback?: (user: TelegramAuthData) => void
  }
}

interface TelegramLoginButtonProps {
  botUsername: string
  onAuth: (data: TelegramAuthData) => Promise<void>
  isConnected?: boolean
  connectedUsername?: string
  onDisconnect?: () => Promise<void>
  disabled?: boolean
  size?: 'small' | 'medium' | 'large'
}

export function TelegramLoginButton({
  botUsername,
  onAuth,
  isConnected = false,
  connectedUsername,
  onDisconnect,
  disabled = false,
  size = 'medium'
}: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scriptRef = useRef<HTMLScriptElement | null>(null)
  const isLoadingRef = useRef(false)

  // Callback handler
  const handleAuth = useCallback(async (user: TelegramAuthData) => {
    await onAuth(user)
  }, [onAuth])

  useEffect(() => {
    if (isConnected || disabled || isLoadingRef.current) return

    // Set up global callback
    window.TelegramLoginCallback = (user: TelegramAuthData) => {
      void handleAuth(user)
    }

    // Load Telegram widget script
    const loadWidget = () => {
      if (!containerRef.current || scriptRef.current) return

      isLoadingRef.current = true

      const script = document.createElement('script')
      script.src = 'https://telegram.org/js/telegram-widget.js?22'
      script.async = true
      script.setAttribute('data-telegram-login', botUsername)
      script.setAttribute('data-size', size)
      script.setAttribute('data-onauth', 'TelegramLoginCallback(user)')
      script.setAttribute('data-request-access', 'write')

      containerRef.current.appendChild(script)
      scriptRef.current = script

      script.onload = () => {
        isLoadingRef.current = false
      }
    }

    loadWidget()

    return () => {
      // Cleanup
      if (scriptRef.current && containerRef.current?.contains(scriptRef.current)) {
        containerRef.current.removeChild(scriptRef.current)
      }
      scriptRef.current = null
      isLoadingRef.current = false
      delete window.TelegramLoginCallback
    }
  }, [botUsername, size, isConnected, disabled, handleAuth])

  // If connected, show connected state
  if (isConnected) {
    return (
      <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
          <div>
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Telegram подключен
            </p>
            {connectedUsername && (
              <p className="text-xs text-green-600 dark:text-green-400">
                @{connectedUsername}
              </p>
            )}
          </div>
        </div>
        {onDisconnect && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void onDisconnect()}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <XCircle className="h-4 w-4 mr-1" />
            Отключить
          </Button>
        )}
      </div>
    )
  }

  // Show Telegram widget container
  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="flex justify-center min-h-[40px] items-center"
      >
        {/* Telegram script will inject button here */}
        {!scriptRef.current && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Загрузка...</span>
          </div>
        )}
      </div>
      <p className="text-xs text-center text-muted-foreground">
        Нажмите кнопку выше для авторизации через Telegram
      </p>
    </div>
  )
}

// Fallback button for when widget fails to load
export function TelegramLoginFallback({
  botUsername,
  disabled = false
}: {
  botUsername: string
  disabled?: boolean
}) {
  const handleClick = () => {
    // Open bot in Telegram with start parameter
    window.open(`https://t.me/${botUsername}?start=connect`, '_blank')
  }

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={disabled}
      className="w-full border-[#0088cc] text-[#0088cc] hover:bg-[#0088cc]/10"
    >
      <Send className="h-4 w-4 mr-2" />
      Подключить через Telegram
    </Button>
  )
}
