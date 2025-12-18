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

export default function CreatePageClientFull() {
  return (
    <ShaderBackground>
      <CreateMetadata />
      {/* Subtle dark vignette overlay for better contrast */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/20 pointer-events-none z-[5]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.15)_100%)] pointer-events-none z-[5]" />
      
      <CreateHeader />
      
      {/* Main Content */}
      <main className="relative z-10 min-h-screen">
        <div className="w-full px-4 sm:px-6 md:px-8 lg:px-12 py-4 sm:py-6 md:py-8 pb-12 sm:pb-16 md:pb-20">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-6 sm:mb-8 md:mb-12"
          >
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-2 sm:mb-3 md:mb-4"
                style={{ 
                  textShadow: '0 2px 10px rgba(0,0,0,0.8), 0 4px 20px rgba(0,0,0,0.5), 0 8px 40px rgba(0,0,0,0.3)' 
                }}>
              Создать новый курс
            </h1>
            <p className="text-xl text-white max-w-2xl mx-auto"
               style={{ 
                 textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 4px 16px rgba(0,0,0,0.5)' 
               }}>
              Загрузите материалы, и наш AI создаст полноценный образовательный курс
              с видео, аудио и интерактивными тестами
            </p>
          </motion.div>

          {/* Features Row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-wrap justify-center gap-2 sm:gap-3 md:gap-4 mb-6 sm:mb-8 md:mb-12"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-black/30 backdrop-blur-md rounded-full border border-white/20">
              <Zap className="w-4 h-4 text-purple-400" />
              <span className="text-white text-sm" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>Быстрая генерация</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-black/30 backdrop-blur-md rounded-full border border-white/20">
              <BookOpen className="w-4 h-4 text-purple-400" />
              <span className="text-white text-sm" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>Структурированные уроки</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-black/30 backdrop-blur-md rounded-full border border-white/20">
              <Video className="w-4 h-4 text-purple-400" />
              <span className="text-white text-sm" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>Мультимедиа контент</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-black/30 backdrop-blur-md rounded-full border border-white/20">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-white text-sm" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>AI-powered</span>
            </div>
          </motion.div>

          {/* Form Component */}
          <CreateCourseForm />
        </div>
      </main>
    </ShaderBackground>
  )
}