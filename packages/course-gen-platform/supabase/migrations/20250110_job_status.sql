-- ============================================================================
-- Migration: 20250110_job_status.sql
-- Purpose: Implement job status tracking for BullMQ orchestration system
-- Author: database-architect
-- Date: 2025-01-10
-- ============================================================================

-- ============================================================================
-- PART 1: ENUMS
-- Job status states aligned with BullMQ job lifecycle
-- ============================================================================

-- Job status states (aligned with BullMQ states)
CREATE TYPE job_status_enum AS ENUM (
    'pending',     -- Job created, waiting to be processed
    'waiting',     -- Job waiting for dependencies or rate limit
    'active',      -- Job currently being processed by worker
    'completed',   -- Job successfully completed
    'failed',      -- Job failed (may retry based on max_attempts)
    'delayed'      -- Job delayed for retry after failure
);

-- ============================================================================
-- PART 2: TABLE
-- Core job status tracking table
-- ============================================================================

-- Job Status table for BullMQ job tracking
CREATE TABLE IF NOT EXISTS job_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id TEXT NOT NULL,
    job_type TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status job_status_enum NOT NULL DEFAULT 'pending',
    progress JSONB DEFAULT '{}',
    error_message TEXT,
    error_stack TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT job_status_job_id_unique UNIQUE (job_id),
    CONSTRAINT job_status_attempts_check CHECK (attempts >= 0 AND attempts <= max_attempts),
    CONSTRAINT job_status_max_attempts_positive CHECK (max_attempts > 0),
    CONSTRAINT job_status_timestamps_check CHECK (
        -- started_at must be after created_at if set
        (started_at IS NULL OR started_at >= created_at) AND
        -- completed_at must be after started_at if both set
        (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at) AND
        -- failed_at must be after started_at if both set
        (failed_at IS NULL OR started_at IS NULL OR failed_at >= started_at)
    ),
    CONSTRAINT job_status_completed_state_check CHECK (
        -- If status is 'completed', completed_at must be set
        (status = 'completed' AND completed_at IS NOT NULL) OR
        (status != 'completed')
    ),
    CONSTRAINT job_status_failed_state_check CHECK (
        -- If status is 'failed', failed_at must be set
        (status = 'failed' AND failed_at IS NOT NULL) OR
        (status != 'failed')
    )
);

-- ============================================================================
-- PART 3: INDEXES
-- Performance optimization for job queries
-- ============================================================================

-- Primary lookup index (most common query pattern)
CREATE INDEX idx_job_status_job_id ON job_status(job_id);

-- Organization and course filtering
CREATE INDEX idx_job_status_organization_id ON job_status(organization_id);
CREATE INDEX idx_job_status_course_id ON job_status(course_id);

-- Status filtering (for job queues and monitoring)
CREATE INDEX idx_job_status_status ON job_status(status);

-- Job type filtering (for analytics and debugging)
CREATE INDEX idx_job_status_job_type ON job_status(job_type);

-- Temporal queries (for job history and cleanup)
CREATE INDEX idx_job_status_created_at ON job_status(created_at DESC);
CREATE INDEX idx_job_status_updated_at ON job_status(updated_at DESC);

-- Composite index for common query: active jobs by organization
CREATE INDEX idx_job_status_org_status ON job_status(organization_id, status);

-- Composite index for user's job history
CREATE INDEX idx_job_status_user_created ON job_status(user_id, created_at DESC);

-- ============================================================================
-- PART 4: ROW LEVEL SECURITY (RLS)
-- Secure access control for job status data
-- ============================================================================

-- Enable RLS on job_status table
ALTER TABLE job_status ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ADMIN ROLE POLICIES (Full organization access)
-- ============================================================================

-- Admins can view all jobs in their organization
CREATE POLICY "admin_job_status_select"
    ON job_status
    FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Admins can create jobs for their organization
CREATE POLICY "admin_job_status_insert"
    ON job_status
    FOR INSERT
    TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Admins can update all jobs in their organization
CREATE POLICY "admin_job_status_update"
    ON job_status
    FOR UPDATE
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Admins can delete jobs in their organization (for cleanup)
CREATE POLICY "admin_job_status_delete"
    ON job_status
    FOR DELETE
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================================================
-- INSTRUCTOR ROLE POLICIES (Own jobs + view organization jobs)
-- ============================================================================

-- Instructors can view all jobs in their organization
CREATE POLICY "instructor_job_status_select_org"
    ON job_status
    FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'instructor'
        )
    );

-- Instructors can create jobs for their own courses
CREATE POLICY "instructor_job_status_insert"
    ON job_status
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'instructor') AND
        -- Course must be owned by instructor (if course_id is set)
        (course_id IS NULL OR course_id IN (
            SELECT id FROM courses WHERE user_id = auth.uid()
        ))
    );

-- Instructors can update their own jobs
CREATE POLICY "instructor_job_status_update_own"
    ON job_status
    FOR UPDATE
    TO authenticated
    USING (
        user_id = auth.uid() AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'instructor')
    )
    WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'instructor')
    );

-- ============================================================================
-- STUDENT ROLE POLICIES (Own jobs only, read-only)
-- ============================================================================

-- Students can view their own jobs
CREATE POLICY "student_job_status_select_own"
    ON job_status
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid() AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'student')
    );

-- Students cannot create, update, or delete jobs
-- (Jobs are created by system on their behalf)

-- ============================================================================
-- PART 5: TRIGGER FUNCTIONS
-- Automated timestamp management
-- ============================================================================

-- Reuse existing update_updated_at_column function from initial schema
-- Apply trigger to job_status table
CREATE TRIGGER update_job_status_updated_at
    BEFORE UPDATE ON job_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 6: COMMENTS
-- Document the table for future developers
-- ============================================================================

COMMENT ON TABLE job_status IS 'BullMQ job status tracking for persistence and querying';
COMMENT ON COLUMN job_status.job_id IS 'Unique BullMQ job ID from queue';
COMMENT ON COLUMN job_status.job_type IS 'Type of job (e.g., "course_generation", "document_processing")';
COMMENT ON COLUMN job_status.organization_id IS 'Organization owning this job (required for multi-tenancy)';
COMMENT ON COLUMN job_status.course_id IS 'Course associated with job (nullable for org-level jobs)';
COMMENT ON COLUMN job_status.user_id IS 'User who initiated the job (nullable for system jobs)';
COMMENT ON COLUMN job_status.status IS 'Current job state aligned with BullMQ lifecycle';
COMMENT ON COLUMN job_status.progress IS 'JSON object tracking job progress (percentage, current step, etc.)';
COMMENT ON COLUMN job_status.error_message IS 'Human-readable error message if job failed';
COMMENT ON COLUMN job_status.error_stack IS 'Full error stack trace for debugging';
COMMENT ON COLUMN job_status.attempts IS 'Number of times job has been attempted';
COMMENT ON COLUMN job_status.max_attempts IS 'Maximum retry attempts before permanent failure';
COMMENT ON COLUMN job_status.started_at IS 'Timestamp when job processing started';
COMMENT ON COLUMN job_status.completed_at IS 'Timestamp when job completed successfully';
COMMENT ON COLUMN job_status.failed_at IS 'Timestamp when job failed permanently';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
