'use client'

import { Link } from '@/src/i18n/navigation'
import { motion } from 'framer-motion'
import { BookOpen, Plus } from 'lucide-react'
import Logo from '@/components/common/logo'
import AuthButton from '@/components/common/auth-button'
import { LanguageSwitcher } from '@/components/common/language-switcher'
import { useSupabase } from '@/lib/supabase/browser-client'

interface HeaderProps {
  darkMode?: boolean
}

export default function Header({ darkMode = false }: HeaderProps = {}) {
  // Use the single source of truth from SupabaseProvider
  const { session, isLoading } = useSupabase()
  const isAuthenticated = !!session

  return (
    <>
      <motion.header
        className="relative z-20 flex items-center justify-between p-4 sm:p-6 lg:p-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        {/* Logo */}
        <div className="sm:hidden">
          <Logo variant="compact" size="sm" forceWhite={darkMode} />
        </div>
        <div className="hidden sm:block">
          <Logo variant="compact" size="md" forceWhite={darkMode} />
        </div>

        {/* Navigation - visible on all screen sizes */}
        <nav
          className="flex items-center space-x-2 sm:space-x-3"
          role="navigation"
          aria-label="Главное меню"
        >
          {!isLoading &&
            (isAuthenticated ? (
              <>
                <Link
                  href="/courses"
                  className={
                    darkMode
                      ? 'group flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-medium text-white/90 shadow-sm transition-all duration-200 hover:border-purple-500/30 hover:bg-purple-500/10 hover:text-purple-400 hover:shadow-md sm:gap-2 sm:px-4 sm:text-sm'
                      : 'group flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-3 py-2.5 text-xs font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-purple-200 hover:bg-purple-50 hover:text-purple-600 hover:shadow-md sm:gap-2 sm:px-4 sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:border-purple-500/30 dark:hover:bg-purple-500/10 dark:hover:text-purple-400'
                  }
                  aria-label="Просмотреть доступные курсы"
                >
                  <BookOpen
                    className={
                      darkMode
                        ? 'h-4 w-4 text-white/60 transition-colors group-hover:text-purple-400'
                        : 'h-4 w-4 text-gray-500 transition-colors group-hover:text-purple-600 dark:text-gray-400 dark:group-hover:text-purple-400'
                    }
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline">Каталог</span>
                </Link>
                <Link
                  href="/create"
                  className={
                    darkMode
                      ? 'group flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-purple-500/20 bg-gradient-to-r from-purple-500/5 to-blue-500/5 px-3 py-2.5 text-xs font-medium text-white/90 shadow-sm transition-all duration-200 hover:border-purple-500/30 hover:from-purple-500/10 hover:to-blue-500/10 hover:text-purple-400 hover:shadow-md sm:gap-2 sm:px-4 sm:text-sm'
                      : 'group flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50 px-3 py-2.5 text-xs font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-purple-300 hover:from-purple-100 hover:to-blue-100 hover:text-purple-600 hover:shadow-md sm:gap-2 sm:px-4 sm:text-sm dark:border-purple-500/20 dark:from-purple-500/5 dark:to-blue-500/5 dark:text-gray-300 dark:hover:border-purple-500/30 dark:hover:from-purple-500/10 dark:hover:to-blue-500/10 dark:hover:text-purple-400'
                  }
                  aria-label="Создать новый курс"
                >
                  <Plus
                    className={
                      darkMode
                        ? 'h-4 w-4 text-purple-400 transition-colors group-hover:text-purple-300'
                        : 'h-4 w-4 text-purple-600 transition-colors group-hover:text-purple-700 dark:text-purple-400 dark:group-hover:text-purple-300'
                    }
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline">Создать курс</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/courses"
                  className={
                    darkMode
                      ? 'group flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-medium text-white/90 shadow-sm transition-all duration-200 hover:border-purple-500/30 hover:bg-purple-500/10 hover:text-purple-400 hover:shadow-md sm:gap-2 sm:px-4 sm:text-sm'
                      : 'group flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-3 py-2.5 text-xs font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-purple-200 hover:bg-purple-50 hover:text-purple-600 hover:shadow-md sm:gap-2 sm:px-4 sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:border-purple-500/30 dark:hover:bg-purple-500/10 dark:hover:text-purple-400'
                  }
                  aria-label="Просмотреть примеры курсов"
                >
                  <BookOpen
                    className={
                      darkMode
                        ? 'h-4 w-4 text-white/60 transition-colors group-hover:text-purple-400'
                        : 'h-4 w-4 text-gray-500 transition-colors group-hover:text-purple-600 dark:text-gray-400 dark:group-hover:text-purple-400'
                    }
                    aria-hidden="true"
                  />
                  <span className="xs:inline hidden sm:inline">Примеры</span>
                  <span className="hidden sm:inline">курсов</span>
                </Link>
              </>
            ))}
        </nav>

        {/* Language & Auth - visible on all screen sizes */}
        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher darkMode={darkMode} compact showChevron={false} />
          <AuthButton darkMode={darkMode} forceWhiteDropdown={darkMode} />
        </div>
      </motion.header>
    </>
  )
}
