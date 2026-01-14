'use client'

import React from 'react'
import { useFormContext } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Bell, AlertCircle, CheckCircle2 } from 'lucide-react'
import { type FormData } from '../_schemas/form-schema'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export function GenerationModeSection() {
  const { watch, setValue } = useFormContext<FormData>()

  const generationMode = watch('generationMode')
  const isAutomatic = generationMode === 'automatic'

  const notifyOnCompletion = watch('notifyOnCompletion')
  const notifyOnError = watch('notifyOnError')
  const notifyOnStageComplete = watch('notifyOnStageComplete')

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl xl:col-span-2 dark:border-white/10 dark:from-black/70 dark:to-black/60"
    >
      <div className="p-6 md:p-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Zap className="h-6 w-6 text-yellow-500 dark:text-yellow-400" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">Режим генерации</h3>
        </div>

        {/* Mode Toggle */}
        <div className="mb-6 flex items-center justify-between rounded-xl bg-slate-100/50 p-4 dark:bg-white/5">
          <div className="flex-1">
            <Label
              htmlFor="generation-mode"
              className="text-base font-medium text-slate-900 dark:text-white"
            >
              Автоматический режим
            </Label>
            <p className="mt-1 text-sm text-slate-500 dark:text-white/50">
              {isAutomatic
                ? 'Курс создается без вашего участия. Вы получите уведомление по готовности.'
                : 'Вы подтверждаете каждый этап генерации вручную.'}
            </p>
          </div>
          <Switch
            id="generation-mode"
            checked={isAutomatic}
            onCheckedChange={(checked) =>
              setValue('generationMode', checked ? 'automatic' : 'semi_automatic')
            }
          />
        </div>

        {/* Notification Options (visible when automatic) */}
        <AnimatePresence>
          {isAutomatic && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-yellow-200 bg-yellow-50/50 p-4 dark:border-yellow-900/50 dark:bg-yellow-950/20">
                <div className="mb-4 flex items-center gap-2">
                  <Bell className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  <span className="font-medium text-slate-900 dark:text-white">Уведомления</span>
                </div>

                <div className="space-y-3">
                  {/* Notify on completion */}
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="notify-completion"
                      checked={notifyOnCompletion}
                      onCheckedChange={(checked) =>
                        setValue('notifyOnCompletion', checked as boolean)
                      }
                    />
                    <Label
                      htmlFor="notify-completion"
                      className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-white/70"
                    >
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      При завершении генерации
                    </Label>
                  </div>

                  {/* Notify on error */}
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="notify-error"
                      checked={notifyOnError}
                      onCheckedChange={(checked) => setValue('notifyOnError', checked as boolean)}
                    />
                    <Label
                      htmlFor="notify-error"
                      className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-white/70"
                    >
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      При ошибках
                    </Label>
                  </div>

                  {/* Notify on stage complete */}
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="notify-stage"
                      checked={notifyOnStageComplete}
                      onCheckedChange={(checked) =>
                        setValue('notifyOnStageComplete', checked as boolean)
                      }
                    />
                    <Label
                      htmlFor="notify-stage"
                      className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-white/70"
                    >
                      <Zap className="h-4 w-4 text-yellow-500" />
                      По этапам (промежуточные)
                    </Label>
                  </div>
                </div>

                <p className="mt-4 text-xs text-slate-500 dark:text-white/40">
                  Уведомления будут отправлены через Push, Email и Telegram (если подключен)
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
