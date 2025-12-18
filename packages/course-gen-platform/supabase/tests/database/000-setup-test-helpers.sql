-- ============================================================================
-- Test Setup: Install pgTAP Extension
-- This file runs first (alphabetically) to set up the test environment
-- ============================================================================

-- Install pgTAP extension for testing
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Verify setup
BEGIN;
SELECT plan(1);
SELECT ok(true, 'Test environment setup completed successfully');
SELECT * FROM finish();
ROLLBACK;
