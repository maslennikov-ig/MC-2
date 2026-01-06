import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Manrope, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/src/i18n/routing';
import { Locale } from '@/src/i18n/config';
import { ErrorBoundary } from "@/components/common/error-boundary";
import { InitialLoaderHide } from "@/components/common/initial-loader-hide";
import { PageTransitionLoader } from "@/components/common/page-transition-loader";
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
          CRITICAL: Initial page loader - renders BEFORE React hydration.
          This prevents white screen flash on slow connections.
          Theme is read from localStorage to match app theme.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  var isDark = theme === 'dark' ||
                    (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  document.documentElement.setAttribute('data-loader-theme', isDark ? 'dark' : 'light');
                } catch(e) {
                  // Silent failure acceptable - theme preference is optional enhancement
                  // localStorage may be unavailable in private browsing or restricted contexts
                }
              })();
            `,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              #initial-loader {
                position: fixed;
                inset: 0;
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                background: hsl(0 0% 100%);
                transition: opacity 0.3s ease-out;
              }
              html[data-loader-theme="dark"] #initial-loader {
                background: hsl(222 47% 11%);
              }
              #initial-loader.hidden {
                opacity: 0;
                pointer-events: none;
              }
              .il-container {
                position: relative;
                width: 100%;
                transform: rotate(-35deg);
              }
              .il-box {
                position: relative;
                left: -100px;
                display: flex;
                justify-content: center;
                align-items: center;
                width: calc(100% + 400px);
                -webkit-box-reflect: below 1px linear-gradient(transparent, rgba(0,0,0,0.3));
                animation: il-surface 1.5s ease-in-out infinite;
              }
              @keyframes il-surface {
                0% { transform: translateX(0); }
                100% { transform: translateX(-200px); }
              }
              .il-cube {
                position: relative;
                width: 200px;
                height: 200px;
                background: rgb(139 92 246);
                box-shadow: 0 0 5px rgba(139,92,246,1), 0 0 25px rgba(139,92,246,1), 0 0 50px rgba(139,92,246,1), 0 0 150px rgba(139,92,246,1);
                transform-origin: bottom right;
                animation: il-rotate 1.5s ease-in-out infinite;
              }
              @keyframes il-rotate {
                0% { transform: rotate(0deg); }
                60%,70%,80%,100% { transform: rotate(90deg); }
                65% { transform: rotate(85deg); }
                75% { transform: rotate(87.5deg); }
              }
            `,
          }}
        />
        {/* Cache invalidation on version change - prevents stale bundle errors */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var APP_VERSION = '${process.env.NEXT_PUBLIC_APP_VERSION || 'dev'}';
                  var STORAGE_KEY = 'mc-app-version';
                  var storedVersion = localStorage.getItem(STORAGE_KEY);

                  if (storedVersion && storedVersion !== APP_VERSION) {
                    console.log('[CacheInvalidator] Version changed: ' + storedVersion + ' -> ' + APP_VERSION);

                    // Clear all caches
                    if ('caches' in window) {
                      caches.keys().then(function(keys) {
                        if (keys.length > 0) {
                          console.log('[CacheInvalidator] Clearing ' + keys.length + ' cache(s)');
                          return Promise.all(keys.map(function(k) { return caches.delete(k); }));
                        }
                      }).then(function() {
                        localStorage.setItem(STORAGE_KEY, APP_VERSION);
                        console.log('[CacheInvalidator] Reloading with fresh bundles...');
                        location.reload();
                      });
                    } else {
                      localStorage.setItem(STORAGE_KEY, APP_VERSION);
                      location.reload();
                    }
                  } else if (!storedVersion) {
                    // First visit - just store version
                    localStorage.setItem(STORAGE_KEY, APP_VERSION);
                  }
                } catch(e) {
                  console.error('[CacheInvalidator] Error:', e);
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${manrope.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        {/* Initial loader - FIRST element, renders before React */}
        <div id="initial-loader" aria-label="Loading">
          <div className="il-container">
            <div className="il-box">
              <div className="il-cube" />
            </div>
          </div>
        </div>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            <InitialLoaderHide />
            <ErrorBoundary>
              <Suspense fallback={null}>
                <PageTransitionLoader />
              </Suspense>
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
