-- Migration: 20251230_01_organization_enums.sql
-- Purpose: Create enums for organization management system
-- - org_role: Role within an organization (different from platform-level role)
-- - invitation_type: Method of invitation delivery
-- - invitation_status: Current state of an invitation

-- Organization-level roles (distinct from platform-level 'role' enum)
-- 'owner' has full control including org deletion and ownership transfer
-- 'admin' can manage members and settings but cannot delete org
-- 'instructor' can create and manage courses
-- 'student' can consume content
CREATE TYPE org_role AS ENUM ('owner', 'admin', 'instructor', 'student');

-- Invitation delivery methods
-- 'email': Direct email invitation to specific address
-- 'link': Shareable URL with unique token
-- 'code': Short alphanumeric code for manual entry
CREATE TYPE invitation_type AS ENUM ('email', 'link', 'code');

-- Invitation lifecycle states
-- 'pending': Awaiting acceptance
-- 'accepted': Successfully used
-- 'expired': Past expiration date
-- 'revoked': Manually cancelled by admin
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');

COMMENT ON TYPE org_role IS 'Role within an organization for member access control';
COMMENT ON TYPE invitation_type IS 'Method of invitation delivery';
COMMENT ON TYPE invitation_status IS 'Current lifecycle state of an invitation';
