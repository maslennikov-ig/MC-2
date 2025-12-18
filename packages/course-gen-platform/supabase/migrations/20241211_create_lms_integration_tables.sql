-- ============================================================================
-- Migration: 20241211_create_lms_integration_tables.sql
-- Purpose: Create database schema for Open edX LMS Integration feature
-- Author: database-architect (lms-integration-specialist)
-- Date: 2024-12-11
-- Related: specs/openedx-integration/data-model.md
-- ============================================================================

-- ============================================================================
-- PART 1: ENUMS
-- Define enum types for LMS import workflow
-- ============================================================================

-- LMS import job status lifecycle
CREATE TYPE lms_import_status AS ENUM (
  'pending',      -- Job created, awaiting processing
  'uploading',    -- Uploading course archive to LMS
  'processing',   -- LMS is processing the import
  'succeeded',    -- Import completed successfully
  'failed'        -- Import failed with errors
);

COMMENT ON TYPE lms_import_status IS 'Lifecycle states for LMS import jobs';

-- ============================================================================
-- PART 2: TABLES
-- LMS configuration and import job tracking tables
-- ============================================================================

-- ----------------------------------------------------------------------------
-- lms_configurations: OAuth credentials and connection settings for LMS instances
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lms_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- LMS connection details
  lms_url TEXT NOT NULL,
  studio_url TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,

  -- Default import parameters
  default_org TEXT NOT NULL,
  default_run TEXT DEFAULT 'self_paced',

  -- Operational settings
  import_timeout_seconds INTEGER DEFAULT 300,
  max_retries INTEGER DEFAULT 3,
  is_active BOOLEAN DEFAULT true,

  -- Connection health monitoring
  last_connection_test TIMESTAMPTZ,
  last_connection_status TEXT,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),

  -- Constraints
  CONSTRAINT unique_lms_config_name_per_org UNIQUE (organization_id, name),
  CONSTRAINT valid_lms_url CHECK (lms_url ~ '^https?://'),
  CONSTRAINT valid_studio_url CHECK (studio_url ~ '^https?://'),
  CONSTRAINT positive_timeout CHECK (import_timeout_seconds > 0),
  CONSTRAINT positive_retries CHECK (max_retries >= 0)
);

COMMENT ON TABLE lms_configurations IS 'OAuth2 credentials and connection settings for Open edX LMS instances';
COMMENT ON COLUMN lms_configurations.lms_url IS 'Base URL of the LMS (e.g., https://lms.example.com)';
COMMENT ON COLUMN lms_configurations.studio_url IS 'Base URL of Studio (e.g., https://studio.example.com)';
COMMENT ON COLUMN lms_configurations.client_id IS 'OAuth2 client ID for API authentication';
COMMENT ON COLUMN lms_configurations.client_secret IS 'OAuth2 client secret for API authentication';
COMMENT ON COLUMN lms_configurations.default_org IS 'Default organization identifier for course imports';
COMMENT ON COLUMN lms_configurations.default_run IS 'Default course run identifier (e.g., self_paced, 2024_Q1)';
COMMENT ON COLUMN lms_configurations.import_timeout_seconds IS 'Maximum time to wait for import completion';
COMMENT ON COLUMN lms_configurations.max_retries IS 'Maximum number of retry attempts for failed imports';
COMMENT ON COLUMN lms_configurations.last_connection_test IS 'Timestamp of last successful connection test';
COMMENT ON COLUMN lms_configurations.last_connection_status IS 'Result of last connection test (success/error message)';

-- ----------------------------------------------------------------------------
-- lms_import_jobs: Tracks course import jobs to LMS with status and error handling
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lms_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lms_configuration_id UUID NOT NULL REFERENCES lms_configurations(id) ON DELETE CASCADE,

  -- edX identifiers
  edx_course_key TEXT NOT NULL,
  edx_task_id TEXT,

  -- Job status tracking
  status lms_import_status DEFAULT 'pending',
  progress_percent INTEGER DEFAULT 0,

  -- Timing metrics
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Error tracking
  error_code TEXT,
  error_message TEXT,
  error_details JSONB,

  -- Result URLs
  course_url TEXT,
  studio_url TEXT,

  -- Additional metadata (custom fields, import parameters, etc.)
  metadata JSONB DEFAULT '{}',

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),

  -- Constraints
  CONSTRAINT valid_progress CHECK (progress_percent >= 0 AND progress_percent <= 100),
  CONSTRAINT valid_duration CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

COMMENT ON TABLE lms_import_jobs IS 'Tracks course import jobs to Open edX LMS with status, progress, and error details';
COMMENT ON COLUMN lms_import_jobs.edx_course_key IS 'Open edX course key (e.g., course-v1:ORG+COURSE+RUN)';
COMMENT ON COLUMN lms_import_jobs.edx_task_id IS 'Task ID from LMS import API for status polling';
COMMENT ON COLUMN lms_import_jobs.progress_percent IS 'Import progress (0-100)';
COMMENT ON COLUMN lms_import_jobs.duration_ms IS 'Total import duration in milliseconds';
COMMENT ON COLUMN lms_import_jobs.error_code IS 'Standardized error code for failed imports';
COMMENT ON COLUMN lms_import_jobs.error_message IS 'Human-readable error message';
COMMENT ON COLUMN lms_import_jobs.error_details IS 'Detailed error information (stack traces, API responses, etc.)';
COMMENT ON COLUMN lms_import_jobs.course_url IS 'URL to view the course in LMS after successful import';
COMMENT ON COLUMN lms_import_jobs.studio_url IS 'URL to edit the course in Studio after successful import';
COMMENT ON COLUMN lms_import_jobs.metadata IS 'Additional metadata (import parameters, custom fields, etc.)';

-- ============================================================================
-- PART 3: INDEXES
-- Performance optimization for common queries
-- ============================================================================

-- lms_configurations indexes
CREATE INDEX idx_lms_configurations_org ON lms_configurations(organization_id);
CREATE INDEX idx_lms_configurations_active ON lms_configurations(is_active)
  WHERE is_active = true;

COMMENT ON INDEX idx_lms_configurations_org IS 'Fast lookup of LMS configs by organization';
COMMENT ON INDEX idx_lms_configurations_active IS 'Partial index for active configurations only';

-- lms_import_jobs indexes
CREATE INDEX idx_lms_import_jobs_course ON lms_import_jobs(course_id);
CREATE INDEX idx_lms_import_jobs_status ON lms_import_jobs(status);
CREATE INDEX idx_lms_import_jobs_created ON lms_import_jobs(created_at DESC);
CREATE INDEX idx_lms_import_jobs_active ON lms_import_jobs(status)
  WHERE status IN ('pending', 'uploading', 'processing');

COMMENT ON INDEX idx_lms_import_jobs_course IS 'Fast lookup of import jobs by course';
COMMENT ON INDEX idx_lms_import_jobs_status IS 'Fast filtering by job status';
COMMENT ON INDEX idx_lms_import_jobs_created IS 'Recent jobs first (job history queries)';
COMMENT ON INDEX idx_lms_import_jobs_active IS 'Partial index for in-progress jobs only';

-- ============================================================================
-- PART 4: ROW-LEVEL SECURITY (RLS)
-- Implement multi-tenant data isolation
-- ============================================================================

-- Enable RLS on both tables
ALTER TABLE lms_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_import_jobs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- lms_configurations RLS policies
-- ----------------------------------------------------------------------------

-- Users can view/modify LMS configs for their organization only
CREATE POLICY lms_config_org_access ON lms_configurations
  FOR ALL
  USING (
    organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
  );

COMMENT ON POLICY lms_config_org_access ON lms_configurations IS
  'Users can access LMS configurations only for their organization (via JWT organization_id claim)';

-- ----------------------------------------------------------------------------
-- lms_import_jobs RLS policies
-- ----------------------------------------------------------------------------

-- Users can view/modify import jobs based on their role and course access
CREATE POLICY lms_import_jobs_access ON lms_import_jobs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = lms_import_jobs.course_id
        AND (
          -- Admins can access all import jobs in their organization
          (
            (SELECT (auth.jwt() ->> 'role')) = 'admin'
            AND c.organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
          )
          OR
          -- Instructors can access import jobs for their own courses
          (
            (SELECT (auth.jwt() ->> 'role')) = 'instructor'
            AND c.user_id = (SELECT auth.uid())
            AND c.organization_id = (SELECT (auth.jwt() ->> 'organization_id')::uuid)
          )
        )
    )
  );

COMMENT ON POLICY lms_import_jobs_access ON lms_import_jobs IS
  'Admins can access all import jobs in their organization; instructors can access import jobs for their own courses';

-- ============================================================================
-- PART 5: TRIGGERS
-- Automatic timestamp updates
-- ============================================================================

-- Update updated_at timestamp on lms_configurations changes
CREATE TRIGGER update_lms_configurations_updated_at
  BEFORE UPDATE ON lms_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TRIGGER update_lms_configurations_updated_at ON lms_configurations IS
  'Automatically update updated_at timestamp on row modification';

-- ============================================================================
-- Migration Complete
-- ============================================================================
