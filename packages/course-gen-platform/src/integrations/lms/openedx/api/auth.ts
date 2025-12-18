/**
 * Open edX OAuth2 Authentication
 * @module integrations/lms/openedx/api/auth
 *
 * OAuth2 client credentials flow with token caching and refresh logic.
 * Implements automatic token refresh on expiry with 60-second safety buffer.
 */

import axios, { type AxiosInstance } from 'axios';
import { OpenEdXAuthError } from '@megacampus/shared-types/lms/errors';
import { lmsLogger } from '../../logger';
import type { OAuth2TokenResponse, OpenEdXApiErrorResponse } from './types';
import { OpenEdXApiError } from './types';

/**
 * OAuth2 configuration for Open edX
 */
export interface OAuth2Config {
  /** Token endpoint URL (e.g., https://lms.example.com/oauth2/access_token) */
  tokenUrl: string;

  /** OAuth2 client ID */
  clientId: string;

  /** OAuth2 client secret */
  clientSecret: string;

  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * Cached token data with expiry tracking
 */
interface CachedToken {
  /** Access token value */
  token: string;

  /** Expiry timestamp (milliseconds since epoch) */
  expiresAt: number;
}

/**
 * Open edX OAuth2 Authentication Manager
 *
 * Handles OAuth2 client credentials flow with automatic token caching
 * and refresh. Thread-safe token management with expiry buffer.
 *
 * @example
 * ```typescript
 * const auth = new OpenEdXAuth({
 *   tokenUrl: 'https://lms.example.com/oauth2/access_token',
 *   clientId: 'my-client-id',
 *   clientSecret: 'my-secret'
 * });
 *
 * const token = await auth.getAccessToken();
 * // Token cached and reused until expiry
 * ```
 */
export class OpenEdXAuth {
  private readonly config: Required<OAuth2Config>;
  private readonly httpClient: AxiosInstance;
  private cachedToken: CachedToken | null = null;
  private tokenRefreshPromise: Promise<string> | null = null;

  /** Safety buffer before token expiry (60 seconds) */
  private static readonly EXPIRY_BUFFER_MS = 60 * 1000;

  constructor(config: OAuth2Config) {
    this.config = {
      timeout: 10000,
      ...config,
    };

    // Create dedicated axios instance for auth requests
    this.httpClient = axios.create({
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    lmsLogger.debug(
      { tokenUrl: this.config.tokenUrl },
      'OpenEdXAuth initialized'
    );
  }

  /**
   * Get valid access token (cached or refreshed)
   *
   * Returns cached token if still valid (with 60s buffer).
   * Acquires new token if cache is empty or expired.
   * Thread-safe: concurrent calls share the same refresh promise.
   *
   * @returns Valid access token
   * @throws {OpenEdXAuthError} If token acquisition fails
   */
  async getAccessToken(): Promise<string> {
    // Check if cached token is still valid
    if (this.cachedToken && this.isTokenValid(this.cachedToken)) {
      lmsLogger.debug('Using cached OAuth2 token');
      return this.cachedToken.token;
    }

    // If refresh already in progress, wait for it
    if (this.tokenRefreshPromise) {
      lmsLogger.debug('Token refresh already in progress, waiting...');
      return this.tokenRefreshPromise;
    }

    // Start new token refresh
    this.tokenRefreshPromise = this.acquireNewToken();

    try {
      const token = await this.tokenRefreshPromise;
      return token;
    } finally {
      this.tokenRefreshPromise = null;
    }
  }

  /**
   * Invalidate cached token (force refresh on next request)
   *
   * Useful when receiving 401 responses despite having cached token.
   * Next getAccessToken() call will acquire fresh token.
   */
  invalidateToken(): void {
    lmsLogger.debug('Invalidating cached OAuth2 token');
    this.cachedToken = null;
  }

  /**
   * Check if token is still valid (with safety buffer)
   */
  private isTokenValid(token: CachedToken): boolean {
    const now = Date.now();
    const isValid = now < token.expiresAt;

    if (!isValid) {
      lmsLogger.debug(
        { expiresAt: new Date(token.expiresAt).toISOString() },
        'Cached token expired'
      );
    }

    return isValid;
  }

  /**
   * Acquire new access token from OAuth2 endpoint
   *
   * Uses client credentials grant type (RFC 6749 section 4.4).
   */
  private async acquireNewToken(): Promise<string> {
    lmsLogger.info('Acquiring new OAuth2 token');

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    try {
      const response = await this.httpClient.post<OAuth2TokenResponse>(
        this.config.tokenUrl,
        params.toString()
      );

      const tokenData = response.data;

      // Validate response
      if (!tokenData.access_token || !tokenData.expires_in) {
        throw new OpenEdXAuthError(
          'Invalid OAuth2 token response: missing access_token or expires_in'
        );
      }

      // Cache token with expiry buffer
      const expiresAt = Date.now() + (tokenData.expires_in * 1000) - OpenEdXAuth.EXPIRY_BUFFER_MS;
      this.cachedToken = {
        token: tokenData.access_token,
        expiresAt,
      };

      lmsLogger.info(
        {
          expiresIn: tokenData.expires_in,
          expiresAt: new Date(expiresAt).toISOString(),
          scope: tokenData.scope,
        },
        'OAuth2 token acquired successfully'
      );

      return tokenData.access_token;
    } catch (error) {
      // Handle axios errors
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const errorData = error.response?.data as OpenEdXApiErrorResponse | undefined;

        lmsLogger.error(
          {
            statusCode,
            error: errorData?.error,
            errorDescription: errorData?.error_description,
            tokenUrl: this.config.tokenUrl,
          },
          'OAuth2 token acquisition failed'
        );

        // Provide specific error message based on status
        if (statusCode === 401 || statusCode === 403) {
          throw new OpenEdXAuthError(
            `OAuth2 authentication failed: ${errorData?.error_description || 'Invalid credentials'}`,
            error
          );
        }

        if (statusCode === 404) {
          throw new OpenEdXAuthError(
            `OAuth2 token endpoint not found: ${this.config.tokenUrl}`,
            error
          );
        }

        // Generic API error
        if (errorData) {
          const apiError = OpenEdXApiError.fromResponse(statusCode || 500, errorData);
          throw new OpenEdXAuthError(
            `OAuth2 token request failed: ${apiError.message}`,
            apiError
          );
        }

        // Network error
        throw new OpenEdXAuthError(
          `OAuth2 token request failed: ${error.message}`,
          error
        );
      }

      // Unknown error
      lmsLogger.error({ error }, 'Unexpected error during OAuth2 token acquisition');
      throw new OpenEdXAuthError(
        'Unexpected error during OAuth2 authentication',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Test connection to OAuth2 endpoint
   *
   * Attempts to acquire token and measures latency.
   * Useful for connection validation and health checks.
   *
   * @returns True if connection successful, throws otherwise
   */
  async testConnection(): Promise<boolean> {
    const startTime = Date.now();

    try {
      await this.getAccessToken();
      const duration = Date.now() - startTime;

      lmsLogger.info(
        { durationMs: duration },
        'OAuth2 connection test successful'
      );

      return true;
    } catch (error) {
      const duration = Date.now() - startTime;

      lmsLogger.error(
        { error, durationMs: duration },
        'OAuth2 connection test failed'
      );

      throw error;
    }
  }
}
