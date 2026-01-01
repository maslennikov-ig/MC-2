import webpush from 'web-push';

// Configure VAPID details if all required environment variables are present
const WEB_PUSH_EMAIL = process.env.WEB_PUSH_EMAIL;
const WEB_PUSH_PRIVATE_KEY = process.env.WEB_PUSH_PRIVATE_KEY;
const WEB_PUSH_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;

/**
 * Check if web push is properly configured
 */
export const isWebPushConfigured = Boolean(
  WEB_PUSH_EMAIL && WEB_PUSH_PRIVATE_KEY && WEB_PUSH_PUBLIC_KEY
);

if (isWebPushConfigured) {
  webpush.setVapidDetails(
    `mailto:${WEB_PUSH_EMAIL}`,
    WEB_PUSH_PUBLIC_KEY!,
    WEB_PUSH_PRIVATE_KEY!
  );
}

/**
 * Push subscription interface matching the PushSubscription API
 */
export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Push notification payload
 */
export interface PushNotificationPayload {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

/**
 * Send a push notification to a subscription
 *
 * @param subscription - The push subscription data
 * @param payload - The notification payload
 * @returns Promise that resolves when notification is sent
 * @throws Error if web push is not configured or sending fails
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushNotificationPayload
): Promise<webpush.SendResult> {
  if (!isWebPushConfigured) {
    throw new Error('Web Push is not configured. Check VAPID environment variables.');
  }

  const webPushSubscription: webpush.PushSubscription = {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
  };

  return webpush.sendNotification(
    webPushSubscription,
    JSON.stringify(payload)
  );
}

/**
 * Send push notification to multiple subscriptions
 * Continues sending even if some fail
 *
 * @param subscriptions - Array of push subscription data
 * @param payload - The notification payload
 * @returns Promise with results for each subscription
 */
export async function sendPushNotificationToMany(
  subscriptions: PushSubscriptionData[],
  payload: PushNotificationPayload
): Promise<{ success: number; failed: number; errors: Array<{ endpoint: string; error: Error }> }> {
  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendPushNotification(sub, payload))
  );

  const errors: Array<{ endpoint: string; error: Error }> = [];
  let success = 0;
  let failed = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      success++;
    } else {
      failed++;
      errors.push({
        endpoint: subscriptions[index].endpoint,
        error: result.reason as Error,
      });
    }
  });

  return { success, failed, errors };
}

export { webpush };
