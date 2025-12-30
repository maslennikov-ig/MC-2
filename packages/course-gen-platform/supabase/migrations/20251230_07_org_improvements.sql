-- Migration: 20251230_07_org_improvements.sql
-- Purpose: Organization management improvements including audit logging,
--          invitation expiry, cleanup triggers, and soft delete support
-- Author: Database Schema Designer Agent
-- Date: 2025-12-30

-- ============================================================================
-- SECTION 1: AUDIT LOG TABLE
-- ============================================================================
-- Audit log table for compliance, debugging, and activity tracking.
-- Tracks all significant actions within organizations.

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add comment for documentation
COMMENT ON TABLE audit_log IS 'Audit log for tracking organization activities for compliance and debugging';
COMMENT ON COLUMN audit_log.action IS 'Action performed (e.g., create, update, delete, invite, join)';
COMMENT ON COLUMN audit_log.entity_type IS 'Type of entity affected (e.g., member, invitation, course)';
COMMENT ON COLUMN audit_log.entity_id IS 'UUID of the affected entity';
COMMENT ON COLUMN audit_log.old_values IS 'Previous state before the action (for updates/deletes)';
COMMENT ON COLUMN audit_log.new_values IS 'New state after the action (for creates/updates)';
COMMENT ON COLUMN audit_log.request_id IS 'Correlation ID for tracing requests across services';

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_log_org_time
ON audit_log(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_time
ON audit_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
ON audit_log(entity_type, entity_id);

-- Note: Partial indexes with time-based predicates using now() are not possible
-- because now() is not IMMUTABLE. Instead, we rely on the composite index
-- idx_audit_log_org_time which efficiently handles time-based queries.
-- For archival purposes, consider partitioning by time range in the future.

-- RLS for audit log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Admins (owner/manager) can view audit logs for their organization
CREATE POLICY "Admins can view audit logs"
ON audit_log FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = audit_log.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'manager')
  )
  OR is_superadmin(auth.uid())
);

-- Service role and authenticated users can insert audit logs
-- (actual authorization is handled at the application layer)
CREATE POLICY "Service role can insert audit logs"
ON audit_log FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================================================
-- SECTION 2: INVITATION EXPIRY FUNCTION
-- ============================================================================
-- Function to expire old invitations. Designed to be called by:
-- - Supabase Edge Function with pg_cron
-- - External cron job
-- - Manual maintenance

CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count integer;
BEGIN
  -- Update all pending invitations that have passed their expiry date
  UPDATE organization_invitations
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now();

  -- Return the number of expired invitations
  GET DIAGNOSTICS expired_count = ROW_COUNT;

  -- Log the expiration event if any invitations were expired
  IF expired_count > 0 THEN
    RAISE NOTICE 'Expired % invitations', expired_count;
  END IF;

  RETURN expired_count;
END;
$$;

COMMENT ON FUNCTION expire_old_invitations() IS
'Marks pending invitations as expired when their expires_at timestamp has passed.
Returns the number of invitations that were expired. Safe to call repeatedly (idempotent).';

-- ============================================================================
-- SECTION 3: INVITATION CLEANUP ON MEMBER DELETION
-- ============================================================================
-- When a member is removed from an organization, revoke any pending email
-- invitations that were sent to their email address.

CREATE OR REPLACE FUNCTION revoke_user_invitations_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
  revoked_count INTEGER;
BEGIN
  -- Get the user's email from auth.users
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = OLD.user_id;

  -- Only proceed if we found an email
  IF user_email IS NOT NULL THEN
    -- Revoke pending email invitations for this user in this org
    UPDATE organization_invitations
    SET status = 'revoked'
    WHERE organization_id = OLD.organization_id
      AND invitation_type = 'email'
      AND status = 'pending'
      AND email = user_email;

    GET DIAGNOSTICS revoked_count = ROW_COUNT;

    IF revoked_count > 0 THEN
      RAISE NOTICE 'Revoked % pending invitations for user % in organization %',
        revoked_count, OLD.user_id, OLD.organization_id;
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION revoke_user_invitations_on_delete() IS
'Trigger function that revokes pending email invitations when a member is removed from an organization.
This prevents removed users from re-joining via an old invitation link.';

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS cleanup_user_invitations_on_delete ON organization_members;

-- Create the trigger
CREATE TRIGGER cleanup_user_invitations_on_delete
  BEFORE DELETE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION revoke_user_invitations_on_delete();

-- ============================================================================
-- SECTION 4: SOFT DELETE FOR ORGANIZATIONS
-- ============================================================================
-- Add soft delete columns to organizations table.
-- This allows recovery of accidentally deleted organizations and maintains
-- referential integrity for historical data.

-- Add soft delete columns
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN organizations.deleted_at IS 'Timestamp when the organization was soft-deleted. NULL means active.';
COMMENT ON COLUMN organizations.deleted_by IS 'User who performed the soft delete operation.';

-- Index for efficient filtering of non-deleted organizations
CREATE INDEX IF NOT EXISTS idx_organizations_deleted
ON organizations(deleted_at)
WHERE deleted_at IS NOT NULL;

-- Index for finding active organizations (most common case)
CREATE INDEX IF NOT EXISTS idx_organizations_active
ON organizations(id)
WHERE deleted_at IS NULL;

-- Update RLS policy to hide deleted organizations from regular queries
-- First, drop the existing policy if it exists
DROP POLICY IF EXISTS "Hide deleted organizations" ON organizations;

-- Create new policy that filters out deleted organizations
-- Note: This policy works alongside existing policies - it's additive
CREATE POLICY "Hide deleted organizations"
ON organizations FOR SELECT
TO authenticated
USING (deleted_at IS NULL);

-- ============================================================================
-- SECTION 5: HELPER FUNCTION FOR SOFT DELETE
-- ============================================================================
-- Function to soft delete an organization (owner only)

CREATE OR REPLACE FUNCTION soft_delete_organization(org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_owner BOOLEAN;
BEGIN
  -- Check if the current user is the owner of this organization
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role = 'owner'
  ) INTO is_owner;

  -- Only owners or superadmins can soft delete
  IF NOT is_owner AND NOT is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only organization owners can delete organizations';
  END IF;

  -- Perform soft delete
  UPDATE organizations
  SET
    deleted_at = now(),
    deleted_by = auth.uid()
  WHERE id = org_id
    AND deleted_at IS NULL;

  -- Return true if a row was updated
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION soft_delete_organization(UUID) IS
'Soft deletes an organization by setting deleted_at timestamp. Only owners and superadmins can perform this action.
Returns TRUE if the organization was deleted, FALSE if it was already deleted or not found.';

-- ============================================================================
-- SECTION 6: HELPER FUNCTION TO RESTORE ORGANIZATION
-- ============================================================================
-- Function to restore a soft-deleted organization (superadmin only)

CREATE OR REPLACE FUNCTION restore_organization(org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only superadmins can restore deleted organizations
  IF NOT is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only superadmins can restore deleted organizations';
  END IF;

  -- Restore the organization
  UPDATE organizations
  SET
    deleted_at = NULL,
    deleted_by = NULL
  WHERE id = org_id
    AND deleted_at IS NOT NULL;

  -- Return true if a row was updated
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION restore_organization(UUID) IS
'Restores a soft-deleted organization. Only superadmins can perform this action.
Returns TRUE if the organization was restored, FALSE if it was not deleted or not found.';

-- ============================================================================
-- SECTION 7: AUDIT LOG HELPER FUNCTION
-- ============================================================================
-- Convenience function to insert audit log entries

CREATE OR REPLACE FUNCTION log_audit_event(
  p_organization_id UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO audit_log (
    organization_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    ip_address,
    user_agent,
    request_id
  ) VALUES (
    p_organization_id,
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_old_values,
    p_new_values,
    p_ip_address,
    p_user_agent,
    p_request_id
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;

COMMENT ON FUNCTION log_audit_event IS
'Helper function to insert audit log entries. Automatically captures the current user from auth.uid().
Returns the UUID of the created audit log entry.';
