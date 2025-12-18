-- ============================================================================
-- Migration: 20251016_add_compound_indexes.sql
-- Purpose: Add compound indexes to optimize common query patterns
-- Author: bug-fixer-agent
-- Date: 2025-10-16
-- Bug: M006 - Add missing database indexes
-- ============================================================================

-- ============================================================================
-- PART 1: COMPOUND INDEXES FOR QUERY OPTIMIZATION
-- These indexes improve performance for common filtering patterns
-- ============================================================================

-- Organizations: Optimize tier-based filtering with ID lookups
-- Common pattern: WHERE id = ? AND tier = ?
-- Use case: Billing router, tier validation
CREATE INDEX IF NOT EXISTS idx_organizations_id_tier
    ON organizations(id, tier);

-- Courses: Optimize organization + status filtering
-- Common pattern: WHERE organization_id = ? AND status = ?
-- Use case: Admin router - list courses by org and status, generation router
CREATE INDEX IF NOT EXISTS idx_courses_org_status
    ON courses(organization_id, status);

-- File Catalog: Optimize course + organization lookups
-- Common pattern: WHERE course_id = ? AND organization_id = ?
-- Use case: File upload validation, quota checks
CREATE INDEX IF NOT EXISTS idx_file_catalog_course_org
    ON file_catalog(course_id, organization_id);

-- File Catalog: Optimize organization + course lookups (reverse order for different access patterns)
-- Common pattern: WHERE organization_id = ? AND course_id = ?
-- Use case: Organization-wide file queries
CREATE INDEX IF NOT EXISTS idx_file_catalog_org_course
    ON file_catalog(organization_id, course_id);

-- Job Status: Enhance existing org+status index with created_at for temporal queries
-- Common pattern: WHERE organization_id = ? AND status = ? ORDER BY created_at DESC
-- Use case: Jobs router - recent jobs by status, monitoring dashboard
-- Note: This replaces the existing idx_job_status_org_status with temporal component
DROP INDEX IF EXISTS idx_job_status_org_status;
CREATE INDEX idx_job_status_org_status_created
    ON job_status(organization_id, status, created_at DESC);

-- Job Status: Add user + status + created_at for user-specific job queries
-- Common pattern: WHERE user_id = ? AND status = ? ORDER BY created_at DESC
-- Use case: User dashboard showing recent job history
CREATE INDEX IF NOT EXISTS idx_job_status_user_status_created
    ON job_status(user_id, status, created_at DESC)
    WHERE user_id IS NOT NULL;

-- ============================================================================
-- PART 2: COMMENTS
-- Document the indexes for future developers
-- ============================================================================

COMMENT ON INDEX idx_organizations_id_tier IS
    'Compound index for tier-based filtering with ID lookups (billing, validation)';

COMMENT ON INDEX idx_courses_org_status IS
    'Compound index for organization + status filtering (admin router, course lists)';

COMMENT ON INDEX idx_file_catalog_course_org IS
    'Compound index for course + organization file lookups (upload validation, quota checks)';

COMMENT ON INDEX idx_file_catalog_org_course IS
    'Compound index for organization + course file lookups (org-wide queries)';

COMMENT ON INDEX idx_job_status_org_status_created IS
    'Compound index for organization + status + temporal queries (job monitoring, dashboards)';

COMMENT ON INDEX idx_job_status_user_status_created IS
    'Partial compound index for user-specific job queries with temporal ordering';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
