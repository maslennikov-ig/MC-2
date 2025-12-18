/**
 * Supabase admin client for web package (Next.js Server Components/Actions/API Routes)
 *
 * NOTE: This is intentionally separate from packages/course-gen-platform/src/shared/supabase/admin.ts
 * Reasons for NOT unifying:
 * 1. Different runtime environments: Next.js Server (this) vs Node.js backend (course-gen-platform)
 * 2. Different env variable names: SUPABASE_SERVICE_ROLE_KEY (this) vs SUPABASE_SERVICE_KEY (course-gen-platform)
 * 3. Different type sources: @/types/database.generated (this) vs @megacampus/shared-types (course-gen-platform)
 * 4. Eager initialization here (Next.js module caching) vs lazy singleton in course-gen-platform
 *
 * Usage: Import via client-factory.ts: import { getAdminClient } from '@/lib/supabase/client-factory'
 * See CLAUDE.md "Supabase Admin Client" section for details.
 */
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.generated'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Admin client with service role key for server-side operations (bypasses RLS)
export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
})

// Re-export types from database types
export type { Course, Section, Lesson, Asset } from '../types/database'