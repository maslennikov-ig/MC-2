/**
 * Mermaid DOM Setup for Node.js Environment
 * @module stages/stage6-lesson-content/utils/mermaid-dom-setup
 *
 * Provides DOM globals required by mermaid in Node.js environment.
 * Mermaid expects browser globals (document, window) which don't exist in Node.js.
 * This module creates a minimal DOM environment using jsdom.
 *
 * IMPORTANT: Must be called ONCE before any mermaid operations.
 * Safe to call multiple times (idempotent).
 *
 * @example
 * ```typescript
 * import { ensureDOMGlobals } from './mermaid-dom-setup';
 * import mermaid from 'mermaid';
 *
 * // Initialize DOM environment
 * ensureDOMGlobals();
 *
 * // Now safe to use mermaid
 * mermaid.initialize({ startOnLoad: false });
 * const result = await mermaid.parse('graph TD; A-->B;');
 * ```
 */

import { JSDOM } from 'jsdom';
import { logger } from '@/shared/logger';

// ============================================================================
// STATE
// ============================================================================

/**
 * Track initialization state to ensure idempotency
 */
let initialized = false;

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Initialize DOM globals required by mermaid in Node.js environment.
 *
 * Creates a minimal JSDOM instance and assigns `document` and `window`
 * to Node.js global scope. This allows mermaid (a browser library) to
 * run in Node.js without modification.
 *
 * **Safe to call multiple times** - will only initialize once.
 *
 * @example
 * ```typescript
 * // Call before any mermaid operations
 * ensureDOMGlobals();
 *
 * // Can safely call again - no-op
 * ensureDOMGlobals();
 * ```
 *
 * @throws {Error} If jsdom fails to create DOM (very rare)
 */
export function ensureDOMGlobals(): void {
  // Idempotent: skip if already initialized
  if (initialized) {
    return;
  }

  try {
    // Create minimal DOM environment
    const dom = new JSDOM('<!DOCTYPE html><body></body>');

    // Assign to Node.js globals
    // TypeScript: JSDOM's window is compatible with DOM Window type
    global.document = dom.window.document;
    global.window = dom.window as unknown as Window & typeof globalThis;

    // Mark as initialized
    initialized = true;

    logger.debug('Mermaid DOM setup: JSDOM initialized successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { error: errorMessage },
      'Mermaid DOM setup: Failed to initialize JSDOM'
    );
    throw new Error(`JSDOM initialization failed: ${errorMessage}. Check jsdom installation and memory.`);
  }
}

/**
 * Check if DOM globals are initialized
 *
 * Utility function for testing or debugging.
 *
 * @returns True if ensureDOMGlobals() has been called
 *
 * @example
 * ```typescript
 * if (!isDOMInitialized()) {
 *   ensureDOMGlobals();
 * }
 * ```
 */
export function isDOMInitialized(): boolean {
  return initialized;
}

/**
 * Clean up DOM globals to prevent memory leaks in long-running processes.
 * Should be called after mermaid operations are complete.
 *
 * This is critical for BullMQ workers processing thousands of lessons
 * to avoid memory leaks from accumulated JSDOM instances.
 *
 * @example
 * ```typescript
 * try {
 *   ensureDOMGlobals();
 *   // ... mermaid operations
 * } finally {
 *   cleanupDOMGlobals();
 * }
 * ```
 */
export function cleanupDOMGlobals(): void {
  if (!initialized) {
    return;
  }

  try {
    // Clean up JSDOM resources
    if (global.window && typeof global.window.close === 'function') {
      global.window.close();
    }

    // @ts-expect-error - Intentionally deleting globals for cleanup
    delete global.document;
    // @ts-expect-error - Intentionally deleting globals for cleanup
    delete global.window;

    initialized = false;

    logger.debug('Mermaid DOM setup: DOM globals cleaned up successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(
      { error: errorMessage },
      'Mermaid DOM setup: Error during cleanup (non-fatal)'
    );
    // Reset state anyway to avoid leaving stale globals
    initialized = false;
  }
}

/**
 * Reset initialization state (for testing only)
 *
 * **DO NOT USE IN PRODUCTION CODE**
 *
 * This function is provided for test isolation - it allows tests
 * to reset the global state and re-initialize DOM environments.
 *
 * @internal
 */
export function resetDOMGlobals(): void {
  initialized = false;
  // Note: Does not delete global.document or global.window
  // Tests should handle cleanup if needed
}
