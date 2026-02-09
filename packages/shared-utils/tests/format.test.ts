import { describe, it, expect } from 'vitest';
import { formatDuration, formatNumber, formatFileSize } from '../src/format';

describe('formatDuration', () => {
  describe('invalid inputs return empty string', () => {
    it('should return empty string for undefined', () => {
      expect(formatDuration(undefined)).toBe('');
    });

    it('should return empty string for NaN', () => {
      expect(formatDuration(NaN)).toBe('');
    });

    it('should return empty string for Infinity', () => {
      expect(formatDuration(Infinity)).toBe('');
    });

    it('should return empty string for negative numbers', () => {
      expect(formatDuration(-1)).toBe('');
      expect(formatDuration(-100)).toBe('');
      expect(formatDuration(-1000)).toBe('');
    });

    it('should return empty string for null (type coercion)', () => {
      // TypeScript won't allow this, but testing runtime behavior
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      expect(formatDuration(null as any)).toBe('');
    });

    it('should return empty string for -Infinity', () => {
      expect(formatDuration(-Infinity)).toBe('');
    });
  });

  describe('milliseconds (< 1s)', () => {
    it('should format 0ms', () => {
      expect(formatDuration(0)).toBe('0ms');
    });

    it('should format 500ms', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('should format 999ms', () => {
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should round fractional milliseconds', () => {
      expect(formatDuration(123.456)).toBe('123ms');
      expect(formatDuration(789.9)).toBe('790ms');
    });

    it('should format 1ms', () => {
      expect(formatDuration(1)).toBe('1ms');
    });

    it('should format 100ms', () => {
      expect(formatDuration(100)).toBe('100ms');
    });
  });

  describe('seconds (1s - 59.9s)', () => {
    it('should format 1000ms as 1.0s', () => {
      expect(formatDuration(1000)).toBe('1.0s');
    });

    it('should format 1500ms as 1.5s', () => {
      expect(formatDuration(1500)).toBe('1.5s');
    });

    it('should format 2500ms as 2.5s', () => {
      expect(formatDuration(2500)).toBe('2.5s');
    });

    it('should format with 1 decimal place', () => {
      expect(formatDuration(1234)).toBe('1.2s');
      expect(formatDuration(5678)).toBe('5.7s');
    });

    it('should round 59999ms to 60.0s', () => {
      // 59999 / 1000 = 59.999, toFixed(1) rounds to 60.0
      expect(formatDuration(59999)).toBe('60.0s');
    });

    it('should format 59000ms as 59.0s', () => {
      expect(formatDuration(59000)).toBe('59.0s');
    });

    it('should format 10000ms as 10.0s', () => {
      expect(formatDuration(10000)).toBe('10.0s');
    });
  });

  describe('minutes (1m - 59m)', () => {
    it('should format 60000ms as 1m', () => {
      expect(formatDuration(60000)).toBe('1m');
    });

    it('should format 90000ms as 1m 30s', () => {
      expect(formatDuration(90000)).toBe('1m 30s');
    });

    it('should format 120000ms as 2m', () => {
      expect(formatDuration(120000)).toBe('2m');
    });

    it('should format 125000ms as 2m 5s', () => {
      expect(formatDuration(125000)).toBe('2m 5s');
    });

    it('should omit seconds when 0', () => {
      expect(formatDuration(180000)).toBe('3m');
      expect(formatDuration(600000)).toBe('10m');
    });

    it('should include seconds when non-zero', () => {
      expect(formatDuration(181000)).toBe('3m 1s');
      expect(formatDuration(605000)).toBe('10m 5s');
    });

    it('should format 3540000ms as 59m', () => {
      expect(formatDuration(3540000)).toBe('59m');
    });

    it('should format 3570000ms as 59m 30s', () => {
      expect(formatDuration(3570000)).toBe('59m 30s');
    });
  });

  describe('hours (>= 1h)', () => {
    it('should format 3600000ms as 1h', () => {
      expect(formatDuration(3600000)).toBe('1h');
    });

    it('should format 3900000ms as 1h 5m', () => {
      expect(formatDuration(3900000)).toBe('1h 5m');
    });

    it('should format 7200000ms as 2h', () => {
      expect(formatDuration(7200000)).toBe('2h');
    });

    it('should format 7500000ms as 2h 5m', () => {
      expect(formatDuration(7500000)).toBe('2h 5m');
    });

    it('should omit minutes when 0', () => {
      expect(formatDuration(10800000)).toBe('3h');
      expect(formatDuration(36000000)).toBe('10h');
    });

    it('should include minutes when non-zero', () => {
      expect(formatDuration(10860000)).toBe('3h 1m');
      expect(formatDuration(36300000)).toBe('10h 5m');
    });

    it('should format large durations', () => {
      expect(formatDuration(86400000)).toBe('24h'); // 1 day
      expect(formatDuration(90000000)).toBe('25h'); // 25 hours
    });

    it('should ignore seconds in hours display', () => {
      // 1h 5m 30s → displays as "1h 5m"
      expect(formatDuration(3930000)).toBe('1h 5m');
    });
  });

  describe('boundary cases', () => {
    it('should handle boundary at 1000ms', () => {
      expect(formatDuration(999)).toBe('999ms');
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(1001)).toBe('1.0s');
    });

    it('should handle boundary at 60s', () => {
      expect(formatDuration(59999)).toBe('60.0s'); // Rounds to 60.0s
      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(60001)).toBe('1m');
    });

    it('should handle boundary at 60m', () => {
      expect(formatDuration(3599000)).toBe('59m 59s');
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(3601000)).toBe('1h');
    });
  });

  describe('edge cases', () => {
    it('should handle very small positive numbers', () => {
      expect(formatDuration(0.1)).toBe('0ms');
      expect(formatDuration(0.9)).toBe('1ms');
    });

    it('should handle fractional seconds', () => {
      expect(formatDuration(1234.567)).toBe('1.2s');
    });

    it('should handle very large numbers', () => {
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      const result = formatDuration(oneYear);
      expect(result).toContain('h');
      expect(result).toBe('8760h');
    });

    it('should handle Number.MAX_SAFE_INTEGER', () => {
      const result = formatDuration(Number.MAX_SAFE_INTEGER);
      expect(result).toContain('h');
    });
  });

  describe('rounding behavior', () => {
    it('should round milliseconds to nearest integer', () => {
      expect(formatDuration(123.4)).toBe('123ms');
      expect(formatDuration(123.5)).toBe('124ms');
      expect(formatDuration(123.9)).toBe('124ms');
    });

    it('should round seconds to 1 decimal place', () => {
      expect(formatDuration(1234)).toBe('1.2s'); // 1.234 → 1.2
      expect(formatDuration(1254)).toBe('1.3s'); // 1.254 → 1.3
      expect(formatDuration(1951)).toBe('2.0s'); // 1.951 → 2.0
    });

    it('should floor minutes and seconds', () => {
      expect(formatDuration(90999)).toBe('1m 30s'); // 90.999s = 1m 30s
      expect(formatDuration(119999)).toBe('1m 59s'); // 119.999s = 1m 59s
    });

    it('should floor hours and minutes', () => {
      expect(formatDuration(3659999)).toBe('1h'); // 3659.999s = 60m 59s → 1h 0m
      expect(formatDuration(3900999)).toBe('1h 5m'); // 3900.999s = 65m 0s → 1h 5m
    });
  });
});

describe('formatNumber', () => {
  it('should return "0" for invalid inputs', () => {
    expect(formatNumber(NaN)).toBe('0');
    expect(formatNumber(Infinity)).toBe('0');
    expect(formatNumber(-1)).toBe('0');
    expect(formatNumber(-100)).toBe('0');
  });

  it('should format numbers < 1000 as-is', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1)).toBe('1');
    expect(formatNumber(999)).toBe('999');
  });

  it('should format thousands with K suffix', () => {
    expect(formatNumber(1000)).toBe('1.0K');
    expect(formatNumber(1500)).toBe('1.5K');
    expect(formatNumber(10000)).toBe('10.0K');
    expect(formatNumber(999999)).toBe('1000.0K');
  });

  it('should format millions with M suffix', () => {
    expect(formatNumber(1000000)).toBe('1.0M');
    expect(formatNumber(1500000)).toBe('1.5M');
    expect(formatNumber(10000000)).toBe('10.0M');
  });

  it('should handle fractional numbers', () => {
    expect(formatNumber(0.5)).toBe('0.5');
    expect(formatNumber(0.9)).toBe('0.9');
  });

  it('should handle boundary at 999.9', () => {
    expect(formatNumber(999.9)).toBe('999.9');
  });

  it('should handle very large numbers', () => {
    expect(formatNumber(1_000_000_000)).toBe('1000.0M');
    expect(formatNumber(999_999_999)).toBe('1000.0M');
  });

  it('should handle zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('should handle -Infinity', () => {
    expect(formatNumber(-Infinity)).toBe('0');
  });
});

describe('formatFileSize', () => {
  it('should return "0 B" for invalid inputs', () => {
    expect(formatFileSize(undefined)).toBe('0 B');
    expect(formatFileSize(NaN)).toBe('0 B');
    expect(formatFileSize(-1)).toBe('0 B');
    expect(formatFileSize(Infinity)).toBe('0 B');
  });

  it('should format zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('should format bytes', () => {
    expect(formatFileSize(1)).toBe('1 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('should format kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(10240)).toBe('10.0 KB');
    expect(formatFileSize(1048575)).toBe('1024.0 KB');
  });

  it('should format megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(1572864)).toBe('1.5 MB');
    expect(formatFileSize(10485760)).toBe('10.0 MB');
  });

  it('should format gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
    expect(formatFileSize(1610612736)).toBe('1.5 GB');
  });

  it('should use custom fallback for undefined', () => {
    expect(formatFileSize(undefined, '-')).toBe('-');
    expect(formatFileSize(undefined, 'N/A')).toBe('N/A');
    expect(formatFileSize(undefined, '')).toBe('');
  });

  it('should use custom fallback for invalid inputs', () => {
    expect(formatFileSize(NaN, '-')).toBe('-');
    expect(formatFileSize(-1, 'invalid')).toBe('invalid');
  });

  it('should ignore fallback for valid inputs', () => {
    expect(formatFileSize(1024, '-')).toBe('1.0 KB');
    expect(formatFileSize(0, '-')).toBe('0 B');
  });
});
