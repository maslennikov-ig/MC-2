-- Migration: 20251230_04_organization_invitations.sql
-- Purpose: Create organization_invitations table for managing member invitations
--          Supports three invitation types: email, link (shareable URL), and code (manual entry)

CREATE TABLE organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent organization
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Invitation type determines which fields are required
  invitation_type invitation_type NOT NULL,

  -- For email invitations: the recipient's email address
  email TEXT,

  -- For link invitations: unique URL token (UUID or similar)
  token TEXT UNIQUE,

  -- For code invitations: short alphanumeric code (e.g., "ABC123")
  code TEXT,

  -- Role to assign when invitation is accepted
  role org_role NOT NULL DEFAULT 'student',

  -- Who created this invitation
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- When this invitation expires
  expires_at TIMESTAMPTZ NOT NULL,

  -- Usage limits (NULL = unlimited for link/code types)
  max_uses INT,
  current_uses INT NOT NULL DEFAULT 0,

  -- Invitation status
  status invitation_status NOT NULL DEFAULT 'pending',

  -- Acceptance tracking (for email invitations or first use of link/code)
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,

  -- Constraint: ensure type-specific required fields are present
  CONSTRAINT invitation_type_fields_check CHECK (
    (invitation_type = 'email' AND email IS NOT NULL AND token IS NULL AND code IS NULL) OR
    (invitation_type = 'link' AND token IS NOT NULL AND email IS NULL AND code IS NULL) OR
    (invitation_type = 'code' AND code IS NOT NULL AND email IS NULL AND token IS NULL)
  ),

  -- Constraint: max_uses must be positive if set
  CONSTRAINT max_uses_positive CHECK (max_uses IS NULL OR max_uses > 0),

  -- Constraint: current_uses cannot exceed max_uses
  CONSTRAINT uses_within_limit CHECK (max_uses IS NULL OR current_uses <= max_uses)
);

-- Index for token lookups (link invitations - unique already creates index but this is explicit)
CREATE INDEX idx_invitations_token ON organization_invitations(token) WHERE token IS NOT NULL;

-- Index for code lookups (code invitations)
CREATE INDEX idx_invitations_code ON organization_invitations(code) WHERE code IS NOT NULL;

-- Composite index for email lookups within organization
CREATE INDEX idx_invitations_email_org ON organization_invitations(email, organization_id) WHERE email IS NOT NULL;

-- Index for listing invitations by status within organization
CREATE INDEX idx_invitations_status_org ON organization_invitations(organization_id, status);

-- Index for finding expired invitations (for cleanup jobs)
CREATE INDEX idx_invitations_expires ON organization_invitations(expires_at) WHERE status = 'pending';

-- Enable Row Level Security
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Add table and column comments
COMMENT ON TABLE organization_invitations IS 'Invitations for users to join organizations';
COMMENT ON COLUMN organization_invitations.invitation_type IS 'Delivery method: email (direct), link (shareable URL), or code (manual entry)';
COMMENT ON COLUMN organization_invitations.token IS 'Unique token for link-type invitations, used in shareable URLs';
COMMENT ON COLUMN organization_invitations.code IS 'Short alphanumeric code for code-type invitations';
COMMENT ON COLUMN organization_invitations.max_uses IS 'Maximum number of times this invitation can be used (NULL = unlimited)';
COMMENT ON COLUMN organization_invitations.current_uses IS 'Number of times this invitation has been used';
