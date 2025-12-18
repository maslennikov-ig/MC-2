/**
 * Qdrant Client Tests
 *
 * Tests for the Qdrant client singleton initialization and configuration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Qdrant Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to allow re-initialization with different env vars
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Environment Variable Validation', () => {
    it('should throw error if QDRANT_URL is missing', async () => {
      delete process.env.QDRANT_URL;
      process.env.QDRANT_API_KEY = 'test-key';

      const { qdrantClient } = await import('@/shared/qdrant/client');

      expect(() => {
        // Access a property to trigger lazy initialization
        qdrantClient.getCollections;
      }).toThrow('Missing required Qdrant environment variables: QDRANT_URL');
    });

    it('should throw error if QDRANT_API_KEY is missing', async () => {
      process.env.QDRANT_URL = 'https://test.qdrant.io';
      delete process.env.QDRANT_API_KEY;

      const { qdrantClient } = await import('@/shared/qdrant/client');

      expect(() => {
        // Access a property to trigger lazy initialization
        qdrantClient.getCollections;
      }).toThrow('Missing required Qdrant environment variables: QDRANT_API_KEY');
    });

    it('should throw error if both environment variables are missing', async () => {
      delete process.env.QDRANT_URL;
      delete process.env.QDRANT_API_KEY;

      const { qdrantClient } = await import('@/shared/qdrant/client');

      expect(() => {
        // Access a property to trigger lazy initialization
        qdrantClient.getCollections;
      }).toThrow('Missing required Qdrant environment variables: QDRANT_URL, QDRANT_API_KEY');
    });

    it('should successfully initialize when all environment variables are present', async () => {
      process.env.QDRANT_URL = 'https://test.qdrant.io';
      process.env.QDRANT_API_KEY = 'test-key';

      const { qdrantClient } = await import('@/shared/qdrant/client');
      expect(qdrantClient).toBeDefined();
      expect(typeof qdrantClient.getCollections).toBe('function');
    });
  });

  describe('Client Instance', () => {
    beforeEach(() => {
      process.env.QDRANT_URL = 'https://test.qdrant.io';
      process.env.QDRANT_API_KEY = 'test-key';
    });

    it('should export a QdrantClient instance', async () => {
      const { qdrantClient } = await import('@/shared/qdrant/client');
      expect(qdrantClient).toBeDefined();
    });

    it('should have standard Qdrant client methods', async () => {
      const { qdrantClient } = await import('@/shared/qdrant/client');
      expect(typeof qdrantClient.getCollections).toBe('function');
      expect(typeof qdrantClient.getCollection).toBe('function');
      expect(typeof qdrantClient.api).toBe('function');
    });

    it('should export QdrantClient type', async () => {
      const module = await import('@/shared/qdrant/client');
      expect(module).toHaveProperty('qdrantClient');
    });
  });

  describe('Singleton Pattern', () => {
    beforeEach(() => {
      process.env.QDRANT_URL = 'https://test.qdrant.io';
      process.env.QDRANT_API_KEY = 'test-key';
    });

    it('should return the same instance on multiple imports', async () => {
      const { qdrantClient: client1 } = await import('@/shared/qdrant/client');
      const { qdrantClient: client2 } = await import('@/shared/qdrant/client');
      expect(client1).toBe(client2);
    });
  });
});
