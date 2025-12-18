"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

interface AppThemeProviderProps {
  children: React.ReactNode
  attribute?: 'class' | 'data-theme' | 'data-mode'
  defaultTheme?: string
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
  storageKey?: string
  themes?: string[]
  forcedTheme?: string
  enableColorScheme?: boolean
  value?: { [themeName: string]: string }
  nonce?: string
}

export function AppThemeProvider({ children, ...props }: AppThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange={false}
      storageKey="theme"
      themes={['light', 'dark']}
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}