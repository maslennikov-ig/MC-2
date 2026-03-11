import type { LogEnvironment } from './types';

export function detectEnvironment(): LogEnvironment | null {
  if (process.env.NODE_ENV === 'test') return 'test';

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';

  try {
    const url = new URL(appUrl);
    const hostname = url.hostname;

    if (hostname === 'dev.ai.megacampus.ru') return 'dev';
    if (hostname === 'ai.megacampus.ru') return 'stage';
  } catch {
    if (appUrl.includes('dev.ai.megacampus.ru')) return 'dev';
    if (appUrl.includes('ai.megacampus.ru') && !appUrl.includes('dev.')) return 'stage';
  }

  return null;
}
