'use client'

import { Link } from '@/src/i18n/navigation'

import { BookOpen, FileText, Plus } from 'lucide-react'
import Logo from '@/components/common/logo'
import AuthButton from '@/components/common/auth-button'
import { LanguageSwitcher } from '@/components/common/language-switcher'
import { useSupabase } from '@/lib/supabase/browser-client'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface HeaderProps {
  darkMode?: boolean
  sticky?: boolean
  surface?: 'transparent' | 'glass'
  className?: string
}

export default function Header({
  darkMode = false,
  sticky = false,
  surface = 'transparent',
  className,
}: HeaderProps = {}) {
  // Use the single source of truth from SupabaseProvider
  const { session, isLoading } = useSupabase()
  const isAuthenticated = !!session
  const t = useTranslations('common.nav')
  const roleDescriptionLinkClass = darkMode
    ? 'group flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-purple-500/25 bg-white/5 px-3 py-2.5 text-xs font-medium text-white/90 shadow-sm transition-all duration-200 hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-400 hover:shadow-md sm:gap-2 sm:px-4 sm:text-sm'
    : 'group flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-purple-200 bg-white/70 px-3 py-2.5 text-xs font-medium text-purple-700 shadow-sm transition-all duration-200 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-800 hover:shadow-md sm:gap-2 sm:px-4 sm:text-sm dark:border-purple-500/25 dark:bg-white/5 dark:text-gray-300 dark:hover:border-purple-500/40 dark:hover:bg-purple-500/10 dark:hover:text-purple-400'
  const roleDescriptionIconClass = darkMode
    ? 'h-4 w-4 text-purple-400 transition-colors group-hover:text-purple-300'
    : 'h-4 w-4 text-purple-600 transition-colors group-hover:text-purple-700 dark:text-purple-400 dark:group-hover:text-purple-300'
  const headerClassName = cn(
    'relative z-20 flex items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-4',
    sticky ? 'sticky top-0 z-50' : null,
    surface === 'glass'
      ? darkMode
        ? 'border-b border-white/10 bg-slate-950/70 backdrop-blur-md'
        : 'border-b border-gray-200 bg-white/80 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/90'
      : null,
    className
  )

  return (
    <header className={headerClassName}>
      {/* Logo */}
      <div className="sm:hidden">
        <Logo variant="icon" showText={false} forceWhite={darkMode} />
      </div>
      <div className="hidden sm:block">
        <Logo variant="compact" size="md" forceWhite={darkMode} />
      </div>

      {/* Navigation - visible on all screen sizes */}
      <nav
        className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-3"
        role="navigation"
        aria-label={t('mainMenu')}
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
                aria-label={t('catalogAria')}
              >
                <BookOpen
                  className={
                    darkMode
                      ? 'h-4 w-4 text-white/60 transition-colors group-hover:text-purple-400'
                      : 'h-4 w-4 text-gray-500 transition-colors group-hover:text-purple-600 dark:text-gray-400 dark:group-hover:text-purple-400'
                  }
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">{t('catalog')}</span>
              </Link>
              <Link
                href="/career-playbook/new"
                className={roleDescriptionLinkClass}
                aria-label={t('createRoleDescriptionAria')}
              >
                <FileText className={roleDescriptionIconClass} aria-hidden="true" />
                <span className="hidden lg:inline">{t('createRoleDescription')}</span>
              </Link>
              <Link
                href="/create"
                className={
                  darkMode
                    ? 'group flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-purple-500/20 bg-gradient-to-r from-purple-500/5 to-blue-500/5 px-3 py-2.5 text-xs font-medium text-white/90 shadow-sm transition-all duration-200 hover:border-purple-500/30 hover:from-purple-500/10 hover:to-blue-500/10 hover:text-purple-400 hover:shadow-md sm:gap-2 sm:px-4 sm:text-sm'
                    : 'group flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50 px-3 py-2.5 text-xs font-medium text-gray-700 shadow-sm transition-all duration-200 hover:border-purple-300 hover:from-purple-100 hover:to-blue-100 hover:text-purple-600 hover:shadow-md sm:gap-2 sm:px-4 sm:text-sm dark:border-purple-500/20 dark:from-purple-500/5 dark:to-blue-500/5 dark:text-gray-300 dark:hover:border-purple-500/30 dark:hover:from-purple-500/10 dark:hover:to-blue-500/10 dark:hover:text-purple-400'
                }
                aria-label={t('createCourseAria')}
              >
                <Plus
                  className={
                    darkMode
                      ? 'h-4 w-4 text-purple-400 transition-colors group-hover:text-purple-300'
                      : 'h-4 w-4 text-purple-600 transition-colors group-hover:text-purple-700 dark:text-purple-400 dark:group-hover:text-purple-300'
                  }
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">{t('createCourse')}</span>
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
                aria-label={t('examplesAria')}
              >
                <BookOpen
                  className={
                    darkMode
                      ? 'h-4 w-4 text-white/60 transition-colors group-hover:text-purple-400'
                      : 'h-4 w-4 text-gray-500 transition-colors group-hover:text-purple-600 dark:text-gray-400 dark:group-hover:text-purple-400'
                  }
                  aria-hidden="true"
                />
                <span className="xs:inline hidden sm:hidden">{t('examples')}</span>
                <span className="hidden sm:inline">{t('exampleCourses')}</span>
              </Link>
              <Link
                href="/career-playbook"
                className={roleDescriptionLinkClass}
                aria-label={t('createRoleDescriptionAria')}
              >
                <FileText className={roleDescriptionIconClass} aria-hidden="true" />
                <span className="hidden lg:inline">{t('createRoleDescription')}</span>
              </Link>
            </>
          ))}
      </nav>

      {/* Language & Auth - visible on all screen sizes */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <LanguageSwitcher darkMode={darkMode} compact showChevron={false} />
        <AuthButton darkMode={darkMode} forceWhiteDropdown={darkMode} />
      </div>
    </header>
  )
}
