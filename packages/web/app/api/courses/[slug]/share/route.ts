import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authenticateRequest } from '@/lib/auth';
import { nanoid } from 'nanoid';
import { logger } from '@/lib/logger';
import type { Database } from '@/types/database.generated';

type CourseUpdate = Database['public']['Tables']['courses']['Update'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = nanoid(8); // For request tracing
  const startTime = Date.now();

  try {
    logger.info('Share API: Starting POST request', {
      requestId,
      headers: {
        host: request.headers.get('host'),
        userAgent: request.headers.get('user-agent'),
        referer: request.headers.get('referer')
      }
    });

    const user = await authenticateRequest(request);
    if (!user) {
      logger.warn('Share API: Authentication failed', { requestId });
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Please login to share courses',
          requestId
        },
        { status: 401 }
      );
    }
    logger.info('Share API: User authenticated', { requestId, userId: user.id, userEmail: user.email });

    const supabase = await createClient();
    const { slug } = await params;
    logger.info('Share API: Processing course', { requestId, slug });

    // Get course and check permissions
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, user_id')
      .eq('slug', slug)
      .single();

    if (courseError) {
      logger.error('Share API: Database error fetching course', {
        requestId,
        slug,
        error: courseError.message,
        code: courseError.code,
        details: courseError.details
      });
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to fetch course information',
          requestId
        },
        { status: 500 }
      );
    }

    if (!course) {
      logger.warn('Share API: Course not found', { requestId, slug });
      return NextResponse.json(
        {
          error: 'Not found',
          message: `Course with slug '${slug}' not found`,
          requestId
        },
        { status: 404 }
      );
    }
    logger.info('Share API: Course found', { requestId, courseId: course.id });

    // Check permissions - only owner, admin, or super_admin
    const isOwner = course.user_id === user.id;
    const isAdmin = user.role === 'admin' || user.role === 'superadmin';

    logger.info('Share API: Permission check', {
      requestId,
      userId: user.id,
      courseOwnerId: course.user_id,
      userRole: user.role,
      isOwner,
      isAdmin
    });

    if (!isOwner && !isAdmin) {
      logger.warn('Share API: Permission denied', {
        requestId,
        userId: user.id,
        courseId: course.id,
        courseOwnerId: course.user_id
      });
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'You do not have permission to share this course',
          requestId
        },
        { status: 403 }
      );
    }

    // Check if share token already exists
    const { data: existingCourse, error: checkError } = await supabase
      .from('courses')
      .select('share_token')
      .eq('id', course.id)
      .single();

    if (checkError) {
      logger.error('Share API: Error checking existing share token', {
        requestId,
        courseId: course.id,
        error: checkError.message
      });
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to check existing share token',
          requestId
        },
        { status: 500 }
      );
    }

    // If token already exists, return it
    if (existingCourse?.share_token) {
      const shareUrl = `${request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL}/shared/${existingCourse.share_token}`;

      logger.info('Share API: Returning existing share token', {
        requestId,
        courseId: course.id,
        duration: Date.now() - startTime
      });

      return NextResponse.json({
        shareToken: existingCourse.share_token,
        shareUrl,
        requestId
      });
    }

    // Generate new share token with prefix for better identification
    const shareToken = `share_${nanoid(16)}`; // Prefixed, URL-safe token

    // Update course with share token
    const { error: updateError } = await supabase
      .from('courses')
      .update({ share_token: shareToken } as CourseUpdate)
      .eq('id', course.id);

    if (updateError) {
      logger.error('Share API: Failed to save share token', {
        requestId,
        courseId: course.id,
        error: updateError.message,
        code: updateError.code
      });
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to create share link',
          requestId
        },
        { status: 500 }
      );
    }

    const shareUrl = `${request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL}/shared/${shareToken}`;

    logger.info('Share API: Share token created successfully', {
      requestId,
      courseId: course.id,
      duration: Date.now() - startTime
    });

    return NextResponse.json({
      shareToken,
      shareUrl,
      requestId
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Share API: Unexpected error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration
    });

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred while creating the share link',
        requestId
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const requestId = nanoid(8);
  const startTime = Date.now();

  try {
    logger.info('Share API DELETE: Starting request', {
      requestId,
      headers: {
        host: request.headers.get('host'),
        userAgent: request.headers.get('user-agent')
      }
    });

    const user = await authenticateRequest(request);
    if (!user) {
      logger.warn('Share API DELETE: Authentication failed', { requestId });
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Please login to manage share links',
          requestId
        },
        { status: 401 }
      );
    }

    const supabase = await createClient();
    const { slug } = await params;
    logger.info('Share API DELETE: Processing course', { requestId, slug, userId: user.id });

    // Get course and check permissions
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, user_id')
      .eq('slug', slug)
      .single();

    if (courseError) {
      logger.error('Share API DELETE: Database error', {
        requestId,
        slug,
        error: courseError.message,
        code: courseError.code
      });
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to fetch course information',
          requestId
        },
        { status: 500 }
      );
    }

    if (!course) {
      logger.warn('Share API DELETE: Course not found', { requestId, slug });
      return NextResponse.json(
        {
          error: 'Not found',
          message: `Course with slug '${slug}' not found`,
          requestId
        },
        { status: 404 }
      );
    }

    // Check permissions
    const isOwner = course.user_id === user.id;
    const isAdmin = user.role === 'admin' || user.role === 'superadmin';

    logger.info('Share API DELETE: Permission check', {
      requestId,
      userId: user.id,
      courseOwnerId: course.user_id,
      userRole: user.role,
      isOwner,
      isAdmin
    });

    if (!isOwner && !isAdmin) {
      logger.warn('Share API DELETE: Permission denied', {
        requestId,
        userId: user.id,
        courseId: course.id
      });
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'You do not have permission to remove share link',
          requestId
        },
        { status: 403 }
      );
    }

    // Remove share token
    const { error: updateError } = await supabase
      .from('courses')
      .update({ share_token: null } as CourseUpdate)
      .eq('id', course.id);

    if (updateError) {
      logger.error('Share API DELETE: Failed to remove share token', {
        requestId,
        courseId: course.id,
        error: updateError.message,
        code: updateError.code
      });
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to remove share link',
          requestId
        },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;
    logger.info('Share API DELETE: Share token removed successfully', {
      requestId,
      courseId: course.id,
      duration
    });

    return NextResponse.json({
      message: 'Share link removed successfully',
      requestId
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Share API DELETE: Unexpected error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration
    });

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An unexpected error occurred while removing the share link',
        requestId
      },
      { status: 500 }
    );
  }
}