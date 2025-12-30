-- Migration: 20251230_05_migrate_existing_members.sql
-- Purpose: Migrate existing user-organization relationships from users.organization_id
--          to the new organization_members table. Also establishes owners for each org.
-- Note: Only migrates users that exist in auth.users (excludes orphaned records)

-- Step 1: Migrate existing relationships
-- Map existing platform roles to organization roles:
--   - instructor -> instructor
--   - student -> student
--   - admin -> admin
--   - superadmin -> admin (superadmin is platform-level, not org-level)
INSERT INTO organization_members (organization_id, user_id, role, joined_at)
SELECT
  u.organization_id,
  u.id as user_id,
  CASE
    WHEN u.role::text = 'instructor' THEN 'instructor'::org_role
    WHEN u.role::text = 'student' THEN 'student'::org_role
    WHEN u.role::text = 'admin' THEN 'admin'::org_role
    WHEN u.role::text = 'superadmin' THEN 'admin'::org_role
    ELSE 'student'::org_role
  END as role,
  COALESCE(u.created_at, now()) as joined_at
FROM users u
-- Only include users that exist in auth.users (FK target)
INNER JOIN auth.users au ON u.id = au.id
WHERE u.organization_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Step 2: Promote first admin in each organization to owner
-- Orders by joined_at to ensure the earliest admin becomes owner
WITH first_admins AS (
  SELECT DISTINCT ON (organization_id) id
  FROM organization_members
  WHERE role = 'admin'
  ORDER BY organization_id, joined_at ASC
)
UPDATE organization_members
SET role = 'owner'
WHERE id IN (SELECT id FROM first_admins);

-- Step 3: For organizations without an owner (no admin existed),
-- promote the first member (by joined_at) to owner
WITH orgs_without_owner AS (
  SELECT DISTINCT organization_id
  FROM organization_members
  WHERE organization_id NOT IN (
    SELECT organization_id FROM organization_members WHERE role = 'owner'
  )
),
first_members AS (
  SELECT DISTINCT ON (om.organization_id) om.id
  FROM organization_members om
  INNER JOIN orgs_without_owner owo ON om.organization_id = owo.organization_id
  ORDER BY om.organization_id, om.joined_at ASC
)
UPDATE organization_members
SET role = 'owner'
WHERE id IN (SELECT id FROM first_members);

-- Step 4: Handle organizations with no members at all
-- These are empty orgs - they'll get an owner when first member joins
-- No action needed here, but adding a comment for documentation

-- Log migration results (for verification)
DO $$
DECLARE
  total_members INT;
  total_owners INT;
  orgs_with_owners INT;
  total_orgs INT;
BEGIN
  SELECT COUNT(*) INTO total_members FROM organization_members;
  SELECT COUNT(*) INTO total_owners FROM organization_members WHERE role = 'owner';
  SELECT COUNT(DISTINCT organization_id) INTO orgs_with_owners FROM organization_members WHERE role = 'owner';
  SELECT COUNT(*) INTO total_orgs FROM organizations;

  RAISE NOTICE 'Migration complete: % members migrated, % owners assigned, %/% orgs have owners',
    total_members, total_owners, orgs_with_owners, total_orgs;
END $$;
