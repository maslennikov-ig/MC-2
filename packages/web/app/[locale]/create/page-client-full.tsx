'use client'

import dynamic from 'next/dynamic'
import { CreateHeader } from './_components/create-header'
import ShaderBackground from '@/components/layouts/shader-background'
import CreateMetadata from '@/components/common/create-metadata'
import { motion } from 'framer-motion'
import { Sparkles, Zap, BookOpen, Video } from 'lucide-react'

// Dynamic import for heavy form component with loading state
const CreateCourseForm = dynamic(() => import('@/components/forms/create-course-form'), {
  loading: () => (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-purple-400"></div>
    </div>
  ),
  ssr: false,
})

export default function CreatePageClientFull() {
  return (
    <ShaderBackground>
      <CreateMetadata />
      {/* Subtle dark vignette overlay for better contrast */}
      <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-b from-black/10 via-transparent to-black/20" />
      <div className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.15)_100%)]" />

      <CreateHeader />

      {/* Main Content */}
      <main className="relative z-10 min-h-screen">
        <div className="w-full px-4 py-4 pb-12 sm:px-6 sm:py-6 sm:pb-16 md:px-8 md:py-8 md:pb-20 lg:px-12">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-6 text-center sm:mb-8 md:mb-12"
          >
            <h1
              className="mb-2 text-3xl font-bold text-white sm:mb-3 sm:text-4xl md:mb-4 md:text-5xl lg:text-6xl"
              style={{
                textShadow:
                  '0 2px 10px rgba(0,0,0,0.8), 0 4px 20px rgba(0,0,0,0.5), 0 8px 40px rgba(0,0,0,0.3)',
              }}
            >
              Создать новый курс
            </h1>
            <p
              className="mx-auto max-w-2xl text-xl text-white"
              style={{
                textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 4px 16px rgba(0,0,0,0.5)',
              }}
            >
              Загрузите материалы, и наш AI создаст полноценный образовательный курс с видео, аудио
              и интерактивными тестами
            </p>
          </motion.div>

          {/* Features Row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-6 flex flex-wrap justify-center gap-2 sm:mb-8 sm:gap-3 md:mb-12 md:gap-4"
          >
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-4 py-2 backdrop-blur-md">
              <Zap className="h-4 w-4 text-purple-400" />
              <span
                className="text-sm text-white"
                style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
              >
                Быстрая генерация
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-4 py-2 backdrop-blur-md">
              <BookOpen className="h-4 w-4 text-purple-400" />
              <span
                className="text-sm text-white"
                style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
              >
                Структурированные уроки
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-4 py-2 backdrop-blur-md">
              <Video className="h-4 w-4 text-purple-400" />
              <span
                className="text-sm text-white"
                style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
              >
                Мультимедиа контент
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-4 py-2 backdrop-blur-md">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span
                className="text-sm text-white"
                style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
              >
                AI-powered
              </span>
            </div>
          </motion.div>

          {/* Form Component */}
          <CreateCourseForm />
        </div>
      </main>
    </ShaderBackground>
  )
}
