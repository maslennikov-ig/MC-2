'use client';

import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

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
            console.log(`[SW Manager] Deleting cache: ${cacheName}`);
            return caches.delete(cacheName);
          })
        );
      }

      // 2. Unregister all service workers (they will re-register on reload)
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(async (registration) => {
            console.log(`[SW Manager] Unregistering SW: ${registration.scope}`);
            return registration.unregister();
          })
        );
      }

      console.log('[SW Manager] All caches cleared successfully');
      return true;
    } catch (error) {
      console.error('[SW Manager] Error clearing caches:', error);
      return false;
    }
  }, []);

  /**
   * Handle version mismatch - clear caches and reload
   */
  const handleVersionMismatch = useCallback(async (oldVersion: string) => {
    console.log(`[SW Manager] Version mismatch detected: ${oldVersion} -> ${APP_VERSION}`);

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
      console.log(`[SW Manager] First visit, saved version: ${APP_VERSION}`);
      return;
    }

    if (savedVersion !== APP_VERSION) {
      // Version changed - clear caches
      handleVersionMismatch(savedVersion);
    } else {
      console.log(`[SW Manager] Version unchanged: ${APP_VERSION}`);
    }
  }, [handleVersionMismatch]);

  /**
   * Handle SW update events
   */
  const handleSWUpdate = useCallback((registration: ServiceWorkerRegistration) => {
    if (updatePending.current) return;
    updatePending.current = true;

    console.log('[SW Manager] New service worker available');

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
        console.log('[SW Manager] Cache updated:', event.data.payload);
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
        console.error('[SW Manager] Detected stale cache error, clearing...');
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
