/**
 * @megacampus/trpc-client-sdk
 *
 * Official tRPC client SDK for MegaCampusAI API
 *
 * This package provides a type-safe client for consuming the MegaCampusAI tRPC API
 * with full TypeScript support, authentication helpers, and comprehensive error handling.
 *
 * @module trpc-client-sdk
 * @version 0.8.0
 *
 * @example Basic Usage
 * ```typescript
 * import { createMegaCampusClient } from '@megacampus/trpc-client-sdk';
 *
 * const client = createMegaCampusClient({
 *   url: 'https://api.megacampus.ai/trpc',
 *   token: 'your-jwt-token',
 * });
 *
 * // Type-safe API calls
 * const courses = await client.generation.test.query({ message: 'Hello' });
 * ```
 */

import { createTRPCClient, httpBatchLink, type TRPCClientError } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';

// ============================================================================
// Type Re-exports from Server
// ============================================================================

/**
 * Main application router type
 *
 * This type is inferred from the server's app router and provides complete
 * type safety for all API procedures.
 *
 * @remarks
 * The AppRouter type should be imported from the server package:
 * `import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router'`
 *
 * For external consumers who don't have access to the server code, this SDK
 * exports the type shape for reference.
 */
export type AppRouter = AnyRouter;

/**
 * User context from JWT token
 */
export interface UserContext {
  id: string;
  email: string;
  role: 'admin' | 'instructor' | 'student';
  organizationId: string;
}

/**
 * tRPC error codes
 */
export type TRPCErrorCode =
  | 'PARSE_ERROR'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_SUPPORTED'
  | 'TIMEOUT'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_SERVER_ERROR'
  | 'NOT_IMPLEMENTED'
  | 'BAD_GATEWAY'
  | 'SERVICE_UNAVAILABLE'
  | 'GATEWAY_TIMEOUT';

/**
 * tRPC error type with proper typing
 */
export type MegaCampusError = TRPCClientError<AppRouter>;

// ============================================================================
// Client Configuration
// ============================================================================

/**
 * Client configuration options
 */
export interface MegaCampusClientConfig {
  /**
   * Base URL for the tRPC API endpoint
   * @example 'https://api.megacampus.ai/trpc'
   * @example 'http://localhost:3000/trpc'
   */
  url: string;

  /**
   * JWT authentication token
   *
   * If provided, will be automatically included in the Authorization header
   * as "Bearer {token}". You can also provide headers directly for more control.
   */
  token?: string;

  /**
   * Custom HTTP headers to include with every request
   *
   * @example
   * ```typescript
   * headers: {
   *   'x-custom-header': 'value',
   * }
   * ```
   */
  headers?: Record<string, string>;

  /**
   * Enable request batching for performance
   *
   * When enabled, multiple queries/mutations made simultaneously will be
   * batched into a single HTTP request. This reduces overhead and improves
   * performance for bulk operations.
   *
   * @default true
   */
  batch?: boolean;

  /**
   * Maximum time to wait for batching (milliseconds)
   *
   * Only applies when batch=true. Controls how long the client will wait
   * to collect requests before sending the batch.
   *
   * @default 10
   */
  batchInterval?: number;

  /**
   * Request timeout in milliseconds
   *
   * @default 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Enable detailed error logging
   *
   * When enabled, errors will be logged to console with full details.
   * Useful for debugging but should be disabled in production.
   *
   * @default false
   */
  debug?: boolean;
}

// ============================================================================
// Client Factory Function
// ============================================================================

/**
 * Create a type-safe MegaCampus tRPC client
 *
 * This is the primary entry point for creating a client instance. The client
 * provides full TypeScript type inference for all API procedures including
 * input parameters, output types, and error handling.
 *
 * @param config - Client configuration options
 * @returns Type-safe tRPC client instance
 *
 * @example Basic authenticated client
 * ```typescript
 * const client = createMegaCampusClient({
 *   url: 'https://api.megacampus.ai/trpc',
 *   token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
 * });
 *
 * // Use the client
 * const result = await client.generation.test.query({ message: 'Hello' });
 * ```
 *
 * @example Client with custom headers
 * ```typescript
 * const client = createMegaCampusClient({
 *   url: 'https://api.megacampus.ai/trpc',
 *   headers: {
 *     'Authorization': `Bearer ${token}`,
 *     'X-Custom-Header': 'value',
 *   },
 * });
 * ```
 *
 * @example Disable batching for real-time updates
 * ```typescript
 * const client = createMegaCampusClient({
 *   url: 'https://api.megacampus.ai/trpc',
 *   token: myToken,
 *   batch: false, // Send each request immediately
 * });
 * ```
 */
export function createMegaCampusClient<TRouter extends AppRouter = AppRouter>(
  config: MegaCampusClientConfig
) {
  const {
    url,
    token,
    headers: customHeaders = {},
    batch = true,
    timeout = 30000,
    debug = false,
  } = config;

  // Build headers
  const headers: Record<string, string> = {
    ...customHeaders,
  };

  // Add Authorization header if token provided
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Create the tRPC client with appropriate configuration
   
  const client = createTRPCClient<TRouter>({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    links: [
      // Type assertion needed due to tRPC version compatibility
       
      httpBatchLink({
        url,

        // Headers can be static or async function
        headers: () => headers,

        // Enable/disable batching
        maxURLLength: batch ? 2083 : 0, // maxURLLength: 0 disables batching

        // Fetch configuration with timeout
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetch: async (input: any, init?: any) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            const response = await fetch(String(input), {
              ...init,
              signal: controller.signal,
            });

            if (debug && !response.ok) {
              console.error('[MegaCampus Client] Request failed:', {
                url: String(input),
                status: response.status,
                statusText: response.statusText,
              });
            }

            return response;
          } catch (error) {
            if (debug) {
              console.error('[MegaCampus Client] Network error:', error);
            }
            throw error;
          } finally {
            clearTimeout(timeoutId);
          }
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    ],
  });

  return client;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create authorization header from JWT token
 *
 * @param token - JWT token string
 * @returns Authorization header object
 *
 * @example
 * ```typescript
 * const headers = createAuthHeader('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
 * // { 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }
 * ```
 */
export function createAuthHeader(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Type guard to check if value has a data property
 */
interface ErrorWithData {
  data?: unknown;
}

/**
 * Type guard to check if error data has required structure
 */
interface ErrorData {
  code?: unknown;
}

/**
 * Check if error is a tRPC error
 *
 * @param error - Error to check
 * @returns True if error is a TRPCClientError
 *
 * @example
 * ```typescript
 * try {
 *   await client.generation.initiate.mutate({ courseId: 'invalid' });
 * } catch (error) {
 *   if (isTRPCError(error)) {
 *     console.log('tRPC error code:', error.data?.code);
 *   }
 * }
 * ```
 */
export function isTRPCError(error: unknown): error is MegaCampusError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const errorWithData = error as ErrorWithData;
  if (!('data' in errorWithData)) {
    return false;
  }

  const { data } = errorWithData;
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const errorData = data as ErrorData;
  return 'code' in errorData;
}

/**
 * Get human-readable error message from tRPC error
 *
 * @param error - tRPC error or any error
 * @returns User-friendly error message
 *
 * @example
 * ```typescript
 * try {
 *   await client.generation.uploadFile.mutate({ ... });
 * } catch (error) {
 *   toast.error(getErrorMessage(error));
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  if (isTRPCError(error)) {
    return error.message || 'An error occurred';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unknown error occurred';
}

/**
 * Get tRPC error code from error
 *
 * @param error - tRPC error or any error
 * @returns tRPC error code or null
 *
 * @example
 * ```typescript
 * try {
 *   await client.admin.listUsers.query({ limit: 50 });
 * } catch (error) {
 *   const code = getErrorCode(error);
 *   if (code === 'FORBIDDEN') {
 *     console.log('Access denied - admin role required');
 *   }
 * }
 * ```
 */
export function getErrorCode(error: unknown): TRPCErrorCode | null {
  if (!isTRPCError(error)) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const data = error.data;
  if (!data || typeof data !== 'object') {
    return null;
  }

  const errorData = data as ErrorData;
  if (!errorData.code) {
    return null;
  }

  return errorData.code as TRPCErrorCode;
}

/**
 * Check if error is an authentication error (UNAUTHORIZED)
 *
 * @param error - Error to check
 * @returns True if error is UNAUTHORIZED
 *
 * @example
 * ```typescript
 * try {
 *   await client.billing.getUsage.query();
 * } catch (error) {
 *   if (isAuthError(error)) {
 *     // Redirect to login
 *     router.push('/login');
 *   }
 * }
 * ```
 */
export function isAuthError(error: unknown): boolean {
  return getErrorCode(error) === 'UNAUTHORIZED';
}

/**
 * Check if error is an authorization error (FORBIDDEN)
 *
 * @param error - Error to check
 * @returns True if error is FORBIDDEN
 *
 * @example
 * ```typescript
 * try {
 *   await client.admin.listOrganizations.query({ limit: 20 });
 * } catch (error) {
 *   if (isPermissionError(error)) {
 *     toast.error('You do not have permission to perform this action');
 *   }
 * }
 * ```
 */
export function isPermissionError(error: unknown): boolean {
  return getErrorCode(error) === 'FORBIDDEN';
}

/**
 * Check if error is a validation error (BAD_REQUEST)
 *
 * @param error - Error to check
 * @returns True if error is BAD_REQUEST
 *
 * @example
 * ```typescript
 * try {
 *   await client.generation.uploadFile.mutate({ ... });
 * } catch (error) {
 *   if (isValidationError(error)) {
 *     // Show validation errors to user
 *     setErrors(getErrorMessage(error));
 *   }
 * }
 * ```
 */
export function isValidationError(error: unknown): boolean {
  return getErrorCode(error) === 'BAD_REQUEST';
}

/**
 * Check if error is a not found error (NOT_FOUND)
 *
 * @param error - Error to check
 * @returns True if error is NOT_FOUND
 */
export function isNotFoundError(error: unknown): boolean {
  return getErrorCode(error) === 'NOT_FOUND';
}

// ============================================================================
// Type Exports for Consumers
// ============================================================================

/**
 * Re-export tRPC client types for convenience
 */
export type { TRPCClientError } from '@trpc/client';

// Note: For full type safety, consumers should also install the server package
// as a dev dependency and import the AppRouter type directly:
//
// import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router';
//
// Then use it with the client:
//
// const client = createMegaCampusClient<AppRouter>({ ... });
