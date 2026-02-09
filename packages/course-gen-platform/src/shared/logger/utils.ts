/**
 * Logger utility functions
 * @module shared/logger/utils
 */

import type { LogEnvironment } from './types';

/**
 * Detect environment from APP_URL or NEXT_PUBLIC_APP_URL
 * @returns 'dev' | 'stage' | 'test' | null
 */
export function detectEnvironment(): LogEnvironment | null {
  // Detect test environment first (vitest sets NODE_ENV=test automatically)
  if (process.env.NODE_ENV === 'test') return 'test';

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';

  // Use URL.hostname for precise matching
  try {
    const url = new URL(appUrl);
    const hostname = url.hostname;

    if (hostname === 'dev.ai.megacampus.ru') return 'dev';
    if (hostname === 'ai.megacampus.ru') return 'stage';
  } catch {
    // Fallback for invalid URLs
    if (appUrl.includes('dev.ai.megacampus.ru')) return 'dev';
    if (appUrl.includes('ai.megacampus.ru') && !appUrl.includes('dev.')) return 'stage';
  }

  return null;
}
