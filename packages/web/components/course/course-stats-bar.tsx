"use client"

import { motion } from "framer-motion"
import { 
  BookOpen, 
  CheckCircle2, 
  Clock, 
  Layers, 
  GraduationCap,
  TrendingUp,
  BarChart3
} from "lucide-react"

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
    "from-violet-600 to-purple-600",   // Основной
    "from-purple-600 to-indigo-600",   // Завершены
    "from-indigo-600 to-blue-600",     // В процессе
    "from-blue-600 to-cyan-600",       // Структура готова
    "from-cyan-600 to-teal-600",       // С уроками
    "from-teal-600 to-emerald-600"     // Всего уроков
  ]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay }}
      className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2 sm:py-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all group"
    >
      <div className={`p-2 rounded-lg bg-gradient-to-br ${gradients[gradientIndex]} group-hover:scale-110 transition-transform shadow-lg`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-lg sm:text-2xl font-bold tabular-nums text-white">
          {value}
        </span>
        <span className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider whitespace-nowrap truncate">
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
      label: "Всего курсов",
      gradientIndex: 0
    },
    {
      icon: CheckCircle2,
      value: stats.completed,
      label: "Завершены",
      gradientIndex: 1
    },
    {
      icon: Clock,
      value: stats.inProgress,
      label: "В процессе",
      gradientIndex: 2
    },
    {
      icon: Layers,
      value: stats.ready,
      label: "Структура готова",
      gradientIndex: 3
    },
    {
      icon: GraduationCap,
      value: stats.withLessons,
      label: "С уроками",
      gradientIndex: 4
    },
    {
      icon: BarChart3,
      value: stats.totalLessons,
      label: "Всего уроков",
      gradientIndex: 5
    }
  ]

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-slate-400" />
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
          Статистика курсов
        </h2>
      </div>
      
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-indigo-500/5 to-cyan-500/5 blur-3xl -z-10" />
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {statItems.map((item, index) => (
            <StatItem
              key={item.label}
              {...item}
              delay={index * 0.05}
            />
          ))}
        </div>
      </div>

      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="h-0.5 mt-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 rounded-full origin-left opacity-50"
      />
    </div>
  )
}