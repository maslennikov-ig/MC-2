/**
 * Tests for shared/logger/utils.ts
 *
 * detectEnvironment: maps APP_URL/NODE_ENV to LogEnvironment
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectEnvironment } from '@/shared/logger/utils';

describe('detectEnvironment', () => {
  beforeEach(() => {
    // Reset all relevant env vars before each test
    vi.stubEnv('NODE_ENV', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('APP_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns "test" when NODE_ENV=test', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(detectEnvironment()).toBe('test');
  });

  it('returns "dev" for dev.ai.megacampus.ru URL', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dev.ai.megacampus.ru');
    expect(detectEnvironment()).toBe('dev');
  });

  it('returns "stage" for ai.megacampus.ru URL', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ai.megacampus.ru');
    expect(detectEnvironment()).toBe('stage');
  });

  it('checks APP_URL when NEXT_PUBLIC_APP_URL is not set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://dev.ai.megacampus.ru');
    expect(detectEnvironment()).toBe('dev');
  });

  it('returns null for unknown URL', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
    expect(detectEnvironment()).toBeNull();
  });

  it('returns null when no env vars are set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(detectEnvironment()).toBeNull();
  });

  it('handles invalid URL by falling back to includes check', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'not-a-url-but-dev.ai.megacampus.ru');
    expect(detectEnvironment()).toBe('dev');
  });
});
