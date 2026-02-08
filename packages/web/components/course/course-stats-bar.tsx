'use client'

import { motion } from 'framer-motion'
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Layers,
  GraduationCap,
  TrendingUp,
  BarChart3,
} from 'lucide-react'

interface CourseStatsBarProps {
  stats: {
    total: number
    completed: number
    inProgress: number
    ready: number
    withLessons: number
    totalLessons: number
  }
}

interface StatItemProps {
  icon: React.ElementType
  value: number
  label: string
  gradientIndex: number
  delay?: number
}

function StatItem({ icon: Icon, value, label, gradientIndex, delay = 0 }: StatItemProps) {
  // Единая цветовая схема с вариациями фиолетово-синего градиента
  const gradients = [
    'from-violet-600 to-purple-600', // Основной
    'from-purple-600 to-indigo-600', // Завершены
    'from-indigo-600 to-blue-600', // В процессе
    'from-blue-600 to-cyan-600', // Структура готова
    'from-cyan-600 to-teal-600', // С уроками
    'from-teal-600 to-emerald-600', // Всего уроков
  ]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay }}
      className="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-2 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10 sm:gap-3 sm:px-4 sm:py-3"
    >
      <div
        className={`rounded-lg bg-gradient-to-br p-2 ${gradients[gradientIndex]} shadow-lg transition-transform group-hover:scale-110`}
      >
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-lg font-bold text-white tabular-nums sm:text-2xl">{value}</span>
        <span className="truncate text-[10px] tracking-wider whitespace-nowrap text-slate-400 uppercase sm:text-xs">
          {label}
        </span>
      </div>
    </motion.div>
  )
}

export default function CourseStatsBar({ stats }: CourseStatsBarProps) {
  const statItems = [
    {
      icon: BookOpen,
      value: stats.total,
      label: 'Всего курсов',
      gradientIndex: 0,
    },
    {
      icon: CheckCircle2,
      value: stats.completed,
      label: 'Завершены',
      gradientIndex: 1,
    },
    {
      icon: Clock,
      value: stats.inProgress,
      label: 'В процессе',
      gradientIndex: 2,
    },
    {
      icon: Layers,
      value: stats.ready,
      label: 'Структура готова',
      gradientIndex: 3,
    },
    {
      icon: GraduationCap,
      value: stats.withLessons,
      label: 'С уроками',
      gradientIndex: 4,
    },
    {
      icon: BarChart3,
      value: stats.totalLessons,
      label: 'Всего уроков',
      gradientIndex: 5,
    },
  ]

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-slate-400" />
        <h2 className="text-sm font-medium tracking-wider text-slate-400 uppercase">
          Статистика курсов
        </h2>
      </div>

      <div className="relative">
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-violet-500/5 via-indigo-500/5 to-cyan-500/5 blur-3xl" />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-3 lg:grid-cols-6">
          {statItems.map((item, index) => (
            <StatItem key={item.label} {...item} delay={index * 0.05} />
          ))}
        </div>
      </div>

      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="mt-4 h-0.5 origin-left rounded-full bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 opacity-50"
      />
    </div>
  )
}
