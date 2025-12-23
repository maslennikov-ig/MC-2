-- Script: validate-tier-structure.sql
-- Purpose: Verify all 5 tiers exist and no invalid tier values
-- Usage: Run via Supabase MCP or psql
-- Expected outcome: All checks PASS

-- 1. Check ENUM values
WITH tier_enum AS (
  SELECT enumlabel AS tier
  FROM pg_enum
  WHERE enumtypid = 'subscription_tier'::regtype
  ORDER BY enumsortorder
)
SELECT
  CASE
    WHEN COUNT(*) = 5 THEN '✅ PASS: 5 tiers found'
    ELSE '❌ FAIL: Expected 5 tiers, found ' || COUNT(*)::text
  END AS enum_count_check,
  CASE
    WHEN bool_and(tier IN ('trial', 'free', 'basic', 'standard', 'premium'))
    THEN '✅ PASS: All tier values valid'
    ELSE '❌ FAIL: Invalid tier values found'
  END AS enum_values_check,
  string_agg(tier::text, ', ' ORDER BY tier) AS found_tiers
FROM tier_enum;

-- 2. Check tier ordering (important for enum sorting)
WITH tier_enum_ordered AS (
  SELECT enumlabel AS tier, enumsortorder AS sort_order
  FROM pg_enum
  WHERE enumtypid = 'subscription_tier'::regtype
  ORDER BY enumsortorder
)
SELECT
  CASE
    WHEN (SELECT COUNT(*) FROM tier_enum_ordered WHERE tier = 'trial' AND sort_order < (SELECT sort_order FROM tier_enum_ordered WHERE tier = 'free')) > 0
    THEN '✅ PASS: TRIAL comes before FREE'
    ELSE '❌ FAIL: TRIAL should come before FREE'
  END AS trial_order_check;

-- 3. Check organizations table uses only valid tiers
SELECT
  subscription_tier,
  COUNT(*) AS org_count
FROM organizations
GROUP BY subscription_tier
ORDER BY
  CASE subscription_tier
    WHEN 'trial' THEN 1
    WHEN 'free' THEN 2
    WHEN 'basic' THEN 3
    WHEN 'standard' THEN 4
    WHEN 'premium' THEN 5
    ELSE 999
  END;
-- Expected: All subscription_tier values in valid ENUM, no NULLs, no unexpected values

-- 4. Check for any NULL tiers (data integrity)
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS: No NULL subscription_tier values'
    ELSE '❌ FAIL: Found ' || COUNT(*)::text || ' organizations with NULL subscription_tier'
  END AS null_tier_check
FROM organizations
WHERE subscription_tier IS NULL;

-- 5. Check RLS policies still work after migration
-- Note: This requires setting role context, typically done in integration tests
-- For manual testing:
-- SET ROLE authenticated;
-- SET request.jwt.claims.organization_id TO 'test-org-uuid';
-- SELECT COUNT(*) FROM organizations WHERE id = 'test-org-uuid'::uuid;
-- Expected: 1 row (RLS allows user to see their own org)
-- RESET ROLE;

SELECT '✅ Tier structure validation complete. Review output above for any FAIL status.' AS validation_summary;
