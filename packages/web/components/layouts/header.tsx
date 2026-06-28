'use client'

import { Link } from '@/src/i18n/navigation'
import type { ReactNode } from 'react'

import { BookOpen, ChevronDown, FileText, Library, Plus } from 'lucide-react'
import Logo from '@/components/common/logo'
import AuthButton from '@/components/common/auth-button'
import { LanguageSwitcher } from '@/components/common/language-switcher'
import { useSupabase } from '@/lib/supabase/browser-client'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface HeaderProps {
  darkMode?: boolean
  sticky?: boolean
  surface?: 'transparent' | 'glass'
  className?: string
}

type ProductNavItemProps = {
  darkMode: boolean
  href: '/career-playbook' | '/courses'
  label: string
  ariaLabel: string
  menuLabel: string
  menuAriaLabel: string
  icon: ReactNode
  actions: Array<{
    href: string
    label: string
    ariaLabel: string
    icon: ReactNode
    primary?: boolean
  }>
  menuTriggerTestId?: string
  menuContentTestId?: string
}

export default function Header({
  darkMode = false,
  sticky = false,
  surface = 'transparent',
  className,
}: HeaderProps = {}) {
  const { isLoading } = useSupabase()
  const t = useTranslations('common.nav')
  const headerClassName = cn(
    'flex items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-4',
    sticky ? 'fixed inset-x-0 top-0 z-50 w-full' : 'relative z-20',
    surface === 'glass'
      ? darkMode
        ? 'border-b border-white/10 bg-slate-950/70 backdrop-blur-md'
        : 'border-b border-gray-200 bg-white/80 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/90'
      : null,
    className
  )

  const roleActions = [
    {
      href: '/career-playbook',
      label: t('roleDescriptionLanding'),
      ariaLabel: t('roleDescriptionsAria'),
      icon: <FileText className="h-4 w-4" aria-hidden="true" />,
    },
    {
      href: '/career-playbook/new?fresh=1',
      label: t('createRoleDescription'),
      ariaLabel: t('createRoleDescriptionAria'),
      icon: <Plus className="h-4 w-4" aria-hidden="true" />,
      primary: true,
    },
    {
      href: '/career-playbook/library',
      label: t('roleDescriptionLibrary'),
      ariaLabel: t('roleDescriptionLibraryAria'),
      icon: <Library className="h-4 w-4" aria-hidden="true" />,
    },
  ]

  const courseActions = [
    {
      href: '/courses',
      label: t('courseLanding'),
      ariaLabel: t('coursesAria'),
      icon: <BookOpen className="h-4 w-4" aria-hidden="true" />,
    },
    {
      href: '/create',
      label: t('createCourse'),
      ariaLabel: t('createCourseAria'),
      icon: <Plus className="h-4 w-4" aria-hidden="true" />,
      primary: true,
    },
    {
      href: '/courses/library',
      label: t('courseLibrary'),
      ariaLabel: t('courseLibraryAria'),
      icon: <Library className="h-4 w-4" aria-hidden="true" />,
    },
  ]

  return (
    <>
      <header className={headerClassName} data-testid="site-header">
        <div className="sm:hidden">
          <Logo variant="icon" showText={false} forceWhite={darkMode} />
        </div>
        <div className="hidden sm:block">
          <Logo variant="compact" size="md" forceWhite={darkMode} />
        </div>

        <nav
          className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2"
          role="navigation"
          aria-label={t('mainMenu')}
        >
          {!isLoading && (
            <>
              <ProductNavItem
                darkMode={darkMode}
                href="/career-playbook"
                label={t('roleDescriptions')}
                ariaLabel={t('roleDescriptionsAria')}
                menuLabel={t('roleDescriptions')}
                menuAriaLabel={t('roleDescriptionsMenuAria')}
                icon={<FileText className="h-4 w-4" aria-hidden="true" />}
                actions={roleActions}
                menuTriggerTestId="header-role-guides-menu-trigger"
                menuContentTestId="header-role-guides-menu"
              />
              <ProductNavItem
                darkMode={darkMode}
                href="/courses"
                label={t('courses')}
                ariaLabel={t('coursesAria')}
                menuLabel={t('courses')}
                menuAriaLabel={t('coursesMenuAria')}
                icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
                actions={courseActions}
                menuTriggerTestId="header-courses-menu-trigger"
                menuContentTestId="header-courses-menu"
              />
            </>
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <LanguageSwitcher darkMode={darkMode} compact showChevron={false} />
          <AuthButton darkMode={darkMode} forceWhiteDropdown={darkMode} />
        </div>
      </header>
      {sticky ? <div className="h-[68px] sm:h-[76px]" aria-hidden="true" /> : null}
    </>
  )
}

function ProductNavItem({
  darkMode,
  href,
  label,
  ariaLabel,
  menuLabel,
  menuAriaLabel,
  icon,
  actions,
  menuTriggerTestId,
  menuContentTestId,
}: ProductNavItemProps) {
  const shellClass = darkMode
    ? 'border-white/10 bg-white/5 text-white/90 hover:border-purple-500/30 hover:bg-purple-500/10 hover:text-purple-200'
    : 'border-gray-200 bg-white/75 text-gray-800 hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200 dark:hover:border-purple-500/30 dark:hover:bg-purple-500/10 dark:hover:text-purple-300'

  return (
    <div
      className={cn(
        'group flex min-h-[44px] min-w-[44px] items-center overflow-hidden rounded-lg border shadow-sm transition-all duration-200',
        shellClass
      )}
    >
      <Link
        href={href}
        aria-label={label}
        title={ariaLabel}
        className="flex min-h-[44px] items-center gap-1.5 px-3 text-xs font-medium sm:gap-2 sm:px-4 sm:text-sm"
      >
        {icon}
        <span className="hidden lg:inline">{label}</span>
      </Link>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          aria-label={menuAriaLabel}
          data-testid={menuTriggerTestId}
          className={cn(
            'flex min-h-[44px] min-w-[36px] items-center justify-center border-l px-2 transition outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
            darkMode ? 'border-white/10' : 'border-gray-200 dark:border-slate-700'
          )}
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          side="bottom"
          sideOffset={20}
          collisionPadding={16}
          data-testid={menuContentTestId}
          className="z-[80] w-[calc(100vw-2rem)] max-w-72 p-2"
        >
          <DropdownMenuLabel className="px-3 py-2 text-xs tracking-[0.14em] text-gray-500 uppercase dark:text-gray-400">
            {menuLabel}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {actions.map((action) => (
            <DropdownMenuItem key={action.href} asChild>
              <Link
                href={action.href}
                aria-label={action.ariaLabel}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm',
                  action.primary
                    ? 'font-semibold text-purple-700 dark:text-purple-300'
                    : 'text-gray-800 dark:text-gray-100'
                )}
              >
                {action.icon}
                <span>{action.label}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
