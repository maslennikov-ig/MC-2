/**
 * LMS Configuration Connection Test Helpers
 * @module server/routers/lms/config-connection-helpers
 *
 * Helper functions for testing LMS connections.
 * Extracted from config-helpers.ts to reduce file size.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';
import {
  OpenEdXAuthError,
  LMSNetworkError,
  LMSTimeoutError,
} from '@megacampus/shared-types/lms/errors';
import { lmsLogger } from '../../../integrations/lms/logger';
import { createLMSAdapter } from '../../../integrations/lms';
import type { TestConnectionResult } from './config-helpers';

interface LmsConfigConnectionFields {
  last_connection_test: string;
  last_connection_status: 'success' | 'failed' | 'pending';
}

const CONNECTION_TEST_TIMEOUT = 10000;

/**
 * Test connection with timeout
 *
 * @param adapter - LMS adapter instance
 * @param configId - Configuration ID for logging
 * @param requestId - Request ID for logging
 * @returns Connection test result
 */
export async function testConnectionWithTimeout(
  adapter: ReturnType<typeof createLMSAdapter>,
  configId: string,
  requestId: string
): Promise<TestConnectionResult> {
  const startTime = Date.now();
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new LMSTimeoutError(
            `Connection test timed out after ${CONNECTION_TEST_TIMEOUT / 1000} seconds`,
            'openedx',
            CONNECTION_TEST_TIMEOUT,
            'connect'
          )
        );
      }, CONNECTION_TEST_TIMEOUT);
    });

    try {
      const result = await Promise.race([adapter.testConnection(), timeoutPromise]);
      lmsLogger.info(
        {
          requestId,
          configId,
          success: result.success,
          latency: result.latencyMs,
        },
        'Connection test completed'
      );

      return {
        success: result.success,
        latency_ms: result.latencyMs,
        message: result.message,
        lms_version: result.lmsVersion,
        api_version: result.apiVersion,
      };
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  } catch (error) {
    return handleConnectionTestError(error, startTime, configId, requestId);
  }
}

/**
 * Handle connection test errors
 *
 * @param error - Error instance
 * @param startTime - Test start timestamp
 * @param configId - Configuration ID for logging
 * @param requestId - Request ID for logging
 * @returns Connection test failure result
 */
export function handleConnectionTestError(
  error: unknown,
  startTime: number,
  configId: string,
  requestId: string
): TestConnectionResult {
  const latencyMs = Date.now() - startTime;
  let message: string;

  if (error instanceof OpenEdXAuthError) {
    message = 'Authentication failed - check client ID and secret';
    lmsLogger.warn(
      { requestId, configId, latencyMs, error: error.message },
      'Connection test failed: Authentication error'
    );
  } else if (error instanceof LMSNetworkError) {
    message = 'Cannot reach LMS - check URL and network connectivity';
    lmsLogger.warn(
      { requestId, configId, latencyMs, error: error.message },
      'Connection test failed: Network error'
    );
  } else if (error instanceof LMSTimeoutError) {
    message = `Connection test timed out after ${CONNECTION_TEST_TIMEOUT / 1000} seconds`;
    lmsLogger.warn(
      { requestId, configId, latencyMs, error: error.message, duration: error.duration },
      'Connection test failed: Timeout'
    );
  } else {
    message = `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    lmsLogger.error(
      {
        requestId,
        configId,
        latencyMs,
        error: error instanceof Error ? error.message : String(error),
      },
      'Connection test failed: Unknown error'
    );
  }

  return {
    success: false,
    latency_ms: latencyMs,
    message,
    lms_version: undefined,
    api_version: undefined,
  };
}

/**
 * Update connection test result in database
 *
 * @param supabase - Supabase admin client
 * @param configId - Configuration ID
 * @param connectionResult - Connection test result
 * @param requestId - Request ID for logging
 */
export async function updateConnectionTestResult(
  supabase: SupabaseClient<Database>,
  configId: string,
  connectionResult: TestConnectionResult,
  requestId: string
): Promise<void> {
  const testTimestamp = new Date().toISOString();
  const updatePayload: LmsConfigConnectionFields = {
    last_connection_test: testTimestamp,
    last_connection_status: connectionResult.success ? 'success' : 'failed',
  };

  const { error: updateError } = await supabase
    .from('lms_configurations')
    .update(updatePayload as unknown as Record<string, unknown>)
    .eq('id', configId);

  if (updateError) {
    lmsLogger.error(
      { requestId, configId, error: updateError.message },
      'Failed to update connection test result in database'
    );
  } else {
    lmsLogger.debug(
      { requestId, configId, status: connectionResult.success ? 'success' : 'failed' },
      'Connection test result saved to database'
    );
  }
}
