-- Migration: 20251230_02_organization_extensions.sql
-- Purpose: Extend organizations table with slug for URL-friendly identifiers
--          and settings JSONB for configurable organization options

-- Add slug column (initially nullable for existing data migration)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Add settings column with empty object default
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- Generate slugs from existing organization names
-- Converts to lowercase and replaces non-alphanumeric chars with hyphens
-- Handles potential duplicates by appending a unique suffix
UPDATE organizations
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- Handle potential duplicate slugs by appending organization ID suffix
WITH duplicates AS (
  SELECT id, slug, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) as rn
  FROM organizations
  WHERE slug IN (
    SELECT slug FROM organizations GROUP BY slug HAVING COUNT(*) > 1
  )
)
UPDATE organizations o
SET slug = o.slug || '-' || substring(o.id::text, 1, 8)
FROM duplicates d
WHERE o.id = d.id AND d.rn > 1;

-- Trim leading/trailing hyphens from slugs
UPDATE organizations
SET slug = trim(BOTH '-' FROM slug)
WHERE slug LIKE '-%' OR slug LIKE '%-';

-- Replace empty slugs with org-{id}
UPDATE organizations
SET slug = 'org-' || substring(id::text, 1, 8)
WHERE slug IS NULL OR slug = '';

-- Now make slug NOT NULL after data migration
ALTER TABLE organizations ALTER COLUMN slug SET NOT NULL;

-- Add index for slug lookups (commonly used in URL routing)
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Add GIN index for settings JSONB queries
CREATE INDEX IF NOT EXISTS idx_organizations_settings ON organizations USING GIN (settings);

COMMENT ON COLUMN organizations.slug IS 'URL-friendly unique identifier for the organization';
COMMENT ON COLUMN organizations.settings IS 'Organization configuration options (JSON)';
