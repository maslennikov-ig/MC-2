import { defineConfig } from 'tsup';

/**
 * tsup configuration for bundling BullMQ sandboxed processor
 *
 * BullMQ sandboxed processors run in a separate Node.js worker thread
 * with native ESM resolution. Bundling the processor into a standalone file
 * eliminates runtime module resolution overhead and ensures all workspace
 * dependencies are self-contained.
 *
 * Note: shared-types now has a post-build script (fix-esm-imports.mjs) that
 * adds .js extensions, so noExternal is an optimization, not a requirement.
 *
 * This only bundles the processor - other files are compiled by tsc normally.
 */
export default defineConfig({
  entry: ['src/orchestrator/processor.ts'],
  outDir: 'dist/orchestrator',
  format: ['esm'],
  target: 'node20',
  splitting: false,
  sourcemap: true,
  clean: false, // Don't clean - tsc builds other files in dist/
  dts: false, // Types not needed for runtime processor
  external: [
    // Keep BullMQ external - it's a runtime dependency and handles its own ESM
    'bullmq',
    // Keep Sentry external - large SDK with native bindings
    '@sentry/node',
    // Keep pino external - it has native bindings
    'pino',
    'pino-pretty',
    // Keep ioredis external - large dependency, works fine as-is
    'ioredis',
    // Keep Supabase external - handles its own ESM
    '@supabase/supabase-js',
    // Keep LangChain external - large and handles ESM properly
    '@langchain/core',
    '@langchain/openai',
    '@langchain/langgraph',
    '@langchain/textsplitters',
    // Keep OpenAI external
    'openai',
    // Keep Qdrant external
    '@qdrant/js-client-rest',
    // Keep other large/native dependencies external
    'sharp',
    'tiktoken',
    'axios',
    'zod',
    // Node built-ins (always external)
    'fs',
    'path',
    'url',
    'crypto',
    'stream',
    'util',
    'events',
    'os',
    'child_process',
    'http',
    'https',
    'net',
    'tls',
    'buffer',
    'process',
    'worker_threads',
  ],
  // Inline workspace packages for self-contained bundle (faster startup, no runtime resolution).
  // Not strictly required since shared-types has fix-esm-imports.mjs post-build script,
  // but keeps the processor bundle independent of node_modules layout.
  noExternal: ['@megacampus/shared-types', '@megacampus/shared-logger', '@megacampus/shared-utils'],
  esbuildOptions(options) {
    options.platform = 'node';
    // Prefer ESM entry points
    options.mainFields = ['module', 'main'];
  },
});
