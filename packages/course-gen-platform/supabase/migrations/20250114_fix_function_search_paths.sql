-- =============================================================================
-- Migration: Fix Function Search Paths (Security Hardening - T069)
--
-- Issue: 7 functions have mutable search_path (CVE-2024-10976, CVE-2018-1058)
-- Risk: SQL injection attacks through schema manipulation
-- Solution: Set explicit search_path to prevent attacker-controlled code execution
--
-- Supabase Lint: 0011_function_search_path_mutable
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
-- =============================================================================

-- =============================================================================
-- FUNCTION 1: update_updated_at_column
-- Type: Trigger function for auto-updating timestamps
-- Security: Empty search_path + fully-qualified pg_catalog.now()
-- =============================================================================

DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
SET search_path = ''
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_updated_at_column() IS
'Trigger function to automatically update updated_at timestamp. Uses empty search_path and fully-qualified pg_catalog.now() for security (CVE-2024-10976).';

-- Recreate triggers that were dropped by CASCADE
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_file_catalog_updated_at
  BEFORE UPDATE ON file_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lesson_content_updated_at
  BEFORE UPDATE ON lesson_content
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_status_updated_at
  BEFORE UPDATE ON job_status
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- FUNCTION 2: update_updated_at_timestamp
-- Type: Trigger function (duplicate of update_updated_at_column)
-- Security: Empty search_path + fully-qualified pg_catalog.now()
-- =============================================================================

DROP FUNCTION IF EXISTS update_updated_at_timestamp() CASCADE;

CREATE OR REPLACE FUNCTION update_updated_at_timestamp()
RETURNS TRIGGER
SET search_path = ''
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_updated_at_timestamp() IS
'Trigger function to automatically update updated_at timestamp. Uses empty search_path and fully-qualified pg_catalog.now() for security (CVE-2024-10976).';

-- =============================================================================
-- FUNCTION 3: deduct_tenant_tokens
-- Type: RPC function for token deduction with row locking
-- Security: Explicit search_path + schema-qualified references
-- =============================================================================

DROP FUNCTION IF EXISTS deduct_tenant_tokens(UUID, INTEGER, UUID) CASCADE;

CREATE OR REPLACE FUNCTION deduct_tenant_tokens(
  p_tenant_id UUID,
  p_amount INTEGER,
  p_course_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  new_balance INTEGER,
  error_code TEXT,
  error_message TEXT
)
SET search_path = public, pg_catalog
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_subscription_id UUID;
    v_monthly_remaining INTEGER;
    v_purchased_remaining INTEGER;
    v_monthly_deducted INTEGER := 0;
    v_purchased_deducted INTEGER := 0;
    v_new_balance INTEGER;
BEGIN
    -- Lock the subscription row
    SELECT id, monthly_tokens_remaining, purchased_tokens_remaining
    INTO v_subscription_id, v_monthly_remaining, v_purchased_remaining
    FROM public.tenant_subscriptions
    WHERE tenant_id = p_tenant_id AND status = 'active'
    FOR UPDATE;

    -- Check if subscription exists
    IF v_subscription_id IS NULL THEN
        RETURN QUERY SELECT false, 0, 'NO_ACTIVE_SUBSCRIPTION'::TEXT, 'No active subscription found for tenant'::TEXT;
        RETURN;
    END IF;

    -- Check if sufficient balance
    IF (v_monthly_remaining + v_purchased_remaining) < p_amount THEN
        RETURN QUERY SELECT false, v_monthly_remaining + v_purchased_remaining,
                           'INSUFFICIENT_TOKENS'::TEXT,
                           pg_catalog.format('Insufficient tokens: required %s, available %s', p_amount, v_monthly_remaining + v_purchased_remaining)::TEXT;
        RETURN;
    END IF;

    -- Deduct from monthly first, then purchased
    IF v_monthly_remaining >= p_amount THEN
        v_monthly_deducted := p_amount;
    ELSE
        v_monthly_deducted := v_monthly_remaining;
        v_purchased_deducted := p_amount - v_monthly_remaining;
    END IF;

    -- Update subscription
    UPDATE public.tenant_subscriptions
    SET monthly_tokens_remaining = monthly_tokens_remaining - v_monthly_deducted,
        purchased_tokens_remaining = purchased_tokens_remaining - v_purchased_deducted,
        updated_at = pg_catalog.now()
    WHERE id = v_subscription_id;

    v_new_balance := v_monthly_remaining + v_purchased_remaining - p_amount;

    -- Record transaction
    INSERT INTO public.token_transactions (
        tenant_id, type, amount, balance_after, reason, course_id, subscription_id, metadata
    ) VALUES (
        p_tenant_id,
        'deduction',
        p_amount,
        v_new_balance,
        'Course generation token deduction',
        p_course_id,
        v_subscription_id,
        pg_catalog.jsonb_build_object(
            'purchased_deducted', v_purchased_deducted,
            'monthly_deducted', v_monthly_deducted,
            'estimated_cost', p_amount
        )
    );

    RETURN QUERY SELECT true, v_new_balance, NULL::TEXT, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION deduct_tenant_tokens(UUID, INTEGER, UUID) IS
'Deducts tokens from tenant subscription. Uses explicit search_path and fully-qualified references for security (CVE-2024-10976).';

-- =============================================================================
-- FUNCTION 4: refund_tenant_tokens
-- Type: RPC function for token refunds with transaction logging
-- Security: Explicit search_path + schema-qualified references
-- =============================================================================

DROP FUNCTION IF EXISTS refund_tenant_tokens(UUID, INTEGER, UUID, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION refund_tenant_tokens(
  p_tenant_id UUID,
  p_amount INTEGER,
  p_course_id UUID,
  p_reason TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  new_balance INTEGER,
  error_code TEXT,
  error_message TEXT
)
SET search_path = public, pg_catalog
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_subscription_id UUID;
    v_current_balance INTEGER;
    v_new_balance INTEGER;
    v_original_transaction_id UUID;
BEGIN
    -- Lock the subscription row
    SELECT id, monthly_tokens_remaining + purchased_tokens_remaining
    INTO v_subscription_id, v_current_balance
    FROM public.tenant_subscriptions
    WHERE tenant_id = p_tenant_id AND status = 'active'
    FOR UPDATE;

    -- Check if subscription exists
    IF v_subscription_id IS NULL THEN
        RETURN QUERY SELECT false, 0, 'NO_ACTIVE_SUBSCRIPTION'::TEXT, 'No active subscription found for tenant'::TEXT;
        RETURN;
    END IF;

    -- Find original deduction transaction
    SELECT id INTO v_original_transaction_id
    FROM public.token_transactions
    WHERE tenant_id = p_tenant_id
      AND course_id = p_course_id
      AND type = 'deduction'
    ORDER BY created_at DESC
    LIMIT 1;

    -- Refund to purchased tokens (simplification: add all to purchased)
    UPDATE public.tenant_subscriptions
    SET purchased_tokens_remaining = purchased_tokens_remaining + p_amount,
        updated_at = pg_catalog.now()
    WHERE id = v_subscription_id;

    v_new_balance := v_current_balance + p_amount;

    -- Record refund transaction
    INSERT INTO public.token_transactions (
        tenant_id, type, amount, balance_after, reason, course_id, subscription_id, metadata
    ) VALUES (
        p_tenant_id,
        'refund',
        p_amount,
        v_new_balance,
        p_reason,
        p_course_id,
        v_subscription_id,
        pg_catalog.jsonb_build_object(
            'original_transaction_id', v_original_transaction_id,
            'refund_reason', p_reason
        )
    );

    RETURN QUERY SELECT true, v_new_balance, NULL::TEXT, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION refund_tenant_tokens(UUID, INTEGER, UUID, TEXT) IS
'Refunds tokens to tenant subscription. Uses explicit search_path and fully-qualified references for security (CVE-2024-10976).';

-- =============================================================================
-- FUNCTION 5: get_tenant_token_balance
-- Type: RPC function for balance queries with subscription details
-- Security: Explicit search_path + schema-qualified references
-- =============================================================================

DROP FUNCTION IF EXISTS get_tenant_token_balance(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_tenant_token_balance(p_tenant_id UUID)
RETURNS TABLE(
  monthly_tokens INTEGER,
  purchased_tokens INTEGER,
  total_tokens INTEGER,
  tier_name TEXT,
  tier_display_name TEXT,
  queue_priority INTEGER,
  tokens_reset_at TIMESTAMPTZ,
  subscription_status TEXT
)
SET search_path = public, pg_catalog
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ts.monthly_tokens_remaining,
        ts.purchased_tokens_remaining,
        ts.monthly_tokens_remaining + ts.purchased_tokens_remaining AS total_tokens,
        st.name AS tier_name,
        st.display_name AS tier_display_name,
        st.queue_priority,
        ts.tokens_reset_at,
        ts.status AS subscription_status
    FROM public.tenant_subscriptions ts
    JOIN public.subscription_tiers st ON ts.tier_id = st.id
    WHERE ts.tenant_id = p_tenant_id
      AND ts.status = 'active';
END;
$$;

COMMENT ON FUNCTION get_tenant_token_balance(UUID) IS
'Returns detailed token balance for tenant. Uses explicit search_path and schema-qualified references for security (CVE-2024-10976).';

-- =============================================================================
-- FUNCTION 6: get_current_auth_context
-- Type: Helper function for retrieving authentication context
-- Security: Explicit search_path + schema-qualified references
-- =============================================================================

DROP FUNCTION IF EXISTS get_current_auth_context() CASCADE;

CREATE OR REPLACE FUNCTION get_current_auth_context()
RETURNS JSONB
SET search_path = public, pg_catalog
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN pg_catalog.jsonb_build_object(
    'current_role', pg_catalog.current_role,
    'jwt_claims', pg_catalog.current_setting('request.jwt.claims', true),
    'auth_uid', auth.uid()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object('error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION get_current_auth_context() IS
'Returns current authentication context for debugging. Uses explicit search_path and fully-qualified references for security (CVE-2024-10976).';

-- =============================================================================
-- FUNCTION 7: update_course_progress
-- Type: RPC function for updating course generation progress
-- Security: Explicit search_path + schema-qualified references
-- =============================================================================

DROP FUNCTION IF EXISTS update_course_progress(UUID, INTEGER, TEXT, TEXT, TEXT, INTEGER, JSONB) CASCADE;

CREATE OR REPLACE FUNCTION update_course_progress(
  p_course_id UUID,
  p_step_id INTEGER,
  p_status TEXT,
  p_message TEXT,
  p_execution_id TEXT DEFAULT NULL,
  p_percent_complete INTEGER DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS BOOLEAN
SET search_path = public, pg_catalog
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.courses
    SET
        progress = pg_catalog.jsonb_build_object(
            'step', p_step_id,
            'message', p_message,
            'executionId', COALESCE(p_execution_id, progress->>'executionId'),
            'percentComplete', COALESCE(p_percent_complete, (progress->>'percentComplete')::int),
            'currentStep', p_message
        ) || p_metadata,
        status = CASE
            WHEN p_status = 'completed' THEN 'completed'
            WHEN p_status = 'failed' THEN 'failed'
            WHEN p_status IN ('in_progress', 'active') THEN 'generating'
            ELSE status
        END,
        updated_at = pg_catalog.now()
    WHERE id = p_course_id;

    RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION update_course_progress(UUID, INTEGER, TEXT, TEXT, TEXT, INTEGER, JSONB) IS
'Updates course generation progress and status. Uses explicit search_path and fully-qualified references for security (CVE-2024-10976).';

-- =============================================================================
-- VERIFICATION: Ensure all 7 functions have search_path configured
-- =============================================================================

DO $$
DECLARE
  v_count INTEGER;
  v_missing TEXT[];
BEGIN
  -- Count functions with search_path
  SELECT COUNT(*) INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'update_updated_at_column',
      'deduct_tenant_tokens',
      'update_updated_at_timestamp',
      'refund_tenant_tokens',
      'get_tenant_token_balance',
      'get_current_auth_context',
      'update_course_progress'
    )
    AND p.prosecdef = true  -- SECURITY DEFINER
    AND p.proconfig IS NOT NULL;  -- Has configuration (search_path)

  -- Find any missing functions
  SELECT pg_catalog.array_agg(proname)
  INTO v_missing
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'update_updated_at_column',
      'deduct_tenant_tokens',
      'update_updated_at_timestamp',
      'refund_tenant_tokens',
      'get_tenant_token_balance',
      'get_current_auth_context',
      'update_course_progress'
    )
    AND (p.prosecdef = false OR p.proconfig IS NULL);

  -- Report results
  IF v_count != 7 THEN
    RAISE EXCEPTION 'Expected 7 functions with search_path, found %. Missing: %', v_count, v_missing;
  END IF;

  RAISE NOTICE '✓ All 7 functions have search_path configured correctly';
  RAISE NOTICE '✓ SQL injection protection enabled (CVE-2024-10976, CVE-2018-1058)';
END $$;
