-- Fix service tables INSERT RLS policies
-- These tables should only be writable by service role (which bypasses RLS)
-- Remove the permissive INSERT policies that allow any user to write

-- 1. audit_log - remove permissive INSERT policy
DROP POLICY IF EXISTS "Service role can insert audit logs" ON "public"."audit_log";

-- 2. system_metrics - remove permissive INSERT policy
DROP POLICY IF EXISTS "system_metrics_service_insert" ON "public"."system_metrics";

-- 3. generation_status_history - remove permissive INSERT policy
DROP POLICY IF EXISTS "generation_history_service_insert" ON "public"."generation_status_history";

-- Add comments explaining the change
COMMENT ON TABLE "public"."audit_log" IS 'Audit logs - INSERT only via service role (RLS bypassed)';
COMMENT ON TABLE "public"."system_metrics" IS 'System metrics - INSERT only via service role (RLS bypassed)';
COMMENT ON TABLE "public"."generation_status_history" IS 'Generation history - INSERT only via service role (RLS bypassed)';
