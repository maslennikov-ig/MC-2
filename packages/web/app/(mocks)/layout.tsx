import localFont from 'next/font/local'
import { AppThemeProvider } from '@/components/common/app-theme-provider'
import '../globals.css'

// Served from this repository; see app/fonts/README.md.
const manrope = localFont({
  src: '../fonts/manrope-latin-cyrillic.woff2',
  variable: '--font-manrope',
  weight: '400 700',
  display: 'swap',
})

export const metadata = {
  title: 'Mocks - MegaCampusAI',
  description: 'Demo and mock pages for UI comparison',
}

export default function MocksLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={manrope.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  )
}
