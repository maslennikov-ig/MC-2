import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTransportConfig } from '../transports';

describe('getTransportConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env to known state
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('development environment', () => {
    it('returns undefined in development (sync stdout, no worker threads)', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.AXIOM_TOKEN;
      delete process.env.AXIOM_DATASET;

      const config = getTransportConfig();

      // In dev, returns undefined to use pino.destination(sync) instead of transport worker threads
      expect(config).toBeUndefined();
    });

    it('returns undefined when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      delete process.env.AXIOM_TOKEN;
      delete process.env.AXIOM_DATASET;

      const config = getTransportConfig();

      expect(config).toBeUndefined();
    });

    it('returns undefined when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.AXIOM_TOKEN;
      delete process.env.AXIOM_DATASET;

      const config = getTransportConfig();

      expect(config).toBeUndefined();
    });
  });

  describe('production environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('returns stdout only when Axiom is not configured', () => {
      delete process.env.AXIOM_TOKEN;
      delete process.env.AXIOM_DATASET;

      const config = getTransportConfig();

      expect(config).toEqual({
        target: 'pino/file',
        options: { destination: 1 },
        level: 'info',
      });
    });

    it('returns Axiom + stdout when Axiom is configured', () => {
      process.env.AXIOM_TOKEN = 'test-token';
      process.env.AXIOM_DATASET = 'test-dataset';

      const config = getTransportConfig() as { targets: unknown[] };

      expect(config).toHaveProperty('targets');
      expect(config.targets).toHaveLength(2);

      // Verify Axiom target
      expect(config.targets[0]).toMatchObject({
        target: '@axiomhq/pino',
        options: {
          dataset: 'test-dataset',
          token: 'test-token',
        },
        level: 'info',
      });

      // Verify stdout target
      expect(config.targets[1]).toMatchObject({
        target: 'pino/file',
        options: { destination: 1 },
        level: 'info',
      });
    });

    it('returns stdout only when only AXIOM_TOKEN is set', () => {
      process.env.AXIOM_TOKEN = 'test-token';
      delete process.env.AXIOM_DATASET;

      const config = getTransportConfig();

      expect(config).toEqual({
        target: 'pino/file',
        options: { destination: 1 },
        level: 'info',
      });
    });

    it('returns stdout only when only AXIOM_DATASET is set', () => {
      delete process.env.AXIOM_TOKEN;
      process.env.AXIOM_DATASET = 'test-dataset';

      const config = getTransportConfig();

      expect(config).toEqual({
        target: 'pino/file',
        options: { destination: 1 },
        level: 'info',
      });
    });
  });

  describe('transport structure', () => {
    it('development returns undefined (no transport, uses sync destination)', () => {
      process.env.NODE_ENV = 'development';

      const config = getTransportConfig();

      // Dev mode avoids pino.transport() worker threads for Next.js compatibility
      expect(config).toBeUndefined();
    });

    it('production targets have correct log levels', () => {
      process.env.NODE_ENV = 'production';
      process.env.AXIOM_TOKEN = 'test-token';
      process.env.AXIOM_DATASET = 'test-dataset';

      const config = getTransportConfig();
      const multiConfig = config as unknown as { targets: Array<{ level?: string }> };

      expect(multiConfig.targets).toBeDefined();
      multiConfig.targets.forEach(target => {
        expect(target.level).toBe('info');
      });
    });
  });
});
