'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Zap, Pause, Play, X, Settings, PauseCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface AutomaticModeControlPanelProps {
  status: string
  isPaused: boolean
  onPause: () => Promise<void>
  onResume: () => Promise<void>
  onCancel: () => Promise<void>
  onSwitchToManual: () => Promise<void>
}

export function AutomaticModeControlPanel({
  status,
  isPaused,
  onPause,
  onResume,
  onCancel,
  onSwitchToManual,
}: AutomaticModeControlPanelProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const terminalStatuses = ['completed', 'failed', 'cancelled']
  const isRunning = !isPaused && !terminalStatuses.includes(status)
  const isTerminal = terminalStatuses.includes(status)

  const handleAction = async (action: string, fn: () => Promise<void>) => {
    setActionLoading(action)
    try {
      await fn()
    } finally {
      setActionLoading(null)
    }
  }

  // Don't show panel if generation is complete
  if (isTerminal) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20">
        <CardContent className="p-4">
          {/* Running State */}
          {isRunning && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  <span className="absolute -top-1 -right-1 h-2 w-2 animate-ping rounded-full bg-yellow-400" />
                </div>
                <div>
                  <span className="font-medium text-slate-900 dark:text-white">
                    Автоматическая генерация
                  </span>
                  <p className="text-sm text-slate-500 dark:text-white/50">
                    Можно закрыть страницу — уведомим по готовности
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleAction('pause', onPause)}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === 'pause' ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Pause className="mr-1 h-4 w-4" />
                  )}
                  Пауза
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleAction('cancel', onCancel)}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === 'cancel' ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <X className="mr-1 h-4 w-4" />
                  )}
                  Отменить
                </Button>
              </div>
            </div>
          )}

          {/* Paused State */}
          {isPaused && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <PauseCircle className="h-5 w-5 text-amber-500" />
                <span className="font-medium text-slate-900 dark:text-white">
                  Генерация приостановлена
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button
                  onClick={() => void handleAction('resume', onResume)}
                  disabled={actionLoading !== null}
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  {actionLoading === 'resume' ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-1 h-4 w-4" />
                  )}
                  Продолжить
                </Button>

                <Button
                  variant="outline"
                  onClick={() => void handleAction('manual', onSwitchToManual)}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === 'manual' ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Settings className="mr-1 h-4 w-4" />
                  )}
                  Ручной режим
                </Button>

                <Button
                  variant="destructive"
                  onClick={() => void handleAction('cancel', onCancel)}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === 'cancel' ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <X className="mr-1 h-4 w-4" />
                  )}
                  Отменить
                </Button>
              </div>

              <p className="text-muted-foreground text-sm">
                В ручном режиме вы сможете проверить и изменить результаты каждого этапа.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
