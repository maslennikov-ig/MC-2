/**
 * Supabase Edge Function: detect-stuck-generations
 *
 * Purpose: Detect courses stuck in generating/processing states for 2+ hours
 * and mark them as failed via the update_course_progress RPC.
 *
 * Criteria:
 *   - generation_status IN (stage_2_processing, stage_3_summarizing,
 *     stage_4_analyzing, stage_5_generating, finalizing)
 *   - last_progress_update < NOW() - 2 hours
 *
 * Trigger: Periodic via pg_cron
 * Security: Service role only (bypasses RLS)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STUCK_STATUSES = [
  'stage_2_processing',
  'stage_3_summarizing',
  'stage_4_analyzing',
  'stage_5_generating',
  'finalizing',
] as const;

type StuckStatus = (typeof STUCK_STATUSES)[number];

const STATUS_TO_STEP_ID: Record<StuckStatus, number> = {
  stage_2_processing: 2,
  stage_3_summarizing: 3,
  stage_4_analyzing: 4,
  stage_5_generating: 5,
  finalizing: 6,
};

interface StuckCourse {
  id: string;
  title: string;
  generation_status: StuckStatus;
  last_progress_update: string;
}

interface CourseDetail {
  id: string;
  title: string;
  generation_status: string;
  last_progress_update: string;
  step_id: number;
  resolved: boolean;
}

interface DetectionResult {
  success: boolean;
  stuckCount: number;
  resolvedCount: number;
  failedToResolve: number;
  timestamp: string;
  details: CourseDetail[];
  error?: string;
}

Deno.serve(async req => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('[DetectStuck] Edge function invoked');

  try {
    // Security check: Only allow service role invocations (pg_cron passes service_role key)
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const incomingToken = authHeader?.replace('Bearer ', '');

    if (!incomingToken || incomingToken !== serviceRoleKey) {
      console.error('[DetectStuck] Unauthorized: invalid or missing service role token');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized - Service role required',
          stuckCount: 0,
          resolvedCount: 0,
          failedToResolve: 0,
          timestamp: new Date().toISOString(),
          details: [],
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[DetectStuck] Missing environment variables');
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Calculate cutoff time (2 hours ago)
    const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    console.log(`[DetectStuck] Searching for courses stuck since before ${cutoffTime}`);

    // Find stuck courses (include NULL last_progress_update — crashed before first progress update)
    // Idempotency: once resolved, generation_status changes to 'failed' (not in STUCK_STATUSES),
    // so concurrent invocations cannot double-mark the same course.
    const { data: stuckCourses, error: queryError } = await supabase
      .from('courses')
      .select('id, title, generation_status, last_progress_update')
      .in('generation_status', [...STUCK_STATUSES])
      .or(`last_progress_update.lt.${cutoffTime},last_progress_update.is.null`)
      .limit(50);

    if (queryError) {
      console.error('[DetectStuck] Error querying stuck courses:', queryError);
      throw queryError;
    }

    const courses = (stuckCourses as StuckCourse[]) || [];
    const stuckCount = courses.length;
    const timestamp = new Date().toISOString();

    console.log(`[DetectStuck] Found ${stuckCount} stuck courses`);

    // Warn if batch limit was hit — more courses may be waiting for next cron cycle
    if (stuckCount >= 50) {
      console.warn(
        `[DetectStuck] Batch limit reached (${stuckCount}/50). Additional stuck courses may exist — next cron cycle will process them.`
      );
    }

    // Log discovery metrics
    console.log(
      JSON.stringify({
        event: 'stuck_courses_detected',
        timestamp,
        stuck_count: stuckCount,
        cutoff_time: cutoffTime,
        batch_limit_reached: stuckCount >= 50,
      })
    );

    if (stuckCount === 0) {
      const result: DetectionResult = {
        success: true,
        stuckCount: 0,
        resolvedCount: 0,
        failedToResolve: 0,
        timestamp,
        details: [],
      };

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Resolve stuck courses in parallel via update_course_progress RPC
    const detectedAt = timestamp;
    const details: CourseDetail[] = [];

    const rpcPromises = courses.map(course => {
      const stepId = STATUS_TO_STEP_ID[course.generation_status];
      console.log(
        `[DetectStuck] Resolving course ${course.id} (${course.title}) - status: ${course.generation_status}, step_id: ${stepId}`
      );
      return supabase.rpc('update_course_progress', {
        p_course_id: course.id,
        p_step_id: stepId,
        p_status: 'failed',
        p_message: 'Автоматически помечено как failed: нет прогресса более 2 часов',
        p_error_message: 'STUCK_GENERATION_TIMEOUT',
        p_error_details: {
          timeout_hours: 2,
          detected_at: detectedAt,
          previous_status: course.generation_status,
          safety_net: true,
          detector: 'detect-stuck-generations',
        },
      });
    });

    const results = await Promise.allSettled(rpcPromises);

    let resolvedCount = 0;
    let failedToResolve = 0;

    results.forEach((result, i) => {
      const course = courses[i];
      const stepId = STATUS_TO_STEP_ID[course.generation_status];
      const rpcError = result.status === 'fulfilled' ? result.value.error : result.reason;
      const resolved = !rpcError;

      if (rpcError) {
        failedToResolve++;
        console.error(`[DetectStuck] Failed to resolve course ${course.id}:`, rpcError);
        console.log(
          JSON.stringify({
            event: 'stuck_course_resolve_failed',
            course_id: course.id,
            generation_status: course.generation_status,
            step_id: stepId,
            error: rpcError?.message || String(rpcError),
          })
        );
      } else {
        resolvedCount++;
        console.log(
          JSON.stringify({
            event: 'stuck_course_resolved',
            course_id: course.id,
            generation_status: course.generation_status,
            step_id: stepId,
          })
        );
      }

      details.push({
        id: course.id,
        title: course.title,
        generation_status: course.generation_status,
        last_progress_update: course.last_progress_update,
        step_id: stepId,
        resolved,
      });
    });

    // Log completion metrics
    console.log(
      JSON.stringify({
        event: 'stuck_detection_completed',
        timestamp,
        stuck_count: stuckCount,
        resolved_count: resolvedCount,
        failed_to_resolve: failedToResolve,
        status: 'success',
      })
    );

    // Alert if there are unresolved courses
    if (failedToResolve > 0) {
      console.warn(
        `[DetectStuck] ${failedToResolve} courses could not be resolved. Manual intervention may be needed.`
      );
    }

    const result: DetectionResult = {
      success: failedToResolve === 0,
      stuckCount,
      resolvedCount,
      failedToResolve,
      timestamp,
      details,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[DetectStuck] Fatal error:', error);

    const timestamp = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log error metrics
    console.log(
      JSON.stringify({
        event: 'stuck_detection_failed',
        timestamp,
        error: errorMessage,
        status: 'error',
      })
    );

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        stuckCount: 0,
        resolvedCount: 0,
        failedToResolve: 0,
        timestamp,
        details: [],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
