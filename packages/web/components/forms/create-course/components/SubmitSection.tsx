import React from "react";
import { motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

interface SubmitSectionProps {
  isSubmitting: boolean;
}

export function SubmitSection({ isSubmitting }: SubmitSectionProps) {
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="xl:col-span-2 flex flex-col sm:flex-row gap-4 justify-between items-center"
    >
      <div className="text-slate-500 dark:text-white/60 text-sm">
        * Обязательные поля
      </div>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="px-6 py-3 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white font-medium rounded-xl transition-all"
          aria-label="Отменить создание курса и вернуться на главную страницу"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className={`inline-flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 group ${
            !isSubmitting
              ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 shadow-xl hover:shadow-2xl hover:scale-105"
              : "bg-white/10 text-white/40 cursor-not-allowed"
          }`}
          aria-label={
            isSubmitting ? "Создание курса в процессе" :
            "Создать новый курс с указанными параметрами"
          }
          aria-disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
              <span>Создание курса...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" aria-hidden="true" />
              <span>Создать курс</span>
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
