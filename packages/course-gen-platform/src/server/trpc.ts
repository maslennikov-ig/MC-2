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
import { getSupabaseAdmin } from '../shared/supabase/admin';
import type { Database } from '@megacampus/shared-types';
import { logger } from '../shared/logger/index.js';

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
 * Create tRPC context from incoming request
 *
 * This function:
 * 1. Extracts JWT from Authorization header
 * 2. Validates JWT using Supabase admin client
 * 3. Extracts custom claims (user_id, role, organization_id) from JWT
 * 4. Returns context with user information or null if unauthenticated
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
    // Validate JWT using Supabase admin client
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);

    // Return unauthenticated context if validation fails
    if (error || !data.user) {
      return { user: null, req };
    }

    // Extract custom claims from JWT
    // These claims are added by the custom_access_token_hook function (T047)
    // Note: getUser() doesn't return JWT payload directly, so we need to decode it
    // However, for security, we should get claims from the database instead
    // to ensure they're current (in case user role changed after JWT issued)

    // Query user data from database to get current role and organization
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email, role, organization_id')
      .eq('id', data.user.id)
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
  errorFormatter({ shape }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Add any custom error data here
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
