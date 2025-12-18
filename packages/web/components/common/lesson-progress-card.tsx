"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Clock, TrendingUp, Target, Award, Sparkles, BookOpen, CheckCircle2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface LessonProgressCardProps {
  completedCount: number
  totalLessons: number
  remainingMinutes: number
  className?: string
  compact?: boolean
}

export default function LessonProgressCard({
  completedCount,
  totalLessons,
  remainingMinutes,
  className,
  compact = false
}: LessonProgressCardProps) {
  const progressPercentage = totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0
  const isCompleted = completedCount === totalLessons && totalLessons > 0
  
  const formatTime = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes} мин`
    }
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}ч ${mins}мин` : `${hours}ч`
  }

  // Achievement milestones
  const getMilestone = () => {
    if (progressPercentage === 0) return null
    if (progressPercentage >= 100) return { icon: Award, text: "Курс завершён!", color: "text-yellow-500" }
    if (progressPercentage >= 75) return { icon: TrendingUp, text: "Почти у цели!", color: "text-purple-500" }
    if (progressPercentage >= 50) return { icon: Target, text: "Половина пройдена", color: "text-blue-500" }
    if (progressPercentage >= 25) return { icon: Sparkles, text: "Отличное начало", color: "text-green-500" }
    return null
  }

  const milestone = getMilestone()

  if (compact) {
    // Compact version for smaller screens
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "relative overflow-hidden rounded-xl p-4",
          "bg-gradient-to-br from-purple-500/10 via-blue-500/5 to-indigo-500/10",
          "dark:from-purple-900/20 dark:via-blue-900/10 dark:to-indigo-900/20",
          "border border-purple-200/50 dark:border-purple-800/30",
          "backdrop-blur-sm shadow-lg",
          className
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Прогресс
          </span>
          <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
            {Math.round(progressPercentage)}%
          </span>
        </div>
        
        <div className="relative">
          <Progress value={progressPercentage} className="h-2 bg-gray-200 dark:bg-gray-800" />
          {isCompleted && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1"
            >
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            </motion.div>
          )}
        </div>
        
        <div className="flex justify-between mt-2 text-xs text-gray-600 dark:text-gray-400">
          <span>{completedCount}/{totalLessons} уроков</span>
          {remainingMinutes > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(remainingMinutes)}
            </span>
          )}
        </div>
      </motion.div>
    )
  }

  // Full version
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative overflow-hidden rounded-2xl",
        "bg-gradient-to-br from-purple-500/10 via-blue-500/5 to-indigo-500/10",
        "dark:from-purple-900/30 dark:via-blue-900/20 dark:to-indigo-900/30",
        "border border-purple-200/50 dark:border-purple-700/40",
        "backdrop-blur-xl shadow-xl",
        "hover:shadow-2xl hover:border-purple-300/60 dark:hover:border-purple-600/50",
        "transition-all duration-300",
        className
      )}
    >
      {/* Animated gradient background */}
      <div className="absolute inset-0 opacity-50">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-400/20 via-transparent to-blue-400/20 animate-pulse" />
      </div>

      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-400/10 to-transparent rounded-full blur-2xl" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-blue-400/10 to-transparent rounded-full blur-xl" />

      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-purple-500/20 to-blue-500/20 dark:from-purple-400/30 dark:to-blue-400/30 rounded-lg">
              <BookOpen className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              Прогресс курса
            </h3>
          </div>
          
          {milestone && (
            <AnimatePresence mode="wait">
              <motion.div
                key={milestone.text}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex items-center gap-1"
              >
                <milestone.icon className={cn("w-4 h-4", milestone.color)} />
                <span className={cn("text-xs font-medium", milestone.color)}>
                  {milestone.text}
                </span>
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Progress bar with enhanced styling */}
        <div className="space-y-3">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-full blur-sm" />
            <Progress 
              value={progressPercentage} 
              className="relative h-3 bg-gray-200/50 dark:bg-gray-800/50"
            />
            
            {/* Animated completion indicator */}
            {isCompleted && (
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 10 }}
                className="absolute -top-2 right-0"
              >
                <div className="relative">
                  <Award className="w-6 h-6 text-yellow-500" />
                  <div className="absolute inset-0 animate-ping">
                    <Award className="w-6 h-6 text-yellow-500/40" />
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                Пройдено
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {completedCount}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  из {totalLessons}
                </span>
              </div>
            </div>

            <div className="text-right">
              <motion.div
                key={progressPercentage}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent"
              >
                {Math.round(progressPercentage)}%
              </motion.div>
            </div>
          </div>

          {/* Remaining time */}
          {remainingMinutes > 0 && (
            <div className="pt-3 border-t border-gray-200/50 dark:border-gray-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-medium">Осталось времени</span>
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {formatTime(remainingMinutes)}
                </span>
              </div>
              
              {/* Time progress bar */}
              <div className="mt-2">
                <div className="h-1 bg-gray-200/50 dark:bg-gray-800/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercentage}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-green-400 to-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Motivational message */}
        {!isCompleted && progressPercentage > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-4 p-3 bg-gradient-to-r from-purple-50/50 to-blue-50/50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg"
          >
            <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
              {progressPercentage < 25 && "Отличное начало! Продолжайте в том же духе 🚀"}
              {progressPercentage >= 25 && progressPercentage < 50 && "Вы делаете успехи! Так держать 💪"}
              {progressPercentage >= 50 && progressPercentage < 75 && "Уже больше половины! Вы молодец 🌟"}
              {progressPercentage >= 75 && "Почти у цели! Ещё немного 🎯"}
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}