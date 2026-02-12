import React, { useState, useMemo } from 'react'
import { useFormContext } from 'react-hook-form'
import { motion } from 'framer-motion'
import { PenTool, ChevronDown } from 'lucide-react'
import { type FormData } from '../_schemas/form-schema'
// We accept any array of styles that matches the shape we need
interface StyleOption {
  value: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}

interface StyleSectionProps {
  mounted: boolean
  reorderedStyles: StyleOption[]
}

export function StyleSection({ mounted, reorderedStyles }: StyleSectionProps) {
  const { register, watch } = useFormContext<FormData>()
  const [showAllStyles, setShowAllStyles] = useState(false)
  const writingStyle = watch('writingStyle')

  const displayedStyles = useMemo(() => {
    return showAllStyles ? reorderedStyles : reorderedStyles.slice(0, 4)
  }, [showAllStyles, reorderedStyles])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="rounded-2xl border border-slate-200 bg-white/90 p-4 backdrop-blur-xl sm:p-6 md:p-8 xl:col-span-1 dark:border-white/10 dark:bg-black/70"
    >
      <h2
        id="writing-style-heading"
        className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900 sm:mb-6 sm:gap-3 sm:text-2xl dark:text-white"
      >
        <PenTool
          className="h-5 w-5 text-purple-500 sm:h-6 sm:w-6 dark:text-purple-400"
          aria-hidden="true"
        />
        Стиль изложения
      </h2>

      <fieldset>
        <legend className="sr-only">Выберите стиль изложения курса</legend>
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4"
          role="radiogroup"
          aria-labelledby="writing-style-heading"
        >
          {displayedStyles.map((style) => {
            const isSelected = mounted && writingStyle === style.value
            return (
              <label
                key={style.value}
                className={`relative cursor-pointer transition-all ${
                  isSelected ? 'scale-105' : ''
                }`}
              >
                <input
                  type="radio"
                  {...register('writingStyle')}
                  value={style.value}
                  className="sr-only"
                  aria-describedby={`style-${style.value}-desc`}
                />
                <div
                  className={`flex h-full flex-col rounded-xl border-2 p-3 transition-all sm:p-4 ${
                    isSelected
                      ? 'border-purple-500 bg-gradient-to-br from-purple-500/30 to-pink-500/30 backdrop-blur-md dark:border-purple-400'
                      : 'border-slate-200 bg-slate-50 backdrop-blur-sm hover:border-slate-400 dark:border-white/10 dark:bg-black/20 dark:hover:border-white/30'
                  }`}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <style.icon
                        className="h-6 w-6 text-purple-500 sm:h-7 sm:w-7 md:h-8 md:w-8 dark:text-purple-400"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="mb-1 text-sm font-bold text-slate-900 sm:text-base dark:text-white">
                        {style.title}
                      </h3>
                      <p
                        id={`style-${style.value}-desc`}
                        className="line-clamp-2 text-xs text-slate-600 sm:line-clamp-none sm:text-sm dark:text-white/70"
                      >
                        {style.description}
                      </p>
                    </div>
                  </div>
                </div>
              </label>
            )
          })}
        </div>

        {/* Show More Styles Button */}
        {!showAllStyles && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6 text-center"
          >
            <button
              type="button"
              onClick={() => setShowAllStyles(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-6 py-3 text-slate-700 transition-all hover:border-purple-500/50 hover:bg-slate-200 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:border-purple-400/50 dark:hover:bg-white/20"
            >
              <ChevronDown className="h-5 w-5" />
              <span className="text-sm font-medium sm:text-base">Ещё стили (+15)</span>
            </button>
          </motion.div>
        )}

        {/* Hide Styles Button */}
        {showAllStyles && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6 text-center"
          >
            <button
              type="button"
              onClick={() => setShowAllStyles(false)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-6 py-3 text-slate-700 transition-all hover:border-purple-500/50 hover:bg-slate-200 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:border-purple-400/50 dark:hover:bg-white/20"
            >
              <ChevronDown className="h-5 w-5 rotate-180" />
              <span className="text-sm font-medium sm:text-base">Скрыть стили</span>
            </button>
          </motion.div>
        )}
      </fieldset>
    </motion.div>
  )
}
