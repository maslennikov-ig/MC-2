'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '../client-logger';
import { createClient } from '@/lib/supabase/client';
import { usePWAAnalytics } from './use-pwa-analytics';

/**
 * VAPID public key from environment
 */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;

/**
 * Convert URL-safe base64 to ArrayBuffer for applicationServerKey
 * Returns ArrayBuffer which is compatible with PushSubscriptionOptionsInit
 */
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  // Return the underlying ArrayBuffer for type compatibility
  return outputArray.buffer as ArrayBuffer;
}

export type NotificationPermission = 'default' | 'granted' | 'denied';

export interface UsePushNotificationsReturn {
  /** Whether push notifications are supported in this browser */
  isSupported: boolean;
  /** Current notification permission state */
  permission: NotificationPermission;
  /** Whether the user is currently subscribed to push notifications */
  isSubscribed: boolean;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Error message if any operation failed */
  error: string | null;
  /** Subscribe to push notifications */
  subscribe: () => Promise<boolean>;
  /** Unsubscribe from push notifications */
  unsubscribe: () => Promise<boolean>;
}

/**
 * Check if push notifications are supported
 */
function checkPushSupport(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(VAPID_PUBLIC_KEY)
  );
}

/**
 * Get current notification permission
 */
function getPermission(): NotificationPermission {
  if (typeof window === 'undefined') return 'default';
  if (!('Notification' in window)) return 'denied';

  return Notification.permission as NotificationPermission;
}

/**
 * Hook to manage Web Push notification subscriptions
 *
 * Features:
 * - Checks browser support for push notifications
 * - Tracks permission state
 * - Manages subscription state
 * - Syncs with backend API
 *
 * @example
 * ```tsx
 * const {
 *   isSupported,
 *   permission,
 *   isSubscribed,
 *   subscribe,
 *   unsubscribe
 * } = usePushNotifications();
 *
 * if (!isSupported) return <p>Push not supported</p>;
 * if (permission === 'denied') return <p>Notifications blocked</p>;
 *
 * return (
 *   <Switch
 *     checked={isSubscribed}
 *     onCheckedChange={(checked) => checked ? subscribe() : unsubscribe()}
 *   />
 * );
 * ```
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { trackEvent } = usePWAAnalytics();

  // Ref to always have access to latest subscribe function (avoids stale closure)
  const subscribeRef = useRef<() => Promise<boolean>>(undefined);

  // Initialize state on mount
  useEffect(() => {
    const initializeState = async () => {
      const supported = checkPushSupport();
      setIsSupported(supported);
      setPermission(getPermission());

      if (supported) {
        // Check if already subscribed - await to avoid race condition
        await checkExistingSubscription();
      }
    };

    initializeState();
  }, []);

  /**
   * Check if there's an existing push subscription
   * Updates isSubscribed state based on browser subscription status.
   * @internal
   */
  const checkExistingSubscription = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(subscription !== null);
    } catch (err) {
      logger.error('[Push] Error checking subscription:', err);
      setIsSubscribed(false);

      // Provide specific error feedback
      if (err instanceof Error) {
        if (err.message.includes('insecure')) {
          setError('Push notifications require HTTPS');
        } else if (err.message.includes('permission')) {
          setError('Notification permission was denied');
        }
      }
    }
  }, []);

  /**
   * Subscribe to push notifications
   *
   * Requests notification permission if needed, creates a push subscription,
   * and registers it with the backend.
   *
   * @returns Promise<boolean> - true if subscription successful, false otherwise
   * @throws Never throws - all errors are caught and set in error state
   *
   * @example
   * ```tsx
   * const { subscribe, error } = usePushNotifications();
   * const success = await subscribe();
   * if (!success) console.error(error);
   * ```
   */
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError('Push notifications are not supported');
      return false;
    }

    if (!VAPID_PUBLIC_KEY) {
      setError('Push notifications are not configured');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check authentication before attempting subscription
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        setError('Please sign in to enable notifications');
        setIsLoading(false);
        return false;
      }

      // Request notification permission if not granted
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        setPermission(result);

        if (result !== 'granted') {
          setError('Notification permission denied');
          return false;
        }
      } else if (Notification.permission === 'denied') {
        setError('Notifications are blocked. Please enable them in browser settings.');
        return false;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();

      // Create new subscription if none exists
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY),
        });
      }

      // Send subscription to backend
      const subscriptionJson = subscription.toJSON();

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: subscriptionJson.endpoint,
          keys: {
            p256dh: subscriptionJson.keys?.p256dh,
            auth: subscriptionJson.keys?.auth,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save subscription');
      }

      setIsSubscribed(true);
      trackEvent('push_subscribed');
      logger.devLog('[Push] Successfully subscribed to push notifications');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to subscribe';
      logger.error('[Push] Subscribe error:', err);
      setError(message);
      trackEvent('push_error', { error: message, action: 'subscribe' });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, trackEvent]);

  /**
   * Unsubscribe from push notifications
   *
   * Removes the push subscription from the browser and notifies the backend.
   * If backend cleanup fails, the user is warned but local unsubscribe is still successful.
   *
   * @returns Promise<boolean> - true if unsubscribe successful, false on error
   *
   * @example
   * ```tsx
   * const { unsubscribe } = usePushNotifications();
   * await unsubscribe();
   * ```
   */
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError('Push notifications are not supported');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        setIsSubscribed(false);
        return true;
      }

      // Unsubscribe from push manager
      const success = await subscription.unsubscribe();

      if (!success) {
        throw new Error('Failed to unsubscribe from push manager');
      }

      // Remove subscription from backend
      const response = await fetch('/api/push/unsubscribe', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
        }),
      });

      if (!response.ok) {
        // Backend cleanup failed - warn user but don't fail completely
        logger.error('[Push] Failed to remove subscription from backend');
        setError('Unsubscribed locally, but server cleanup failed. You may still receive some notifications.');
        setIsSubscribed(false);
        return true; // Still return true since local unsubscribe worked
      }

      setIsSubscribed(false);
      trackEvent('push_unsubscribed');
      logger.devLog('[Push] Successfully unsubscribed from push notifications');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unsubscribe';
      logger.error('[Push] Unsubscribe error:', err);
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, trackEvent]);

  // Keep subscribeRef updated with latest subscribe function
  useEffect(() => {
    subscribeRef.current = subscribe;
  }, [subscribe]);

  // Listen for permission changes using Permissions API with fallback
  useEffect(() => {
    if (!isSupported) return;

    let permissionStatus: PermissionStatus | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    const handleChange = () => {
      const newPermission = permissionStatus?.state as NotificationPermission;
      setPermission(newPermission);
      if (newPermission === 'denied') {
        setIsSubscribed(false);
      }
    };

    // Try to use native Permissions API with change listener
    if ('permissions' in navigator) {
      navigator.permissions
        .query({ name: 'notifications' })
        .then((status) => {
          permissionStatus = status;
          setPermission(status.state as NotificationPermission);
          status.addEventListener('change', handleChange);
        })
        .catch(() => {
          // Fallback: Poll every 30 seconds instead of 1 second
          fallbackInterval = setInterval(() => {
            const currentPermission = getPermission();
            if (currentPermission !== permission) {
              setPermission(currentPermission);
              if (currentPermission === 'denied') {
                setIsSubscribed(false);
              }
            }
          }, 30000);
        });
    } else {
      // No Permissions API: Poll every 30 seconds
      fallbackInterval = setInterval(() => {
        const currentPermission = getPermission();
        if (currentPermission !== permission) {
          setPermission(currentPermission);
          if (currentPermission === 'denied') {
            setIsSubscribed(false);
          }
        }
      }, 30000);
    }

    return () => {
      if (permissionStatus) {
        permissionStatus.removeEventListener('change', handleChange);
      }
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  }, [isSupported, permission]);

  // Listen for subscription changes from service worker
  // Uses subscribeRef to avoid stale closure issues
  useEffect(() => {
    if (!isSupported) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        // Re-sync subscription with backend using ref to get latest function
        logger.devLog('[Push] Subscription changed, re-syncing...');
        subscribeRef.current?.();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [isSupported]); // Remove subscribe from deps - using ref instead

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  };
}
