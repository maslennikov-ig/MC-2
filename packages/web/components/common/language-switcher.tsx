'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter, usePathname } from '@/src/i18n/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { setLocale } from '@/app/actions/i18n'
import { locales, type Locale } from '@/src/i18n/config'
import { cn } from '@/lib/utils'
import { getLocalPreferences, saveLocalPreferences } from '@/lib/user-preferences'

/**
 * Flag components for supported locales
 */
function RussianFlag({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-5 rounded-sm', className)} viewBox="0 0 640 480" aria-hidden="true">
      <g fillRule="evenodd" strokeWidth="1pt">
        <path fill="#fff" d="M0 0h640v480H0z" />
        <path fill="#0039a6" d="M0 160h640v320H0z" />
        <path fill="#d52b1e" d="M0 320h640v160H0z" />
      </g>
    </svg>
  )
}

function BritishFlag({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-5 rounded-sm', className)} viewBox="0 0 640 480" aria-hidden="true">
      <path fill="#012169" d="M0 0h640v480H0z" />
      <path
        fill="#FFF"
        d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-178L0 64V0h75z"
      />
      <path
        fill="#C8102E"
        d="m424 281 216 159v40L369 281h55zm-184 20 6 35L54 480H0l240-179zM640 0v3L391 191l2-44L590 0h50zM0 0l239 176h-60L0 42V0z"
      />
      <path fill="#FFF" d="M241 0v480h160V0H241zM0 160v160h640V160H0z" />
      <path fill="#C8102E" d="M0 193v96h640v-96H0zM273 0v480h96V0h-96z" />
    </svg>
  )
}

const FLAGS: Record<Locale, React.ComponentType<{ className?: string }>> = {
  ru: RussianFlag,
  en: BritishFlag,
}

const LANGUAGE_NAMES: Record<Locale, { native: string; english: string }> = {
  ru: { native: 'Русский', english: 'Russian' },
  en: { native: 'English', english: 'English' },
}

interface LanguageSwitcherProps {
  /** Variant: 'button' for header, 'menu-item' for use inside ProfileMenu */
  variant?: 'button' | 'menu-item'
  /** Additional class name */
  className?: string
  /** Force dark mode styling */
  darkMode?: boolean
  /** Show chevron indicator */
  showChevron?: boolean
  /** Compact mode - only flag, no text */
  compact?: boolean
}

/**
 * Language switcher component with flag icons and dropdown menu.
 *
 * @example
 * // In header (standalone button)
 * <LanguageSwitcher />
 *
 * @example
 * // Compact in header
 * <LanguageSwitcher compact showChevron={false} />
 *
 * @example
 * // Inside ProfileMenu (as menu item trigger)
 * <LanguageSwitcher variant="menu-item" />
 */
export function LanguageSwitcher({
  variant = 'button',
  className,
  darkMode = false,
  showChevron = true,
  compact = false,
}: LanguageSwitcherProps) {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('common')

  const CurrentFlag = FLAGS[locale]

  const handleLocaleChange = (newLocale: Locale) => {
    if (newLocale === locale) return

    startTransition(async () => {
      // 1. Save to userPreferences in localStorage
      const currentPrefs = getLocalPreferences()
      if (currentPrefs) {
        saveLocalPreferences({ ...currentPrefs, language: newLocale })
      }

      // 2. Set locale cookie
      await setLocale(newLocale)

      // 3. Navigate to new locale
      router.replace(pathname, { locale: newLocale })
    })
  }

  // For menu-item variant, render a simpler trigger for embedding
  if (variant === 'menu-item') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div
            className={cn(
              'flex w-full cursor-pointer items-center justify-between rounded-sm px-3 py-2',
              'hover:bg-accent focus:bg-accent',
              darkMode && 'hover:bg-slate-700 focus:bg-slate-700',
              className
            )}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-4 w-4 items-center justify-center">
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CurrentFlag className="h-4 w-5" />
                )}
              </div>
              <span>{LANGUAGE_NAMES[locale].native}</span>
            </div>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[160px]">
          {locales.map((loc) => {
            const Flag = FLAGS[loc]
            const isSelected = loc === locale
            return (
              <DropdownMenuItem
                key={loc}
                onClick={() => handleLocaleChange(loc)}
                className={cn('flex cursor-pointer items-center gap-3', isSelected && 'bg-accent')}
              >
                <Flag className="h-4 w-5" />
                <span className="flex-1">{LANGUAGE_NAMES[loc].native}</span>
                {isSelected && <Check className="text-primary h-4 w-4" />}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // Button variant for header
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          className={cn(
            'min-h-[44px] min-w-[44px] gap-2',
            darkMode && 'text-white/90 hover:bg-white/10 hover:text-white',
            className
          )}
          aria-label={t('metadata.title')} // Using existing translation as fallback
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CurrentFlag />}
          {!compact && <span className="text-xs font-medium uppercase">{locale}</span>}
          {showChevron && <ChevronDown className="h-3 w-3 opacity-50" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {locales.map((loc) => {
          const Flag = FLAGS[loc]
          const isSelected = loc === locale
          return (
            <DropdownMenuItem
              key={loc}
              onClick={() => handleLocaleChange(loc)}
              className={cn(
                'flex cursor-pointer items-center gap-3 py-2.5',
                isSelected && 'bg-accent'
              )}
            >
              <Flag className="h-4 w-5" />
              <div className="flex-1">
                <div className="font-medium">{LANGUAGE_NAMES[loc].native}</div>
                {loc !== locale && (
                  <div className="text-muted-foreground text-xs">{LANGUAGE_NAMES[loc].english}</div>
                )}
              </div>
              {isSelected && <Check className="text-primary h-4 w-4" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Re-export for backward compatibility
export default LanguageSwitcher
