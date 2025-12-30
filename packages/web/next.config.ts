import type { NextConfig } from "next";
import webpack from 'webpack';
import createNextIntlPlugin from 'next-intl/plugin';

// Read version from package.json for cache invalidation
const packageJson = require('./package.json');
const APP_VERSION = packageJson.version;

const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  disable: process.env.NODE_ENV === 'development',
  reloadOnOnline: true,
  // Custom worker with async helpers for workbox compatibility
  customWorkerSrc: 'worker',
  // CRITICAL: Disable start URL caching completely
  // Both options required per @ducanh2912/next-pwa docs
  cacheStartUrl: false,
  dynamicStartUrl: false,
  // Clean up outdated caches on deploy
  cleanupOutdatedCaches: true,
  // Version in cacheId for cache invalidation
  cacheId: `megacampus-${APP_VERSION}`,
  // Do NOT use default runtimeCaching (uses CacheFirst for JS = 502 after deploy)
  extendDefaultRuntimeCaching: false,
  // Exclude _next from precache - files change every build
  buildExcludes: [/app-build-manifest\.json$/, /\.map$/],
  publicExcludes: ['!_next/**/*'],
  // CRITICAL: All caching config must be inside workboxOptions to truly override defaults
  // Top-level skipWaiting is IGNORED - must be in workboxOptions!
  workboxOptions: {
    // CRITICAL: skipWaiting and clientsClaim MUST be inside workboxOptions
    // Top-level placement is silently ignored by Workbox
    // See: https://github.com/nicolo-ribaudo/next-pwa/issues/issues
    skipWaiting: false,  // Don't take control mid-session
    clientsClaim: false, // Don't claim clients immediately
    // Exclude JS/CSS/JSON from precache manifest
    exclude: [/\.js$/, /\.css$/, /\.json$/],
    // MINIMAL runtime caching - ONLY fonts, images, and media
    // NO JS/CSS/JSON - these change on every deploy and cause 502 errors when cached
    // The SW will NOT intercept any code-related requests
    runtimeCaching: [
    {
      // Google Fonts webfonts (woff2 files) - safe to cache long-term
      urlPattern: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts-webfonts',
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 365 * 24 * 60 * 60 // 1 year
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    },
    {
      // Google Fonts CSS - use StaleWhileRevalidate for font CSS
      urlPattern: /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'google-fonts-stylesheets',
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 7 * 24 * 60 * 60 // 1 week
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    },
    {
      // Local font files (woff, woff2, etc.)
      urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-font-assets',
        expiration: {
          maxEntries: 8,
          maxAgeSeconds: 365 * 24 * 60 * 60 // 1 year
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    },
    {
      // Images - safe to cache
      urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp|avif)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-image-assets',
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 7 * 24 * 60 * 60 // 1 week
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    },
    {
      // Next.js optimized images
      urlPattern: /\/_next\/image\?url=.+$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'next-image',
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 7 * 24 * 60 * 60 // 1 week
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    },
    {
      // Audio files
      urlPattern: /\.(?:mp3|wav|ogg|flac)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-audio-assets',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    },
    {
      // Video files
      urlPattern: /\.(?:mp4|webm|mov)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-video-assets',
        expiration: {
          maxEntries: 16,
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    }
    // NO JS/CSS/JSON rules - let the browser handle these directly
    // This prevents stale code from being served after deployments
    ]
  }
  // Removed fallbacks to avoid babel-loader requirement
})

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Exclude pino from bundling to fix worker thread errors during build
  // Pino uses thread-stream which requires native worker files
  // Also exclude shared-logger which imports pino as workspace dependency
  serverExternalPackages: [
    'pino',
    'pino-pretty',
    'thread-stream',
    '@megacampus/shared-logger',
    '@axiomhq/pino',
  ],
  // Expose app version to client for cache invalidation
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
  },
  // typedRoutes disabled - incompatible with [locale] dynamic segment in next-intl
  // Routes like "/" are not recognized with dynamic locale prefix
  typedRoutes: false,
  productionBrowserSourceMaps: false,
  compiler: {
    // Remove console.log, console.debug, console.info in production
    // Keep console.error and console.warn for debugging production issues
    removeConsole: {
      exclude: ['error', 'warn'],
    },
  },
  eslint: {
    dirs: ['app', 'components', 'lib', 'hooks', 'types'],
    ignoreDuringBuilds: true, // Speed up builds - lint separately in CI
  },
  typescript: {
    ignoreBuildErrors: false, // Keep type checking
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    qualities: [75, 90, 100], // Added qualities configuration for Next.js 16 compatibility
    dangerouslyAllowSVG: false,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'drive.google.com',
      }
    ],
    loader: 'default',
    loaderFile: undefined,
    domains: [], // deprecated in favor of remotePatterns
    path: '/_next/image',
    unoptimized: false,
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // Suppress Edge Runtime warnings for Supabase client
  // These warnings occur because Supabase uses Node.js APIs like process.versions
  // but they don't affect functionality in Edge Runtime
  webpack: (config, { isServer }) => {
    // === Pino worker thread fix ===
    // Pino uses thread-stream with worker threads that don't work when bundled.
    // Force pino and related packages to be loaded as external modules on server.
    if (isServer) {
      const externals = config.externals || [];
      config.externals = [
        ...externals,
        'pino',
        'pino-pretty',
        'thread-stream',
        '@megacampus/shared-logger',
      ];
    }

    // === ElkJS Web Worker suppression ===
    // ElkJS optionally requires 'web-worker' for Node.js environments.
    // In browser (Next.js client), this is unnecessary and causes build errors.
    // We use elk.bundled.js which doesn't need the worker.
    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^web-worker$/,
        contextRegExp: /elkjs\/lib$/,
      })
    );

    if (!isServer) {
      // Suppress specific warnings in client-side builds
      config.ignoreWarnings = [
        {
          module: /@supabase/,
          message: /.*process\.versions.*/,
        },
        {
          module: /@supabase/,
          message: /.*process\.version.*/,
        },
      ];

      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }

    // Exclude test files from production builds
    config.module.rules.push({
      test: /\.(test|spec)\.(ts|tsx|js|jsx)$/,
      use: 'ignore-loader'
    });

    // Exclude test directories from builds
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules',
        '**/.git',
        '**/tests/**',
        '**/__tests__/**',
        '**/*.test.*',
        '**/*.spec.*',
        '**/scripts/test-*'
      ]
    };

    return config;
  },
  async headers() {
    return [
      // Security headers for all pages
      {
        source: '/:path*',
        headers: [
          // Security Headers
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          // Content Security Policy - relaxed for development
          {
            key: 'Content-Security-Policy',
            value: process.env.NODE_ENV === 'development'
              ? `
                default-src 'self';
                script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com;
                style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
                font-src 'self' https://fonts.gstatic.com;
                img-src 'self' data: https: blob:;
                media-src 'self' https://drive.google.com https://*.googleusercontent.com https://*.supabase.co blob: data:;
                connect-src 'self' https://*.supabase.co wss://*.supabase.co ws://localhost:* http://localhost:* https://flow8n.ru https://drive.google.com https://www.react-grab.com;
                frame-src 'self' https://drive.google.com https://drive.usercontent.google.com https://*.googleusercontent.com https://www.youtube.com https://youtube.com;
                frame-ancestors 'none';
                base-uri 'self';
                form-action 'self';
                worker-src 'self';
              `.replace(/\s{2,}/g, ' ').trim()
              : `
                default-src 'self';
                script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net;
                style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
                font-src 'self' https://fonts.gstatic.com;
                img-src 'self' data: https: blob:;
                media-src 'self' https://drive.google.com https://*.googleusercontent.com https://*.supabase.co blob: data:;
                connect-src 'self' https://*.supabase.co wss://*.supabase.co https://flow8n.ru https://drive.google.com;
                frame-src 'self' https://drive.google.com https://drive.usercontent.google.com https://*.googleusercontent.com https://www.youtube.com https://youtube.com;
                frame-ancestors 'none';
                base-uri 'self';
                form-action 'self';
                worker-src 'self';
              `.replace(/\s{2,}/g, ' ').trim()
          }
        ]
      },
      // Specific CORS rules for API routes
      {
        source: '/api/courses/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NODE_ENV === 'development' 
              ? 'http://localhost:3000' 
              : 'https://megacampus.ai'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, X-API-Key'
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true'
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400'
          }
        ]
      },
      // Strict CORS for sensitive endpoints
      {
        source: '/api/content/generate',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NODE_ENV === 'development' 
              ? 'http://localhost:3000' 
              : 'https://megacampus.ai'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'POST, OPTIONS'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization'
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true'
          },
          {
            key: 'Access-Control-Max-Age',
            value: '0' // No preflight caching for security
          }
        ]
      }
    ]
  }
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

module.exports = withNextIntl(withPWA(nextConfig));