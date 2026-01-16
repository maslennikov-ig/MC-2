'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Home, BookOpen, Plus, User, Settings, LogOut, Sun, Moon, X, Loader2 } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/browser-client'
import { useThemeSync } from '@/lib/hooks/use-theme-sync'
import { useLocale } from 'next-intl'
import { useRouter, usePathname } from '@/src/i18n/navigation'
import { setLocale } from '@/app/actions/i18n'
import type { Locale } from '@/src/i18n/config'
import Logo from '@/components/common/logo'
import { cn } from '@/lib/utils'
import { RoleBadge } from '@/components/common/role-badge'

interface NavigationSheetProps {
  isOpen: boolean
  onClose: () => void
  isDark?: boolean
  /** Container element to portal into (for fullscreen support) */
  container?: HTMLElement | null
}

interface NavItem {
  id: string
  labelRu: string
  labelEn: string
  icon: React.ElementType
  href: string
  requiresAuth?: boolean
}

const navItems: NavItem[] = [
  { id: 'home', labelRu: 'Главная', labelEn: 'Home', icon: Home, href: '/' },
  { id: 'courses', labelRu: 'Каталог', labelEn: 'Catalog', icon: BookOpen, href: '/courses' },
  {
    id: 'create',
    labelRu: 'Создать курс',
    labelEn: 'Create Course',
    icon: Plus,
    href: '/create',
    requiresAuth: true,
  },
  {
    id: 'profile',
    labelRu: 'Профиль',
    labelEn: 'Profile',
    icon: User,
    href: '/profile',
    requiresAuth: true,
  },
  {
    id: 'settings',
    labelRu: 'Настройки',
    labelEn: 'Settings',
    icon: Settings,
    href: '/profile?tab=settings',
    requiresAuth: true,
  },
]

export function NavigationSheet({
  isOpen,
  onClose,
  isDark = true,
  container,
}: NavigationSheetProps) {
  const { session, supabase } = useSupabase()
  const { theme, toggleTheme } = useThemeSync()
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [mounted, setMounted] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)

  const isAuthenticated = !!session
  const user = session?.user

  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch user role
  useEffect(() => {
    if (!user?.id) {
      setUserRole(null)
      return
    }

    const fetchRole = async () => {
      const { data } = await supabase.from('users').select('role').eq('id', user.id).single()

      if (data) {
        setUserRole(data.role)
      }
    }

    fetchRole()
  }, [user?.id, supabase])

  // Generate initials
  const initials =
    user?.user_metadata?.full_name
      ?.split(' ')
      ?.map((n: string) => n[0])
      ?.join('')
      ?.toUpperCase() ||
    user?.email?.split('@')[0]?.slice(0, 2)?.toUpperCase() ||
    'U'

  // Handle sign out
  const handleSignOut = async () => {
    await supabase.auth.signOut()
    onClose()
    router.push('/')
  }

  // Handle language toggle - matches LanguageSwitcher pattern exactly
  const handleLanguageToggle = () => {
    const newLocale: Locale = locale === 'ru' ? 'en' : 'ru'
    startTransition(async () => {
      await setLocale(newLocale)
      router.replace(pathname, { locale: newLocale })
    })
  }

  const languageInfo = {
    ru: { flag: '🇷🇺', name: 'Русский', switchTo: 'English' },
    en: { flag: '🇬🇧', name: 'English', switchTo: 'Русский' },
  }

  // Filter nav items based on auth
  const visibleNavItems = navItems.filter((item) => !item.requiresAuth || isAuthenticated)

  // Handle navigation - close sheet first, then navigate
  // This is needed because in fullscreen mode, navigation may not work
  // if the sheet is still open in a portal container
  const handleNavigation = (href: string) => {
    onClose()
    // Small delay to ensure sheet closes before navigation
    setTimeout(() => {
      router.push(href as any)
    }, 50)
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className={cn(
          'flex w-[300px] flex-col p-0 sm:w-[350px]',
          isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
        )}
        hideCloseButton
        container={container}
      >
        {/* Accessibility: Hidden title for screen readers */}
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>

        {/* Header with Logo and Close */}
        <div
          className={cn(
            'flex items-center justify-between border-b p-4',
            isDark ? 'border-slate-700' : 'border-slate-200'
          )}
        >
          <div onClick={onClose}>
            <Logo variant="compact" size="sm" forceTheme={isDark ? 'dark' : 'light'} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className={cn(
              'h-8 w-8',
              isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* User Profile Section (if authenticated) */}
        {isAuthenticated && user && (
          <div
            className={cn(
              'border-b p-4',
              isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'
            )}
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                {user.user_metadata?.avatar_url && (
                  <AvatarImage
                    src={user.user_metadata.avatar_url}
                    alt={user.user_metadata?.full_name || 'User'}
                  />
                )}
                <AvatarFallback
                  className={cn(
                    'font-semibold',
                    isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'
                  )}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      'truncate text-sm font-semibold',
                      isDark ? 'text-white' : 'text-slate-900'
                    )}
                  >
                    {user.user_metadata?.full_name || locale === 'ru'
                      ? 'Мой аккаунт'
                      : 'My Account'}
                  </p>
                  {userRole && userRole !== 'student' && (
                    <RoleBadge
                      role={userRole as any}
                      className="px-1.5 py-0.5 text-xs"
                      showIcon={userRole === 'superadmin'}
                    />
                  )}
                </div>
                <p className={cn('truncate text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>
                  {user.email}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {visibleNavItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => handleNavigation(item.href)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                    isDark
                      ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">
                    {locale === 'ru' ? item.labelRu : item.labelEn}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Bottom Section: Theme, Language, Sign Out */}
        <div
          className={cn('space-y-1 border-t p-3', isDark ? 'border-slate-700' : 'border-slate-200')}
        >
          {/* Theme Toggle */}
          {mounted && (
            <button
              onClick={toggleTheme}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                isDark
                  ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              <span className="font-medium">
                {locale === 'ru' ? 'Переключить тему' : 'Toggle Theme'}
              </span>
            </button>
          )}

          {/* Language Toggle */}
          {mounted && (
            <button
              onClick={handleLanguageToggle}
              disabled={isPending}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                isDark
                  ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                isPending && 'cursor-wait opacity-70'
              )}
            >
              {isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <span className="w-5 text-center text-lg">{languageInfo[locale].flag}</span>
              )}
              <div className="flex flex-col items-start">
                <span className="font-medium">{languageInfo[locale].name}</span>
                <span className={cn('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>
                  → {languageInfo[locale].switchTo}
                </span>
              </div>
            </button>
          )}

          {/* Sign Out (if authenticated) */}
          {isAuthenticated && (
            <>
              <Separator className={isDark ? 'bg-slate-700' : 'bg-slate-200'} />
              <button
                onClick={() => void handleSignOut()}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                  isDark
                    ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                    : 'text-red-600 hover:bg-red-50 hover:text-red-700'
                )}
              >
                <LogOut className="h-5 w-5" />
                <span className="font-medium">{locale === 'ru' ? 'Выйти' : 'Sign Out'}</span>
              </button>
            </>
          )}

          {/* Sign In (if not authenticated) */}
          {!isAuthenticated && (
            <button
              onClick={() => handleNavigation('/auth/login')}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 font-medium transition-colors',
                'bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:from-purple-600 hover:to-indigo-700'
              )}
            >
              <User className="h-5 w-5" />
              {locale === 'ru' ? 'Войти' : 'Sign In'}
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
