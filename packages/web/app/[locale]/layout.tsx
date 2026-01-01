import type { Metadata, Viewport } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { routing } from '@/src/i18n/routing';
import { Locale } from '@/src/i18n/config';
import { ErrorBoundary } from "@/components/common/error-boundary";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";
import { BackToTop } from "@/components/ui/back-to-top";
import { ServiceWorkerManager } from "@/components/pwa/ServiceWorkerManager";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import "../globals.css";
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

/**
 * PWA viewport configuration with theme color
 */
export const viewport: Viewport = {
  themeColor: '#667eea',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

/**
 * Generate static params for all supported locales.
 * This enables Next.js to pre-generate locale paths at build time,
 * improving performance even with dynamic rendering.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Generate localized metadata for SEO.
 * Uses translations from common.metadata namespace.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: 'common' });

  const ogLocale = locale === 'ru' ? 'ru_RU' : 'en_US';

  return {
    applicationName: 'MegaCampusAI',
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'MegaCampusAI',
    },
    title: {
      default: t('metadata.title'),
      template: '%s | MegaCampusAI',
    },
    description: t('metadata.description'),
    keywords: t('metadata.keywords').split(', '),
    authors: [{ name: 'MegaCampusAI Team' }],
    creator: 'MegaCampusAI',
    publisher: 'MegaCampusAI',
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
    alternates: {
      canonical: '/',
      languages: {
        ru: '/',
        en: '/en',
      },
    },
    openGraph: {
      type: 'website',
      locale: ogLocale,
      url: '/',
      siteName: 'MegaCampusAI',
      title: t('metadata.openGraph.title'),
      description: t('metadata.openGraph.description'),
      images: [
        {
          url: '/images/og-image.png',
          width: 1200,
          height: 630,
          alt: t('metadata.openGraph.title'),
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@courseai',
      creator: '@courseai',
      title: t('metadata.openGraph.title'),
      description: t('metadata.openGraph.description'),
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
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/*
          CRITICAL: Kill Switch - v3.0 (TEMPORARY)
          PWA is disabled. This script ALWAYS clears ALL caches and unregisters ALL SWs.
          This ensures ALL users get clean state after deployment.
        */}
        <Script
          id="sw-kill-switch"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var CLEARED_KEY = 'mc-sw-killed';

                  // Only run once per session to avoid infinite loop
                  if (sessionStorage.getItem(CLEARED_KEY)) {
                    console.log('[KillSwitch] Already cleared this session');
                    return;
                  }

                  var hadSW = false;
                  var hadCache = false;

                  // Unregister ALL service workers
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistrations().then(function(regs) {
                      if (regs.length > 0) {
                        hadSW = true;
                        console.log('[KillSwitch] Found ' + regs.length + ' SW(s), unregistering...');
                        return Promise.all(regs.map(function(r) { return r.unregister(); }));
                      }
                    }).then(function() {
                      if (hadSW) {
                        console.log('[KillSwitch] All SWs unregistered');
                      }
                    });
                  }

                  // Clear ALL caches
                  if ('caches' in window) {
                    caches.keys().then(function(keys) {
                      if (keys.length > 0) {
                        hadCache = true;
                        console.log('[KillSwitch] Found ' + keys.length + ' cache(s), deleting...');
                        return Promise.all(keys.map(function(k) { return caches.delete(k); }));
                      }
                    }).then(function() {
                      if (hadCache) {
                        console.log('[KillSwitch] All caches deleted');
                      }

                      // Mark as cleared and reload if we had SW or caches
                      if (hadSW || hadCache) {
                        sessionStorage.setItem(CLEARED_KEY, '1');
                        console.log('[KillSwitch] Reloading with clean state...');
                        setTimeout(function() { location.reload(); }, 100);
                      }
                    });
                  }

                  // Also listen for chunk errors just in case
                  window.addEventListener('error', function(e) {
                    var msg = (e.message || '').toLowerCase();
                    if (msg.includes('chunk') || msg.includes('failed to fetch')) {
                      console.log('[KillSwitch] Chunk error detected, forcing reload');
                      sessionStorage.setItem(CLEARED_KEY, '1');
                      location.reload();
                    }
                  });

                } catch(err) {
                  console.error('[KillSwitch] Error:', err);
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${manrope.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            <ErrorBoundary>
              {children}
              <BackToTop threshold={300} />
              <Toaster />
              <ServiceWorkerManager />
              <InstallPrompt />
            </ErrorBoundary>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
