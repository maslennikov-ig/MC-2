--
-- Seed Data for Local Development and Testing
--
-- This file is automatically executed by `supabase start` and `supabase db reset`
-- after migrations are applied.
--

-- Insert test organizations with different tiers
-- These IDs are used by integration tests

-- Organizations for file-upload.test.ts (TEST_FILE_UPLOAD_ORGS)
INSERT INTO organizations (id, name, tier, storage_quota_bytes, storage_used_bytes) VALUES
  ('00000000-0000-0000-0000-000000000101', 'Free Tier Org', 'free', 10485760, 0),           -- 10MB
  ('00000000-0000-0000-0000-000000000102', 'Basic Plus Tier Org', 'basic_plus', 104857600, 0), -- 100MB
  ('00000000-0000-0000-0000-000000000103', 'Standard Tier Org', 'standard', 1073741824, 0),    -- 1GB
  ('00000000-0000-0000-0000-000000000104', 'Premium Tier Org', 'premium', 10737418240, 0),     -- 10GB
  ('00000000-0000-0000-0000-000000000105', 'Quota Full Org', 'basic_plus', 104857600, 104857600), -- 100MB quota, 100MB used
  -- Organizations for trpc-server.test.ts and authentication.test.ts
  ('759ba851-3f16-4294-9627-dc5a0a366c8e', 'Test Organization', 'standard', 53687091200, 0),
  ('859ba851-3f16-4294-9627-dc5a0a366c8e', 'Test Organization 2', 'premium', 107374182400, 0)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  tier = EXCLUDED.tier,
  storage_quota_bytes = EXCLUDED.storage_quota_bytes,
  storage_used_bytes = EXCLUDED.storage_used_bytes;

--
-- Note: Test users and courses are created dynamically by integration tests
-- using setupTestFixtures() functions in each test suite.
--
-- The organizations created above are referenced by:
-- - tests/integration/file-upload.test.ts (TEST_FILE_UPLOAD_ORGS)
-- - tests/integration/authentication.test.ts
-- - tests/integration/trpc-server.test.ts
-- - Other integration tests
--
