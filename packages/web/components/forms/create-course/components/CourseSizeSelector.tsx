import React from 'react'
import { useFormContext } from 'react-hook-form'
import { motion } from 'framer-motion'
import { Zap, BookOpen, Library, GraduationCap } from 'lucide-react'
import {
  COURSE_SIZES,
  COURSE_SIZE_PRESETS,
  getAllCourseSizeLabels,
  type CourseSize,
} from '@megacampus/shared-types'
import { type FormData } from '../_schemas/form-schema'

// Map course sizes to icons
const COURSE_SIZE_ICONS: Record<CourseSize, React.ComponentType<{ className?: string }>> = {
  mini: Zap,
  compact: BookOpen,
  standard: Library,
  comprehensive: GraduationCap,
}

export function CourseSizeSelector() {
  const { register, watch, setValue } = useFormContext<FormData>()
  const courseSize = watch('courseSize')
  const language = watch('language') || 'ru'

  // Get localized labels for current language
  const labels = getAllCourseSizeLabels(language)

  // Handle size selection - also set estimatedLessons and estimatedSections
  const handleSizeClick = (size: CourseSize) => {
    setValue('courseSize', size)
    const preset = COURSE_SIZE_PRESETS[size]
    setValue('estimatedLessons', preset.targetLessons)
    setValue('estimatedSections', preset.targetSections)
  }

  return (
    <div className="mb-6">
      <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Размер курса</h3>

      <fieldset>
        <legend className="sr-only">Выберите размер курса</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4">
          {COURSE_SIZES.map((size) => {
            const isSelected = courseSize === size
            const Icon = COURSE_SIZE_ICONS[size]
            const label = labels[size]

            return (
              <label
                key={size}
                className={`relative cursor-pointer transition-all ${
                  isSelected ? 'scale-105' : ''
                }`}
              >
                <input
                  type="radio"
                  {...register('courseSize')}
                  value={size}
                  className="sr-only"
                  aria-describedby={`size-${size}-desc`}
                  onClick={() => handleSizeClick(size)}
                />
                <motion.div
                  whileHover={{ scale: isSelected ? 1 : 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex h-full flex-col rounded-xl border-2 p-4 transition-all ${
                    isSelected
                      ? 'border-purple-500 bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-md dark:border-purple-400'
                      : 'border-slate-200 bg-slate-50 backdrop-blur-sm hover:border-slate-400 dark:border-white/10 dark:bg-black/20 dark:hover:border-white/30'
                  }`}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <Icon
                        className="h-7 w-7 text-purple-500 sm:h-8 sm:w-8 dark:text-purple-400"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="mb-1 text-base font-bold text-slate-900 sm:text-lg dark:text-white">
                        {label.title}
                      </h4>
                      <p className="mb-1 text-xs text-purple-600 sm:text-sm dark:text-purple-300">
                        {label.subtitle}
                      </p>
                      <p
                        id={`size-${size}-desc`}
                        className="text-xs text-slate-600 sm:text-sm dark:text-white/70"
                      >
                        {label.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* Advisory note */}
      <p className="mt-3 text-xs text-slate-500 dark:text-white/50">
        Это рекомендация - фактический размер может отличаться
      </p>
    </div>
  )
}
