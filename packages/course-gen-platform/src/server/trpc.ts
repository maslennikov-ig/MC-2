/**
 * tRPC context and initialization
 * @module server/trpc
 *
 * This module creates the tRPC context with Supabase Auth integration.
 * It extracts and validates JWT tokens from incoming requests and populates
 * the context with user information for use in procedures.
 */

import { initTRPC } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { createHmac } from 'crypto';
import { getSupabaseAdmin } from '../shared/supabase/admin';
import type { Database } from '@megacampus/shared-types';
import { logger } from '../shared/logger/index.js';
import { AppError } from './errors/typed-errors';
import { PipelineError } from '../shared/errors/pipeline-errors';

/**
 * User context extracted from JWT
 */
export type UserContext = {
  id: string;
  email: string;
  role: Database['public']['Enums']['role'];
  organizationId: string;
};

/**
 * tRPC context type
 * Contains user information if authenticated, null otherwise
 * Also includes the request object for IP extraction in rate limiting
 */
export type Context = {
  user: UserContext | null;
  req: Request;
};

/**
 * Extract JWT token from Authorization header
 * @param req - Request object
 * @returns JWT token string or null if not found
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  // Extract token from "Bearer <token>" format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Verify JWT signature locally using HMAC-SHA256.
 * Used as a fallback in test environments when supabase.auth.getUser() fails
 * (e.g., mock JWTs without real sessions in auth.sessions).
 *
 * @returns Decoded payload if signature is valid and token is not expired, null otherwise
 */
function verifyJWTLocally(token: string, secret: string): { sub: string; email?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const expectedSig = createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (expectedSig !== signature) return null;

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

    // Check expiration
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;

    // Must have sub claim
    if (!decoded.sub) return null;

    return { sub: decoded.sub, email: decoded.email };
  } catch {
    return null;
  }
}

/**
 * Create tRPC context from incoming request
 *
 * This function:
 * 1. Extracts JWT from Authorization header
 * 2. Validates JWT using Supabase admin client (getUser API call)
 * 3. Falls back to local JWT signature verification in test environments
 *    (GoTrue rejects mock JWTs that lack real sessions in auth.sessions)
 * 4. Loads user data from database for current role and organization
 * 5. Returns context with user information or null if unauthenticated
 *
 * @param opts - Context options containing request
 * @returns Context object with user or null
 */
export async function createContext(opts: FetchCreateContextFnOptions): Promise<Context> {
  const { req } = opts;

  // Extract JWT from Authorization header
  const token = extractToken(req);

  // Return unauthenticated context if no token
  if (!token) {
    return { user: null, req };
  }

  try {
    const supabase = getSupabaseAdmin();

    // Primary path: validate JWT using Supabase Auth API (checks signature + session)
    const { data, error } = await supabase.auth.getUser(token);

    let userId: string | undefined;

    if (!error && data.user) {
      userId = data.user.id;
    } else if (process.env.NODE_ENV === 'test') {
      // Fallback for test environments: verify JWT signature locally.
      // GoTrue rejects mock JWTs without real sessions in auth.sessions,
      // but locally-signed JWTs with valid signatures are safe for testing.
      const jwtSecret = process.env.SUPABASE_JWT_SECRET?.trim();
      if (jwtSecret) {
        const claims = verifyJWTLocally(token, jwtSecret);
        if (claims) {
          userId = claims.sub;
        }
      }
    }

    if (!userId) {
      return { user: null, req };
    }

    // Query user data from database to get current role and organization
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email, role, organization_id')
      .eq('id', userId)
      .single();

    // Return unauthenticated context if user not found in database
    if (userError || !userData) {
      return { user: null, req };
    }

    // Populate context with user information
    return {
      user: {
        id: userData.id,
        email: userData.email,
        role: userData.role,
        organizationId: userData.organization_id,
      },
      req,
    };
  } catch (err) {
    // Log error but return unauthenticated context
    // Don't throw errors in context creation - let procedures handle authorization
    logger.error({ err }, 'Error validating JWT in context');
    return { user: null, req };
  }
}

/**
 * Initialize tRPC with context
 */
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    const cause = error.cause;

    let appErrorCode: string | undefined;
    let severity: string | undefined;
    let isRetryable: boolean | undefined;

    if (cause instanceof AppError) {
      appErrorCode = cause.code;
    } else if (cause instanceof PipelineError) {
      appErrorCode = cause.code;
      severity = cause.severity;
      isRetryable = cause.retryable;
    }

    return {
      ...shape,
      data: {
        ...shape.data,
        ...(appErrorCode && { appErrorCode }),
        ...(severity && { severity }),
        ...(isRetryable !== undefined && { isRetryable }),
      },
    };
  },
});

/**
 * Export tRPC router creator
 * Use this to create new tRPC routers
 */
export const router = t.router;

/**
 * Export public procedure
 * This procedure does not require authentication
 * Use this for public endpoints that don't need user context
 */
export const publicProcedure = t.procedure;

/**
 * Export middleware creator
 * Use this to create custom middleware for procedures
 */
export const middleware = t.middleware;

/**
 * NOTE: protectedProcedure, adminProcedure, and instructorProcedure
 * should be imported directly from their respective modules to avoid circular dependencies:
 *
 * import { protectedProcedure } from './middleware/auth';
 * import { adminProcedure, instructorProcedure } from './procedures';
 */
