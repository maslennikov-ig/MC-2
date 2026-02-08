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

export default function CreatePageClient() {
  return (
    <ShaderBackground>
      <CreateMetadata />
      <CreateHeader />

      <main className="relative z-10 container mx-auto px-4 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Hero Section */}
          <div className="mx-auto mb-12 max-w-4xl text-center">
            <motion.h1
              className="mb-6 text-4xl font-bold text-white md:text-5xl"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              Создайте свой курс за минуты
            </motion.h1>

            <motion.p
              className="mx-auto mb-8 max-w-2xl text-lg text-gray-300"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
            >
              Используйте искусственный интеллект для автоматической генерации профессионального
              образовательного контента
            </motion.p>

            {/* Features */}
            <motion.div
              className="mx-auto mb-12 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
            >
              <div className="flex items-center justify-center gap-2 text-purple-300">
                <Zap className="h-5 w-5" />
                <span className="text-sm">Быстрая генерация</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-blue-300">
                <BookOpen className="h-5 w-5" />
                <span className="text-sm">Структурированный контент</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-green-300">
                <Video className="h-5 w-5" />
                <span className="text-sm">Мультимедиа поддержка</span>
              </div>
            </motion.div>
          </div>

          {/* Form Card */}
          <motion.div
            className="mx-auto max-w-2xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            <div className="relative">
              {/* Decorative elements */}
              <div className="absolute -top-4 -left-4 h-24 w-24 rounded-full bg-purple-500/20 blur-xl" />
              <div className="absolute -right-4 -bottom-4 h-32 w-32 rounded-full bg-blue-500/20 blur-xl" />

              <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-lg md:p-8">
                <div className="mb-6 flex items-center gap-2">
                  <Sparkles className="h-6 w-6 text-purple-400" />
                  <h2 className="text-2xl font-semibold text-white">Новый курс</h2>
                </div>

                <CreateCourseForm />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </main>
    </ShaderBackground>
  )
}
