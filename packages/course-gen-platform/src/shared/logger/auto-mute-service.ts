/**
 * Auto-mute service for error logs
 * @module shared/logger/auto-mute-service
 *
 * Centralized logic for applying auto-mute status to error logs
 * that match expected error patterns.
 */

import { logger as baseLogger } from '@megacampus/shared-logger';
import { getSupabaseAdmin } from '../supabase/admin';
import { shouldAutoMute } from './auto-classification';

/**
 * Apply auto-mute status to error log if it matches auto-mute rules
 *
 * @param logId - The ID of the error log entry
 * @param errorMessage - The error message to check against auto-mute rules
 *
 * @example
 * ```typescript
 * // After inserting an error log:
 * const { data } = await supabase.from('error_logs').insert({...}).select('id').single();
 * if (data?.id) {
 *   await applyAutoMuteStatus(data.id, params.error_message);
 * }
 * ```
 */
export async function applyAutoMuteStatus(logId: string, errorMessage: string): Promise<void> {
  const autoMuteResult = shouldAutoMute(errorMessage);
  if (!autoMuteResult.mute) return;

  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from('log_issue_status' as any).insert({
      log_type: 'error_log',
      log_id: logId,
      status: 'auto_muted',
      notes: `Auto-muted: ${autoMuteResult.reason}. ${autoMuteResult.description}`,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      // Handle race condition: fingerprint already has status (code 23505)
      // This is expected behavior when parallel errors share the same fingerprint
      if (error.code === '23505') {
        baseLogger.debug(
          { fingerprint: autoMuteResult.reason, logId },
          'Auto-mute status already exists for fingerprint group (race condition handled)'
        );
        return; // Success - status already set for this error group
      }

      baseLogger.warn(
        { error, logId, reason: autoMuteResult.reason },
        'Failed to apply auto-mute status'
      );
    }
  } catch (err) {
    baseLogger.warn({ err, logId }, 'Exception applying auto-mute status');
  }
}
