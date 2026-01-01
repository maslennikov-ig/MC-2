import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { checkRateLimit, getRateLimitIdentifier } from '@/lib/rate-limit';

/**
 * Schema for push subscription request body
 */
const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/**
 * Allowed origins for CSRF protection
 */
const getAllowedOrigins = (): string[] => {
  const origins = [
    'https://megacampus.ai',
    'https://www.megacampus.ai',
  ];
  if (process.env.NODE_ENV === 'development') {
    origins.push('http://localhost:3000');
  }
  return origins;
};

/**
 * POST /api/push/subscribe
 *
 * Saves a push notification subscription for the authenticated user
 */
export async function POST(req: NextRequest) {
  try {
    // Validate origin to prevent CSRF
    const origin = req.headers.get('origin');
    const allowedOrigins = getAllowedOrigins();

    if (!origin || !allowedOrigins.includes(origin)) {
      return NextResponse.json(
        { error: 'Invalid origin' },
        { status: 403 }
      );
    }

    // Rate limit: 10 requests per hour per user/IP
    const rateLimitId = getRateLimitIdentifier(req);
    const rateLimit = await checkRateLimit(`push-subscribe:${rateLimitId}`, {
      requests: 10,
      window: 3600, // 1 hour
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfter || 60),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            'X-RateLimit-Reset': String(rateLimit.reset),
          },
        }
      );
    }

    const supabase = await createClient();

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validationResult = pushSubscriptionSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid subscription data', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { endpoint, keys } = validationResult.data;

    // Get user agent for debugging/analytics
    const userAgent = req.headers.get('user-agent') || null;

    // Upsert the subscription (update if exists, insert if new)
    // Uses composite key (user_id, endpoint) to allow same endpoint for different users
    const { error: dbError } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint,
          keys_p256dh: keys.p256dh,
          keys_auth: keys.auth,
          user_agent: userAgent,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,endpoint',
          ignoreDuplicates: false,
        }
      );

    if (dbError) {
      logger.error('Failed to save push subscription:', dbError);
      return NextResponse.json(
        { error: 'Failed to save subscription' },
        { status: 500 }
      );
    }

    logger.info(`Push subscription saved for user ${user.id}`);

    return NextResponse.json(
      { success: true, message: 'Subscription saved' },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Push subscribe error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
