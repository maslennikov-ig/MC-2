import React, { useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { motion } from 'framer-motion'
import { Settings2, ChevronDown, Users, Target } from 'lucide-react'
import { type FormData } from '../_schemas/form-schema'

export function AdvancedSettingsSection() {
  const {
    register,
    formState: { errors },
  } = useFormContext<FormData>()
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)

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
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
