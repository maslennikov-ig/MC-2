/**
 * Logger utility functions
 * @module shared/logger/utils
 */

import type { LogEnvironment } from './types';

/**
 * Detect environment from APP_URL or NEXT_PUBLIC_APP_URL
 * @returns 'dev' | 'stage' | null
 */
export function detectEnvironment(): LogEnvironment | null {
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
