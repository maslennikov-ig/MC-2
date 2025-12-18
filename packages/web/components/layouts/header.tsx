"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { BookOpen, Plus } from "lucide-react"
import Logo from "@/components/common/logo"
import AuthButton from "@/components/common/auth-button"
import { useSupabase } from "@/lib/supabase/browser-client"

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
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {/* Logo */}
        <div className="sm:hidden">
          <Logo variant="compact" size="sm" forceWhite={darkMode} />
        </div>
        <div className="hidden sm:block">
          <Logo variant="compact" size="md" forceWhite={darkMode} />
        </div>

        {/* Navigation - visible on all screen sizes */}
        <nav className="flex items-center space-x-2 sm:space-x-3" role="navigation" aria-label="Главное меню">
          {!isLoading && (
            isAuthenticated ? (
              <>
                <Link
                  href="/courses"
                  className={darkMode
                    ? "group text-white/90 hover:text-purple-400 text-xs sm:text-sm font-medium px-3 sm:px-4 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-purple-500/10 hover:border-purple-500/30 transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center gap-1.5 sm:gap-2 shadow-sm hover:shadow-md"
                    : "group text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 text-xs sm:text-sm font-medium px-3 sm:px-4 py-2.5 rounded-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:border-purple-200 dark:hover:border-purple-500/30 transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center gap-1.5 sm:gap-2 shadow-sm hover:shadow-md"}
                  aria-label="Просмотреть доступные курсы"
                >
                  <BookOpen className={darkMode ? "w-4 h-4 text-white/60 group-hover:text-purple-400 transition-colors" : "w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors"} aria-hidden="true" />
                  <span className="hidden sm:inline">Каталог</span>
                </Link>
                <Link
                  href="/create"
                  className={darkMode
                    ? "group text-white/90 hover:text-purple-400 text-xs sm:text-sm font-medium px-3 sm:px-4 py-2.5 rounded-full bg-gradient-to-r from-purple-500/5 to-blue-500/5 border border-purple-500/20 hover:from-purple-500/10 hover:to-blue-500/10 hover:border-purple-500/30 transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center gap-1.5 sm:gap-2 shadow-sm hover:shadow-md"
                    : "group text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 text-xs sm:text-sm font-medium px-3 sm:px-4 py-2.5 rounded-full bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-500/5 dark:to-blue-500/5 border border-purple-200 dark:border-purple-500/20 hover:from-purple-100 hover:to-blue-100 dark:hover:from-purple-500/10 dark:hover:to-blue-500/10 hover:border-purple-300 dark:hover:border-purple-500/30 transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center gap-1.5 sm:gap-2 shadow-sm hover:shadow-md"}
                  aria-label="Создать новый курс"
                >
                  <Plus className={darkMode ? "w-4 h-4 text-purple-400 group-hover:text-purple-300 transition-colors" : "w-4 h-4 text-purple-600 dark:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors"} aria-hidden="true" />
                  <span className="hidden sm:inline">Создать курс</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/courses"
                  className={darkMode
                    ? "group text-white/90 hover:text-purple-400 text-xs sm:text-sm font-medium px-3 sm:px-4 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-purple-500/10 hover:border-purple-500/30 transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center gap-1.5 sm:gap-2 shadow-sm hover:shadow-md"
                    : "group text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 text-xs sm:text-sm font-medium px-3 sm:px-4 py-2.5 rounded-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:border-purple-200 dark:hover:border-purple-500/30 transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center gap-1.5 sm:gap-2 shadow-sm hover:shadow-md"}
                  aria-label="Просмотреть примеры курсов"
                >
                  <BookOpen className={darkMode ? "w-4 h-4 text-white/60 group-hover:text-purple-400 transition-colors" : "w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors"} aria-hidden="true" />
                  <span className="hidden xs:inline sm:inline">Примеры</span>
                  <span className="hidden sm:inline">курсов</span>
                </Link>
              </>
            )
          )}
        </nav>

        {/* Auth Button - visible on all screen sizes */}
        <div className="flex items-center">
          <AuthButton darkMode={darkMode} forceWhiteDropdown={darkMode} />
        </div>
      </motion.header>
    </>
  )
}