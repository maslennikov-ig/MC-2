import React from 'react'
import { useFormContext } from 'react-hook-form'
import { motion } from 'framer-motion'
import { Sparkles, Target, Zap, BookOpen, Library, GraduationCap, Info } from 'lucide-react'
import {
  COURSE_SIZES,
  COURSE_SIZE_PRESETS,
  getAllCourseSizeLabels,
  getCourseSizeUILabels,
  type CourseSize,
} from '@megacampus/shared-types'
import { type FormData } from '../_schemas/form-schema'

// Map course sizes to icons
const COURSE_SIZE_ICONS: Record<CourseSize, React.ComponentType<{ className?: string }>> = {
  auto: Sparkles,
  micro: Target,
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
  const uiLabels = getCourseSizeUILabels(language)

  // Handle size selection - also set estimatedLessons and estimatedSections
  // For 'auto', we don't set these values - LLM decides
  const handleSizeClick = (size: CourseSize) => {
    setValue('courseSize', size)
    if (size !== 'auto') {
      const preset = COURSE_SIZE_PRESETS[size]
      setValue('estimatedLessons', preset.targetLessons)
      setValue('estimatedSections', preset.targetSections)
    }
  }

  // Separate 'auto' from preset sizes for different layout
  const autoSize = 'auto' as CourseSize
  const presetSizes = COURSE_SIZES.filter((s) => s !== 'auto')

  const renderSizeCard = (size: CourseSize, isAuto: boolean = false) => {
    const isSelected = courseSize === size
    const Icon = COURSE_SIZE_ICONS[size]
    const label = labels[size]

    // Auto uses cyan/teal gradient, presets use purple
    const selectedStyles = isAuto
      ? 'border-cyan-500 bg-gradient-to-br from-cyan-500/20 to-teal-500/20 backdrop-blur-md dark:border-cyan-400'
      : 'border-purple-500 bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-md dark:border-purple-400'

    const iconColor = isAuto
      ? 'text-cyan-500 dark:text-cyan-400'
      : 'text-purple-500 dark:text-purple-400'

    const subtitleColor = isAuto
      ? 'text-cyan-600 dark:text-cyan-300'
      : 'text-purple-600 dark:text-purple-300'

    return (
      <label
        key={size}
        className={`relative cursor-pointer transition-all ${isSelected ? 'scale-[1.02]' : ''}`}
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
              ? selectedStyles
              : 'border-slate-200 bg-slate-50 backdrop-blur-sm hover:border-slate-400 dark:border-white/10 dark:bg-black/20 dark:hover:border-white/30'
          }`}
          role="radio"
          aria-checked={isSelected}
          tabIndex={isSelected ? 0 : -1}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <Icon className={`h-7 w-7 sm:h-8 sm:w-8 ${iconColor}`} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="mb-1 text-base font-bold text-slate-900 sm:text-lg dark:text-white">
                {label.title}
              </h4>
              <p className={`mb-1 text-xs sm:text-sm ${subtitleColor}`}>{label.subtitle}</p>
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
  }

  return (
    <div className="mb-6">
      <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
        {uiLabels.sectionTitle}
      </h3>

      <fieldset>
        <legend className="sr-only">{uiLabels.legendText}</legend>

        {/* Auto option - full width at top */}
        <div className="mb-3">{renderSizeCard(autoSize, true)}</div>

        {/* Helper text when 'auto' is selected */}
        {courseSize === 'auto' && (
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-cyan-50 p-3 text-sm text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-300">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>{uiLabels.autoHelperText}</span>
          </div>
        )}

        {/* Preset sizes - 2x2 grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4">
          {presetSizes.map((size) => renderSizeCard(size, false))}
        </div>
      </fieldset>

      {/* Advisory note */}
      <p className="mt-3 text-xs text-slate-500 dark:text-white/50">{uiLabels.advisoryNote}</p>
    </div>
  )
}
