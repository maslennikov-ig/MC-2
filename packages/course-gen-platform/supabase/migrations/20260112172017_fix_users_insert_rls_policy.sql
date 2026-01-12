-- Fix users INSERT RLS policy
-- Previously: WITH CHECK (true) - ANY authenticated user could insert
-- Now: Only allow users to insert their own record
-- Service role bypasses RLS, so backend can still create any user

DROP POLICY IF EXISTS "users_insert_unified" ON "public"."users";

CREATE POLICY "users_insert_unified" ON "public"."users"
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

-- Add comment explaining the policy
COMMENT ON POLICY "users_insert_unified" ON "public"."users" IS
'Users can only insert their own record. Service role bypasses RLS for admin operations.';
