import { defineConfig } from 'tsup';

/**
 * tsup configuration for bundling BullMQ sandboxed processor
 *
 * Problem: BullMQ sandboxed processors run in a separate Node.js worker thread
 * with native ESM resolution. Node.js ESM requires explicit `.js` extensions
 * for relative imports, but our TypeScript codebase uses `moduleResolution: "Bundler"`
 * which doesn't add them.
 *
 * Solution: Bundle processor.ts into a standalone file that inlines all workspace
 * dependencies, eliminating the need for relative imports with .js extensions.
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
  // Bundle all workspace packages inline - this is the key fix
  // These packages use relative imports without .js extensions
  noExternal: ['@megacampus/shared-types', '@megacampus/shared-logger'],
  esbuildOptions(options) {
    options.platform = 'node';
    // Prefer ESM entry points
    options.mainFields = ['module', 'main'];
  },
});
