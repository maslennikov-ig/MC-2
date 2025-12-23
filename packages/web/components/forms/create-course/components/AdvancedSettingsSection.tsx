import React, { useState } from "react";
import { useFormContext } from "react-hook-form";
import { motion } from "framer-motion";
import { Settings2, ChevronDown, Users } from "lucide-react";
import { type FormData } from "../_schemas/form-schema";

export function AdvancedSettingsSection() {
  const { register, watch, formState: { errors } } = useFormContext<FormData>();
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const lessonDuration = watch("lessonDuration");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="xl:col-span-2 bg-gradient-to-br from-white/90 to-white/70 dark:from-black/70 dark:to-black/60 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden"
    >
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
        className={`w-full flex items-center justify-between p-6 transition-all hover:bg-slate-50/50 dark:hover:bg-white/5 ${
          showAdvancedSettings ? 'border-b border-slate-200 dark:border-white/10' : ''
        }`}
        aria-expanded={showAdvancedSettings}
        aria-controls="advanced-settings-content"
      >
        <div className="flex items-center gap-3">
          <Settings2 className="w-6 h-6 text-purple-500 dark:text-purple-400" />
          <span className="text-xl font-bold text-slate-900 dark:text-white">
            Дополнительные настройки
          </span>
          <span className="text-slate-500 dark:text-white/50 text-sm font-normal">
            (необязательно)
          </span>
        </div>
        <motion.div
          animate={{ rotate: showAdvancedSettings ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-slate-500 dark:text-white/60" />
        </motion.div>
      </button>

      {/* Collapsible Content */}
      <motion.div
        id="advanced-settings-content"
        initial={false}
        animate={{
          height: showAdvancedSettings ? "auto" : 0,
          opacity: showAdvancedSettings ? 1 : 0
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="overflow-hidden"
      >
        <div className="p-6 pt-4 md:p-8 md:pt-6">

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
            <div>
              <label className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
                <Users className="inline w-4 h-4 mr-2" />
                Целевая аудитория
              </label>
              <input
                {...register("targetAudience")}
                type="text"
                className={`w-full px-4 py-3 bg-slate-100 dark:bg-black/30 backdrop-blur-sm border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:bg-slate-50 dark:focus:bg-black/40 transition-all ${
                  errors.targetAudience ? 'border-red-500 animate-pulse' : 'border-slate-300 dark:border-white/20 focus:border-purple-500 dark:focus:border-purple-400'
                }`}
                placeholder="Разработчики, менеджеры, студенты..."
              />
              {errors.targetAudience && (
                <p className="text-red-500 dark:text-red-400 text-sm mt-2">
                  {errors.targetAudience.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
                Количество уроков
                <span className="text-slate-500 dark:text-white/50 text-sm ml-2">(авто если не указано)</span>
              </label>
              <input
                {...register("estimatedLessons", {
                  setValueAs: (v) => v === "" ? undefined : Number(v)
                })}
                type="number"
                min="10"
                max="100"
                className="w-full px-4 py-3 bg-slate-100 dark:bg-black/30 backdrop-blur-sm border border-slate-300 dark:border-white/20 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 focus:bg-slate-50 dark:focus:bg-black/40 transition-all"
                placeholder="Автоматически"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
                Количество модулей
                <span className="text-slate-500 dark:text-white/50 text-sm ml-2">(авто если не указано)</span>
              </label>
              <input
                {...register("estimatedSections", {
                  setValueAs: (v) => v === "" ? undefined : Number(v)
                })}
                type="number"
                min="3"
                max="30"
                className="w-full px-4 py-3 bg-slate-100 dark:bg-black/30 backdrop-blur-sm border border-slate-300 dark:border-white/20 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 focus:bg-slate-50 dark:focus:bg-black/40 transition-all"
                placeholder="Автоматически"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
                Стратегия контента
              </label>
              <select
                {...register("contentStrategy")}
                className="w-full px-4 py-3 bg-slate-100 dark:bg-white/10 border border-slate-300 dark:border-white/20 rounded-xl text-slate-900 dark:text-white appearance-none focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 focus:bg-slate-50 dark:focus:bg-white/15 transition-all cursor-pointer"
              >
                <option value="auto" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">Автоматически</option>
                <option value="create_from_scratch" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">Создать с нуля</option>
                <option value="expand_and_enhance" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">Расширить и улучшить</option>
                <option value="optimize_existing" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">Оптимизировать существующий</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-slate-700 dark:text-white/90 mb-2 font-medium flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                Длительность урока
              </label>
              <select
                {...register("lessonDuration", { valueAsNumber: true })}
                className="w-full px-4 py-3 bg-slate-100 dark:bg-black/30 backdrop-blur-sm border border-slate-300 dark:border-white/20 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 focus:bg-slate-50 dark:focus:bg-black/40 transition-all"
              >
                <option value={3} className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">3 минуты — микрообучение</option>
                <option value={5} className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">5 минут — быстрое изучение (рекомендуется)</option>
                <option value={10} className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">10 минут — стандартный урок</option>
                <option value={15} className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">15 минут — углубленное изучение</option>
                <option value={20} className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">20 минут — глубокое погружение</option>
                <option value={30} className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">30 минут — для сложных тем</option>
                <option value={45} className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">45 минут — ЭКСТРЕМАЛЬНО (не рекомендуется)</option>
              </select>
              <p className="text-xs text-slate-500 dark:text-white/50 mt-1">
                5 минут оптимально для большинства тем. При выборе стиля &quot;Микрообучение&quot; автоматически устанавливается 3 минуты.
              </p>
              {lessonDuration === 45 && (
                <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-xs text-red-400 font-medium">
                    ⚠️ <strong>Внимание:</strong> 45 минут крайне не рекомендуется из-за:
                  </p>
                  <ul className="text-xs text-red-300 mt-1 ml-4 space-y-0.5">
                    <li>• Резкое падение концентрации после 20 минут</li>
                    <li>• Низкий процент завершения длинных уроков (~30%)</li>
                    <li>• Высокая когнитивная нагрузка снижает усвоение материала</li>
                    <li>• Лучше разбить на 2-3 урока по 15-20 минут</li>
                  </ul>
                  <p className="text-xs text-red-400 mt-2">
                    💡 <strong>Рекомендация:</strong> Используйте только для исключительных случаев (детальный разбор комплексных технических систем).
                  </p>
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
                Результаты обучения
              </label>
              <textarea
                {...register("learningOutcomes")}
                rows={3}
                className="w-full px-4 py-3 bg-slate-100 dark:bg-white/10 border border-slate-300 dark:border-white/20 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 focus:bg-slate-50 dark:focus:bg-white/15 transition-all resize-none"
                placeholder="После прохождения курса студенты смогут..."
              />
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
