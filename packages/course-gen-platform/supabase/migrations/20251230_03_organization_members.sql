-- Migration: 20251230_03_organization_members.sql
-- Purpose: Create organization_members table for many-to-many user-organization relationships
--          This replaces the direct organization_id FK on users table with a join table
--          allowing users to belong to multiple organizations with different roles

CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Role within this organization
  role org_role NOT NULL DEFAULT 'student',

  -- Membership metadata
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Ensure a user can only have one membership per organization
  UNIQUE(organization_id, user_id)
);

-- Index for looking up user's organizations (most common query)
CREATE INDEX idx_org_members_user ON organization_members(user_id);

-- Index for listing organization members
CREATE INDEX idx_org_members_org ON organization_members(organization_id);

-- Composite index for role-based queries within an organization
-- Useful for: "find all admins in org X", "count instructors in org Y"
CREATE INDEX idx_org_members_org_role ON organization_members(organization_id, role);

-- Enable Row Level Security
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Add table comment
COMMENT ON TABLE organization_members IS 'Many-to-many relationship between users and organizations with role-based access';
COMMENT ON COLUMN organization_members.role IS 'User role within this specific organization';
COMMENT ON COLUMN organization_members.invited_by IS 'User who invited this member (NULL if original member or migrated)';
