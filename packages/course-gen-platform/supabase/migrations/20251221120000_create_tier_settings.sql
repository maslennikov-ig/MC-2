-- Migration: 20251221120000_create_tier_settings.sql
-- Purpose: Create tier_settings table for database-driven tier configuration
-- Replaces hardcoded TypeScript tier settings with centralized database configuration

-- =============================================================================
-- TABLE: tier_settings
-- =============================================================================
-- Stores subscription tier configurations including quotas, limits, and features.
-- Replaces hardcoded values in file-upload-constants.ts and other TypeScript files.

CREATE TABLE IF NOT EXISTS public.tier_settings (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tier identification (must match tier enum values)
    tier_key TEXT NOT NULL UNIQUE,

    -- Display information
    display_name TEXT NOT NULL,

    -- Storage quotas
    storage_quota_bytes BIGINT NOT NULL,
    max_file_size_bytes BIGINT NOT NULL,
    max_files_per_course INTEGER NOT NULL,

    -- Processing limits
    max_concurrent_jobs INTEGER NOT NULL,

    -- Allowed file types
    allowed_mime_types TEXT[] NOT NULL,
    allowed_extensions TEXT[] NOT NULL,

    -- Pricing (in cents for precision)
    monthly_price_cents INTEGER DEFAULT 0,

    -- Additional features (flexible JSONB for future expansion)
    features JSONB DEFAULT '{}'::jsonb,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Constraints
    CONSTRAINT tier_key_matches_enum CHECK (
        tier_key IN ('trial', 'free', 'basic', 'standard', 'premium')
    ),
    CONSTRAINT storage_quota_positive CHECK (storage_quota_bytes >= 0),
    CONSTRAINT max_file_size_positive CHECK (max_file_size_bytes >= 0),
    CONSTRAINT max_files_non_negative CHECK (max_files_per_course >= 0),
    CONSTRAINT max_concurrent_jobs_positive CHECK (max_concurrent_jobs >= 1),
    CONSTRAINT monthly_price_non_negative CHECK (monthly_price_cents >= 0)
);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE public.tier_settings IS
    'Subscription tier configurations with quotas, limits, and pricing. Single source of truth for tier-based features.';

COMMENT ON COLUMN public.tier_settings.id IS
    'Unique identifier for the tier setting record';

COMMENT ON COLUMN public.tier_settings.tier_key IS
    'Tier identifier matching the tier enum: trial, free, basic, standard, premium';

COMMENT ON COLUMN public.tier_settings.display_name IS
    'Human-readable tier name for UI display';

COMMENT ON COLUMN public.tier_settings.storage_quota_bytes IS
    'Maximum storage allowed per organization in bytes';

COMMENT ON COLUMN public.tier_settings.max_file_size_bytes IS
    'Maximum size of a single uploaded file in bytes';

COMMENT ON COLUMN public.tier_settings.max_files_per_course IS
    'Maximum number of files allowed per course (0 means no file uploads)';

COMMENT ON COLUMN public.tier_settings.max_concurrent_jobs IS
    'Maximum number of parallel generation jobs allowed';

COMMENT ON COLUMN public.tier_settings.allowed_mime_types IS
    'Array of allowed MIME types for file uploads';

COMMENT ON COLUMN public.tier_settings.allowed_extensions IS
    'Array of allowed file extensions for UI display';

COMMENT ON COLUMN public.tier_settings.monthly_price_cents IS
    'Monthly subscription price in cents (e.g., 4900 = $49.00)';

COMMENT ON COLUMN public.tier_settings.features IS
    'JSONB object for additional tier features (e.g., priority_support, custom_branding)';

COMMENT ON COLUMN public.tier_settings.is_active IS
    'Whether this tier is currently available for new subscriptions';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Index for tier lookup (most common query pattern)
CREATE INDEX idx_tier_settings_tier_key ON public.tier_settings(tier_key);

-- Index for active tiers (for listing available tiers)
CREATE INDEX idx_tier_settings_is_active ON public.tier_settings(is_active) WHERE is_active = true;

-- =============================================================================
-- TRIGGER: Auto-update updated_at
-- =============================================================================

CREATE TRIGGER update_tier_settings_updated_at
    BEFORE UPDATE ON public.tier_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.tier_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read active tier settings (needed for frontend pricing display)
CREATE POLICY "tier_settings_public_read"
    ON public.tier_settings
    FOR SELECT
    USING (is_active = true);

-- Policy: Superadmins can read all tier settings (including inactive)
CREATE POLICY "tier_settings_superadmin_read_all"
    ON public.tier_settings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE users.id = auth.uid()
            AND (users.raw_user_meta_data ->> 'role') = 'superadmin'
        )
    );

-- Policy: Superadmins can insert tier settings
CREATE POLICY "tier_settings_superadmin_insert"
    ON public.tier_settings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE users.id = auth.uid()
            AND (users.raw_user_meta_data ->> 'role') = 'superadmin'
        )
    );

-- Policy: Superadmins can update tier settings
CREATE POLICY "tier_settings_superadmin_update"
    ON public.tier_settings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE users.id = auth.uid()
            AND (users.raw_user_meta_data ->> 'role') = 'superadmin'
        )
    );

-- Policy: Superadmins can delete tier settings
CREATE POLICY "tier_settings_superadmin_delete"
    ON public.tier_settings
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE users.id = auth.uid()
            AND (users.raw_user_meta_data ->> 'role') = 'superadmin'
        )
    );

-- =============================================================================
-- SEED DATA
-- =============================================================================
-- Values derived from packages/shared-types/src/file-upload-constants.ts

INSERT INTO public.tier_settings (
    tier_key,
    display_name,
    storage_quota_bytes,
    max_file_size_bytes,
    max_files_per_course,
    max_concurrent_jobs,
    allowed_mime_types,
    allowed_extensions,
    monthly_price_cents,
    features,
    is_active
) VALUES
    -- Trial tier: Full features for evaluation
    (
        'trial',
        'Trial',
        1073741824,  -- 1 GB
        10485760,    -- 10 MB
        3,
        5,
        ARRAY[
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/html',
            'text/plain',
            'text/markdown'
        ],
        ARRAY['pdf', 'docx', 'pptx', 'html', 'txt', 'md'],
        0,
        '{"trial_duration_days": 14, "watermark_enabled": true}'::jsonb,
        true
    ),

    -- Free tier: Minimal features, no file uploads
    (
        'free',
        'Free',
        10485760,    -- 10 MB
        5242880,     -- 5 MB
        0,           -- No file uploads
        1,
        ARRAY[]::TEXT[],  -- No allowed MIME types
        ARRAY[]::TEXT[],  -- No allowed extensions
        0,
        '{"ads_enabled": true}'::jsonb,
        true
    ),

    -- Basic tier: Entry-level paid tier
    (
        'basic',
        'Basic',
        104857600,   -- 100 MB
        10485760,    -- 10 MB
        1,
        2,
        ARRAY['text/plain', 'text/markdown'],
        ARRAY['txt', 'md'],
        1900,        -- $19.00
        '{"email_support": true}'::jsonb,
        true
    ),

    -- Standard tier: Most popular tier
    (
        'standard',
        'Standard',
        1073741824,  -- 1 GB
        10485760,    -- 10 MB
        3,
        5,
        ARRAY[
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/html',
            'text/plain',
            'text/markdown'
        ],
        ARRAY['pdf', 'docx', 'pptx', 'html', 'txt', 'md'],
        4900,        -- $49.00
        '{"priority_support": true, "analytics_dashboard": true}'::jsonb,
        true
    ),

    -- Premium tier: Full features with images
    (
        'premium',
        'Premium',
        10737418240, -- 10 GB
        104857600,   -- 100 MB
        10,
        10,
        ARRAY[
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/html',
            'text/plain',
            'text/markdown',
            'image/png',
            'image/jpeg',
            'image/gif',
            'image/svg+xml',
            'image/webp'
        ],
        ARRAY['pdf', 'docx', 'pptx', 'html', 'txt', 'md', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'],
        14900,       -- $149.00
        '{"priority_support": true, "analytics_dashboard": true, "custom_branding": true, "api_access": true, "dedicated_support": true}'::jsonb,
        true
    )
ON CONFLICT (tier_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    storage_quota_bytes = EXCLUDED.storage_quota_bytes,
    max_file_size_bytes = EXCLUDED.max_file_size_bytes,
    max_files_per_course = EXCLUDED.max_files_per_course,
    max_concurrent_jobs = EXCLUDED.max_concurrent_jobs,
    allowed_mime_types = EXCLUDED.allowed_mime_types,
    allowed_extensions = EXCLUDED.allowed_extensions,
    monthly_price_cents = EXCLUDED.monthly_price_cents,
    features = EXCLUDED.features,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- =============================================================================
-- HELPER FUNCTION: Get tier settings by tier key
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_tier_settings(p_tier_key TEXT)
RETURNS public.tier_settings
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT * FROM public.tier_settings
    WHERE tier_key = p_tier_key
    AND is_active = true
    LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_tier_settings(TEXT) IS
    'Retrieves tier settings by tier key. Returns NULL if tier not found or inactive.';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_tier_settings(TEXT) TO authenticated;
