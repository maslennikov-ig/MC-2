import React from "react";
import { useFormContext } from "react-hook-form";
import { motion } from "framer-motion";
import { FolderOpen, AlertCircle } from "lucide-react";
import { generationFormats } from "../_data/constants";
import { type FormData } from "../_schemas/form-schema";

interface FormatsSectionProps {
  mounted: boolean;
  toggleFormat: (format: string, available: boolean, required?: boolean) => void;
  formats: string[];
}

export function FormatsSection({ mounted, toggleFormat, formats }: FormatsSectionProps) {
  const { formState: { errors } } = useFormContext<FormData>();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="bg-white/90 dark:bg-black/70 backdrop-blur-xl rounded-2xl p-4 sm:p-6 md:p-8 border border-slate-200 dark:border-white/10 xl:col-span-1"
    >
      <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
        <FolderOpen className="w-5 h-5 sm:w-6 sm:h-6 text-purple-500 dark:text-purple-400" />
        Форматы генерации
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
        {generationFormats.map((format) => {
          const isSelected = mounted && formats.includes(format.value);
          const isAvailable = format.available;
          const isRequired = format.required;
          const isClickable = isAvailable && !isRequired;
          return (
            <motion.div
              key={format.value}
              whileHover={isClickable ? { scale: 1.02 } : {}}
              whileTap={isClickable ? { scale: 0.98 } : {}}
              onClick={() => toggleFormat(format.value, format.available, format.required)}
              className={`relative p-4 rounded-xl border-2 transition-all ${
                !isAvailable
                  ? "opacity-60 cursor-not-allowed grayscale-[30%]"
                  : isRequired
                    ? "cursor-default"
                    : "cursor-pointer"
              } ${
                isSelected && isAvailable
                  ? "bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500 dark:border-purple-400"
                  : isAvailable
                    ? "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30"
                    : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10"
              }`}
            >
              {isRequired && (
                <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-600 dark:text-green-400 rounded-full border border-green-500/30">
                  Всегда
                </span>
              )}
              {!isAvailable && (
                <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full border border-amber-500/30">
                  Скоро
                </span>
              )}
              <div className="flex items-center gap-3">
                <format.icon className={`w-6 h-6 ${isAvailable ? 'text-purple-500 dark:text-purple-400' : 'text-slate-400 dark:text-white/40'}`} />
                <div>
                  <h3 className={`font-semibold ${isAvailable ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-white/60'}`}>{format.title}</h3>
                  <p className={`text-sm ${isAvailable ? 'text-slate-500 dark:text-white/60' : 'text-slate-400 dark:text-white/40'}`}>{format.description}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      {errors.formats && (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-red-400 text-sm mt-4 flex items-center gap-1"
        >
          <AlertCircle className="w-4 h-4" />
          {errors.formats.message}
        </motion.p>
      )}
    </motion.div>
  );
}
