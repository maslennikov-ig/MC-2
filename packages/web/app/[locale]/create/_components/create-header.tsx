'use client'

import { Link } from '@/src/i18n/navigation'
import { motion } from 'framer-motion'
import { Home, BookOpen } from 'lucide-react'
import Logo from '@/components/common/logo'
import AuthButton from '@/components/common/auth-button'
import { useSupabase } from '@/lib/supabase/browser-client'

export function CreateHeader() {
  const { session } = useSupabase()
  const isAuthenticated = !!session

  return (
    <motion.header
      className="relative z-20 flex items-center justify-between p-4 sm:p-6 lg:p-8"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      {/* Logo */}
      <div className="sm:hidden">
        <Logo variant="compact" size="sm" forceWhite={true} />
      </div>
      <div className="hidden sm:block">
        <Logo variant="compact" size="md" forceWhite={true} />
      </div>

      {/* Center Navigation */}
      <nav
        className="absolute left-1/2 hidden -translate-x-1/2 transform items-center space-x-3 md:flex"
        role="navigation"
        aria-label="Навигация"
      >
        <Link
          href="/"
          className="group flex min-h-[44px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/90 shadow-sm transition-all duration-200 hover:border-purple-500/30 hover:bg-purple-500/10 hover:text-purple-400 hover:shadow-md"
          aria-label="Вернуться на главную страницу"
        >
          <Home
            className="h-4 w-4 text-white/60 transition-colors group-hover:text-purple-400"
            aria-hidden="true"
          />
          <span>Главная</span>
        </Link>

        {isAuthenticated && (
          <Link
            href="/courses"
            className="group flex min-h-[44px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/90 shadow-sm transition-all duration-200 hover:border-purple-500/30 hover:bg-purple-500/10 hover:text-purple-400 hover:shadow-md"
            aria-label="Просмотреть все курсы"
          >
            <BookOpen
              className="h-4 w-4 text-white/60 transition-colors group-hover:text-purple-400"
              aria-hidden="true"
            />
            <span>Мои курсы</span>
          </Link>
        )}
      </nav>

      {/* Auth Button */}
      <AuthButton darkMode={true} />
    </motion.header>
  )
}
