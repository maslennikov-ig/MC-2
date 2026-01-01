import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { Json } from '@/types/database.generated';

const eventSchema = z.object({
  eventType: z.enum([
    'install_prompt_shown',
    'install_accepted',
    'install_dismissed',
    'install_error',
    'push_subscribed',
    'push_unsubscribed',
    'push_error',
  ]),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * POST /api/analytics/pwa
 * Track a PWA analytics event
 *
 * No authentication required - allows tracking for anonymous users
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = eventSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid event data' },
        { status: 400 }
      );
    }

    const { eventType, metadata } = result.data;
    const userAgent = req.headers.get('user-agent') || undefined;

    const supabase = await createClient();

    // Get user if authenticated (optional)
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('pwa_analytics')
      .insert({
        event_type: eventType,
        user_id: user?.id || null,
        user_agent: userAgent,
        metadata: (metadata || {}) as Json,
      });

    if (error) {
      console.error('[PWA Analytics] Insert error:', error);
      return NextResponse.json(
        { error: 'Failed to track event' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PWA Analytics] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analytics/pwa
 * Get PWA analytics summary (admin only)
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Check admin access
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get time ranges
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch stats in parallel
    const [
      totalEvents,
      last24hEvents,
      last7dEvents,
      eventBreakdown,
    ] = await Promise.all([
      supabase.from('pwa_analytics').select('*', { count: 'exact', head: true }),
      supabase.from('pwa_analytics').select('*', { count: 'exact', head: true }).gte('created_at', last24h),
      supabase.from('pwa_analytics').select('*', { count: 'exact', head: true }).gte('created_at', last7d),
      supabase.from('pwa_analytics').select('event_type').gte('created_at', last30d),
    ]);

    // Calculate event breakdown
    const breakdown: Record<string, number> = {};
    if (eventBreakdown.data) {
      for (const row of eventBreakdown.data) {
        breakdown[row.event_type] = (breakdown[row.event_type] || 0) + 1;
      }
    }

    // Calculate conversion rates
    const promptsShown = breakdown['install_prompt_shown'] || 0;
    const installs = breakdown['install_accepted'] || 0;
    const installRate = promptsShown > 0 ? ((installs / promptsShown) * 100).toFixed(1) : '0';

    const pushSubscribed = breakdown['push_subscribed'] || 0;
    const pushUnsubscribed = breakdown['push_unsubscribed'] || 0;

    return NextResponse.json({
      summary: {
        total: totalEvents.count || 0,
        last24h: last24hEvents.count || 0,
        last7d: last7dEvents.count || 0,
      },
      install: {
        promptsShown,
        accepted: installs,
        dismissed: breakdown['install_dismissed'] || 0,
        conversionRate: installRate,
      },
      push: {
        subscribed: pushSubscribed,
        unsubscribed: pushUnsubscribed,
        netSubscriptions: pushSubscribed - pushUnsubscribed,
      },
      breakdown,
    });
  } catch (error) {
    console.error('[PWA Analytics] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
