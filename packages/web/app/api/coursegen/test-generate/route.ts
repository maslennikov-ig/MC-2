/**
 * POST /api/coursegen/test-generate
 *
 * TEST ENDPOINT - accepts Bearer token for testing via curl
 * DO NOT USE IN PRODUCTION - bypass cookie authentication
 *
 * This endpoint is specifically for manual testing and CI/CD
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { ENV } from '@/lib/env';

export async function POST(request: NextRequest) {
  try {
    // Extract Bearer token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Create Supabase client with the token
    const supabase = createSupabaseClient(
      ENV.SUPABASE_URL,
      ENV.SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      logger.warn('[TEST] Unauthorized access attempt', {
        error: authError?.message
      });
      return NextResponse.json(
        { error: 'Invalid or expired token', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (_parseError) {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    logger.info('[TEST] Proxying course generation request', {
      userId: user.id,
      courseId: body.courseId
    });

    // Call tRPC endpoint
    // Use COURSEGEN_BACKEND_URL as single source of truth for backend URL
    const backendUrl = process.env.COURSEGEN_BACKEND_URL || 'http://localhost:3456';
    const tRPCUrl = `${backendUrl}/trpc`;
    const response = await fetch(`${tRPCUrl}/generation.initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('[TEST] tRPC generation.initiate failed', {
        userId: user.id,
        courseId: body.courseId,
        status: response.status,
        error: data
      });
    } else {
      logger.info('[TEST] Course generation initiated successfully', {
        userId: user.id,
        courseId: body.courseId
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    logger.error('[TEST] Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
