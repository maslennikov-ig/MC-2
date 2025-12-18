-- ============================================================================
-- Migration: 20250116_admin_panel_infrastructure.sql
-- Purpose: Create admin panel infrastructure for platform management
-- Author: database-architect
-- Date: 2025-01-16
-- Spec: docs/ADMIN-PANEL-SPEC.md Phase 1
-- ============================================================================

-- ============================================================================
-- PART 1: API KEYS TABLE
-- Purpose: Store hashed API keys for organization authentication
-- ============================================================================

-- API Keys table for organization API authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key_prefix TEXT NOT NULL,           -- First 8 chars for display (e.g., "mcai_abc...")
    key_hash TEXT NOT NULL,             -- bcrypt hash of full key
    name TEXT,                          -- Optional description/label
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,             -- NULL = active, NOT NULL = revoked
    last_used_at TIMESTAMPTZ,           -- Track last API usage

    -- Constraints
    CONSTRAINT api_keys_key_prefix_unique UNIQUE (key_prefix),
    CONSTRAINT api_keys_key_prefix_format CHECK (key_prefix ~ '^[a-z0-9_]{8,}$'),
    CONSTRAINT api_keys_name_length CHECK (name IS NULL OR LENGTH(name) BETWEEN 1 AND 100),
    CONSTRAINT api_keys_revoked_logic CHECK (
        revoked_at IS NULL OR revoked_at >= created_at
    )
);

-- ============================================================================
-- PART 2: ADMIN AUDIT LOGS TABLE
-- Purpose: Track all superadmin actions for compliance and debugging
-- ============================================================================

-- Admin audit logs for tracking superadmin actions
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,               -- 'create_organization', 'revoke_api_key', etc.
    resource_type TEXT,                 -- 'organization', 'api_key', 'user', etc.
    resource_id UUID,                   -- ID of affected resource
    metadata JSONB DEFAULT '{}',        -- Additional context (old/new values, reason, etc.)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT admin_audit_logs_action_not_empty CHECK (LENGTH(action) > 0),
    CONSTRAINT admin_audit_logs_resource_consistency CHECK (
        (resource_type IS NULL AND resource_id IS NULL) OR
        (resource_type IS NOT NULL AND resource_id IS NOT NULL)
    )
);

-- ============================================================================
-- PART 3: INDEXES
-- Performance optimization for frequently queried columns
-- ============================================================================

-- API Keys indexes
CREATE INDEX idx_api_keys_organization_id ON api_keys(organization_id);
CREATE INDEX idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_created_by ON api_keys(created_by);
CREATE INDEX idx_api_keys_revoked_at ON api_keys(revoked_at) WHERE revoked_at IS NULL; -- Partial index for active keys
CREATE INDEX idx_api_keys_last_used_at ON api_keys(last_used_at DESC NULLS LAST);

-- Admin Audit Logs indexes
CREATE INDEX idx_audit_logs_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX idx_audit_logs_created_at ON admin_audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON admin_audit_logs(resource_type);
CREATE INDEX idx_audit_logs_resource_id ON admin_audit_logs(resource_id);

-- Composite index for filtering audit logs by admin + date range
CREATE INDEX idx_audit_logs_admin_created ON admin_audit_logs(admin_id, created_at DESC);

-- Composite index for filtering by resource type + ID
CREATE INDEX idx_audit_logs_resource ON admin_audit_logs(resource_type, resource_id);

-- ============================================================================
-- PART 4: ROW LEVEL SECURITY (RLS)
-- Enable RLS and create superadmin-only access policies
-- ============================================================================

-- Enable RLS on both tables
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- API KEYS RLS POLICIES
-- Only superadmins can read/write API keys
-- ============================================================================

-- Superadmins can view all API keys
CREATE POLICY "superadmin_api_keys_select"
    ON api_keys
    FOR SELECT
    TO authenticated
    USING (is_superadmin(auth.uid()));

-- Superadmins can create API keys
CREATE POLICY "superadmin_api_keys_insert"
    ON api_keys
    FOR INSERT
    TO authenticated
    WITH CHECK (is_superadmin(auth.uid()));

-- Superadmins can update API keys (for revoking, updating last_used_at, etc.)
CREATE POLICY "superadmin_api_keys_update"
    ON api_keys
    FOR UPDATE
    TO authenticated
    USING (is_superadmin(auth.uid()))
    WITH CHECK (is_superadmin(auth.uid()));

-- Superadmins can delete API keys (though revocation is preferred)
CREATE POLICY "superadmin_api_keys_delete"
    ON api_keys
    FOR DELETE
    TO authenticated
    USING (is_superadmin(auth.uid()));

-- ============================================================================
-- ADMIN AUDIT LOGS RLS POLICIES
-- Superadmins can read audit logs, system can write
-- ============================================================================

-- Superadmins can view all audit logs
CREATE POLICY "superadmin_audit_logs_select"
    ON admin_audit_logs
    FOR SELECT
    TO authenticated
    USING (is_superadmin(auth.uid()));

-- System can insert audit logs (no direct user INSERT via RLS)
-- NOTE: Application code should use SECURITY DEFINER functions to write audit logs
CREATE POLICY "system_audit_logs_insert"
    ON admin_audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Only allow insert if the admin_id matches the authenticated user
        -- This prevents users from creating audit logs for other admins
        admin_id = auth.uid() AND is_superadmin(auth.uid())
    );

-- No UPDATE or DELETE policies - audit logs are immutable
-- If deletion is needed, use database-level SECURITY DEFINER functions

-- ============================================================================
-- PART 5: TRIGGER FUNCTIONS
-- Automated data management (not needed for these tables, but included for consistency)
-- ============================================================================

-- No triggers needed for api_keys or admin_audit_logs
-- created_at uses DEFAULT NOW(), and updated_at is not needed for these tables
-- last_used_at is updated by application code, not triggers

-- ============================================================================
-- PART 6: HELPER FUNCTIONS
-- Utility functions for API key management
-- ============================================================================

-- Function to check if an API key is valid (not revoked, exists)
CREATE OR REPLACE FUNCTION public.is_api_key_valid(key_prefix_param TEXT)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.api_keys
        WHERE key_prefix = key_prefix_param
        AND revoked_at IS NULL
    );
$$;

COMMENT ON FUNCTION public.is_api_key_valid(TEXT) IS
    'Helper function to check if an API key is valid (not revoked). Used for API authentication. Returns TRUE if key exists and is not revoked, FALSE otherwise.';

-- Function to get organization_id from API key prefix
CREATE OR REPLACE FUNCTION public.get_organization_from_api_key(key_prefix_param TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT organization_id FROM public.api_keys
    WHERE key_prefix = key_prefix_param
    AND revoked_at IS NULL
    LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_organization_from_api_key(TEXT) IS
    'Helper function to get organization_id from API key prefix. Returns NULL if key is invalid or revoked.';

-- Function to update last_used_at timestamp for API key
CREATE OR REPLACE FUNCTION public.update_api_key_last_used(key_prefix_param TEXT)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
    UPDATE public.api_keys
    SET last_used_at = NOW()
    WHERE key_prefix = key_prefix_param
    AND revoked_at IS NULL;
$$;

COMMENT ON FUNCTION public.update_api_key_last_used(TEXT) IS
    'Update last_used_at timestamp for API key. Called by application on successful API authentication.';

-- ============================================================================
-- PART 7: COMMENTS
-- Document the schema for future developers
-- ============================================================================

COMMENT ON TABLE api_keys IS 'API keys for organization authentication. Keys are stored as bcrypt hashes with only the prefix visible for display. Supports revocation and usage tracking.';
COMMENT ON TABLE admin_audit_logs IS 'Immutable audit log of all superadmin actions. Used for compliance, debugging, and security monitoring.';

COMMENT ON COLUMN api_keys.key_prefix IS 'First 8+ characters of API key for display (e.g., "mcai_abc12345"). Must be unique.';
COMMENT ON COLUMN api_keys.key_hash IS 'bcrypt hash of full API key. Never expose this value to clients.';
COMMENT ON COLUMN api_keys.name IS 'Optional human-readable name/description for the API key (e.g., "Production API", "Testing Key").';
COMMENT ON COLUMN api_keys.revoked_at IS 'Timestamp when key was revoked. NULL = active, NOT NULL = revoked. Revoked keys cannot be used for authentication.';
COMMENT ON COLUMN api_keys.last_used_at IS 'Last time this API key was successfully used for authentication. NULL = never used.';

COMMENT ON COLUMN admin_audit_logs.action IS 'Action performed by admin (e.g., "create_organization", "revoke_api_key", "update_user_role").';
COMMENT ON COLUMN admin_audit_logs.resource_type IS 'Type of resource affected (e.g., "organization", "api_key", "user").';
COMMENT ON COLUMN admin_audit_logs.resource_id IS 'UUID of the affected resource.';
COMMENT ON COLUMN admin_audit_logs.metadata IS 'JSONB containing additional context like old/new values, reason, request metadata, etc.';

-- ============================================================================
-- PART 8: VERIFICATION QUERIES
-- Run these queries to verify migration success
-- ============================================================================

-- Verify tables exist
DO $$
BEGIN
    ASSERT (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys') = 1,
        'api_keys table was not created';
    ASSERT (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'admin_audit_logs') = 1,
        'admin_audit_logs table was not created';
    RAISE NOTICE 'Verification: Tables created successfully';
END $$;

-- Verify indexes exist
DO $$
BEGIN
    ASSERT (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'api_keys') >= 5,
        'api_keys indexes were not created';
    ASSERT (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'admin_audit_logs') >= 5,
        'admin_audit_logs indexes were not created';
    RAISE NOTICE 'Verification: Indexes created successfully';
END $$;

-- Verify RLS is enabled
DO $$
BEGIN
    ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'api_keys' AND relnamespace = 'public'::regnamespace),
        'RLS not enabled on api_keys';
    ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'admin_audit_logs' AND relnamespace = 'public'::regnamespace),
        'RLS not enabled on admin_audit_logs';
    RAISE NOTICE 'Verification: RLS enabled successfully';
END $$;

-- Verify RLS policies exist
DO $$
BEGIN
    ASSERT (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'api_keys') >= 4,
        'api_keys RLS policies were not created';
    ASSERT (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_audit_logs') >= 2,
        'admin_audit_logs RLS policies were not created';
    RAISE NOTICE 'Verification: RLS policies created successfully';
END $$;

-- Verify helper functions exist
DO $$
BEGIN
    ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'is_api_key_valid' AND pronamespace = 'public'::regnamespace) = 1,
        'is_api_key_valid function was not created';
    ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'get_organization_from_api_key' AND pronamespace = 'public'::regnamespace) = 1,
        'get_organization_from_api_key function was not created';
    ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'update_api_key_last_used' AND pronamespace = 'public'::regnamespace) = 1,
        'update_api_key_last_used function was not created';
    RAISE NOTICE 'Verification: Helper functions created successfully';
END $$;

-- Verify is_superadmin helper exists (should have been created in previous migration)
DO $$
BEGIN
    ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'is_superadmin' AND pronamespace = 'public'::regnamespace) = 1,
        'is_superadmin function not found. Run migration 20251022142233 first.';
    RAISE NOTICE 'Verification: is_superadmin helper function exists';
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Success message
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Admin Panel Infrastructure Migration Complete';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tables created: api_keys, admin_audit_logs';
    RAISE NOTICE 'RLS enabled: All tables protected with superadmin-only policies';
    RAISE NOTICE 'Helper functions: is_api_key_valid, get_organization_from_api_key, update_api_key_last_used';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Create tRPC admin router (packages/course-gen-platform/src/server/routers/admin.ts)';
    RAISE NOTICE '2. Implement API key generation/validation logic';
    RAISE NOTICE '3. Create admin panel UI (megacampus-web/app/admin/)';
    RAISE NOTICE '========================================';
END $$;
