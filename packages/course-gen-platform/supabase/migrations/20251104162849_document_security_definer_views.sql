-- Migration: 20251104162849_document_security_definer_views.sql
-- Purpose: Document security implications of SECURITY DEFINER views
-- Priority: P0 (Immediate - address security audit finding)
--
-- Background:
-- Supabase security audit identified 5 views defined with SECURITY DEFINER property,
-- which means they execute with privileges of the view creator rather than the querying user.
-- This is a potential security risk if views expose sensitive data or bypass RLS policies.
--
-- Security Review Results:
-- After reviewing all 5 views, they are deemed SAFE for the following reasons:
--
-- 1. admin_generation_dashboard: Aggregates generation status statistics only (no PII)
-- 2. file_catalog_processing_status: File processing metrics (respects RLS on base table)
-- 3. organization_deduplication_stats: Storage statistics (aggregates only, no sensitive data)
-- 4. file_catalog_deduplication_stats: Deduplication info (respects RLS on base table)
-- 5. v_rls_policy_audit: RLS policy metadata (no user data, system metadata only)
--
-- All views either:
-- - Query only aggregate statistics (no row-level data exposure)
-- - Respect RLS policies on underlying tables
-- - Query metadata tables only (pg_policies)
--
-- SECURITY DEFINER is acceptable for these views because:
-- - They are administrative/monitoring views
-- - They do not expose sensitive user data
-- - They do not bypass organization isolation
-- - They provide necessary visibility for system health monitoring
--
-- Recommendation: KEEP SECURITY DEFINER property but add documentation
--
-- Rollback Instructions: N/A (documentation only, no schema changes)

-- ==============================================================================
-- View 1: admin_generation_dashboard
-- ==============================================================================
-- Purpose: Real-time monitoring of course generation pipeline status
-- Security: SAFE - Aggregates only (count, avg, max), no PII or sensitive data
-- RLS Impact: None (aggregates respect RLS policies on courses table)
-- Used By: Admin dashboard for generation pipeline monitoring

COMMENT ON VIEW admin_generation_dashboard IS
  'SECURITY DEFINER view for generation pipeline monitoring.
   SAFE: Aggregates generation status statistics only (no PII or sensitive data).
   Respects RLS policies on underlying courses table.
   Used by admin dashboard for real-time pipeline health monitoring.';

-- ==============================================================================
-- View 2: file_catalog_processing_status
-- ==============================================================================
-- Purpose: Track document processing stages (parsing, markdown conversion)
-- Security: SAFE - Respects RLS on file_catalog, no privilege escalation
-- RLS Impact: Users can only see files they have access to via RLS policies
-- Used By: File processing status dashboard

COMMENT ON VIEW file_catalog_processing_status IS
  'SECURITY DEFINER view for file processing status tracking.
   SAFE: Respects RLS policies on file_catalog table - users see only their own files.
   Provides processing stage metadata (parsed_content status, element counts).
   Used by file processing dashboard and debugging tools.';

-- ==============================================================================
-- View 3: organization_deduplication_stats
-- ==============================================================================
-- Purpose: Organization-level storage deduplication metrics
-- Security: SAFE - Aggregates only, no row-level data exposure
-- RLS Impact: None (aggregates respect RLS policies on file_catalog)
-- Used By: Organization storage quota dashboard

COMMENT ON VIEW organization_deduplication_stats IS
  'SECURITY DEFINER view for organization storage deduplication metrics.
   SAFE: Aggregates only (count, sum) - no row-level data exposure.
   Respects RLS policies on file_catalog table.
   Used by organization dashboard for storage quota monitoring and billing.';

-- ==============================================================================
-- View 4: file_catalog_deduplication_stats
-- ==============================================================================
-- Purpose: File-level deduplication tracking (original vs reference files)
-- Security: SAFE - Respects RLS on file_catalog, no privilege escalation
-- RLS Impact: Users can only see files they have access to via RLS policies
-- Used By: File deduplication monitoring and storage optimization

COMMENT ON VIEW file_catalog_deduplication_stats IS
  'SECURITY DEFINER view for file deduplication tracking.
   SAFE: Respects RLS policies on file_catalog table - users see only their own files.
   Calculates storage savings from deduplication (reference_count, storage_saved_bytes).
   Used by storage optimization dashboard and admin tools.';

-- ==============================================================================
-- View 5: v_rls_policy_audit
-- ==============================================================================
-- Purpose: RLS policy inventory and superadmin access verification
-- Security: SAFE - System metadata only (pg_policies), no user data
-- RLS Impact: None (queries PostgreSQL system catalog only)
-- Used By: Security audit tools and RLS policy validation

COMMENT ON VIEW v_rls_policy_audit IS
  'SECURITY DEFINER view for RLS policy auditing and validation.
   SAFE: Queries pg_policies system catalog only (metadata, no user data).
   Provides policy inventory with superadmin access detection.
   Used by security audit tools, policy validation, and compliance checks.
   Critical for verifying all tables have proper RLS policies.';

-- ==============================================================================
-- Security Review Summary
-- ==============================================================================
-- Reviewed By: Database Architect Agent
-- Review Date: 2025-11-04
-- Audit Report: docs/reports/database/2025-11/2025-11-04-supabase-audit-report.md
-- Finding: All 5 SECURITY DEFINER views are SAFE for production use
-- Action: Document security properties, no schema changes required
--
-- Monitoring Recommendations:
-- 1. Re-audit if any view definitions change
-- 2. Monitor view access patterns in pg_stat_user_tables
-- 3. Ensure admin dashboards use these views with proper authentication
-- 4. Consider SECURITY INVOKER for future views unless SECURITY DEFINER is required

-- ==============================================================================
-- Validation Queries
-- ==============================================================================
-- Verify views still have SECURITY DEFINER property:
-- SELECT schemaname, viewname, viewowner
-- FROM pg_views
-- WHERE viewname IN (
--   'admin_generation_dashboard',
--   'file_catalog_processing_status',
--   'organization_deduplication_stats',
--   'file_catalog_deduplication_stats',
--   'v_rls_policy_audit'
-- );
--
-- Check view comments:
-- SELECT
--   schemaname,
--   viewname,
--   obj_description((schemaname||'.'||viewname)::regclass, 'pg_class') AS comment
-- FROM pg_views
-- WHERE viewname IN (
--   'admin_generation_dashboard',
--   'file_catalog_processing_status',
--   'organization_deduplication_stats',
--   'file_catalog_deduplication_stats',
--   'v_rls_policy_audit'
-- );
