"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { useAuthModal } from "@/lib/hooks/use-auth-modal"
import { useSupabase } from "@/lib/supabase/browser-client"

export default function HeroContent() {
  const { session } = useSupabase()
  const isAuthenticated = !!session
  const { open } = useAuthModal()

  return (
    <motion.main 
      className="absolute bottom-4 sm:bottom-6 md:bottom-8 left-4 sm:left-6 md:left-8 right-4 sm:right-auto z-20 max-w-full sm:max-w-2xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <div className="text-left">
        <motion.div
          className="inline-flex items-center px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm mb-3 sm:mb-4 md:mb-5 relative"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          style={{
            filter: "url(#glass-effect)",
            textShadow: "0 2px 4px rgba(0,0,0,0.3)"
          }}
        >
          <div className="absolute top-0 left-1 right-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-full" />
          <span className="text-white/95 text-xs font-normal relative z-10">✨ Новая эра образования с AI</span>
        </motion.div>

        {/* Main Heading - Using responsive typography scale */}
        <motion.h1 
          className="heading-1 text-white mb-3 sm:mb-4 md:mb-6"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          style={{ textShadow: "0 4px 8px rgba(0,0,0,0.4)" }}
        >
          <span className="font-medium italic">MegaCampusAI</span>
          <span className="font-light"> создавайте</span>
          <br />
          <motion.span 
            className="font-light tracking-tight text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            курсы в один клик
          </motion.span>
        </motion.h1>

        {/* Description - Using body-large class */}
        <motion.p 
          className="body-large font-light text-white/85 mb-4 sm:mb-5 md:mb-6 max-w-full sm:max-w-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          style={{ textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}
        >
          Автоматизированная система генерации образовательных курсов. 
          Загружайте документы, получайте полноценные курсы с видео, 
          аудио и тестами за считанные минуты.
        </motion.p>

        {/* Conditional CTA Buttons */}
        <motion.div 
          className="flex flex-col gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          {isAuthenticated === true ? (
            // Authenticated user - show course actions
            <div className="flex items-center gap-4 flex-wrap">
              <Link 
                href="/courses" 
                className="inline-flex items-center justify-center px-6 sm:px-8 py-2.5 sm:py-3 rounded-full bg-transparent border-2 border-white/40 text-white font-medium text-sm transition-all duration-300 hover:bg-white/10 hover:border-white/60 hover:scale-105"
                style={{ textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}
              >
                Смотреть курсы
              </Link>
              <Link
                href="/create"
                className="relative isolate inline-flex items-center justify-center px-6 sm:px-8 py-2.5 sm:py-3 rounded-full font-semibold text-sm transition-all duration-300 hover:scale-105 shadow-lg before:absolute before:inset-0 before:rounded-full before:bg-white before:-z-10"
                style={{ color: '#111827' }}
              >
                Создать курс
              </Link>
            </div>
          ) : isAuthenticated === false ? (
            // Non-authenticated user - show auth actions
            <>
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={() => open('register')}
                  className="inline-flex items-center justify-center px-6 sm:px-8 py-2.5 sm:py-3 rounded-full bg-transparent border-2 border-white/40 text-white font-medium text-sm transition-all duration-300 hover:bg-white/10 hover:border-white/60 hover:scale-105"
                  style={{ textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}
                >
                  Начать бесплатно
                </button>
                <button
                  onClick={() => open('login')}
                  className="relative isolate inline-flex items-center justify-center px-6 sm:px-8 py-2.5 sm:py-3 rounded-full font-semibold text-sm transition-all duration-300 hover:scale-105 shadow-lg before:absolute before:inset-0 before:rounded-full before:bg-white before:-z-10"
                  style={{ color: '#111827' }}
                >
                  Войти
                </button>
              </div>
              {/* Additional link for exploring */}
              <motion.div
                className="mt-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 1 }}
              >
                <Link
                  href="/courses"
                  className="inline-flex items-center min-h-[44px] min-w-[44px] text-white text-sm hover:text-white transition-colors underline underline-offset-4 decoration-white/50 hover:decoration-white"
                  style={{ textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}
                >
                  или посмотрите примеры курсов →
                </Link>
              </motion.div>
            </>
          ) : null}
        </motion.div>
      </div>
    </motion.main>
  )
}