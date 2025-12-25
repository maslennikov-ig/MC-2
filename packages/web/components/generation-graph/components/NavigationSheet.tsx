'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Home,
  BookOpen,
  Plus,
  User,
  Settings,
  LogOut,
  Sun,
  Moon,
  X,
  Loader2,
} from 'lucide-react';
import { useSupabase } from '@/lib/supabase/browser-client';
import { useThemeSync } from '@/lib/hooks/use-theme-sync';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/src/i18n/navigation';
import { setLocale } from '@/app/actions/i18n';
import type { Locale } from '@/src/i18n/config';
import Logo from '@/components/common/logo';
import { cn } from '@/lib/utils';
import { RoleBadge } from '@/components/common/role-badge';

interface NavigationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  isDark?: boolean;
  /** Container element to portal into (for fullscreen support) */
  container?: HTMLElement | null;
}

interface NavItem {
  id: string;
  labelRu: string;
  labelEn: string;
  icon: React.ElementType;
  href: string;
  requiresAuth?: boolean;
}

const navItems: NavItem[] = [
  { id: 'home', labelRu: 'Главная', labelEn: 'Home', icon: Home, href: '/' },
  { id: 'courses', labelRu: 'Каталог', labelEn: 'Catalog', icon: BookOpen, href: '/courses' },
  { id: 'create', labelRu: 'Создать курс', labelEn: 'Create Course', icon: Plus, href: '/create', requiresAuth: true },
  { id: 'profile', labelRu: 'Профиль', labelEn: 'Profile', icon: User, href: '/profile', requiresAuth: true },
  { id: 'settings', labelRu: 'Настройки', labelEn: 'Settings', icon: Settings, href: '/profile?tab=settings', requiresAuth: true },
];

export function NavigationSheet({ isOpen, onClose, isDark = true, container }: NavigationSheetProps) {
  const { session, supabase } = useSupabase();
  const { theme, toggleTheme } = useThemeSync();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const isAuthenticated = !!session;
  const user = session?.user;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch user role
  useEffect(() => {
    if (!user?.id) {
      setUserRole(null);
      return;
    }

    const fetchRole = async () => {
      const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (data) {
        setUserRole(data.role);
      }
    };

    fetchRole();
  }, [user?.id, supabase]);

  // Generate initials
  const initials = user?.user_metadata?.full_name
    ?.split(' ')
    ?.map((n: string) => n[0])
    ?.join('')
    ?.toUpperCase() ||
    user?.email
    ?.split('@')[0]
    ?.slice(0, 2)
    ?.toUpperCase() || 'U';

  // Handle sign out
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onClose();
    router.push('/');
  };

  // Handle language toggle - matches LanguageSwitcher pattern exactly
  const handleLanguageToggle = () => {
    const newLocale: Locale = locale === 'ru' ? 'en' : 'ru';
    startTransition(async () => {
      await setLocale(newLocale);
      router.replace(pathname, { locale: newLocale });
    });
  };

  const languageInfo = {
    ru: { flag: '🇷🇺', name: 'Русский', switchTo: 'English' },
    en: { flag: '🇬🇧', name: 'English', switchTo: 'Русский' },
  };

  // Filter nav items based on auth
  const visibleNavItems = navItems.filter(
    (item) => !item.requiresAuth || isAuthenticated
  );

  // Handle navigation - navigate immediately, sheet will close naturally
  const handleNavigation = (href: string) => {
    router.push(href as any);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className={cn(
          'w-[300px] sm:w-[350px] flex flex-col p-0',
          isDark
            ? 'bg-slate-900 border-slate-700'
            : 'bg-white border-slate-200'
        )}
        hideCloseButton
        container={container}
      >
        {/* Accessibility: Hidden title for screen readers */}
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>

        {/* Header with Logo and Close */}
        <div className={cn(
          'flex items-center justify-between p-4 border-b',
          isDark ? 'border-slate-700' : 'border-slate-200'
        )}>
          <div onClick={onClose}>
            <Logo
              variant="compact"
              size="sm"
              forceTheme={isDark ? 'dark' : 'light'}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className={cn(
              'h-8 w-8',
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            )}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* User Profile Section (if authenticated) */}
        {isAuthenticated && user && (
          <div className={cn(
            'p-4 border-b',
            isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'
          )}>
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                {user.user_metadata?.avatar_url && (
                  <AvatarImage src={user.user_metadata.avatar_url} alt={user.user_metadata?.full_name || 'User'} />
                )}
                <AvatarFallback className={cn(
                  'font-semibold',
                  isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'
                )}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={cn(
                    'font-semibold text-sm truncate',
                    isDark ? 'text-white' : 'text-slate-900'
                  )}>
                    {user.user_metadata?.full_name || locale === 'ru' ? 'Мой аккаунт' : 'My Account'}
                  </p>
                  {userRole && userRole !== 'student' && (
                    <RoleBadge
                      role={userRole as any}
                      className="text-xs px-1.5 py-0.5"
                      showIcon={userRole === 'superadmin'}
                    />
                  )}
                </div>
                <p className={cn(
                  'text-xs truncate',
                  isDark ? 'text-slate-400' : 'text-slate-500'
                )}>
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
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left',
                    isDark
                      ? 'text-slate-300 hover:text-white hover:bg-slate-800'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
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
        <div className={cn(
          'border-t p-3 space-y-1',
          isDark ? 'border-slate-700' : 'border-slate-200'
        )}>
          {/* Theme Toggle */}
          {mounted && (
            <button
              onClick={toggleTheme}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                isDark
                  ? 'text-slate-300 hover:text-white hover:bg-slate-800'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
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
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                isDark
                  ? 'text-slate-300 hover:text-white hover:bg-slate-800'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
                isPending && 'opacity-70 cursor-wait'
              )}
            >
              {isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <span className="text-lg w-5 text-center">{languageInfo[locale].flag}</span>
              )}
              <div className="flex flex-col items-start">
                <span className="font-medium">{languageInfo[locale].name}</span>
                <span className={cn(
                  'text-xs',
                  isDark ? 'text-slate-500' : 'text-slate-400'
                )}>
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
                onClick={handleSignOut}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                  isDark
                    ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
                    : 'text-red-600 hover:text-red-700 hover:bg-red-50'
                )}
              >
                <LogOut className="h-5 w-5" />
                <span className="font-medium">
                  {locale === 'ru' ? 'Выйти' : 'Sign Out'}
                </span>
              </button>
            </>
          )}

          {/* Sign In (if not authenticated) */}
          {!isAuthenticated && (
            <button
              onClick={() => handleNavigation('/auth/login')}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg font-medium transition-colors',
                'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white'
              )}
            >
              <User className="h-5 w-5" />
              {locale === 'ru' ? 'Войти' : 'Sign In'}
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
