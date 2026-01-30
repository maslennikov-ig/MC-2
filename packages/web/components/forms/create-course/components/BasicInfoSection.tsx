import React from 'react'
import { useFormContext } from 'react-hook-form'
import { motion } from 'framer-motion'
import { BookOpen, Mail, Globe, AlertCircle } from 'lucide-react'
import { type FormData } from '../_schemas/form-schema'

interface BasicInfoSectionProps {
  onBlur: () => void
}

export function BasicInfoSection({ onBlur }: BasicInfoSectionProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<FormData>()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-slate-200 bg-white/90 p-4 backdrop-blur-xl sm:p-6 md:p-8 xl:col-span-1 dark:border-white/10 dark:bg-black/70"
    >
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900 sm:mb-6 sm:gap-3 sm:text-2xl dark:text-white">
        <BookOpen className="h-5 w-5 text-purple-500 sm:h-6 sm:w-6 dark:text-purple-400" />
        Основная информация
      </h2>

      <div className="space-y-6">
        {/* Topic Field */}
        <div>
          <label
            htmlFor="topic"
            className="mb-2 block font-medium text-slate-700 dark:text-white/90"
          >
            Тема курса <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input
            id="topic"
            {...register('topic')}
            type="text"
            className={`w-full rounded-xl border bg-slate-100 px-4 py-3 text-slate-900 placeholder-slate-400 backdrop-blur-sm transition-all focus:bg-slate-50 focus:outline-none dark:bg-black/30 dark:text-white dark:placeholder-white/40 dark:focus:bg-black/40 ${
              errors.topic
                ? 'animate-pulse border-red-500'
                : 'border-slate-300 focus:border-purple-500 dark:border-white/20 dark:focus:border-purple-400'
            }`}
            placeholder="Например: Основы машинного обучения"
            aria-describedby={errors.topic ? 'topic-error' : undefined}
            aria-invalid={errors.topic ? 'true' : 'false'}
            aria-required="true"
            onBlur={onBlur}
          />
          {errors.topic && (
            <motion.p
              id="topic-error"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 flex items-center gap-1 text-sm text-red-400"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {errors.topic.message}
            </motion.p>
          )}
        </div>

        {/* Email Field */}
        <div>
          <label
            htmlFor="email"
            className="mb-2 block font-medium text-slate-700 dark:text-white/90"
          >
            <Mail className="mr-2 inline h-4 w-4" aria-hidden="true" />
            Email для результатов <span className="text-red-500 dark:text-red-400">*</span>
            <span className="ml-2 text-sm text-slate-500 dark:text-white/50">
              (из вашего профиля)
            </span>
          </label>
          <input
            id="email"
            {...register('email')}
            type="email"
            readOnly
            disabled
            className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500 backdrop-blur-sm dark:border-white/10 dark:bg-black/20 dark:text-white/70"
            placeholder="your@email.com"
            aria-describedby="email-info"
            aria-readonly="true"
          />
          <p id="email-info" className="mt-1 text-xs text-slate-500 dark:text-white/50">
            Email автоматически подставляется из регистрационных данных
          </p>
        </div>

        {/* Language Field */}
        <div>
          <label
            htmlFor="language"
            className="mb-2 block font-medium text-slate-700 dark:text-white/90"
          >
            <Globe className="mr-2 inline h-4 w-4" aria-hidden="true" />
            Язык курса
          </label>
          <select
            id="language"
            {...register('language')}
            className="w-full cursor-pointer appearance-none rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-slate-900 transition-all focus:border-purple-500 focus:bg-slate-50 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white dark:focus:border-purple-400 dark:focus:bg-white/15"
            aria-label="Выберите язык курса"
          >
            <option value="ru" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇷🇺 Русский
            </option>
            <option value="en" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇬🇧 English
            </option>
            <option value="zh" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇨🇳 中文 (Chinese)
            </option>
            <option value="es" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇪🇸 Español
            </option>
            <option value="fr" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇫🇷 Français
            </option>
            <option value="de" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇩🇪 Deutsch
            </option>
            <option value="ja" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇯🇵 日本語 (Japanese)
            </option>
            <option value="ko" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇰🇷 한국어 (Korean)
            </option>
            <option value="ar" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇸🇦 العربية (Arabic)
            </option>
            <option value="pt" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇵🇹 Português
            </option>
            <option value="it" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇮🇹 Italiano
            </option>
            <option value="tr" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇹🇷 Türkçe
            </option>
            <option value="vi" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇻🇳 Tiếng Việt
            </option>
            <option value="th" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇹🇭 ไทย (Thai)
            </option>
            <option value="id" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇮🇩 Bahasa Indonesia
            </option>
            <option value="ms" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇲🇾 Bahasa Melayu
            </option>
            <option value="hi" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇮🇳 हिन्दी (Hindi)
            </option>
            <option value="bn" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇧🇩 বাংলা (Bengali)
            </option>
            <option value="pl" className="bg-white text-slate-900 dark:bg-gray-800 dark:text-white">
              🇵🇱 Polski
            </option>
          </select>
        </div>

        {/* Description Field */}
        <div>
          <label
            htmlFor="description"
            className="mb-2 block font-medium text-slate-700 dark:text-white/90"
          >
            Описание и требования
            <span className="ml-2 text-sm text-slate-500 dark:text-white/50">
              (что должно быть в курсе)
            </span>
          </label>
          <textarea
            id="description"
            {...register('description')}
            rows={4}
            maxLength={7000}
            className={`w-full resize-none rounded-xl border bg-slate-100 px-4 py-3 text-slate-900 placeholder-slate-400 transition-all focus:bg-slate-50 focus:outline-none dark:bg-white/10 dark:text-white dark:placeholder-white/40 dark:focus:bg-white/15 ${
              errors.description
                ? 'animate-pulse border-red-500'
                : 'border-slate-300 focus:border-purple-500 dark:border-white/20 dark:focus:border-purple-400'
            }`}
            placeholder="Опишите ключевые темы, целевую аудиторию и желаемые результаты обучения..."
            aria-describedby={errors.description ? 'description-error' : undefined}
            aria-invalid={errors.description ? 'true' : 'false'}
            onBlur={onBlur}
          />
          {errors.description && (
            <motion.p
              id="description-error"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 flex items-center gap-1 text-sm text-red-400"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {errors.description.message}
            </motion.p>
          )}
        </div>
      </div>
    </motion.div>
  )
}
