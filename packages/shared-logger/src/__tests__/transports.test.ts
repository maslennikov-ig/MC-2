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
    it('returns pino-pretty transport in development', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.AXIOM_TOKEN;
      delete process.env.AXIOM_DATASET;

      const config = getTransportConfig();

      expect(config).toEqual({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          sync: true,
        },
      });
    });

    it('returns pino-pretty when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      delete process.env.AXIOM_TOKEN;
      delete process.env.AXIOM_DATASET;

      const config = getTransportConfig();

      expect(config).toHaveProperty('target', 'pino-pretty');
    });

    it('returns pino-pretty when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.AXIOM_TOKEN;
      delete process.env.AXIOM_DATASET;

      const config = getTransportConfig();

      expect(config).toHaveProperty('target', 'pino-pretty');
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
    it('pino-pretty config has all expected options', () => {
      process.env.NODE_ENV = 'development';

      const config = getTransportConfig() as {
        target: string;
        options: Record<string, unknown>;
      };

      expect(config.options).toHaveProperty('colorize', true);
      expect(config.options).toHaveProperty('translateTime', 'SYS:standard');
      expect(config.options).toHaveProperty('ignore', 'pid,hostname');
      expect(config.options).toHaveProperty('sync', true);
    });

    it('production targets have correct log levels', () => {
      process.env.NODE_ENV = 'production';
      process.env.AXIOM_TOKEN = 'test-token';
      process.env.AXIOM_DATASET = 'test-dataset';

      const config = getTransportConfig();
      const multiConfig = config as unknown as { targets: Array<{ level?: string }> };

      expect(multiConfig.targets).toBeDefined();
      multiConfig.targets.forEach((target) => {
        expect(target.level).toBe('info');
      });
    });
  });
});
