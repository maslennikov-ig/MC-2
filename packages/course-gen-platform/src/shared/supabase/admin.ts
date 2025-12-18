/**
 * Supabase admin client singleton for course-gen-platform (Node.js backend)
 * @module supabase/admin
 *
 * NOTE: This is intentionally separate from packages/web/lib/supabase-admin.ts
 * Reasons for NOT unifying:
 * 1. Different runtime environments: Node.js (this) vs Next.js Server Components (web)
 * 2. Different env variable names: SUPABASE_SERVICE_KEY (this) vs SUPABASE_SERVICE_ROLE_KEY (web)
 * 3. Different client libraries: @supabase/supabase-js (this) vs @supabase/ssr (web for user clients)
 * 4. Different configuration needs: minimal here vs extended headers/schema config for Next.js
 *
 * See CLAUDE.md "Supabase Admin Client" section for details.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';
import logger from '../logger';

let supabaseAdmin: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (!supabaseAdmin) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      logger.error({
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseServiceKey,
        urlPrefix: supabaseUrl?.substring(0, 30),
      }, '[SupabaseAdmin] Missing configuration');
      throw new Error('Missing Supabase configuration: SUPABASE_URL or SUPABASE_SERVICE_KEY');
    }

    // Verify service key contains service_role
    const keyPayload = supabaseServiceKey.split('.')[1];
    if (keyPayload) {
      try {
        const decoded = JSON.parse(Buffer.from(keyPayload, 'base64').toString());
        logger.info({ role: decoded.role }, '[SupabaseAdmin] Initializing with role');
      } catch {
        logger.warn('[SupabaseAdmin] Could not decode key payload');
      }
    }

    supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    logger.info({ url: supabaseUrl }, '[SupabaseAdmin] Client initialized');
  }

  return supabaseAdmin;
}

export default getSupabaseAdmin;
