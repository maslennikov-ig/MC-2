import React, { useState, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { motion } from "framer-motion";
import { PenTool, ChevronDown } from "lucide-react";
import { type FormData } from "../_schemas/form-schema";
// We accept any array of styles that matches the shape we need
interface StyleOption {
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

interface StyleSectionProps {
  mounted: boolean;
  reorderedStyles: StyleOption[];
}

export function StyleSection({ mounted, reorderedStyles }: StyleSectionProps) {
  const { register, watch } = useFormContext<FormData>();
  const [showAllStyles, setShowAllStyles] = useState(false);
  const writingStyle = watch("writingStyle");

  const displayedStyles = useMemo(() => {
    return showAllStyles ? reorderedStyles : reorderedStyles.slice(0, 4);
  }, [showAllStyles, reorderedStyles]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="bg-white/90 dark:bg-black/70 backdrop-blur-xl rounded-2xl p-4 sm:p-6 md:p-8 border border-slate-200 dark:border-white/10 xl:col-span-1"
    >
      <h2 id="writing-style-heading" className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
        <PenTool className="w-5 h-5 sm:w-6 sm:h-6 text-purple-500 dark:text-purple-400" aria-hidden="true" />
        Стиль изложения
      </h2>
      
      <fieldset>
        <legend className="sr-only">Выберите стиль изложения курса</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4" role="radiogroup" aria-labelledby="writing-style-heading">
          {displayedStyles.map((style) => {
            const isSelected = mounted && writingStyle === style.value;
            return (
              <label
                key={style.value}
                className={`relative cursor-pointer transition-all ${
                  isSelected ? "scale-105" : ""
                }`}
              >
                <input
                  type="radio"
                  {...register("writingStyle")}
                  value={style.value}
                  className="sr-only"
                  aria-describedby={`style-${style.value}-desc`}
                />
                <div
                  className={`p-3 sm:p-4 rounded-xl border-2 transition-all h-full flex flex-col ${
                    isSelected
                      ? "bg-gradient-to-br from-purple-500/30 to-pink-500/30 border-purple-500 dark:border-purple-400 backdrop-blur-md"
                      : "bg-slate-50 dark:bg-black/20 backdrop-blur-sm border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30"
                  }`}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <style.icon className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-purple-500 dark:text-purple-400" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base mb-1">{style.title}</h3>
                    <p id={`style-${style.value}-desc`} className="text-slate-600 dark:text-white/70 text-xs sm:text-sm line-clamp-2 sm:line-clamp-none">{style.description}</p>
                  </div>
                </div>
              </div>
            </label>
            );
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
              className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white rounded-xl transition-all border border-slate-200 dark:border-white/20 hover:border-purple-500/50 dark:hover:border-purple-400/50"
            >
              <ChevronDown className="w-5 h-5" />
              <span className="font-medium text-sm sm:text-base">Ещё стили (+15)</span>
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
              className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white rounded-xl transition-all border border-slate-200 dark:border-white/20 hover:border-purple-500/50 dark:hover:border-purple-400/50"
            >
              <ChevronDown className="w-5 h-5 rotate-180" />
              <span className="font-medium text-sm sm:text-base">Скрыть стили</span>
            </button>
          </motion.div>
        )}
      </fieldset>
    </motion.div>
  );
}
