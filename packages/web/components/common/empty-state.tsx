'use client'

import { motion } from 'framer-motion'
import { BookOpen, Search, Filter, Sparkles, FolderOpen, FileX, Inbox, Zap } from 'lucide-react'
import Link from 'next/link'
import type { Route } from 'next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type EmptyStateType = 'no-courses' | 'no-results' | 'no-filtered' | 'error'

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
  'no-courses': {
    icon: Inbox,
    title: 'Курсы пока не созданы',
    description: 'Создайте свой первый курс с помощью AI-генератора',
    iconColor: 'from-violet-500 to-purple-600',
    action: {
      label: 'Создать первый курс',
      href: '/create',
    },
  },
  'no-results': {
    icon: Search,
    title: 'Ничего не найдено',
    description: 'Попробуйте изменить поисковый запрос или параметры фильтрации',
    iconColor: 'from-blue-500 to-cyan-600',
  },
  'no-filtered': {
    icon: Filter,
    title: 'Нет курсов с такими фильтрами',
    description: 'Попробуйте изменить или сбросить фильтры',
    iconColor: 'from-amber-500 to-orange-600',
  },
  error: {
    icon: FileX,
    title: 'Произошла ошибка',
    description: 'Не удалось загрузить курсы. Попробуйте обновить страницу',
    iconColor: 'from-red-500 to-rose-600',
  },
}

export default function EmptyState({
  type,
  title: customTitle,
  description: customDescription,
  action: customAction,
  className,
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
      className={cn('flex flex-col items-center justify-center px-4 py-16', className)}
    >
      <div className="relative mb-8">
        <motion.div
          animate={{
            rotate: [0, 5, -5, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            repeatType: 'reverse',
          }}
          className={`absolute inset-0 bg-gradient-to-br ${config.iconColor} opacity-20 blur-2xl`}
        />

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            type: 'spring',
            stiffness: 260,
            damping: 20,
            delay: 0.1,
          }}
          className={`relative h-24 w-24 rounded-full bg-gradient-to-br ${config.iconColor} p-[2px]`}
        >
          <div className="bg-background flex h-full w-full items-center justify-center rounded-full">
            <Icon className="text-muted-foreground h-12 w-12" />
          </div>
        </motion.div>

        {type === 'no-courses' && (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="absolute -top-2 -right-2"
            >
              <Sparkles className="h-6 w-6 text-yellow-500" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="absolute -bottom-2 -left-2"
            >
              <Zap className="h-5 w-5 text-purple-500" />
            </motion.div>
          </>
        )}
      </div>

      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-3 text-center text-2xl font-semibold"
      >
        {title}
      </motion.h3>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-muted-foreground mb-8 max-w-md text-center"
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
                <Sparkles className="h-5 w-5" />
                {action.label}
              </Link>
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={'onClick' in action ? action.onClick : undefined}
              className="inline-flex items-center gap-2"
            >
              <Sparkles className="h-5 w-5" />
              {action.label}
            </Button>
          )}
        </motion.div>
      )}

      {type === 'no-results' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-muted/30 mt-8 max-w-md rounded-lg p-4"
        >
          <p className="text-muted-foreground mb-2 text-sm">Советы по поиску:</p>
          <ul className="text-muted-foreground space-y-1 text-sm">
            <li>• Используйте более общие термины</li>
            <li>• Проверьте правописание</li>
            <li>• Попробуйте другие ключевые слова</li>
            <li>• Сбросьте фильтры для расширения поиска</li>
          </ul>
        </motion.div>
      )}

      {type === 'no-courses' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-12 grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-3"
        >
          <div className="text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 p-[2px]">
              <div className="bg-background flex h-full w-full items-center justify-center rounded-full">
                <BookOpen className="text-muted-foreground h-6 w-6" />
              </div>
            </div>
            <h4 className="mb-1 font-medium">AI-генерация</h4>
            <p className="text-muted-foreground text-sm">
              Создавайте курсы автоматически с помощью ИИ
            </p>
          </div>

          <div className="text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 p-[2px]">
              <div className="bg-background flex h-full w-full items-center justify-center rounded-full">
                <FolderOpen className="text-muted-foreground h-6 w-6" />
              </div>
            </div>
            <h4 className="mb-1 font-medium">Из документов</h4>
            <p className="text-muted-foreground text-sm">Загружайте файлы для создания курсов</p>
          </div>

          <div className="text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 p-[2px]">
              <div className="bg-background flex h-full w-full items-center justify-center rounded-full">
                <Zap className="text-muted-foreground h-6 w-6" />
              </div>
            </div>
            <h4 className="mb-1 font-medium">Быстро</h4>
            <p className="text-muted-foreground text-sm">
              Получите готовый курс за несколько минут
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
