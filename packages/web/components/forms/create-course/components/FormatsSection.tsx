import React from 'react'
import { useFormContext } from 'react-hook-form'
import { motion } from 'framer-motion'
import { FolderOpen, AlertCircle } from 'lucide-react'
import { generationFormats } from '../_data/constants'
import { type FormData } from '../_schemas/form-schema'

interface FormatsSectionProps {
  mounted: boolean
  toggleFormat: (format: string, available: boolean, required?: boolean) => void
  formats: string[]
}

export function FormatsSection({ mounted, toggleFormat, formats }: FormatsSectionProps) {
  const {
    formState: { errors },
  } = useFormContext<FormData>()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="rounded-2xl border border-slate-200 bg-white/90 p-4 backdrop-blur-xl sm:p-6 md:p-8 xl:col-span-1 dark:border-white/10 dark:bg-black/70"
    >
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900 sm:mb-6 sm:gap-3 sm:text-2xl dark:text-white">
        <FolderOpen className="h-5 w-5 text-purple-500 sm:h-6 sm:w-6 dark:text-purple-400" />
        Форматы генерации
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4">
        {generationFormats.map((format) => {
          const isSelected = mounted && formats.includes(format.value)
          const isAvailable = format.available
          const isRequired = format.required
          const isClickable = isAvailable && !isRequired
          return (
            <motion.div
              key={format.value}
              whileHover={isClickable ? { scale: 1.02 } : {}}
              whileTap={isClickable ? { scale: 0.98 } : {}}
              onClick={() => toggleFormat(format.value, format.available, format.required)}
              className={`relative rounded-xl border-2 p-4 transition-all ${
                !isAvailable
                  ? 'cursor-not-allowed opacity-60 grayscale-[30%]'
                  : isRequired
                    ? 'cursor-default'
                    : 'cursor-pointer'
              } ${
                isSelected && isAvailable
                  ? 'border-purple-500 bg-gradient-to-br from-purple-500/20 to-pink-500/20 dark:border-purple-400'
                  : isAvailable
                    ? 'border-slate-200 bg-slate-50 hover:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/30'
                    : 'border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5'
              }`}
            >
              {isRequired && (
                <span className="absolute top-2 right-2 rounded-full border border-green-500/30 bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                  Всегда
                </span>
              )}
              {!isAvailable && (
                <span className="absolute top-2 right-2 rounded-full border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  Скоро
                </span>
              )}
              <div className="flex items-center gap-3">
                <format.icon
                  className={`h-6 w-6 ${isAvailable ? 'text-purple-500 dark:text-purple-400' : 'text-slate-400 dark:text-white/40'}`}
                />
                <div>
                  <h3
                    className={`font-semibold ${isAvailable ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-white/60'}`}
                  >
                    {format.title}
                  </h3>
                  <p
                    className={`text-sm ${isAvailable ? 'text-slate-500 dark:text-white/60' : 'text-slate-400 dark:text-white/40'}`}
                  >
                    {format.description}
                  </p>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
      {errors.formats && (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex items-center gap-1 text-sm text-red-400"
        >
          <AlertCircle className="h-4 w-4" />
          {errors.formats.message}
        </motion.p>
      )}
    </motion.div>
  )
}
