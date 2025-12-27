import React from "react";
import { motion } from "framer-motion";
import { Loader2, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface SubmitSectionProps {
  isSubmitting: boolean;
  workerReady?: boolean;
  workerLoading?: boolean;
  workerError?: string | null;
}

export function SubmitSection({
  isSubmitting,
  workerReady = true,
  workerLoading = false,
  workerError = null,
}: SubmitSectionProps) {
  const router = useRouter();

  // Determine if submit should be disabled
  const isDisabled = isSubmitting || workerLoading || !workerReady;

  // Get button state info
  const getButtonState = () => {
    if (isSubmitting) {
      return {
        label: "Создание курса...",
        ariaLabel: "Создание курса в процессе",
        icon: <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />,
      };
    }
    if (workerLoading) {
      return {
        label: "Проверка системы...",
        ariaLabel: "Проверка готовности системы генерации",
        icon: <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />,
      };
    }
    if (!workerReady) {
      return {
        label: "Система недоступна",
        ariaLabel: "Система генерации курсов временно недоступна",
        icon: <AlertCircle className="w-6 h-6" aria-hidden="true" />,
      };
    }
    return {
      label: "Создать курс",
      ariaLabel: "Создать новый курс с указанными параметрами",
      icon: <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" aria-hidden="true" />,
    };
  };

  const buttonState = getButtonState();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="xl:col-span-2 flex flex-col gap-4"
    >
      {/* Worker status indicator */}
      {!workerLoading && (
        <div className="flex items-center justify-end gap-2 text-sm">
          {workerReady ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-green-600 dark:text-green-400">
                Система готова к генерации
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span className="text-amber-600 dark:text-amber-400">
                  {workerError || "Система генерации временно недоступна"}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Попробуйте обновить страницу через несколько секунд. Если проблема сохраняется, обратитесь в поддержку.
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
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
            disabled={isDisabled}
            className={`inline-flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 group ${
              !isDisabled
                ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 shadow-xl hover:shadow-2xl hover:scale-105"
                : "bg-white/10 text-white/40 cursor-not-allowed"
            }`}
            aria-label={buttonState.ariaLabel}
            aria-disabled={isDisabled}
          >
            {buttonState.icon}
            <span>{buttonState.label}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
