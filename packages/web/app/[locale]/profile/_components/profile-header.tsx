'use client'

import { Link } from '@/src/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Home, BookOpen, Plus, Sparkles } from 'lucide-react'
import Logo from '@/components/common/logo'
import AuthButton from '@/components/common/auth-button'
import ThemeToggle from '@/components/common/theme-toggle'
import { Button } from '@/components/ui/button'
import { useAuthModal } from '@/lib/hooks/use-auth-modal'
import { useSupabase } from '@/lib/supabase/browser-client'
import { usePathname } from '@/src/i18n/navigation'

export function ProfileHeader() {
  const t = useTranslations('profile')
  const { session } = useSupabase()
  const isAuthenticated = !!session
  const authModal = useAuthModal()
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm transition-colors duration-200 dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto max-w-[1920px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Left side - Logo */}
          <Logo variant="compact" size="md" />

          {/* Center - Navigation */}
          <nav className="absolute left-1/2 flex -translate-x-1/2 transform items-center gap-3">
            <Link
              href="/"
              className="group flex min-h-[42px] items-center gap-2 rounded-full border border-gray-300 bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-400 hover:bg-gray-200 hover:text-gray-900 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/50 dark:text-gray-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <Home className="h-4 w-4 text-gray-500 transition-colors group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-white" />
              <span>{t('header.goHome')}</span>
            </Link>
            <Link
              href="/courses"
              className="group flex min-h-[42px] items-center gap-2 rounded-full border border-gray-300 bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-gray-400 hover:bg-gray-200 hover:text-gray-900 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/50 dark:text-gray-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <BookOpen className="h-4 w-4 text-gray-500 transition-colors group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-white" />
              <span>{t('navigation.catalog')}</span>
            </Link>
            {isAuthenticated === true ? (
              <Link
                href="/create"
                className="group flex min-h-[42px] items-center gap-2 rounded-full border border-purple-300 bg-gradient-to-r from-purple-100 to-blue-100 px-4 py-2.5 text-sm font-medium text-purple-700 shadow-sm transition-all duration-200 hover:border-purple-400 hover:from-purple-200 hover:to-blue-200 hover:text-purple-900 hover:shadow-md dark:border-purple-500/20 dark:from-purple-600/10 dark:to-blue-600/10 dark:text-gray-300 dark:hover:border-purple-500/30 dark:hover:from-purple-600/20 dark:hover:to-blue-600/20 dark:hover:text-white"
              >
                <Plus className="h-4 w-4 text-purple-600 transition-colors group-hover:text-purple-700 dark:text-purple-400 dark:group-hover:text-purple-300" />
                <span>{t('navigation.createCourse')}</span>
              </Link>
            ) : isAuthenticated === false ? (
              <Button
                onClick={() => authModal.open('register', { returnTo: pathname })}
                className="flex min-h-[42px] items-center gap-2 !rounded-full border border-purple-300 bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:from-purple-700 hover:to-blue-700 hover:shadow-xl dark:border-purple-500/20"
              >
                <Sparkles className="h-4 w-4" />
                <span>{t('navigation.startFree')}</span>
              </Button>
            ) : null}
          </nav>

          {/* Right side - Theme toggle and Auth button */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>
      </div>
    </header>
  )
}
