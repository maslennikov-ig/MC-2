import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ErrorBoundary } from "@/components/common/error-boundary";
import { Toaster } from "sonner";
// Theme provider moved to providers.tsx to fix hydration issues
import { Providers } from "./providers";
// import ThemeScript from "./theme-script"; // Removed to fix theme switching issue
import { BackToTop } from "@/components/ui/back-to-top";
import "./globals.css";
// KaTeX CSS for math formula rendering
import "katex/dist/katex.min.css";
import "@/components/markdown/styles/katex-overrides.css";
// Code Block styles with Shiki theme integration
import "@/components/markdown/styles/code-block.css";
// Task list checkbox styling for GFM
import "@/components/markdown/styles/task-list.css";

// Force dynamic rendering to ensure auth state is always fresh
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  manifest: '/manifest.json',
  title: {
    default: "MegaCampusAI - Автоматизированная генерация курсов",
    template: "%s | MegaCampusAI"
  },
  description: "Создавайте профессиональные образовательные курсы с помощью искусственного интеллекта. Автоматический анализ документов, структурирование материалов и генерация интерактивного контента.",
  keywords: ["курсы", "образование", "AI", "искусственный интеллект", "обучение", "онлайн курсы", "генерация курсов"],
  authors: [{ name: "MegaCampusAI Team" }],
  creator: "MegaCampusAI",
  publisher: "MegaCampusAI",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/',
    siteName: 'MegaCampusAI',
    title: 'MegaCampusAI - Автоматизированная генерация курсов',
    description: 'Создавайте профессиональные образовательные курсы с помощью искусственного интеллекта',
    images: [
      {
        url: '/images/og-image.png',
        width: 1200,
        height: 630,
        alt: 'MegaCampusAI - Автоматизированная генерация курсов',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@courseai',
    creator: '@courseai',
    title: 'MegaCampusAI - Автоматизированная генерация курсов',
    description: 'Создавайте профессиональные образовательные курсы с помощью искусственного интеллекта',
    images: ['/images/twitter-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon.ico', type: 'image/x-icon' },
    ],
    shortcut: '/icons/favicon.ico',
    apple: '/icons/favicon.svg',
    other: [
      {
        rel: 'icon',
        url: '/icons/favicon.svg',
        type: 'image/svg+xml',
      },
      {
        rel: 'mask-icon',
        url: '/icons/favicon.svg',
        color: '#667eea',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head />
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <Providers>
          <ErrorBoundary>
            {children}
            <BackToTop threshold={300} />
            <Toaster 
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'rgba(0, 0, 0, 0.95)',
                color: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                fontSize: '14px',
                lineHeight: '1.5',
                padding: '12px 16px',
                borderRadius: '12px',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.1)',
                maxWidth: '420px',
                wordBreak: 'break-word',
              },
              className: 'sonner-toast',
              duration: 5000,
            }}
            theme="dark"
            closeButton
            richColors
            expand={false}
            visibleToasts={3}
            gap={12}
            offset="24px"
          />
            </ErrorBoundary>
          </Providers>
      </body>
    </html>
  );
}
