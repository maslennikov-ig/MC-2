'use client';

import { useCallback } from 'react';
import { logger } from '../client-logger';

/**
 * PWA Analytics event types
 */
export type PWAEventType =
  // Install prompt events
  | 'install_prompt_shown'
  | 'install_accepted'
  | 'install_dismissed'
  | 'install_error'
  // Push notification events
  | 'push_subscribed'
  | 'push_unsubscribed'
  | 'push_error';

/**
 * Optional event properties
 */
export interface PWAEventProperties {
  error?: string;
  action?: string;
  [key: string]: unknown;
}

export interface UsePWAAnalyticsReturn {
  /** Track a PWA-related event */
  trackEvent: (event: PWAEventType, properties?: PWAEventProperties) => void;
}

/**
 * Hook for tracking PWA-related analytics events
 *
 * Events are sent to the backend and stored for admin dashboard analysis.
 * All tracking is fire-and-forget - failures are silently ignored to not
 * impact user experience.
 *
 * @example
 * ```tsx
 * const { trackEvent } = usePWAAnalytics();
 * trackEvent('install_accepted');
 * trackEvent('push_error', { error: 'Permission denied' });
 * ```
 */
export function usePWAAnalytics(): UsePWAAnalyticsReturn {
  const trackEvent = useCallback((event: PWAEventType, properties?: PWAEventProperties) => {
    // Log for development/debugging
    logger.devLog(`[PWA Analytics] ${event}`, properties || {});

    // Send to backend analytics endpoint (fire-and-forget)
    fetch('/api/analytics/pwa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: event, metadata: properties }),
    }).catch(() => {
      // Silent fail - analytics should never break the app
    });
  }, []);

  return { trackEvent };
}
