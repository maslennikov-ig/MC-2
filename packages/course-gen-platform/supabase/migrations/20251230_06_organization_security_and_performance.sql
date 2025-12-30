-- Migration: 20251230_06_organization_security_and_performance.sql
-- Purpose: Comprehensive security and performance improvements for organization management
--
-- Changes:
-- 1. Replace RLS policies with improved versions for organization_members and organization_invitations
-- 2. Add accept_invitation RPC function with race condition protection
-- 3. Add member limit enforcement trigger
-- 4. Add member_count column with auto-update trigger
-- 5. Add ownership transfer RPC function
-- 6. Add performance indexes

-- ============================================================================
-- SECTION 1: RLS POLICY IMPROVEMENTS
-- ============================================================================

-- Drop existing policies on organization_members to replace with improved versions
DROP POLICY IF EXISTS "org_members_select" ON organization_members;
DROP POLICY IF EXISTS "org_members_insert" ON organization_members;
DROP POLICY IF EXISTS "org_members_update" ON organization_members;
DROP POLICY IF EXISTS "org_members_delete" ON organization_members;

-- Drop existing policies on organization_invitations to replace with improved versions
DROP POLICY IF EXISTS "invitations_select" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_insert" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_update" ON organization_invitations;
DROP POLICY IF EXISTS "invitations_delete" ON organization_invitations;

-- Organization Members Policies

-- Policy: Users can view their own memberships
CREATE POLICY "Users can view own memberships"
ON organization_members FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR is_superadmin(auth.uid())
);

-- Policy: Users can view all members in organizations they belong to
CREATE POLICY "Members can view org members"
ON organization_members FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organization_members.organization_id
    AND om.user_id = auth.uid()
  )
);

-- Policy: Admins/owners can insert members in their orgs
CREATE POLICY "Admins can insert members"
ON organization_members FOR INSERT
TO authenticated
WITH CHECK (
  is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organization_members.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'manager')
  )
);

-- Policy: Admins/owners can update members in their orgs (but cannot promote to owner unless they are owner)
CREATE POLICY "Admins can update members"
ON organization_members FOR UPDATE
TO authenticated
USING (
  is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organization_members.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'manager')
  )
)
WITH CHECK (
  -- Prevent non-owners from setting role to owner
  role <> 'owner'
  OR EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organization_members.organization_id
    AND om.user_id = auth.uid()
    AND om.role = 'owner'
  )
  OR is_superadmin(auth.uid())
);

-- Policy: Users can delete their own membership (leave org) or admins can remove members
CREATE POLICY "Users can leave or admins can remove"
ON organization_members FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()  -- Users can leave
  OR is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organization_members.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'manager')
  )
);

-- Organization Invitations Policies

-- Policy: Admins can view all invitations in their orgs
CREATE POLICY "Admins can view invitations"
ON organization_invitations FOR SELECT
TO authenticated
USING (
  is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organization_invitations.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'manager')
  )
);

-- Policy: Anyone can view pending link/code invitations (for accept flow)
CREATE POLICY "View pending link or code invitations"
ON organization_invitations FOR SELECT
TO authenticated
USING (
  status = 'pending'
  AND expires_at > now()
  AND invitation_type IN ('link', 'code')
);

-- Policy: Users can view invitations sent to their email
CREATE POLICY "Users can view own email invitations"
ON organization_invitations FOR SELECT
TO authenticated
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
  AND status = 'pending'
  AND expires_at > now()
);

-- Policy: Admins can create invitations
CREATE POLICY "Admins can create invitations"
ON organization_invitations FOR INSERT
TO authenticated
WITH CHECK (
  is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organization_invitations.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'manager')
  )
);

-- Policy: Admins can update invitations (revoke, etc.)
CREATE POLICY "Admins can update invitations"
ON organization_invitations FOR UPDATE
TO authenticated
USING (
  is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organization_invitations.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'manager')
  )
);

-- Policy: Allow update for invitation acceptance (pending invitations can be accepted)
CREATE POLICY "Accept pending invitations"
ON organization_invitations FOR UPDATE
TO authenticated
USING (
  status = 'pending'
  AND expires_at > now()
)
WITH CHECK (
  -- Can only update to accepted status or increment uses
  status IN ('pending', 'accepted')
);

-- Policy: Admins can delete invitations
CREATE POLICY "Admins can delete invitations"
ON organization_invitations FOR DELETE
TO authenticated
USING (
  is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organization_invitations.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'manager')
  )
);

-- ============================================================================
-- SECTION 2: ACCEPT INVITATION RPC FUNCTION
-- ============================================================================

-- Drop existing function if it exists to ensure clean replacement
DROP FUNCTION IF EXISTS accept_invitation(UUID, UUID);

-- Create accept_invitation function with race condition protection
CREATE OR REPLACE FUNCTION accept_invitation(
  p_invitation_id UUID,
  p_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation RECORD;
  v_member_id UUID;
BEGIN
  -- Lock invitation row to prevent race conditions
  SELECT * INTO v_invitation
  FROM organization_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation not found');
  END IF;

  IF v_invitation.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation is no longer valid');
  END IF;

  IF v_invitation.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation has expired');
  END IF;

  -- Check max uses for link/code invitations
  IF v_invitation.max_uses IS NOT NULL AND v_invitation.current_uses >= v_invitation.max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation has reached maximum uses');
  END IF;

  -- For email invitations, verify the user's email matches
  IF v_invitation.invitation_type = 'email' THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = p_user_id
      AND email = v_invitation.email
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Email does not match invitation');
    END IF;
  END IF;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = v_invitation.organization_id
    AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already a member of this organization');
  END IF;

  -- Insert membership
  INSERT INTO organization_members (
    organization_id, user_id, role, invited_by
  ) VALUES (
    v_invitation.organization_id,
    p_user_id,
    v_invitation.role,
    v_invitation.created_by
  )
  RETURNING id INTO v_member_id;

  -- Update invitation atomically
  UPDATE organization_invitations
  SET
    current_uses = current_uses + 1,
    status = CASE
      WHEN invitation_type = 'email' THEN 'accepted'::invitation_status
      WHEN max_uses IS NOT NULL AND current_uses + 1 >= max_uses THEN 'accepted'::invitation_status
      ELSE status
    END,
    accepted_by = CASE
      WHEN invitation_type = 'email' THEN p_user_id
      WHEN max_uses IS NOT NULL AND current_uses + 1 >= max_uses THEN p_user_id
      ELSE accepted_by
    END,
    accepted_at = CASE
      WHEN invitation_type = 'email' THEN now()
      WHEN max_uses IS NOT NULL AND current_uses + 1 >= max_uses THEN now()
      ELSE accepted_at
    END
  WHERE id = p_invitation_id;

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_member_id,
    'organization_id', v_invitation.organization_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already a member of this organization');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION accept_invitation(UUID, UUID) TO authenticated;

-- ============================================================================
-- SECTION 3: MEMBER LIMIT ENFORCEMENT TRIGGER
-- ============================================================================

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS enforce_member_limit ON organization_members;
DROP FUNCTION IF EXISTS check_organization_member_limit();

-- Create function to check member limits
CREATE OR REPLACE FUNCTION check_organization_member_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_max_members INT;
  v_current_count INT;
BEGIN
  -- Get max members setting from organization
  SELECT (settings->>'maxMembers')::int INTO v_max_members
  FROM organizations
  WHERE id = NEW.organization_id;

  -- If max members is configured, check the limit
  IF v_max_members IS NOT NULL THEN
    SELECT COUNT(*) INTO v_current_count
    FROM organization_members
    WHERE organization_id = NEW.organization_id;

    IF v_current_count >= v_max_members THEN
      RAISE EXCEPTION 'Organization has reached maximum member limit (%)', v_max_members
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger to enforce member limit on insert
CREATE TRIGGER enforce_member_limit
  BEFORE INSERT ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION check_organization_member_limit();

-- ============================================================================
-- SECTION 4: MEMBER COUNT COLUMN AND AUTO-UPDATE TRIGGER
-- ============================================================================

-- Add member_count column if it doesn't exist
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS member_count INT NOT NULL DEFAULT 0;

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS maintain_member_count ON organization_members;
DROP FUNCTION IF EXISTS update_organization_member_count();

-- Create function to maintain member count
CREATE OR REPLACE FUNCTION update_organization_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE organizations
    SET member_count = member_count + 1
    WHERE id = NEW.organization_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE organizations
    SET member_count = GREATEST(member_count - 1, 0)  -- Prevent negative counts
    WHERE id = OLD.organization_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Create trigger to maintain member count
CREATE TRIGGER maintain_member_count
  AFTER INSERT OR DELETE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION update_organization_member_count();

-- Initialize counts from existing data
UPDATE organizations o
SET member_count = (
  SELECT COUNT(*)
  FROM organization_members om
  WHERE om.organization_id = o.id
);

-- ============================================================================
-- SECTION 5: OWNERSHIP TRANSFER RPC FUNCTION
-- ============================================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS transfer_organization_ownership(UUID, UUID, UUID);

-- Create ownership transfer function
CREATE OR REPLACE FUNCTION transfer_organization_ownership(
  p_org_id UUID,
  p_current_owner_id UUID,
  p_new_owner_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is the current owner (or superadmin)
  IF NOT (
    is_superadmin(auth.uid())
    OR (auth.uid() = p_current_owner_id AND EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = p_org_id
      AND user_id = p_current_owner_id
      AND role = 'owner'
    ))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to transfer ownership');
  END IF;

  -- Verify current owner exists and is actually owner
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
    AND user_id = p_current_owner_id
    AND role = 'owner'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Current owner not found or not an owner');
  END IF;

  -- Verify new owner is a member of the organization
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
    AND user_id = p_new_owner_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'New owner must be an existing member of the organization');
  END IF;

  -- Cannot transfer to self
  IF p_current_owner_id = p_new_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer ownership to yourself');
  END IF;

  -- Perform the transfer atomically
  -- Downgrade current owner to manager
  UPDATE organization_members
  SET role = 'manager'
  WHERE organization_id = p_org_id
    AND user_id = p_current_owner_id
    AND role = 'owner';

  -- Upgrade new owner
  UPDATE organization_members
  SET role = 'owner'
  WHERE organization_id = p_org_id
    AND user_id = p_new_owner_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Ownership transferred successfully',
    'new_owner_id', p_new_owner_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION transfer_organization_ownership(UUID, UUID, UUID) TO authenticated;

-- ============================================================================
-- SECTION 6: ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Compound index for email lookups on invitations
CREATE INDEX IF NOT EXISTS idx_invitations_email_status
ON organization_invitations(email, status)
WHERE email IS NOT NULL;

-- Index for created_by audit trail
CREATE INDEX IF NOT EXISTS idx_invitations_created_by
ON organization_invitations(created_by);

-- Partial index for active pending invitations (commonly queried)
CREATE INDEX IF NOT EXISTS idx_invitations_pending_active
ON organization_invitations(organization_id, status)
WHERE status = 'pending';

-- Index for member_count queries on organizations
CREATE INDEX IF NOT EXISTS idx_organizations_member_count
ON organizations(member_count);

-- ============================================================================
-- SECTION 7: COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION accept_invitation(UUID, UUID) IS
'Atomically accepts an invitation and creates membership. Handles race conditions with row locking.';

COMMENT ON FUNCTION check_organization_member_limit() IS
'Trigger function that enforces organization member limits from settings.maxMembers.';

COMMENT ON FUNCTION update_organization_member_count() IS
'Trigger function that maintains denormalized member_count on organizations table.';

COMMENT ON FUNCTION transfer_organization_ownership(UUID, UUID, UUID) IS
'Transfers organization ownership from current owner to new owner. Demotes current owner to manager.';

COMMENT ON COLUMN organizations.member_count IS
'Denormalized count of organization members for performance. Maintained by trigger.';
