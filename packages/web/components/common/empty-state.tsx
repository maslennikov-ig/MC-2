"use client"

import { motion } from "framer-motion"
import { 
  BookOpen, 
  Search, 
  Filter, 
  Sparkles, 
  FolderOpen,
  FileX,
  Inbox,
  Zap
} from "lucide-react"
import Link from "next/link"
import type { Route } from "next"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type EmptyStateType = "no-courses" | "no-results" | "no-filtered" | "error"

interface EmptyStateProps {
  type: EmptyStateType
  title?: string
  description?: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  className?: string
}

const emptyStateConfigs = {
  "no-courses": {
    icon: Inbox,
    title: "Курсы пока не созданы",
    description: "Создайте свой первый курс с помощью AI-генератора",
    iconColor: "from-violet-500 to-purple-600",
    action: {
      label: "Создать первый курс",
      href: "/create"
    }
  },
  "no-results": {
    icon: Search,
    title: "Ничего не найдено",
    description: "Попробуйте изменить поисковый запрос или параметры фильтрации",
    iconColor: "from-blue-500 to-cyan-600"
  },
  "no-filtered": {
    icon: Filter,
    title: "Нет курсов с такими фильтрами",
    description: "Попробуйте изменить или сбросить фильтры",
    iconColor: "from-amber-500 to-orange-600"
  },
  "error": {
    icon: FileX,
    title: "Произошла ошибка",
    description: "Не удалось загрузить курсы. Попробуйте обновить страницу",
    iconColor: "from-red-500 to-rose-600"
  }
}

export default function EmptyState({ 
  type, 
  title: customTitle, 
  description: customDescription, 
  action: customAction,
  className 
}: EmptyStateProps) {
  const config = emptyStateConfigs[type]
  const Icon = config.icon
  const title = customTitle || config.title
  const description = customDescription || config.description
  const action = customAction || ('action' in config ? config.action : undefined)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn("flex flex-col items-center justify-center py-16 px-4", className)}
    >
      <div className="relative mb-8">
        <motion.div
          animate={{ 
            rotate: [0, 5, -5, 0],
            scale: [1, 1.05, 1]
          }}
          transition={{ 
            duration: 4,
            repeat: Infinity,
            repeatType: "reverse"
          }}
          className={`absolute inset-0 bg-gradient-to-br ${config.iconColor} blur-2xl opacity-20`}
        />
        
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ 
            type: "spring",
            stiffness: 260,
            damping: 20,
            delay: 0.1
          }}
          className={`relative w-24 h-24 rounded-full bg-gradient-to-br ${config.iconColor} p-[2px]`}
        >
          <div className="w-full h-full rounded-full bg-background flex items-center justify-center">
            <Icon className="w-12 h-12 text-muted-foreground" />
          </div>
        </motion.div>

        {type === "no-courses" && (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="absolute -top-2 -right-2"
            >
              <Sparkles className="w-6 h-6 text-yellow-500" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="absolute -bottom-2 -left-2"
            >
              <Zap className="w-5 h-5 text-purple-500" />
            </motion.div>
          </>
        )}
      </div>

      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-2xl font-semibold mb-3 text-center"
      >
        {title}
      </motion.h3>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-muted-foreground text-center max-w-md mb-8"
      >
        {description}
      </motion.p>

      {action && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          {action.href ? (
            <Button size="lg" asChild>
              <Link href={action.href as Route} className="inline-flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                {action.label}
              </Link>
            </Button>
          ) : (
            <Button size="lg" onClick={'onClick' in action ? action.onClick : undefined} className="inline-flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              {action.label}
            </Button>
          )}
        </motion.div>
      )}

      {type === "no-results" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 p-4 rounded-lg bg-muted/30 max-w-md"
        >
          <p className="text-sm text-muted-foreground mb-2">Советы по поиску:</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Используйте более общие термины</li>
            <li>• Проверьте правописание</li>
            <li>• Попробуйте другие ключевые слова</li>
            <li>• Сбросьте фильтры для расширения поиска</li>
          </ul>
        </motion.div>
      )}

      {type === "no-courses" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl"
        >
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 p-[2px]">
              <div className="w-full h-full rounded-full bg-background flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
            <h4 className="font-medium mb-1">AI-генерация</h4>
            <p className="text-sm text-muted-foreground">
              Создавайте курсы автоматически с помощью ИИ
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 p-[2px]">
              <div className="w-full h-full rounded-full bg-background flex items-center justify-center">
                <FolderOpen className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
            <h4 className="font-medium mb-1">Из документов</h4>
            <p className="text-sm text-muted-foreground">
              Загружайте файлы для создания курсов
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 p-[2px]">
              <div className="w-full h-full rounded-full bg-background flex items-center justify-center">
                <Zap className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
            <h4 className="font-medium mb-1">Быстро</h4>
            <p className="text-sm text-muted-foreground">
              Получите готовый курс за несколько минут
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}