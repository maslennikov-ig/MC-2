'use client';

import { useState, useEffect, useCallback } from 'react';
import { logger } from '../client-logger';

/**
 * BeforeInstallPromptEvent interface
 * Not yet in TypeScript lib, so we define it here
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// LocalStorage keys
const DISMISSED_KEY = 'pwa-install-dismissed';
const DISMISSED_EXPIRY_DAYS = 7;

/**
 * Check if the current browser is iOS Safari
 * iOS Safari doesn't support beforeinstallprompt - users must use "Add to Home Screen"
 */
function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false;

  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  // @ts-expect-error - MSStream is IE-specific
  const isNotAndroid = !window.MSStream;

  return isIOS && isNotAndroid;
}

/**
 * Check if the app is already installed (running in standalone mode)
 */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  // Check for standalone display mode
  const standaloneQuery = window.matchMedia('(display-mode: standalone)');

  // Also check iOS-specific standalone property
  const isIOSStandalone = 'standalone' in window.navigator &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return standaloneQuery.matches || isIOSStandalone;
}

/**
 * Check if the user dismissed the prompt within the expiry period
 */
function isDismissedRecently(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const dismissedAt = localStorage.getItem(DISMISSED_KEY);
    if (!dismissedAt) return false;

    const dismissedTime = parseInt(dismissedAt, 10);
    const now = Date.now();
    const expiryMs = DISMISSED_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    return now - dismissedTime < expiryMs;
  } catch {
    return false;
  }
}

/**
 * Save dismiss timestamp to localStorage
 */
function saveDismissed(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
  } catch {
    // Ignore localStorage errors
  }
}

export interface UseInstallPromptReturn {
  /** Whether the install prompt can be shown */
  canInstall: boolean;
  /** Whether the app is already installed */
  isInstalled: boolean;
  /** Whether this is iOS Safari (different install flow) */
  isIOSSafari: boolean;
  /** Trigger the native install prompt */
  promptInstall: () => Promise<boolean>;
  /** Dismiss the prompt (won't show for 7 days) */
  dismissPrompt: () => void;
}

/**
 * Hook to manage PWA install prompt
 *
 * Features:
 * - Captures the beforeinstallprompt event
 * - Detects if already installed
 * - Handles iOS Safari separately (no native prompt)
 * - Respects user dismissal for 7 days
 *
 * @example
 * ```tsx
 * const { canInstall, isInstalled, promptInstall, dismissPrompt } = useInstallPrompt();
 *
 * if (canInstall) {
 *   return <Button onClick={promptInstall}>Install App</Button>;
 * }
 * ```
 */
export function useInstallPrompt(): UseInstallPromptReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(true); // Default to true to prevent flash
  const [isiOS, setIsIOS] = useState(false);
  const [wasDismissed, setWasDismissed] = useState(true); // Default to true to prevent flash

  // Initialize state on mount
  useEffect(() => {
    setIsInstalled(isStandalone());
    setIsIOS(isIOSSafari());
    setWasDismissed(isDismissedRecently());
  }, []);

  // Listen for beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      // Prevent Chrome 67+ from automatically showing the prompt
      event.preventDefault();

      // Store the event for later use
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      logger.devLog('[PWA] beforeinstallprompt captured');
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      logger.devLog('[PWA] App was installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Listen for display mode changes (in case app is installed while page is open)
  useEffect(() => {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');

    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };

    if (standaloneQuery.addEventListener) {
      standaloneQuery.addEventListener('change', handleChange);
    } else {
      // Fallback for older browsers
      standaloneQuery.addListener(handleChange);
    }

    return () => {
      if (standaloneQuery.removeEventListener) {
        standaloneQuery.removeEventListener('change', handleChange);
      } else {
        standaloneQuery.removeListener(handleChange);
      }
    };
  }, []);

  /**
   * Trigger the native install prompt
   * @returns true if user accepted, false if dismissed
   */
  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      logger.devLog('[PWA] No deferred prompt available');
      return false;
    }

    try {
      // Show the prompt
      await deferredPrompt.prompt();

      // Wait for user choice
      const { outcome } = await deferredPrompt.userChoice;

      logger.devLog(`[PWA] User choice: ${outcome}`);

      // Clear the deferred prompt - it can only be used once
      setDeferredPrompt(null);

      if (outcome === 'accepted') {
        setIsInstalled(true);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('[PWA] Error showing install prompt:', error);
      return false;
    }
  }, [deferredPrompt]);

  /**
   * Dismiss the prompt and don't show for 7 days
   */
  const dismissPrompt = useCallback(() => {
    saveDismissed();
    setWasDismissed(true);
    logger.devLog('[PWA] Install prompt dismissed');
  }, []);

  // Calculate canInstall
  // Can install if:
  // 1. Not already installed
  // 2. Not dismissed recently
  // 3. Not iOS Safari (they have their own install flow)
  // 4. Has a deferred prompt available
  const canInstall = !isInstalled && !wasDismissed && !isiOS && deferredPrompt !== null;

  return {
    canInstall,
    isInstalled,
    isIOSSafari: isiOS,
    promptInstall,
    dismissPrompt,
  };
}
