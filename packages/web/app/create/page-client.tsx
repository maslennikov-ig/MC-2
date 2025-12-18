"use client"

import dynamic from "next/dynamic"
import { CreateHeader } from "./_components/create-header"
import ShaderBackground from "@/components/layouts/shader-background"
import CreateMetadata from "@/components/common/create-metadata"
import { motion } from "framer-motion"
import { Sparkles, Zap, BookOpen, Video } from "lucide-react"

// Dynamic import for heavy form component with loading state
const CreateCourseForm = dynamic(
  () => import("@/components/forms/create-course-form"),
  { 
    loading: () => (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
      </div>
    ),
    ssr: false
  }
)

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
          <div className="max-w-4xl mx-auto text-center mb-12">
            <motion.h1 
              className="text-4xl md:text-5xl font-bold text-white mb-6"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              Создайте свой курс за минуты
            </motion.h1>
            
            <motion.p 
              className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
            >
              Используйте искусственный интеллект для автоматической генерации 
              профессионального образовательного контента
            </motion.p>

            {/* Features */}
            <motion.div 
              className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto mb-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
            >
              <div className="flex items-center justify-center gap-2 text-purple-300">
                <Zap className="w-5 h-5" />
                <span className="text-sm">Быстрая генерация</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-blue-300">
                <BookOpen className="w-5 h-5" />
                <span className="text-sm">Структурированный контент</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-green-300">
                <Video className="w-5 h-5" />
                <span className="text-sm">Мультимедиа поддержка</span>
              </div>
            </motion.div>
          </div>

          {/* Form Card */}
          <motion.div 
            className="max-w-2xl mx-auto"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            <div className="relative">
              {/* Decorative elements */}
              <div className="absolute -top-4 -left-4 w-24 h-24 bg-purple-500/20 rounded-full blur-xl" />
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-blue-500/20 rounded-full blur-xl" />
              
              <div className="relative bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl">
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles className="w-6 h-6 text-purple-400" />
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