'use client';

import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { logger } from '@/lib/client-logger';

/**
 * Build version from package.json, exposed via next.config.ts
 * This changes on every deploy, allowing cache invalidation
 */
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
const VERSION_STORAGE_KEY = 'megacampus-app-version';

/**
 * ServiceWorkerManager - Handles PWA lifecycle and cache management
 *
 * Key features:
 * 1. Detects version changes and clears outdated caches
 * 2. Listens for SW updates and prompts user to reload
 * 3. Handles SW registration errors gracefully
 * 4. Prevents 502 errors after deploys by proactive cache cleanup
 *
 * @see https://developer.chrome.com/docs/workbox/modules/workbox-window/
 */
export function ServiceWorkerManager() {
  const hasCheckedVersion = useRef(false);
  const updatePending = useRef(false);

  /**
   * Clear all caches and unregister stale service workers
   */
  const clearAllCaches = useCallback(async (): Promise<boolean> => {
    try {
      // 1. Clear all Cache Storage entries
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(async (cacheName) => {
            logger.devLog(`[SW Manager] Deleting cache: ${cacheName}`);
            return caches.delete(cacheName);
          })
        );
      }

      // 2. Unregister all service workers (they will re-register on reload)
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(async (registration) => {
            logger.devLog(`[SW Manager] Unregistering SW: ${registration.scope}`);
            return registration.unregister();
          })
        );
      }

      logger.devLog('[SW Manager] All caches cleared successfully');
      return true;
    } catch (error) {
      logger.error('[SW Manager] Error clearing caches:', error);
      return false;
    }
  }, []);

  /**
   * Handle version mismatch - clear caches and reload
   */
  const handleVersionMismatch = useCallback(async (oldVersion: string) => {
    logger.info(`[SW Manager] Version mismatch detected: ${oldVersion} -> ${APP_VERSION}`);

    const cleared = await clearAllCaches();

    if (cleared) {
      // Save new version before reload
      localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION);

      // Show brief notification and reload
      toast.info('Updating to new version...', {
        duration: 1500,
      });

      // Small delay to show toast, then reload
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  }, [clearAllCaches]);

  /**
   * Check for version changes on mount
   */
  const checkVersion = useCallback(() => {
    if (hasCheckedVersion.current) return;
    hasCheckedVersion.current = true;

    const savedVersion = localStorage.getItem(VERSION_STORAGE_KEY);

    if (!savedVersion) {
      // First visit - just save version
      localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION);
      logger.devLog(`[SW Manager] First visit, saved version: ${APP_VERSION}`);
      return;
    }

    if (savedVersion !== APP_VERSION) {
      // Version changed - clear caches
      handleVersionMismatch(savedVersion);
    } else {
      logger.devLog(`[SW Manager] Version unchanged: ${APP_VERSION}`);
    }
  }, [handleVersionMismatch]);

  /**
   * Handle SW update events
   */
  const handleSWUpdate = useCallback((registration: ServiceWorkerRegistration) => {
    if (updatePending.current) return;
    updatePending.current = true;

    logger.info('[SW Manager] New service worker available');

    // Show toast with reload option
    toast.info('A new version is available', {
      duration: 10000,
      action: {
        label: 'Reload',
        onClick: async () => {
          // Skip waiting and claim clients
          registration.waiting?.postMessage({ type: 'SKIP_WAITING' });

          // Clear caches and reload
          await clearAllCaches();
          localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION);
          window.location.reload();
        },
      },
    });
  }, [clearAllCaches]);

  /**
   * Register SW update listener
   */
  const setupSWListener = useCallback(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then((registration) => {
      // Listen for new SW installations
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            // New SW is ready, prompt user
            handleSWUpdate(registration);
          }
        });
      });
    });

    // Listen for controller change (when new SW takes over)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!updatePending.current) {
        // SW changed without our intervention - reload to get fresh content
        window.location.reload();
      }
    });

    // Listen for messages from SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'CACHE_UPDATED') {
        logger.devLog('[SW Manager] Cache updated:', event.data.payload);
      }
    });
  }, [handleSWUpdate]);

  /**
   * Handle fetch errors that might indicate stale cache
   */
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const message = event.message?.toLowerCase() || '';
      const filename = event.filename?.toLowerCase() || '';

      // Detect chunk loading failures (common with stale caches)
      if (
        message.includes('loading chunk') ||
        message.includes('loading css chunk') ||
        message.includes('failed to fetch') ||
        filename.includes('_next/static')
      ) {
        logger.error('[SW Manager] Detected stale cache error, clearing...');
        clearAllCaches().then(() => {
          localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION);
          window.location.reload();
        });
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [clearAllCaches]);

  /**
   * Intercept fetch responses to detect 502/503 errors
   * This handles cases where server returns error for missing chunks after deploy
   */
  useEffect(() => {
    // Only intercept if we're in browser with service worker
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const originalFetch = window.fetch;
    let isClearing = false;

    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);

        // Detect 502/503 errors on static assets (likely stale cache after deploy)
        if ((response.status === 502 || response.status === 503) && !isClearing) {
          const input = args[0];
          const url = typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : input instanceof URL
                ? input.href
                : '';

          // Only act on Next.js static assets and page requests
          if (url.includes('/_next/') || url.includes('.js') || url.includes('.css')) {
            isClearing = true;
            logger.error(`[SW Manager] Detected ${response.status} on ${url}, clearing caches...`);

            await clearAllCaches();
            localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION);

            // Show toast and reload
            toast.info('Updating to new version...', { duration: 1500 });
            setTimeout(() => window.location.reload(), 500);
          }
        }

        return response;
      } catch (error) {
        // Re-throw the original error
        throw error;
      }
    };

    // Cleanup: restore original fetch on unmount
    return () => {
      window.fetch = originalFetch;
    };
  }, [clearAllCaches]);

  /**
   * Initialize on mount
   */
  useEffect(() => {
    // Check version first
    checkVersion();

    // Setup SW listeners
    setupSWListener();
  }, [checkVersion, setupSWListener]);

  // This component doesn't render anything
  return null;
}
