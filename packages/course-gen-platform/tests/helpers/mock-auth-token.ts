/**
 * Mock Auth Token Helper
 *
 * Generates locally-signed JWT tokens for tests, bypassing Supabase Auth API.
 * Uses Node.js crypto (zero external dependencies).
 *
 * Why: signInWithPassword() hits Supabase Auth REST API which is flaky in CI
 * ("Database error querying schema" causes 30%+ test failures).
 * Local JWT generation is instant and 100% reliable.
 *
 * The generated tokens are accepted by supabase.auth.getUser() because:
 * 1. Signed with the correct SUPABASE_JWT_SECRET (HS256)
 * 2. Contain valid `sub` pointing to an existing auth.users record
 * 3. Have correct `aud` and `role` claims
 *
 * Requires: SUPABASE_JWT_SECRET env var (available in CI via GitHub secrets)
 */

import { createHmac } from 'crypto';

/**
 * Base64url encode (RFC 7515)
 */
function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

/**
 * Create a HS256-signed JWT token for testing
 *
 * @param userId - User UUID (must exist in auth.users)
 * @param email - User email
 * @param secret - SUPABASE_JWT_SECRET
 * @param expiresInSeconds - Token lifetime (default: 3600 = 1 hour)
 * @returns Signed JWT string
 */
export function createTestJWT(
  userId: string,
  email: string,
  secret: string,
  expiresInSeconds = 3600
): string {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'HS256', typ: 'JWT' };

  const payload = {
    aud: 'authenticated',
    exp: now + expiresInSeconds,
    iat: now,
    iss: process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL}/auth/v1` : 'test-issuer',
    sub: userId,
    email,
    phone: '',
    app_metadata: {
      provider: 'email',
      providers: ['email'],
    },
    user_metadata: {},
    role: 'authenticated',
    aal: 'aal1',
    amr: [{ method: 'password', timestamp: now }],
    session_id: crypto.randomUUID(),
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac('sha256', secret).update(signingInput).digest();

  return `${signingInput}.${base64url(signature)}`;
}
