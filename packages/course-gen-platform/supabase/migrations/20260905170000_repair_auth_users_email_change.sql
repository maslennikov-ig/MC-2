-- Supabase Auth maps email_change to a non-null Go string. The repository's
-- postgres-only test-user helper inserted auth.users rows without that column,
-- leaving NULL values that make every Auth admin users listing fail while scanning.
-- Repair only the invalid representation and make the same helper supply the
-- Auth-compatible empty value. Do not change Auth schema or real email/token state.

BEGIN;

UPDATE auth.users
SET email_change = ''
WHERE email_change IS NULL;

CREATE OR REPLACE FUNCTION public.create_test_auth_user(
  p_user_id UUID,
  p_email TEXT,
  p_encrypted_password TEXT,
  p_role TEXT,
  p_email_confirmed BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, pg_temp
AS $$
DECLARE
  v_inserted BOOLEAN := FALSE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id cannot be NULL';
  END IF;
  IF p_email IS NULL OR p_email = '' THEN
    RAISE EXCEPTION 'p_email cannot be NULL or empty';
  END IF;
  IF p_encrypted_password IS NULL OR p_encrypted_password = '' THEN
    RAISE EXCEPTION 'p_encrypted_password cannot be NULL or empty';
  END IF;
  IF p_role IS NULL OR p_role = '' THEN
    RAISE EXCEPTION 'p_role cannot be NULL or empty';
  END IF;
  IF p_role NOT IN ('admin', 'instructor', 'student') THEN
    RAISE EXCEPTION 'p_role must be one of: admin, instructor, student. Got: %', p_role;
  END IF;

  INSERT INTO auth.users AS existing (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    aud,
    role,
    raw_app_meta_data,
    raw_user_meta_data,
    confirmation_token,
    email_change_token_new,
    email_change,
    recovery_token
  )
  VALUES (
    p_user_id,
    '00000000-0000-0000-0000-000000000000'::UUID,
    p_email,
    p_encrypted_password,
    CASE WHEN p_email_confirmed THEN NOW() ELSE NULL END,
    NOW(),
    NOW(),
    'authenticated',
    'authenticated',
    jsonb_build_object('role', p_role),
    jsonb_build_object('email', p_email),
    '',
    '',
    '',
    ''
  )
  ON CONFLICT (id) DO UPDATE SET
    raw_app_meta_data = jsonb_build_object('role', p_role),
    raw_user_meta_data = jsonb_build_object('email', p_email),
    email_change = COALESCE(existing.email_change, ''),
    updated_at = NOW()
  RETURNING TRUE INTO v_inserted;

  IF v_inserted THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'user_id', p_user_id,
      'email', p_email,
      'role', p_role,
      'message', 'Test auth user created successfully'
    );
  END IF;
  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', p_user_id,
    'email', p_email,
    'role', p_role,
    'message', 'Test auth user updated successfully (idempotent)'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM,
      'detail', SQLSTATE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_test_auth_user(UUID, TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_test_auth_user(UUID, TEXT, TEXT, TEXT, BOOLEAN)
  TO postgres;

COMMENT ON FUNCTION public.create_test_auth_user(UUID, TEXT, TEXT, TEXT, BOOLEAN) IS
'TEST ENVIRONMENT ONLY - Creates predefined Auth fixtures. Granted only to postgres.
Every direct auth.users insert supplies the empty-string email_change representation
required by Supabase Auth; idempotent replay repairs a NULL without replacing a pending value.';

COMMIT;
