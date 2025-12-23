-- Migration: add_log_issue_status_table
-- Purpose: Create table to track status of log issues (errors and generation traces)
-- for admin review and resolution workflow

-- ============================================================================
-- 1. Create the log_issue_status table
-- ============================================================================
CREATE TABLE IF NOT EXISTS log_issue_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Polymorphic reference to either error_logs or generation_trace
    log_type TEXT NOT NULL CHECK (log_type IN ('error_log', 'generation_trace')),
    log_id UUID NOT NULL,

    -- Issue tracking fields
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'ignored')),
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Ensure one status record per log entry
    UNIQUE(log_type, log_id)
);

-- Add table comment
COMMENT ON TABLE log_issue_status IS 'Tracks review status for error_logs and generation_trace entries. Enables admin workflow for issue triage, assignment, and resolution.';

-- Add column comments
COMMENT ON COLUMN log_issue_status.log_type IS 'Type of log being tracked: error_log or generation_trace';
COMMENT ON COLUMN log_issue_status.log_id IS 'UUID reference to the log entry (polymorphic FK to error_logs.id or generation_trace.id)';
COMMENT ON COLUMN log_issue_status.status IS 'Current issue status: new (unreviewed), in_progress (being worked on), resolved (fixed), ignored (not actionable)';
COMMENT ON COLUMN log_issue_status.assigned_to IS 'User assigned to resolve this issue (nullable)';
COMMENT ON COLUMN log_issue_status.notes IS 'Free-form notes about the issue, resolution steps, or reason for ignoring';
COMMENT ON COLUMN log_issue_status.updated_by IS 'User who last updated this status record';

-- ============================================================================
-- 2. Create indexes for query performance
-- ============================================================================

-- Index on status for filtering by issue state (common dashboard query)
CREATE INDEX idx_log_issue_status_status ON log_issue_status(status);

-- Index on created_at for sorting (newest first in admin UI)
CREATE INDEX idx_log_issue_status_created_at ON log_issue_status(created_at DESC);

-- Index on assigned_to for filtering by assignee
CREATE INDEX idx_log_issue_status_assigned_to ON log_issue_status(assigned_to) WHERE assigned_to IS NOT NULL;

-- Composite index for common query pattern: filter by type + status
CREATE INDEX idx_log_issue_status_type_status ON log_issue_status(log_type, status);

-- ============================================================================
-- 3. Create trigger for auto-updating updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_log_issue_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_issue_status_updated_at
    BEFORE UPDATE ON log_issue_status
    FOR EACH ROW
    EXECUTE FUNCTION update_log_issue_status_updated_at();

-- ============================================================================
-- 4. Enable RLS and create policies
-- ============================================================================

ALTER TABLE log_issue_status ENABLE ROW LEVEL SECURITY;

-- Policy: Superadmin can read all log issue statuses
CREATE POLICY "superadmin_select_all_log_issue_status"
    ON log_issue_status
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Policy: Admin can read log issue statuses for their organization's logs
-- This requires joining through error_logs or generation_trace to get organization
CREATE POLICY "admin_select_org_log_issue_status"
    ON log_issue_status
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
        AND (
            -- For error_logs: check organization_id directly
            (log_type = 'error_log' AND EXISTS (
                SELECT 1 FROM error_logs el
                JOIN users u ON u.organization_id = el.organization_id
                WHERE el.id = log_issue_status.log_id
                AND u.id = auth.uid()
            ))
            OR
            -- For generation_trace: check via course -> organization
            (log_type = 'generation_trace' AND EXISTS (
                SELECT 1 FROM generation_trace gt
                JOIN courses c ON c.id = gt.course_id
                JOIN users u ON u.organization_id = c.organization_id
                WHERE gt.id = log_issue_status.log_id
                AND u.id = auth.uid()
            ))
        )
    );

-- Policy: Superadmin can insert log issue statuses
CREATE POLICY "superadmin_insert_log_issue_status"
    ON log_issue_status
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Policy: Admin can insert log issue statuses for their organization's logs
CREATE POLICY "admin_insert_org_log_issue_status"
    ON log_issue_status
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
        AND (
            (log_type = 'error_log' AND EXISTS (
                SELECT 1 FROM error_logs el
                JOIN users u ON u.organization_id = el.organization_id
                WHERE el.id = log_id
                AND u.id = auth.uid()
            ))
            OR
            (log_type = 'generation_trace' AND EXISTS (
                SELECT 1 FROM generation_trace gt
                JOIN courses c ON c.id = gt.course_id
                JOIN users u ON u.organization_id = c.organization_id
                WHERE gt.id = log_id
                AND u.id = auth.uid()
            ))
        )
    );

-- Policy: Superadmin can update all log issue statuses
CREATE POLICY "superadmin_update_log_issue_status"
    ON log_issue_status
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Policy: Admin can update log issue statuses for their organization's logs
CREATE POLICY "admin_update_org_log_issue_status"
    ON log_issue_status
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
        AND (
            (log_type = 'error_log' AND EXISTS (
                SELECT 1 FROM error_logs el
                JOIN users u ON u.organization_id = el.organization_id
                WHERE el.id = log_issue_status.log_id
                AND u.id = auth.uid()
            ))
            OR
            (log_type = 'generation_trace' AND EXISTS (
                SELECT 1 FROM generation_trace gt
                JOIN courses c ON c.id = gt.course_id
                JOIN users u ON u.organization_id = c.organization_id
                WHERE gt.id = log_issue_status.log_id
                AND u.id = auth.uid()
            ))
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
        AND (
            (log_type = 'error_log' AND EXISTS (
                SELECT 1 FROM error_logs el
                JOIN users u ON u.organization_id = el.organization_id
                WHERE el.id = log_id
                AND u.id = auth.uid()
            ))
            OR
            (log_type = 'generation_trace' AND EXISTS (
                SELECT 1 FROM generation_trace gt
                JOIN courses c ON c.id = gt.course_id
                JOIN users u ON u.organization_id = c.organization_id
                WHERE gt.id = log_id
                AND u.id = auth.uid()
            ))
        )
    );

-- Policy: Superadmin can delete log issue statuses
CREATE POLICY "superadmin_delete_log_issue_status"
    ON log_issue_status
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Policy: Admin can delete log issue statuses for their organization's logs
CREATE POLICY "admin_delete_org_log_issue_status"
    ON log_issue_status
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
        AND (
            (log_type = 'error_log' AND EXISTS (
                SELECT 1 FROM error_logs el
                JOIN users u ON u.organization_id = el.organization_id
                WHERE el.id = log_issue_status.log_id
                AND u.id = auth.uid()
            ))
            OR
            (log_type = 'generation_trace' AND EXISTS (
                SELECT 1 FROM generation_trace gt
                JOIN courses c ON c.id = gt.course_id
                JOIN users u ON u.organization_id = c.organization_id
                WHERE gt.id = log_issue_status.log_id
                AND u.id = auth.uid()
            ))
        )
    );

-- Policy: Service role has full access (for backend operations)
CREATE POLICY "service_role_full_access_log_issue_status"
    ON log_issue_status
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
