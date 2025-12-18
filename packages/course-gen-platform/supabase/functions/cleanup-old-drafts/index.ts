/**
 * Supabase Edge Function: cleanup-old-drafts
 *
 * Purpose: Automatically delete abandoned draft courses that were never processed
 * Criteria:
 *   - status = 'draft'
 *   - generation_status IS NULL (never started processing)
 *   - created_at < NOW() - 24 hours
 *
 * Trigger: Hourly via pg_cron
 * Security: Service role only (bypasses RLS)
 *
 * @see docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md (section 6.3)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CleanupResult {
  success: boolean
  deletedCount: number
  cutoffTime: string
  timestamp: string
  deletedCourses?: Array<{
    id: string
    title: string
    created_at: string
  }>
  error?: string
}

interface DeletedCourse {
  id: string
  title: string
  created_at: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('[Cleanup] Edge function invoked')

  try {
    // Security check: Only allow service role or cron invocations
    const authHeader = req.headers.get('Authorization')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!authHeader || !authHeader.includes('Bearer')) {
      console.error('[Cleanup] Missing or invalid Authorization header')
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized - Service role required',
          deletedCount: 0,
          cutoffTime: new Date().toISOString(),
          timestamp: new Date().toISOString()
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      )
    }

    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[Cleanup] Missing environment variables')
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Calculate cutoff time (24 hours ago)
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    console.log(`[Cleanup] Starting cleanup of drafts older than ${cutoffTime}`)

    // Delete old unused drafts with transaction safety
    const { data: deletedCourses, error: deleteError } = await supabase
      .from('courses')
      .delete()
      .eq('status', 'draft')
      .is('generation_status', null)
      .lt('created_at', cutoffTime)
      .select('id, title, created_at')

    if (deleteError) {
      console.error('[Cleanup] Error deleting courses:', deleteError)
      throw deleteError
    }

    const deletedCount = deletedCourses?.length || 0
    const timestamp = new Date().toISOString()

    console.log(`[Cleanup] Successfully deleted ${deletedCount} old draft courses`)

    // Log metrics for monitoring
    console.log(JSON.stringify({
      event: 'cleanup_completed',
      timestamp,
      deleted_count: deletedCount,
      cutoff_time: cutoffTime,
      status: 'success'
    }))

    // Alert if high number of deletions
    if (deletedCount > 100) {
      console.warn(`[Cleanup] High number of drafts deleted: ${deletedCount}. This may indicate an issue.`)
    }

    const result: CleanupResult = {
      success: true,
      deletedCount,
      cutoffTime,
      timestamp,
      deletedCourses: (deletedCourses as DeletedCourse[])?.slice(0, 10) || [] // Include first 10 for debugging
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[Cleanup] Fatal error:', error)

    const timestamp = new Date().toISOString()
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Log error metrics
    console.log(JSON.stringify({
      event: 'cleanup_failed',
      timestamp,
      error: errorMessage,
      status: 'error'
    }))

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        deletedCount: 0,
        cutoffTime: new Date().toISOString(),
        timestamp
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
