/**
 * Vitest setup file - runs before each test file
 * For global setup (worker startup), see global-setup.ts
 */
import { config } from 'dotenv';
import path from 'path';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

// ============================================================================
// DOM ENVIRONMENT SETUP (Required for mermaid in Node.js)
// Must be done BEFORE mermaid is imported by any test file
// ============================================================================
const dom = new JSDOM('<!DOCTYPE html><body></body>');
global.document = dom.window.document;
global.window = dom.window as unknown as Window & typeof globalThis;

// Create DOMPurify instance and attach to window and global
// Mermaid requires DOMPurify.addHook() to be available
const DOMPurify = createDOMPurify(dom.window);
// @ts-expect-error - Mermaid expects DOMPurify on window
global.window.DOMPurify = DOMPurify;
// @ts-expect-error - Also set global.DOMPurify for direct access
global.DOMPurify = DOMPurify;

// NOTE: global.window is set here for mermaid, which requires it at import time.
// OpenAI SDK is configured with dangerouslyAllowBrowser: true to handle this.

// Load environment variables from .env
config({ path: path.resolve(__dirname, '../.env') });

// Verify critical environment variables are loaded
console.log('=== TEST FILE SETUP ===');
console.log(
  'SUPABASE_URL:',
  process.env.SUPABASE_URL
    ? 'SET (' + process.env.SUPABASE_URL.substring(0, 30) + '...)'
    : 'MISSING'
);
console.log(
  'SUPABASE_SERVICE_KEY:',
  process.env.SUPABASE_SERVICE_KEY
    ? 'SET (' + process.env.SUPABASE_SERVICE_KEY.substring(0, 30) + '...)'
    : 'MISSING'
);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Missing required Supabase environment variables');
}
