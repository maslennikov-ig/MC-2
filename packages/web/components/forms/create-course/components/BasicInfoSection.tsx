import React from "react";
import { useFormContext } from "react-hook-form";
import { motion } from "framer-motion";
import { BookOpen, Mail, Globe, AlertCircle } from "lucide-react";
import { type FormData } from "../_schemas/form-schema";

interface BasicInfoSectionProps {
  onBlur: () => void;
}

export function BasicInfoSection({ onBlur }: BasicInfoSectionProps) {
  const { register, formState: { errors } } = useFormContext<FormData>();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white/90 dark:bg-black/70 backdrop-blur-xl rounded-2xl p-4 sm:p-6 md:p-8 border border-slate-200 dark:border-white/10 xl:col-span-1"
    >
      <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
        <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-purple-500 dark:text-purple-400" />
        Основная информация
      </h2>

      <div className="space-y-6">
        {/* Topic Field */}
        <div>
          <label htmlFor="topic" className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
            Тема курса <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input
            id="topic"
            {...register("topic")}
            type="text"
            className={`w-full px-4 py-3 bg-slate-100 dark:bg-black/30 backdrop-blur-sm border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:bg-slate-50 dark:focus:bg-black/40 transition-all ${
              errors.topic ? 'border-red-500 animate-pulse' : 'border-slate-300 dark:border-white/20 focus:border-purple-500 dark:focus:border-purple-400'
            }`}
            placeholder="Например: Основы машинного обучения"
            aria-describedby={errors.topic ? "topic-error" : undefined}
            aria-invalid={errors.topic ? "true" : "false"}
            aria-required="true"
            onBlur={onBlur}
          />
          {errors.topic && (
            <motion.p
              id="topic-error"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-400 text-sm mt-2 flex items-center gap-1"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle className="w-4 h-4" aria-hidden="true" />
              {errors.topic.message}
            </motion.p>
          )}
        </div>

        {/* Email Field */}
        <div>
          <label htmlFor="email" className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
            <Mail className="inline w-4 h-4 mr-2" aria-hidden="true" />
            Email для результатов <span className="text-red-500 dark:text-red-400">*</span>
            <span className="text-slate-500 dark:text-white/50 text-sm ml-2">(из вашего профиля)</span>
          </label>
          <input
            id="email"
            {...register("email")}
            type="email"
            readOnly
            disabled
            className="w-full px-4 py-3 bg-slate-100 dark:bg-black/20 backdrop-blur-sm border border-slate-200 dark:border-white/10 rounded-xl text-slate-500 dark:text-white/70 cursor-not-allowed"
            placeholder="your@email.com"
            aria-describedby="email-info"
            aria-readonly="true"
          />
          <p id="email-info" className="text-slate-500 dark:text-white/50 text-xs mt-1">
            Email автоматически подставляется из регистрационных данных
          </p>
        </div>

        {/* Language Field */}
        <div>
          <label htmlFor="language" className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
            <Globe className="inline w-4 h-4 mr-2" aria-hidden="true" />
            Язык курса
          </label>
          <select
            id="language"
            {...register("language")}
            className="w-full px-4 py-3 bg-slate-100 dark:bg-white/10 border border-slate-300 dark:border-white/20 rounded-xl text-slate-900 dark:text-white appearance-none focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 focus:bg-slate-50 dark:focus:bg-white/15 transition-all cursor-pointer"
            aria-label="Выберите язык курса"
          >
            <option value="ru" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇷🇺 Русский</option>
            <option value="en" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇬🇧 English</option>
            <option value="zh" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇨🇳 中文 (Chinese)</option>
            <option value="es" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇪🇸 Español</option>
            <option value="fr" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇫🇷 Français</option>
            <option value="de" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇩🇪 Deutsch</option>
            <option value="ja" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇯🇵 日本語 (Japanese)</option>
            <option value="ko" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇰🇷 한국어 (Korean)</option>
            <option value="ar" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇸🇦 العربية (Arabic)</option>
            <option value="pt" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇵🇹 Português</option>
            <option value="it" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇮🇹 Italiano</option>
            <option value="tr" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇹🇷 Türkçe</option>
            <option value="vi" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇻🇳 Tiếng Việt</option>
            <option value="th" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇹🇭 ไทย (Thai)</option>
            <option value="id" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇮🇩 Bahasa Indonesia</option>
            <option value="ms" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇲🇾 Bahasa Melayu</option>
            <option value="hi" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇮🇳 हिन्दी (Hindi)</option>
            <option value="pl" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇵🇱 Polski</option>
          </select>
        </div>

        {/* Description Field */}
        <div>
          <label htmlFor="description" className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
            Описание и требования
            <span className="text-slate-500 dark:text-white/50 text-sm ml-2">(что должно быть в курсе)</span>
          </label>
          <textarea
            id="description"
            {...register("description")}
            rows={4}
            className={`w-full px-4 py-3 bg-slate-100 dark:bg-white/10 border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:bg-slate-50 dark:focus:bg-white/15 transition-all resize-none ${
              errors.description ? 'border-red-500 animate-pulse' : 'border-slate-300 dark:border-white/20 focus:border-purple-500 dark:focus:border-purple-400'
            }`}
            placeholder="Опишите ключевые темы, целевую аудиторию и желаемые результаты обучения..."
            aria-describedby={errors.description ? "description-error" : undefined}
            aria-invalid={errors.description ? "true" : "false"}
            onBlur={onBlur}
          />
          {errors.description && (
            <motion.p
              id="description-error"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-400 text-sm mt-2 flex items-center gap-1"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle className="w-4 h-4" aria-hidden="true" />
              {errors.description.message}
            </motion.p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
