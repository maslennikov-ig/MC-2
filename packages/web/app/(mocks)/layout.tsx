import { Manrope } from 'next/font/google'
import '../globals.css'

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata = {
  title: 'Mocks - MegaCampusAI',
  description: 'Demo and mock pages for UI comparison',
}

export default function MocksLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={manrope.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
