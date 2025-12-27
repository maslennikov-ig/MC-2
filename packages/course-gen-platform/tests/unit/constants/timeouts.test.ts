import { describe, it, expect } from 'vitest';
import { TIMEOUTS, RETRY_CONFIG } from '@/shared/constants/timeouts';

describe('TIMEOUTS', () => {
  it('should have all required timeout values', () => {
    expect(TIMEOUTS.PRE_FLIGHT_TOTAL).toBe(90000);
    expect(TIMEOUTS.BUNKER_INIT).toBe(30000);
    expect(TIMEOUTS.UPLOADS_DIRECTORY).toBe(60000);
    expect(TIMEOUTS.READINESS_CHECK).toBe(5000);
    expect(TIMEOUTS.HEALTH_CHECK).toBe(5000);
    expect(TIMEOUTS.DEFAULT_API).toBe(10000);
  });

  it('should have all retry interval values', () => {
    expect(TIMEOUTS.FILE_ACCESS_INITIAL).toBe(2000);
    expect(TIMEOUTS.FILE_ACCESS_MAX).toBe(15000);
    expect(TIMEOUTS.PRE_FLIGHT_RETRY).toBe(2000);
  });

  it('should have positive values for all timeouts', () => {
    Object.values(TIMEOUTS).forEach(value => {
      expect(value).toBeGreaterThan(0);
    });
  });

  it('should have timeout values in milliseconds', () => {
    // Verify all timeouts are reasonable (between 1 second and 2 minutes)
    Object.values(TIMEOUTS).forEach(value => {
      expect(value).toBeGreaterThanOrEqual(1000);
      expect(value).toBeLessThanOrEqual(120000);
    });
  });
});

describe('RETRY_CONFIG', () => {
  it('should have valid retry configuration', () => {
    expect(RETRY_CONFIG.FILE_ACCESS_MAX_RETRIES).toBe(5);
    expect(RETRY_CONFIG.FILE_ACCESS_BACKOFF_MULTIPLIER).toBe(1.5);
    expect(RETRY_CONFIG.PRE_FLIGHT_MAX_RETRIES).toBe(30);
  });

  it('should have positive retry counts', () => {
    expect(RETRY_CONFIG.FILE_ACCESS_MAX_RETRIES).toBeGreaterThan(0);
    expect(RETRY_CONFIG.PRE_FLIGHT_MAX_RETRIES).toBeGreaterThan(0);
  });

  it('should have backoff multiplier greater than 1', () => {
    expect(RETRY_CONFIG.FILE_ACCESS_BACKOFF_MULTIPLIER).toBeGreaterThan(1);
  });
});
