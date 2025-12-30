import type { Metadata } from "next";
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
    manifest: '/manifest.json',
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
          CRITICAL: Emergency SW cleanup script - v2.0
          This runs BEFORE any JS bundles load to fix stuck users with stale cache.
          - On version change: immediately clears ALL caches and reloads
          - On chunk load error: clears caches and retries (with loop protection)
        */}
        <Script
          id="sw-emergency-cleanup"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var APP_VERSION = '${process.env.NEXT_PUBLIC_APP_VERSION || 'dev'}';
                  var VERSION_KEY = 'mc-app-version';
                  var CLEARING_KEY = 'mc-clearing';
                  var RETRY_KEY = 'mc-retry';

                  // Skip if we're in the middle of clearing (prevents loop)
                  if (sessionStorage.getItem(CLEARING_KEY)) {
                    sessionStorage.removeItem(CLEARING_KEY);
                    console.log('[CacheBuster] Cleared caches, continuing with fresh state');
                    return;
                  }

                  var savedVersion = localStorage.getItem(VERSION_KEY);
                  var versionChanged = savedVersion && savedVersion !== APP_VERSION;

                  // CASE 1: Version changed - clear everything and reload
                  if (versionChanged) {
                    console.log('[CacheBuster] Version changed: ' + savedVersion + ' → ' + APP_VERSION);
                    localStorage.setItem(VERSION_KEY, APP_VERSION);
                    sessionStorage.setItem(CLEARING_KEY, '1');

                    // Clear all caches
                    if ('caches' in window) {
                      caches.keys().then(function(keys) {
                        return Promise.all(keys.map(function(k) { return caches.delete(k); }));
                      }).then(function() {
                        console.log('[CacheBuster] Caches cleared');
                      });
                    }

                    // Unregister all service workers
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.getRegistrations().then(function(regs) {
                        return Promise.all(regs.map(function(r) { return r.unregister(); }));
                      }).then(function() {
                        console.log('[CacheBuster] SWs unregistered, reloading...');
                        setTimeout(function() { location.reload(); }, 100);
                      });
                    } else {
                      setTimeout(function() { location.reload(); }, 100);
                    }
                    return; // Stop execution - page will reload
                  }

                  // CASE 2: First visit - just save version
                  if (!savedVersion) {
                    localStorage.setItem(VERSION_KEY, APP_VERSION);
                  }

                  // CASE 3: Error recovery for chunk loading failures
                  var MAX_RETRIES = 3;
                  var COOLDOWN_MS = 60000;

                  window.addEventListener('error', function(e) {
                    var msg = (e.message || '').toLowerCase();
                    var isChunkError = msg.includes('loading chunk') ||
                                       msg.includes('failed to fetch') ||
                                       msg.includes('chunkloaderror') ||
                                       msg.includes('dynamically imported module');

                    if (!isChunkError) return;

                    var now = Date.now();
                    var retryData = JSON.parse(sessionStorage.getItem(RETRY_KEY) || '{"count":0,"time":0}');

                    // Reset if cooldown passed
                    if (now - retryData.time > COOLDOWN_MS) {
                      retryData.count = 0;
                    }

                    if (retryData.count < MAX_RETRIES) {
                      console.log('[CacheBuster] Chunk error, retry ' + (retryData.count + 1) + '/' + MAX_RETRIES);
                      sessionStorage.setItem(RETRY_KEY, JSON.stringify({count: retryData.count + 1, time: now}));
                      sessionStorage.setItem(CLEARING_KEY, '1');

                      // Clear caches and reload
                      if ('caches' in window) {
                        caches.keys().then(function(keys) {
                          return Promise.all(keys.map(function(k) { return caches.delete(k); }));
                        });
                      }
                      if ('serviceWorker' in navigator) {
                        navigator.serviceWorker.getRegistrations().then(function(regs) {
                          regs.forEach(function(r) { r.unregister(); });
                        });
                      }

                      setTimeout(function() { location.reload(); }, 150);
                    } else {
                      console.error('[CacheBuster] Max retries reached. Manual cache clear needed.');
                    }
                  });

                } catch(err) {
                  console.error('[CacheBuster] Error:', err);
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
            </ErrorBoundary>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
