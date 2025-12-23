'use client'

import { useState, useEffect } from 'react'
import { useThemeSync } from '@/lib/hooks/use-theme-sync'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { User, Settings, BookOpen, LogOut, Sun, Moon, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Link } from '@/src/i18n/navigation'
import { useLocale } from 'next-intl'
import { useRouter, usePathname } from '@/src/i18n/navigation'
import { setLocale } from '@/app/actions/i18n'
import type { Locale } from '@/src/i18n/config'
import { RoleBadge } from '@/components/common/role-badge'
import type { UserRole } from '@/types/database'

interface ProfileMenuProps {
  user: {
    id: string
    email: string
    name?: string
    image?: string
    role?: UserRole
  }
  onSignOut: () => Promise<void>
  className?: string
  darkMode?: boolean
  forceWhiteDropdown?: boolean
  showRoleBadge?: boolean
  customActions?: ProfileAction[]
  isLoading?: boolean
}

interface ProfileAction {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
  destructive?: boolean
  href?: string
}

export default function ProfileMenu({ 
  user, 
  onSignOut, 
  className,
  darkMode = false,
  forceWhiteDropdown = false,
  showRoleBadge = true,
  customActions = [],
  isLoading = false
}: ProfileMenuProps) {
  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isLocaleChanging, setIsLocaleChanging] = useState(false)
  const { theme, toggleTheme } = useThemeSync()

  // Locale switching
  const locale = useLocale() as Locale
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Generate initials from name or email
  const initials = user.name
    ?.split(' ')
    ?.map(n => n[0])
    ?.join('')
    ?.toUpperCase() || 
    user.email
    ?.split('@')[0]
    ?.slice(0, 2)
    ?.toUpperCase() || 'U'

  // Check if user should see role badge (non-student roles)
  const shouldShowRoleBadge = user.role && user.role !== 'student'

  // Handle sign out with error handling
  const handleSignOut = async () => {
    try {
      await onSignOut()
      setIsOpen(false)
    } catch {
      // Sign out failed - error will be handled by caller
    }
  }

  // Handle theme toggle
  const handleThemeToggle = () => {
    toggleTheme()
  }

  // Handle language toggle
  const handleLanguageToggle = async () => {
    const newLocale: Locale = locale === 'ru' ? 'en' : 'ru'
    setIsLocaleChanging(true)
    try {
      await setLocale(newLocale)
      router.replace(pathname, { locale: newLocale })
    } finally {
      setIsLocaleChanging(false)
    }
  }

  // Language display info
  const languageInfo = {
    ru: { flag: '🇷🇺', name: 'Русский', switchTo: 'English' },
    en: { flag: '🇬🇧', name: 'English', switchTo: 'Русский' }
  }

  // Handle menu item clicks
  const handleMenuItemClick = (action: ProfileAction) => {
    action.onClick()
    setIsOpen(false)
  }

  // Default navigation actions
  const defaultActions: ProfileAction[] = [
    {
      id: 'my-courses',
      label: 'Мои курсы',
      icon: BookOpen,
      onClick: () => {},
      href: '/courses'
    },
    {
      id: 'profile',
      label: 'Профиль',
      icon: User,
      onClick: () => {},
      href: '/profile'
    },
    {
      id: 'settings',
      label: 'Настройки',
      icon: Settings,
      onClick: () => {},
      href: '/profile?tab=settings'
    }
  ]

  // Show loading skeleton if loading
  if (isLoading) {
    return <Skeleton className="h-10 w-10 rounded-full" />
  }

  // Combine default and custom actions
  const allActions = [...defaultActions, ...customActions]

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className={cn(
            "relative h-10 w-10 rounded-full md:h-10 md:w-10 min-h-[44px] min-w-[44px]",
            darkMode && "hover:bg-white/10 text-white",
            className
          )}
          aria-label="Открыть меню профиля"
          aria-expanded={isOpen}
          aria-haspopup="menu"
        >
          <Avatar className="h-10 w-10">
            {user.image && (
              <AvatarImage src={user.image} alt={user.name || 'User'} />
            )}
            <AvatarFallback className={cn(
              "bg-primary text-primary-foreground font-medium",
              darkMode && "bg-white/20 text-white"
            )}>
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        className={cn(
          "w-72 p-2",
          forceWhiteDropdown && "bg-slate-800 border-slate-700"
        )} 
        align="end"
        sideOffset={8}
        role="menu"
        aria-label="Меню профиля"
      >
        {/* Profile Header */}
        <div className={cn(
          "flex items-center gap-3 p-3 rounded-lg mb-2",
          forceWhiteDropdown ? "bg-slate-700/50" : "bg-accent/50"
        )}>
          <Avatar className="h-12 w-12">
            {user.image && (
              <AvatarImage src={user.image} alt={user.name || 'User'} />
            )}
            <AvatarFallback className={cn(
              "bg-primary text-primary-foreground font-semibold text-lg",
              forceWhiteDropdown && "bg-white/20 text-white"
            )}>
              {initials}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className={cn(
                "font-semibold text-sm truncate",
                forceWhiteDropdown && "text-white"
              )}>
                {user.name || 'Мой аккаунт'}
              </p>
              {showRoleBadge && shouldShowRoleBadge && user.role && (
                <RoleBadge
                  role={user.role}
                  className="text-xs px-1.5 py-0.5"
                  showIcon={user.role === 'superadmin'}
                />
              )}
            </div>
            <p className={cn(
              "text-xs text-muted-foreground truncate",
              forceWhiteDropdown && "text-slate-400"
            )}>
              {user.email}
            </p>
          </div>
        </div>

        <DropdownMenuSeparator className={forceWhiteDropdown ? "bg-slate-700" : ""} />

        {/* Navigation Items */}
        {allActions.map((action) => (
          <DropdownMenuItem 
            key={action.id}
            asChild={!!action.href}
            role="menuitem"
            onSelect={() => !action.href && handleMenuItemClick(action)}
          >
            {action.href ? (
              <Link
                href={action.href as Parameters<typeof Link>['0']['href']}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 cursor-pointer",
                  forceWhiteDropdown && "text-white hover:bg-slate-700 focus:bg-slate-700",
                  action.destructive && "text-destructive focus:text-destructive"
                )}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <action.icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <span>{action.label}</span>
              </Link>
            ) : (
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 cursor-pointer",
                  forceWhiteDropdown && "text-white hover:bg-slate-700 focus:bg-slate-700",
                  action.destructive && "text-destructive focus:text-destructive"
                )}
                onClick={() => handleMenuItemClick(action)}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <action.icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <span>{action.label}</span>
              </div>
            )}
          </DropdownMenuItem>
        ))}

        {/* Theme Toggle */}
        {mounted && (
          <DropdownMenuItem
            role="menuitem"
            onSelect={handleThemeToggle}
            className={cn(
              "flex items-center gap-3 px-3 py-2 cursor-pointer",
              forceWhiteDropdown && "text-white hover:bg-slate-700 focus:bg-slate-700"
            )}
          >
            <div className="w-4 h-4 flex items-center justify-center">
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </div>
            <span>Переключить тему</span>
          </DropdownMenuItem>
        )}

        {/* Language Toggle */}
        {mounted && (
          <DropdownMenuItem
            role="menuitem"
            onSelect={handleLanguageToggle}
            disabled={isLocaleChanging}
            className={cn(
              "flex items-center gap-3 px-3 py-2 cursor-pointer",
              forceWhiteDropdown && "text-white hover:bg-slate-700 focus:bg-slate-700"
            )}
          >
            <div className="w-4 h-4 flex items-center justify-center">
              {isLocaleChanging ? (
                <Globe className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <span className="text-sm" aria-hidden="true">{languageInfo[locale].flag}</span>
              )}
            </div>
            <div className="flex flex-col">
              <span>{languageInfo[locale].name}</span>
              <span className="text-xs text-muted-foreground">
                → {languageInfo[locale].switchTo}
              </span>
            </div>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator className={forceWhiteDropdown ? "bg-slate-700" : ""} />

        {/* Sign Out */}
        <DropdownMenuItem
          role="menuitem"
          className={cn(
            "flex items-center gap-3 px-3 py-2 cursor-pointer",
            forceWhiteDropdown 
              ? "text-red-400 hover:bg-slate-700 focus:bg-slate-700 hover:text-red-400 focus:text-red-400" 
              : "text-destructive focus:text-destructive"
          )}
          onSelect={handleSignOut}
        >
          <div className="w-4 h-4 flex items-center justify-center">
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </div>
          <span>Выйти</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}