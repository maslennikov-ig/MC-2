import React, { useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings2,
  ChevronDown,
  Users,
  Target,
  Zap,
  Bell,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { type FormData } from '../_schemas/form-schema'
import { CourseSizeSelector } from './CourseSizeSelector'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export function AdvancedSettingsSection() {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<FormData>()
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)

  // Generation mode state
  const generationMode = watch('generationMode')
  const isAutomatic = generationMode === 'automatic'
  const notifyOnCompletion = watch('notifyOnCompletion')
  const notifyOnError = watch('notifyOnError')
  const notifyOnStageComplete = watch('notifyOnStageComplete')

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl xl:col-span-2 dark:border-white/10 dark:from-black/70 dark:to-black/60"
    >
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
        className={`flex w-full items-center justify-between p-6 transition-all hover:bg-slate-50/50 dark:hover:bg-white/5 ${
          showAdvancedSettings ? 'border-b border-slate-200 dark:border-white/10' : ''
        }`}
        aria-expanded={showAdvancedSettings}
        aria-controls="advanced-settings-content"
      >
        <div className="flex items-center gap-3">
          <Settings2 className="h-6 w-6 text-purple-500 dark:text-purple-400" />
          <span className="text-xl font-bold text-slate-900 dark:text-white">
            Дополнительные настройки
          </span>
          <span className="text-sm font-normal text-slate-500 dark:text-white/50">
            (необязательно)
          </span>
        </div>
        <motion.div
          animate={{ rotate: showAdvancedSettings ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="h-5 w-5 text-slate-500 dark:text-white/60" />
        </motion.div>
      </button>

      {/* Collapsible Content */}
      <motion.div
        id="advanced-settings-content"
        initial={false}
        animate={{
          height: showAdvancedSettings ? 'auto' : 0,
          opacity: showAdvancedSettings ? 1 : 0,
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="overflow-hidden"
      >
        <div className="p-6 pt-4 md:p-8 md:pt-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left column - Course Size */}
            <div>
              <CourseSizeSelector />
            </div>

            {/* Right column - Other settings */}
            <div className="space-y-6">
              {/* Целевая аудитория */}
              <div>
                <label className="mb-2 block font-medium text-slate-700 dark:text-white/90">
                  <Users className="mr-2 inline h-4 w-4" />
                  Целевая аудитория
                </label>
                <input
                  {...register('targetAudience')}
                  type="text"
                  className={`w-full rounded-xl border bg-slate-100 px-4 py-3 text-slate-900 placeholder-slate-400 backdrop-blur-sm transition-all focus:bg-slate-50 focus:outline-none dark:bg-black/30 dark:text-white dark:placeholder-white/40 dark:focus:bg-black/40 ${
                    errors.targetAudience
                      ? 'animate-pulse border-red-500'
                      : 'border-slate-300 focus:border-purple-500 dark:border-white/20 dark:focus:border-purple-400'
                  }`}
                  placeholder="Разработчики, менеджеры, студенты..."
                />
                {errors.targetAudience && (
                  <p className="mt-2 text-sm text-red-500 dark:text-red-400">
                    {errors.targetAudience.message}
                  </p>
                )}
              </div>

              {/* Результаты обучения */}
              <div>
                <label className="mb-2 block font-medium text-slate-700 dark:text-white/90">
                  <Target className="mr-2 inline h-4 w-4" />
                  Результаты обучения
                </label>
                <textarea
                  {...register('learningOutcomes')}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-slate-900 placeholder-slate-400 transition-all focus:border-purple-500 focus:bg-slate-50 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white dark:placeholder-white/40 dark:focus:border-purple-400 dark:focus:bg-white/15"
                  placeholder="После прохождения курса студенты смогут..."
                />
              </div>

              {/* Separator before Generation Mode */}
              <div className="border-t border-slate-200 dark:border-white/10" />

              {/* Generation Mode Section */}
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <Zap className="h-5 w-5 text-purple-500 dark:text-purple-400" />
                  <span className="font-medium text-slate-900 dark:text-white">
                    Режим генерации
                  </span>
                </div>

                {/* Mode Toggle */}
                <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-100/50 p-4 dark:bg-white/5">
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
                      <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-900/50 dark:bg-purple-950/20">
                        <div className="mb-4 flex items-center gap-2">
                          <Bell className="h-5 w-5 text-purple-500 dark:text-purple-400" />
                          <span className="font-medium text-slate-900 dark:text-white">
                            Уведомления
                          </span>
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
                              onCheckedChange={(checked) =>
                                setValue('notifyOnError', checked as boolean)
                              }
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
                              <Zap className="h-4 w-4 text-purple-500" />
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
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
