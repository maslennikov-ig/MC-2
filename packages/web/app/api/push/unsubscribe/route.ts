import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { checkRateLimit, getRateLimitIdentifier } from '@/lib/rate-limit';

/**
 * Schema for unsubscribe request body
 */
const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
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
 * DELETE /api/push/unsubscribe
 *
 * Removes a push notification subscription for the authenticated user
 */
export async function DELETE(req: NextRequest) {
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
    const rateLimit = await checkRateLimit(`push-unsubscribe:${rateLimitId}`, {
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
    const validationResult = unsubscribeSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { endpoint } = validationResult.data;

    // Delete the subscription
    const { error: dbError } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);

    if (dbError) {
      logger.error('Failed to delete push subscription:', dbError);
      return NextResponse.json(
        { error: 'Failed to delete subscription' },
        { status: 500 }
      );
    }

    logger.info(`Push subscription removed for user ${user.id}`);

    return NextResponse.json(
      { success: true, message: 'Subscription removed' },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Push unsubscribe error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
