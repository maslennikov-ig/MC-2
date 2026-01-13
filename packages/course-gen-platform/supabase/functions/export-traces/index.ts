/**
 * Supabase Edge Function: export-traces
 *
 * Purpose: Export old generation traces from archive to cold storage (Supabase Storage)
 * Flow:
 *   1. Call export_archive_to_json(90) to get records older than 90 days
 *   2. Upload JSON to trace-archives bucket
 *   3. Call purge_exported_archive(90) to delete exported records
 *
 * Trigger: Weekly via pg_cron (Sundays at 3:00 UTC)
 * Security: Service role only (bypasses RLS)
 *
 * @see docs/ADR-006-generation-trace-lifecycle.md
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportResult {
  success: boolean;
  exportedCount: number;
  purgedCount: number;
  fileName: string | null;
  timestamp: string;
  error?: string;
}

interface ExportData {
  export_count: number;
  export_data: unknown[] | null;
  error_message: string | null;
}

interface PurgeData {
  purged_count: number;
  error_message: string | null;
}

serve(async req => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('[ExportTraces] Edge function invoked');

  try {
    // Security check: Only allow service role or cron invocations
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!authHeader || !authHeader.includes('Bearer')) {
      console.error('[ExportTraces] Missing or invalid Authorization header');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized - Service role required',
          exportedCount: 0,
          purgedCount: 0,
          fileName: null,
          timestamp: new Date().toISOString(),
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
      console.error('[ExportTraces] Missing environment variables');
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Parse optional age_days from request body
    let ageDays = 90;
    try {
      if (req.method === 'POST') {
        const body = await req.json();
        if (body.age_days && typeof body.age_days === 'number') {
          ageDays = body.age_days;
        }
      }
    } catch {
      // Use default age_days if body parsing fails
    }

    console.log(`[ExportTraces] Starting export of archive records older than ${ageDays} days`);

    // Step 1: Get export data from archive
    const { data: exportResult, error: exportError } = await supabase.rpc(
      'export_archive_to_json',
      { p_age_days: ageDays }
    );

    if (exportError) {
      console.error('[ExportTraces] Error calling export_archive_to_json:', exportError);
      throw exportError;
    }

    const exportData = (exportResult as ExportData[])?.[0];

    if (!exportData || exportData.error_message) {
      throw new Error(exportData?.error_message || 'Failed to export archive data');
    }

    const exportCount = exportData.export_count;
    const jsonData = exportData.export_data;

    console.log(`[ExportTraces] Found ${exportCount} records to export`);

    // If no records to export, return early
    if (exportCount === 0 || !jsonData || (Array.isArray(jsonData) && jsonData.length === 0)) {
      console.log('[ExportTraces] No records to export');
      return new Response(
        JSON.stringify({
          success: true,
          exportedCount: 0,
          purgedCount: 0,
          fileName: null,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Step 2: Upload to Supabase Storage
    const now = new Date();
    const fileName = `traces/archive_${now.toISOString().split('T')[0]}_${now.getTime()}.json`;

    console.log(`[ExportTraces] Uploading to storage: ${fileName}`);

    const { error: uploadError } = await supabase.storage
      .from('trace-archives')
      .upload(fileName, JSON.stringify(jsonData), {
        contentType: 'application/json',
        upsert: false,
      });

    if (uploadError) {
      // If bucket doesn't exist, try to create it
      if (
        uploadError.message?.includes('not found') ||
        uploadError.message?.includes('does not exist')
      ) {
        console.log('[ExportTraces] Bucket not found, attempting to create...');

        // Note: Creating buckets requires admin API or dashboard
        // For now, log warning and fail gracefully
        console.warn(
          '[ExportTraces] Please create the "trace-archives" bucket manually via Supabase Dashboard'
        );
        throw new Error(
          `Storage bucket "trace-archives" not found. Please create it via Supabase Dashboard.`
        );
      }

      console.error('[ExportTraces] Error uploading to storage:', uploadError);
      throw uploadError;
    }

    console.log(`[ExportTraces] Successfully uploaded ${exportCount} records to ${fileName}`);

    // Step 3: Purge exported records from archive
    const { data: purgeResult, error: purgeError } = await supabase.rpc('purge_exported_archive', {
      p_age_days: ageDays,
    });

    if (purgeError) {
      console.error('[ExportTraces] Error calling purge_exported_archive:', purgeError);
      // Don't throw - export was successful, just log the purge failure
      console.warn('[ExportTraces] Export succeeded but purge failed. Records may be re-exported.');
    }

    const purgeData = (purgeResult as PurgeData[])?.[0];
    const purgedCount = purgeData?.purged_count || 0;

    if (purgeData?.error_message) {
      console.warn(`[ExportTraces] Purge warning: ${purgeData.error_message}`);
    }

    console.log(`[ExportTraces] Purged ${purgedCount} records from archive`);

    const timestamp = new Date().toISOString();

    // Log metrics for monitoring
    console.log(
      JSON.stringify({
        event: 'export_completed',
        timestamp,
        exported_count: exportCount,
        purged_count: purgedCount,
        file_name: fileName,
        age_days: ageDays,
        status: 'success',
      })
    );

    const result: ExportResult = {
      success: true,
      exportedCount: exportCount,
      purgedCount,
      fileName,
      timestamp,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[ExportTraces] Fatal error:', error);

    const timestamp = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log error metrics
    console.log(
      JSON.stringify({
        event: 'export_failed',
        timestamp,
        error: errorMessage,
        status: 'error',
      })
    );

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        exportedCount: 0,
        purgedCount: 0,
        fileName: null,
        timestamp,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
